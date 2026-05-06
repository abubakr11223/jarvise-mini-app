import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const GROQ_API_KEY = process.env.GROQ_API_KEY
  if (!GROQ_API_KEY) {
    return NextResponse.json({ error: 'GROQ_API_KEY sozlanmagan' }, { status: 500 })
  }

  try {
    const formData = await request.formData()
    const audio = formData.get('audio') as File | null
    if (!audio) return NextResponse.json({ error: 'Audio fayl topilmadi' }, { status: 400 })

    const language = (formData.get('language') as string) || 'uz'

    const groqForm = new FormData()
    groqForm.append('file', audio, 'audio.webm')
    groqForm.append('model', 'whisper-large-v3-turbo')
    groqForm.append('language', language)
    groqForm.append('response_format', 'json')

    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
      body: groqForm,
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
