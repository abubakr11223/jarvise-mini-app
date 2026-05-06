import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
  const GROQ_API_KEY       = process.env.GROQ_API_KEY

  try {
    const formData = await request.formData()
    const audio    = formData.get('audio') as File | null
    if (!audio) return NextResponse.json({ error: 'Audio fayl topilmadi' }, { status: 400 })

    const language = (formData.get('language') as string) || 'ru'

    // ── ElevenLabs Scribe — rus tili uchun eng yaxshi ──────────────────────
    if (ELEVENLABS_API_KEY) {
      const el = new FormData()
      el.append('file', audio, 'audio.webm')
      el.append('model_id', 'scribe_v1')
      el.append('language_code', language)
      el.append('tag_audio_events', 'false')  // tezroq — musiqa/shovqin tahlilini o'chiradi
      el.append('num_speakers', '1')           // tezroq — 1 kishi gapiradi

      const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
        method: 'POST',
        headers: { 'xi-api-key': ELEVENLABS_API_KEY },
        body: el,
      })
      if (res.ok) {
        const data = await res.json()
        return NextResponse.json({ text: data.text || '' })
      }
    }

    // ── Groq Whisper fallback ──────────────────────────────────────────────
    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: 'API kalit kerak' }, { status: 500 })
    }

    const gf = new FormData()
    gf.append('file', audio, 'audio.webm')
    gf.append('model', 'whisper-large-v3')
    gf.append('language', language)
    gf.append('response_format', 'json')
    gf.append('prompt', 'расход, доход, долг, рублей, тысяч, заплатил, купил, кафе, такси, зарплата, перевёл')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: gf,
    })

    if (!res.ok) {
      const err = await res.text()
      return NextResponse.json({ error: `Groq xatosi: ${err.slice(0, 200)}` }, { status: res.status })
    }

    const data = await res.json()
    return NextResponse.json({ text: data.text || '' })
  } catch (error) {
    return NextResponse.json(
      { error: 'Xato: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
