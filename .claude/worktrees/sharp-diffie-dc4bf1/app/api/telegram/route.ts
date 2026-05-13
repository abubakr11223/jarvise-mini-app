import { NextRequest, NextResponse } from 'next/server'
import { kvAdd } from '../expenses/route'
import { parseAllExpenses } from '../../../lib/expense-parser'

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const BOT_APP     = process.env.TELEGRAM_BOT_APP || 'app'
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'hisob_shaxsiy_bot'
const N8N_URL     = process.env.N8N_WEBHOOK_URL ||
  'https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495'

const today = () => new Date().toLocaleDateString('ru-RU')

// ── Javobni tozalash: EXPENSE kodlar + valyuta so'zlari ───────────────────
function cleanReply(text: string): string {
  return text
    .replace(/\[EXPENSE:.*?\]/gi, '')
    .replace(/\bEXPENSE:[\w\sЀ-ӿÀ-ſ]+\|\d+\|\w+/gi, '')
    .replace(/\b(?:тысяч\s+)?(?:рублей|рубля|рублей|руб\.?)\b/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// ── Telegram API ──────────────────────────────────────────────────────────
async function tgPost(method: string, body: object) {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function sendMessage(chat_id: number, text: string, extra?: object) {
  await tgPost('sendMessage', { chat_id, text, parse_mode: 'Markdown', ...extra })
}

// ── Ovozni matnga aylantirish ─────────────────────────────────────────────
async function transcribeVoice(file_id: string): Promise<string> {
  if (!BOT_TOKEN) return ''
  const ELEVENLABS = process.env.ELEVENLABS_API_KEY
  const GROQ       = process.env.GROQ_API_KEY

  const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${file_id}`)
    .then(r => r.json())
  if (!info.ok) return ''

  const audio = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`)
    .then(r => r.arrayBuffer())
  const blob = new Blob([audio], { type: 'audio/ogg' })

  if (ELEVENLABS) {
    const fd = new FormData()
    fd.append('file', blob, 'voice.ogg')
    fd.append('model_id', 'scribe_v1')
    fd.append('language_code', 'ru')
    fd.append('tag_audio_events', 'false')
    fd.append('num_speakers', '1')
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': ELEVENLABS }, body: fd,
    })
    if (res.ok) { const d = await res.json(); if (d.text) return d.text }
  }
  if (GROQ) {
    const fd = new FormData()
    fd.append('file', blob, 'voice.ogg')
    fd.append('model', 'whisper-large-v3')
    fd.append('language', 'ru')
    fd.append('response_format', 'json')
    fd.append('prompt', 'расход, доход, такси, завтрак, зарплата, сум, тысяч')
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${GROQ}` }, body: fd,
    })
    if (res.ok) { const d = await res.json(); return d.text || '' }
  }
  return ''
}

// ── n8n AI ga yuborish (8 soniya timeout) ────────────────────────────────
async function askAI(text: string, user_id: number, username: string): Promise<string> {
  try {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const res = await fetch(N8N_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, user_id, username }),
    })
    clearTimeout(timer)
    if (!res.ok) return ''
    const d = await res.json()
    return d.reply || d.response || d.text || d.message || d.output || ''
  } catch { return '' }
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
      await sendMessage(chat_id, '🎙 ...')
      text = await transcribeVoice(file_id)
      if (!text) { await sendMessage(chat_id, '❌ Tushunilmadi. Matn yozing.'); return NextResponse.json({ ok: true }) }
      await sendMessage(chat_id, `📝 _"${text}"_`)
    } else {
      return NextResponse.json({ ok: true })
    }

    // ── 1. Foydalanuvchi matnidan xarajat/daromat ajratish ─────────────────
    const localExps = parseAllExpenses(text)

    if (localExps.length > 0) {
      // Darhol Redis ga saqlash
      const stored = localExps.map(e => ({
        id: Date.now() + Math.random(),
        name: e.name, amount: e.amount, type: e.type, date: today(),
      }))
      await kvAdd(stored)

      // Xulosa + "Mini appda ko'rish" tugmasi
      const inlineKb = {
        inline_keyboard: [[{
          text: "📊 Mini appda ko'rish",
          url: `https://t.me/${BOT_USERNAME}/${BOT_APP}`,
        }]],
      }
      const lines = stored.map(e =>
        `${e.type === 'DAROMAT' ? '💰' : '💸'} ${e.name} — ${e.amount.toLocaleString()} so'm`
      ).join('\n')
      await sendMessage(chat_id, `${lines}\n\n✅ Saqlandi`, { reply_markup: inlineKb })

      // n8n ga ham yuborish (Notion uchun), javobini ko'rsatmaymiz
      askAI(text, user_id, username).catch(() => {})
    } else {
      // ── 2. Xarajat topilmadi → AI dan javob olish ────────────────────────
      const rawReply = await askAI(text, user_id, username)
      if (rawReply) {
        await sendMessage(chat_id, cleanReply(rawReply))
      } else {
        await sendMessage(chat_id, "🤔 Javob kelmadi. Qayta urinib ko'ring.")
      }
    }
  } catch (e) { console.error('TG webhook:', e) }

  return NextResponse.json({ ok: true })
}
