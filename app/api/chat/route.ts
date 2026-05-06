import { NextRequest, NextResponse } from 'next/server'

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495"

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''

    let n8nResponse: Response

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        body: formData,
      })
    } else {
      const body = await request.json()
      n8nResponse = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
    }

    if (!n8nResponse.ok) {
      const errorText = await n8nResponse.text()
      return NextResponse.json(
        { error: `N8n xatosi: ${n8nResponse.status} - ${errorText}` },
        { status: n8nResponse.status }
      )
    }

    const responseText = await n8nResponse.text()

    // n8n turli formatda javob qaytarishi mumkin
    let data: unknown
    try {
      data = JSON.parse(responseText)
    } catch {
      // Agar JSON bo'lmasa, matn sifatida qaytaramiz
      return NextResponse.json({ reply: responseText })
    }

    // Turli formatlarni qo'llab-quvvatlaymiz
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      if (d.reply) return NextResponse.json(data)
      if (d.response) return NextResponse.json({ reply: d.response })
      if (d.text) return NextResponse.json({ reply: d.text })
      if (d.message) return NextResponse.json({ reply: d.message })
      if (d.output) return NextResponse.json({ reply: d.output })
      // Array bo'lsa, birinchi elementni olamiz
      if (Array.isArray(data) && data.length > 0) {
        const first = data[0] as Record<string, unknown>
        const reply = first?.reply || first?.response || first?.text || first?.message || first?.output || JSON.stringify(first)
        return NextResponse.json({ reply })
      }
    }

    if (typeof data === 'string') {
      return NextResponse.json({ reply: data })
    }

    return NextResponse.json({ reply: '✅ Qabul qilindi!' })
  } catch (error) {
    console.error('Proxy xatosi:', error)
    return NextResponse.json(
      { error: 'Server xatosi: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
