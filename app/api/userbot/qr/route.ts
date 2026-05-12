// QR kod orqali Telegram login — flood wait yo'q, kod kerak emas
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

async function kvSet(key: string, value: string, ex?: number) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  const url = ex ? `${REDIS_URL}/set/${key}/ex/${ex}` : `${REDIS_URL}/set/${key}`
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: value,
  }).catch(() => {})
}

// ── POST — QR token yaratish ──────────────────────────────────────────────
export async function POST() {
  if (!API_ID || !API_HASH) {
    return NextResponse.json({ ok: false, error: 'API sozlanmagan' })
  }
  try {
    const client = new TelegramClient(new StringSession(''), API_ID, API_HASH,
      { connectionRetries: 2, timeout: 20 })
    await client.connect()

    const result = await client.invoke(new Api.auth.ExportLoginToken({
      apiId: API_ID, apiHash: API_HASH, exceptIds: [],
    }))
    await client.disconnect()

    if (!(result instanceof Api.auth.LoginToken)) {
      return NextResponse.json({ ok: false, error: 'QR token yaratib bo\'lmadi' })
    }

    const tokenB64 = Buffer.from(result.token).toString('base64url')
    const tgUrl    = `tg://login?token=${tokenB64}`
    const expires  = result.expires            // unix timestamp

    // Tokenni Redis ga saqlash (tekshirish uchun)
    await kvSet('tg_qr_token', tokenB64, 30)

    return NextResponse.json({ ok: true, token: tokenB64, tgUrl, expires })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String(e) })
  }
}

// ── GET — login bo'ldimi tekshirish (polling) ─────────────────────────────
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  if (!token) return NextResponse.json({ ok: false, error: 'token kerak' })

  try {
    const client = new TelegramClient(new StringSession(''), API_ID, API_HASH,
      { connectionRetries: 2, timeout: 20 })
    await client.connect()

    const tokenBuf = Buffer.from(token, 'base64url')

    let result
    try {
      result = await client.invoke(new Api.auth.ExportLoginToken({
        apiId: API_ID, apiHash: API_HASH, exceptIds: [],
      }))
    } catch { result = null }

    // Agar LoginTokenSuccess bo'lsa — ulandi!
    if (result instanceof Api.auth.LoginTokenSuccess ||
        result instanceof Api.auth.LoginTokenMigrateTo) {
      const sessionStr = client.session.save() as unknown as string
      await client.disconnect()
      if (sessionStr && sessionStr.length > 10) {
        await kvSet('tg_userbot_session', sessionStr)
        const me = await (async () => {
          try {
            const c2 = new TelegramClient(new StringSession(sessionStr), API_ID, API_HASH, {})
            await c2.connect(); const m = await c2.getMe(); await c2.disconnect(); return m
          } catch { return null }
        })()
        return NextResponse.json({
          ok: true, connected: true,
          user: me ? {
            name: [me.firstName, me.lastName].filter(Boolean).join(' '),
            username: me.username, phone: me.phone,
          } : null,
        })
      }
    }

    // Hali kutilmoqda — tokenni yangilash
    try {
      await client.invoke(new Api.auth.AcceptLoginToken({ token: tokenBuf }))
      const sessionStr = client.session.save() as unknown as string
      await client.disconnect()
      if (sessionStr && sessionStr.length > 10) {
        await kvSet('tg_userbot_session', sessionStr)
        return NextResponse.json({ ok: true, connected: true })
      }
    } catch {}

    await client.disconnect()
    return NextResponse.json({ ok: true, connected: false, waiting: true })
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: String(e) })
  }
}
