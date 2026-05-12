// Gmail API — list, read, search
import { NextRequest, NextResponse } from 'next/server'
import { gmailList, gmailRead, gmailSearch } from '../../../lib/gmail'

export const runtime = 'nodejs' // Buffer kerak

const isConfigured = () =>
  !!(process.env.GMAIL_CLIENT_ID &&
     process.env.GMAIL_CLIENT_SECRET &&
     process.env.GMAIL_REFRESH_TOKEN)

export async function GET(request: NextRequest) {
  if (!isConfigured()) {
    return NextResponse.json({ ok: false, setup_required: true,
      message: 'GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET va GMAIL_REFRESH_TOKEN kerak' })
  }

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action') || 'list'
  const q      = searchParams.get('q') || 'in:inbox'
  const id     = searchParams.get('id')

  if (action === 'list') {
    const messages = await gmailList(q)
    return NextResponse.json({ ok: true, messages })
  }

  if (action === 'search' && q) {
    const messages = await gmailSearch(q)
    return NextResponse.json({ ok: true, messages })
  }

  if (action === 'read' && id) {
    const message = await gmailRead(id)
    if (!message) return NextResponse.json({ ok: false, error: 'Not found' })
    return NextResponse.json({ ok: true, message })
  }

  return NextResponse.json({ ok: false, error: 'Unknown action' })
}
