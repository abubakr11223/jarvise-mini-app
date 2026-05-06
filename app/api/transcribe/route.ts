import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY
  const GROQ_API_KEY       = process.env.GROQ_API_KEY

  try {
    const formData = await request.formData()
    const audio    = formData.get('audio') as File | null
    if (!audio) return NextResponse.json({ error: 'Audio fayl topilmadi' }, { status: 400 })

    const language = (formData.get('language') as string) || 'uz'

    // ── ElevenLabs Scribe — eng yaxshi o'zbek/rus tili (agar kalit bo'lsa) ──
    if (ELEVENLABS_API_KEY) {
      const el = new FormData()
      el.append('file', audio, 'audio.webm')
      el.append('model_id', 'scribe_v1')
      el.append('language_code', language === 'ru' ? 'ru' : 'uz')

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
      return NextResponse.json({ error: 'GROQ_API_KEY yoki ELEVENLABS_API_KEY kerak' }, { status: 500 })
    }

    const gf = new FormData()
    gf.append('file', audio, 'audio.webm')
    gf.append('model', 'whisper-large-v3')   // turbo emas — aniqroq model
    gf.append('language', language)
    gf.append('response_format', 'json')
    // Vocabulary hint — o'zbek moliya so'zlari uchun
    gf.append('prompt', "xarajat, daromat, qarz, so'm, ming, berdim, oldim, kafeda, taksi, maosh, oziq-ovqat, supermarket")

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
      { error: 'Transkriptsiya xatosi: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
