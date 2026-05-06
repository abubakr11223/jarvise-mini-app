import { NextRequest, NextResponse } from 'next/server'

const BOT_TOKEN  = process.env.TELEGRAM_BOT_TOKEN
const N8N_URL    = process.env.N8N_WEBHOOK_URL ||
  'https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495'

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
    gf.append('prompt', 'расход, доход, такси, завтрак, зарплата, рублей, тысяч')
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
        await sendMessage(chat_id, '❌ Ovozni tushunib bo\'lmadi. Matn yozing.')
        return NextResponse.json({ ok: true })
      }
      // Transcribed text ni foydalanuvchiga ko'rsat
      await sendMessage(chat_id, `📝 _Siz aytdingiz: "${text}"_`)
    } else {
      return NextResponse.json({ ok: true })
    }

    const reply = await askAI(text, user_id, username)
    await sendMessage(chat_id, reply)

  } catch (e) { console.error('TG webhook:', e) }

  return NextResponse.json({ ok: true })
}
