import { NextRequest, NextResponse } from 'next/server'

const GROQ_API_KEY = process.env.GROQ_API_KEY
const SERPER_KEY   = process.env.SERPER_API_KEY
const N8N_URL      = process.env.N8N_WEBHOOK_URL ||
  'https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495'

// ── Web qidirish ──────────────────────────────────────────────────────────
async function webSearch(query: string): Promise<string> {
  try {
    if (SERPER_KEY) {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5, gl: 'uz', hl: 'ru' }),
      })
      if (res.ok) {
        const d = await res.json()
        const parts: string[] = []
        if (d.answerBox?.answer)   parts.push(d.answerBox.answer)
        if (d.answerBox?.snippet)  parts.push(d.answerBox.snippet)
        if (d.knowledgeGraph?.description) parts.push(d.knowledgeGraph.description)
        ;(d.organic || []).slice(0, 4).forEach((r: { title: string; snippet: string }) =>
          parts.push(`${r.title}: ${r.snippet}`)
        )
        if (parts.length > 0) return parts.join('\n\n').slice(0, 2000)
      }
    }
    // DuckDuckGo fallback (kalit kerak emas)
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
    const d = await r.json()
    const parts = [d.Answer, d.AbstractText, ...(d.RelatedTopics||[]).slice(0,2).map((t:{Text?:string})=>t.Text||'')].filter(Boolean)
    return parts.join('\n\n').slice(0, 800)
  } catch { return '' }
}

function isQuestion(text: string): boolean {
  if (text.trim().endsWith('?')) return true
  const qw = ['qanday','qancha','nima','nima u','kimdir','qaerda','qachon','qaysi',
               'что такое','как','сколько','кто такой','где','когда','почему','зачем',
               'расскажи','объясни','what is','how','who is','where','when','why',
               'курс','dollar','valyuta','ob-havo','pogoda','погода','narx','цена','price']
  return qw.some(w => text.toLowerCase().includes(w))
}

async function callGroq(messages: { role: string; content: string }[]): Promise<string> {
  if (!GROQ_API_KEY) return ''
  try {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 1024,
        temperature: 0.7,
      }),
    })
    if (!res.ok) return ''
    const d = await res.json()
    return d.choices?.[0]?.message?.content || ''
  } catch { return '' }
}

const SYSTEM = `Sen JONKA — aqlli shaxsiy moliya va hayot assistentisan.
Foydalanuvchi qaysi tilda yozsa — ALBATTA shu tilda qisqa va aniq javob ber.
Internet ma'lumoti berilsa — undan foydalanib dolzarb javob ber.
Moliya, investitsiya, hayot haqida savolda professional maslahat ber.`

export async function POST(request: NextRequest) {
  try {
    const body    = await request.json() as Record<string, unknown>
    const userMsg = String(body.message || body.text || '').trim()
    if (!userMsg) return NextResponse.json({ reply: '' })

    const cyrCount = (userMsg.match(/[а-яёА-ЯЁ]/g)||[]).length
    const lang     = cyrCount > userMsg.length * 0.1 ? 'ru' : 'uz'

    const messages: { role: string; content: string }[] = [{ role: 'system', content: SYSTEM }]

    // Internet qidirish
    if (isQuestion(userMsg)) {
      const ctx = await webSearch(userMsg)
      if (ctx) {
        messages.push({
          role: 'system',
          content: lang === 'ru' ? `[Данные из интернета]:\n${ctx}` : `[Internet ma'lumoti]:\n${ctx}`,
        })
      }
    }

    messages.push({ role: 'user', content: userMsg })

    // Groq bilan to'g'ridan javob
    const groqReply = await callGroq(messages)
    if (groqReply) return NextResponse.json({ reply: groqReply })

    // Fallback: n8n
    try {
      const n8n = await fetch(N8N_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (n8n.ok) {
        const d = await n8n.json() as Record<string, unknown>
        return NextResponse.json({ reply: String(d.reply||d.response||d.text||d.message||d.output||'✅') })
      }
    } catch {}

    return NextResponse.json({ reply: lang==='ru' ? '🤔 Попробуйте ещё раз.' : "🤔 Qayta urinib ko'ring." })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
