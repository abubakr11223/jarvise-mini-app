import { NextRequest, NextResponse } from 'next/server'

const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL ||
  "https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495"

// n8n javobidan xarajat ma'lumotini ajratib olish
function extractExpense(text: string): { name: string; amount: number; type: string } | null {
  const lower = text.toLowerCase()

  // Xarajat/daromat saqlanganligi haqida kalit so'zlar (UZ + RU)
  const savedKeywords = [
    'yozib olindi', 'saqlandi', "qo'shildi", 'qoshildi', 'qeyd qilindi',
    'bazangizga', 'notion', 'muvaffaqiyatli', 'добавлено', 'записано', 'сохранено', 'учтено'
  ]
  const isExpenseSaved = savedKeywords.some(k => lower.includes(k))
  if (!isExpenseSaved) return null

  // Daromat yoki xarajat turi
  const incomeKeywords = ['daromat', 'kirim', 'тушум', 'доход', 'получено', 'income']
  const type = incomeKeywords.some(k => lower.includes(k)) ? 'DAROMAT' : 'XARAJAT'

  // Summani ajratish: "45,000 so'm" yoki "45000 som" yoki "45 000 UZS"
  const amountMatch = text.match(/(\d[\d\s,]*)\s*(?:so['']?m|som|сум|uzs|узс)/i)
  if (!amountMatch) return null
  const amount = parseInt(amountMatch[1].replace(/[\s,]/g, ''))
  if (!amount || amount < 100) return null

  // Kategoriya nomini ajratish (turli format)
  const namePatterns = [
    /📝\s*Nomi:\s*([^\n]+)/i,
    /[-–]\s*📝\s*Nomi:\s*([^\n]+)/i,
    /\*\*Nomi[*:]+\s*([^\n*]+)/i,
    /Nomi:\s*([^\n,]+)/i,
    /\*\*Категория[*:]+\s*([^\n*]+)/i,
    /Название:\s*([^\n,]+)/i,
    /\*\*Toifa[*:]+\s*([^\n*]+)/i,
  ]
  let name = type === 'XARAJAT' ? 'Xarajat' : 'Daromat'
  for (const pattern of namePatterns) {
    const m = text.match(pattern)
    if (m) { name = m[1].trim().replace(/\*+/g, '').replace(/[📝💰📂]/g, '').trim(); break }
  }

  return { name, amount, type }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || ''
    let n8nResponse: Response

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData()
      n8nResponse = await fetch(N8N_WEBHOOK_URL, { method: 'POST', body: formData })
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
        { error: `N8n xatosi: ${n8nResponse.status} — ${errorText.slice(0, 200)}` },
        { status: n8nResponse.status }
      )
    }

    const responseText = await n8nResponse.text()
    let data: unknown
    try { data = JSON.parse(responseText) } catch { return NextResponse.json({ reply: responseText }) }

    // Javob matnini olish — turli formatlarni qo'llab-quvvatlash
    let reply = ''
    if (data && typeof data === 'object') {
      const d = data as Record<string, unknown>
      reply = String(d.reply || d.response || d.text || d.message || d.output || '')
      if (!reply && Array.isArray(data) && data.length > 0) {
        const first = data[0] as Record<string, unknown>
        reply = String(first?.reply || first?.text || first?.message || first?.output || '')
      }
    } else if (typeof data === 'string') {
      reply = data
    }

    if (!reply) return NextResponse.json({ reply: '✅ Qabul qilindi!' })

    // Agar [EXPENSE:...] pattern yo'q bo'lsa, smart parser ishlatamiz
    const hasExpenseCode = /\[EXPENSE:/i.test(reply)
    const expense = hasExpenseCode ? null : extractExpense(reply)

    return NextResponse.json({
      reply,
      ...(expense ? { expense } : {}),
    })
  } catch (error) {
    console.error('Proxy xatosi:', error)
    return NextResponse.json(
      { error: 'Server xatosi: ' + (error instanceof Error ? error.message : String(error)) },
      { status: 500 }
    )
  }
}
