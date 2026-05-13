import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const GROQ_API_KEY   = process.env.GROQ_API_KEY
  const OPENAI_API_KEY = process.env.OPENAI_API_KEY

  try {
    const form  = await request.formData()
    const image = form.get('image') as File | null
    if (!image) return NextResponse.json({ error: 'Rasm topilmadi' }, { status: 400 })

    const buffer = await image.arrayBuffer()
    const base64 = Buffer.from(buffer).toString('base64')
    const mime   = image.type || 'image/jpeg'

    const SYSTEM = `Sen chek/kassa cheki tahlilchisisaN. Rasmdan tovar/xizmat nomlarini va narxlarini ajrat.
FAQAT sof JSON qaytар (izoh yo'q, markdown yo'q):
{"items":[{"name":"Tovar nomi","amount":12000},...], "total":45000}
Narxlar butun son bo'lsin (UZS). Agar narx topa olmasang amount=0.`

    // ── 1. OpenAI GPT-4o (agar kalit bo'lsa) ──────────────────────────────
    if (OPENAI_API_KEY) {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 600,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: SYSTEM },
              { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}`, detail: 'low' } },
            ],
          }],
        }),
      })
      if (res.ok) {
        const d   = await res.json()
        const txt = d.choices?.[0]?.message?.content || ''
        const parsed = tryParse(txt)
        if (parsed) return NextResponse.json({ ok: true, ...parsed })
      }
    }

    // ── 2. Groq Llama Vision ───────────────────────────────────────────────
    if (GROQ_API_KEY) {
      const models = ['meta-llama/llama-4-scout-17b-16e-instruct', 'llama-3.2-11b-vision-preview']
      for (const model of models) {
        try {
          const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model,
              max_tokens: 600,
              messages: [{
                role: 'user',
                content: [
                  { type: 'text', text: SYSTEM },
                  { type: 'image_url', image_url: { url: `data:${mime};base64,${base64}` } },
                ],
              }],
            }),
          })
          if (res.ok) {
            const d   = await res.json()
            const txt = d.choices?.[0]?.message?.content || ''
            const parsed = tryParse(txt)
            if (parsed) return NextResponse.json({ ok: true, ...parsed })
          }
        } catch { continue }
      }
    }

    return NextResponse.json({ error: 'Vision API topilmadi yoki xato' }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}

function tryParse(txt: string): { items: { name: string; amount: number }[]; total: number } | null {
  try {
    const m = txt.match(/\{[\s\S]*\}/)
    if (!m) return null
    const d = JSON.parse(m[0])
    if (!Array.isArray(d.items)) return null
    return {
      items: d.items.filter((i: { amount: number }) => i.amount > 0).slice(0, 30),
      total: d.total || d.items.reduce((s: number, i: { amount: number }) => s + (i.amount || 0), 0),
    }
  } catch { return null }
}
