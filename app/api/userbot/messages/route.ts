// Telegram kontaktga xabar yuborish va oxirgi xabarlarni o'qish
import { NextRequest, NextResponse } from 'next/server'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'
import { Api } from 'telegram/tl'

export const runtime = 'nodejs'
export const maxDuration = 30

const API_ID    = parseInt(process.env.TELEGRAM_API_ID   || '0')
const API_HASH  = process.env.TELEGRAM_API_HASH          || ''
const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

async function kvGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const r = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await r.json()
    return result ? String(result).replace(/^"|"$/g, '') : null
  } catch { return null }
}

function makeClient(sessionStr: string) {
  return new TelegramClient(
    new StringSession(sessionStr), API_ID, API_HASH,
    { connectionRetries: 2, timeout: 20 }
  )
}

// ── POST — xabar yuborish ─────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await kvGet('tg_userbot_session')
  if (!session) return NextResponse.json({ ok: false, error: 'Ulangan emas.' })

  const { userId, username, phone, message } = await req.json().catch(() => ({})) as {
    userId?: string; username?: string; phone?: string; message: string
  }

  if (!message) return NextResponse.json({ ok: false, error: 'Xabar matni kerak' })
  if (!userId && !username && !phone)
    return NextResponse.json({ ok: false, error: 'userId, username yoki phone kerak' })

  try {
    const client = makeClient(session)
    await client.connect()

    // Kontaktni aniqlash
    const entity = username
      ? `@${username.replace('@', '')}`
      : phone
        ? phone
        : userId!

    await client.sendMessage(entity, { message })
    await client.disconnect()

    return NextResponse.json({ ok: true, sent: true })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg })
  }
}

// ── GET — oxirgi xabarlar ─────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  const session = await kvGet('tg_userbot_session')
  if (!session) return NextResponse.json({ ok: false, error: 'Ulangan emas.' })

  const userId   = req.nextUrl.searchParams.get('userId')
  const username = req.nextUrl.searchParams.get('username')
  const limit    = parseInt(req.nextUrl.searchParams.get('limit') || '20')

  if (!userId && !username)
    return NextResponse.json({ ok: false, error: 'userId yoki username kerak' })

  try {
    const client = makeClient(session)
    await client.connect()

    const entity = username
      ? `@${username.replace('@', '')}`
      : userId!

    const messages = await client.getMessages(entity, { limit })
    await client.disconnect()

    const result = messages.map(m => ({
      id:        m.id,
      text:      m.message || '',
      date:      new Date(m.date * 1000).toLocaleString('ru-RU'),
      out:       m.out,     // true = men yubordim, false = u yubordi
    }))

    return NextResponse.json({ ok: true, messages: result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg })
  }
}
