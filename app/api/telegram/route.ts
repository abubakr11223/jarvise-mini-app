import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const N8N_URL   = process.env.N8N_WEBHOOK_URL ||
  'https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495'
const BASE_URL  = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : 'https://jarvise-mini-app-jf5u.vercel.app'

const today = () => new Date().toLocaleDateString('ru-RU')

// ── EXPENSE kodlarni ajratib olish (n8n qaytargan formatlar) ──────────────
function parseExpenseCodes(text: string): { name: string; amount: number; type: string }[] {
  const results: { name: string; amount: number; type: string }[] = []
  // Format 1: [EXPENSE:Такси|50000|XARAJAT]
  const re1 = /\[EXPENSE:(.*?)\|(.*?)\|(.*?)\]/gi
  // Format 2: EXPENSE:Такси|50000|XARAJAT  (without brackets)
  const re2 = /\bEXPENSE:([\wЀ-ӿÀ-ſ]+)\|(\d+)\|(\w+)/gi

  for (const m of [...text.matchAll(re1), ...text.matchAll(re2)]) {
    const amount = parseInt(m[2])
    if (amount > 0) results.push({ name: m[1].trim(), amount, type: m[3].trim().toUpperCase() })
  }
  return results
}

// ── Javobni tozalash — EXPENSE kodlar + "рублей/руб" olib tashlash ────────
function cleanReply(text: string): string {
  return text
    .replace(/\[EXPENSE:.*?\]/gi, '')
    .replace(/\bEXPENSE:[\wЀ-ӿÀ-ſ]+\|\d+\|\w+/gi, '')
    .replace(/\s*\d+\s*(?:рублей|рублей|рубля|руб\.?|тысяч рублей|тыс\.? руб\.?)/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// ── Xarajatlarni serverga saqlash ─────────────────────────────────────────
async function saveExpenses(exps: { name: string; amount: number; type: string }[]) {
  const expenses = exps.map(e => ({
    id: Date.now() + Math.random(),
    name: e.name,
    amount: e.amount,
    type: e.type,
    date: today(),
  }))
  try {
    await fetch(`${BASE_URL}/api/expenses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ expenses }),
    })
  } catch {}
}

async function sendMessage(chat_id: number, text: string) {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'Markdown' }),
  })
}

async function transcribeVoice(file_id: string): Promise<string> {
  if (!BOT_TOKEN) return ''
  const ELEVENLABS = process.env.ELEVENLABS_API_KEY
  const GROQ       = process.env.GROQ_API_KEY

  const infoRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${file_id}`)
  const info    = await infoRes.json()
  if (!info.ok) return ''

  const dlRes  = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`)
  const buffer = await dlRes.arrayBuffer()
  const blob   = new Blob([buffer], { type: 'audio/ogg' })

  if (ELEVENLABS) {
    const el = new FormData()
    el.append('file', blob, 'voice.ogg')
    el.append('model_id', 'scribe_v1')
    el.append('language_code', 'ru')
    el.append('tag_audio_events', 'false')
    el.append('num_speakers', '1')
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': ELEVENLABS }, body: el,
    })
    if (res.ok) { const d = await res.json(); if (d.text) return d.text }
  }

  if (GROQ) {
    const gf = new FormData()
    gf.append('file', blob, 'voice.ogg')
    gf.append('model', 'whisper-large-v3')
    gf.append('language', 'ru')
    gf.append('response_format', 'json')
    gf.append('prompt', 'расход, доход, такси, завтрак, зарплата, сум, тысяч')
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${GROQ}` }, body: gf,
    })
    if (res.ok) { const d = await res.json(); return d.text || '' }
  }
  return ''
}

async function askAI(text: string, user_id: number, username: string): Promise<string> {
  try {
    const res = await fetch(N8N_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, user_id, username }),
    })
    if (!res.ok) return '❌ Xato yuz berdi'
    const data = await res.json()
    return data.reply || data.response || data.text || data.message || data.output || '✅ Qabul qilindi'
  } catch { return '❌ AI bilan bog\'lanib bo\'lmadi' }
}

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: true })

  try {
    const update  = await request.json()
    const message = update.message
    if (!message) return NextResponse.json({ ok: true })

    const chat_id  = message.chat.id
    const from     = message.from
    const username = from?.username || from?.first_name || 'User'
    const user_id  = from?.id || 0

    let text = ''

    if (message.text) {
      text = message.text
    } else if (message.voice || message.audio) {
      const file_id = (message.voice ?? message.audio).file_id
      await sendMessage(chat_id, '🎙 Ovoz qabul qilindi...')
      text = await transcribeVoice(file_id)
      if (!text) {
        await sendMessage(chat_id, '❌ Ovozni tushunib bo\'lmadi.')
        return NextResponse.json({ ok: true })
      }
      await sendMessage(chat_id, `📝 _"${text}"_`)
    } else {
      return NextResponse.json({ ok: true })
    }

    const rawReply = await askAI(text, user_id, username)

    // EXPENSE kodlarni ajratib serverga saqlash
    const expenses = parseExpenseCodes(rawReply)
    if (expenses.length > 0) await saveExpenses(expenses)

    // Foydalanuvchiga toza javob yuborish (kodlar va "rubl" yo'q)
    const clean = cleanReply(rawReply)
    if (clean) await sendMessage(chat_id, clean)

  } catch (e) { console.error('TG webhook:', e) }

  return NextResponse.json({ ok: true })
}
