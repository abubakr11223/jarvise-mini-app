import { NextRequest, NextResponse } from 'next/server'

// n8n workflow chaqiradi: ovoz xabar → matn + xarajatlar
// POST body: { file_id, bot_token, language? }
export async function POST(request: NextRequest) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
  const GROQ_API_KEY       = process.env.GROQ_API_KEY

  try {
    const { file_id, bot_token, language = 'ru' } = await request.json()
    if (!file_id || !bot_token) {
      return NextResponse.json({ error: 'file_id va bot_token kerak' }, { status: 400 })
    }

    // 1. Telegram dan fayl yo'lini olish
    const infoRes = await fetch(`https://api.telegram.org/bot${bot_token}/getFile?file_id=${file_id}`)
    const info = await infoRes.json()
    if (!info.ok) return NextResponse.json({ error: 'Fayl topilmadi' }, { status: 400 })

    // 2. Audio faylni yuklab olish
    const dlRes  = await fetch(`https://api.telegram.org/file/bot${bot_token}/${info.result.file_path}`)
    const buffer = await dlRes.arrayBuffer()
    const blob   = new Blob([buffer], { type: 'audio/ogg' })

    // 3. ElevenLabs Scribe bilan transkripsiya
    if (ELEVENLABS_API_KEY) {
      const el = new FormData()
      el.append('file', blob, 'voice.ogg')
      el.append('model_id', 'scribe_v1')
      el.append('language_code', language)
      el.append('tag_audio_events', 'false')
      el.append('num_speakers', '1')

      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        body: el,
      })
      if (res.ok) {
        const data = await res.json()
        const text = data.text || ''
        return NextResponse.json({ text, ok: true })
      }
    }

    // 4. Groq Whisper fallback
    if (GROQ_API_KEY) {
      const gf = new FormData()
      gf.append('file', blob, 'voice.ogg')
      gf.append('model', 'whisper-large-v3')
      gf.append('language', language)
      gf.append('response_format', 'json')
      gf.append('prompt', 'расход, доход, долг, рублей, тысяч, заплатил, купил, кафе, такси, зарплата')

      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        body: gf,
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({ text: data.text || '', ok: true })
      }
    }

    return NextResponse.json({ error: 'API kalit topilmadi' }, { status: 500 })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
