// Telegram shaxsiy akkaunt autentifikatsiyasi (MTProto/GramJS)
// ENV kerak: TELEGRAM_API_ID, TELEGRAM_API_HASH (https://my.telegram.org/apps dan olinadi)
import { NextRequest, NextResponse } from 'next/server'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'

export const runtime = 'nodejs'
export const maxDuration = 30

const API_ID    = parseInt(process.env.TELEGRAM_API_ID    || '0')
const API_HASH  = process.env.TELEGRAM_API_HASH           || ''
const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

// ── Redis helpers ─────────────────────────────────────────────────────────
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

async function kvDel(key: string) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  await fetch(`${REDIS_URL}/del/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
  }).catch(() => {})
}

// ── TG Client factory ─────────────────────────────────────────────────────
function makeClient(sessionStr = '') {
  return new TelegramClient(
    new StringSession(sessionStr),
    API_ID,
    API_HASH,
    { connectionRetries: 2, timeout: 20 }
  )
}

// ── GET — holat tekshiruvi ────────────────────────────────────────────────
export async function GET() {
  if (!API_ID || !API_HASH) {
    return NextResponse.json({
      ok: false,
      error: 'TELEGRAM_API_ID / TELEGRAM_API_HASH sozlanmagan',
      setup: 'https://my.telegram.org/apps ga kiring va App yarating',
    })
  }
  const session = await kvGet('tg_userbot_session')
  if (!session) {
    return NextResponse.json({ ok: true, connected: false, step: 'phone' })
  }
  // Session bor — tekshirish
  try {
    const client = makeClient(session)
    await client.connect()
    const me = await client.getMe()
    await client.disconnect()
    return NextResponse.json({
      ok: true, connected: true,
      user: {
        id: me.id?.toString(),
        name: [me.firstName, me.lastName].filter(Boolean).join(' '),
        username: me.username,
        phone: me.phone,
      },
    })
  } catch {
    await kvDel('tg_userbot_session')
    return NextResponse.json({ ok: true, connected: false, step: 'phone' })
  }
}

// ── POST — auth flow ──────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  if (!API_ID || !API_HASH) {
    return NextResponse.json({ ok: false, error: 'API sozlanmagan' })
  }

  const body = await req.json().catch(() => ({}))
  const { action } = body as { action: string }

  // ── 1. Telefon raqami yuborish → OTP ─────────────────────────────────
  if (action === 'phone') {
    const { phone } = body as { phone: string }
    if (!phone) return NextResponse.json({ ok: false, error: 'Telefon raqami kerak' })

    try {
      const { Api: TLApi } = await import('telegram/tl')
      const client = makeClient()
      await client.connect()

      // SMS majburiy so'rash (Telegram app emas)
      const result = await client.invoke(new TLApi.auth.SendCode({
        phoneNumber: phone,
        apiId: API_ID,
        apiHash: API_HASH,
        settings: new TLApi.CodeSettings({
          allowFlashcall: false,
          currentNumber:  false,
          allowAppHash:   false,
          allowMissedCall: false,
        }),
      }))
      await client.disconnect()

      await kvSet('tg_userbot_pending', JSON.stringify({
        phone,
        phoneCodeHash: (result as { phoneCodeHash: string }).phoneCodeHash,
      }), 600)

      return NextResponse.json({ ok: true, step: 'code', hint: 'Telegramga kod keldi' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      // Flood wait — qancha kutish kerakligini ko'rsatish
      const waitMatch = msg.match(/wait of (\d+) seconds/)
      if (waitMatch) {
        const secs  = parseInt(waitMatch[1])
        const hours = Math.floor(secs / 3600)
        const mins  = Math.floor((secs % 3600) / 60)
        return NextResponse.json({ ok: false,
          error: `Telegram ${hours > 0 ? `${hours} soat ` : ''}${mins} daqiqa kutishni talab qilmoqda. Keyinroq urinib ko'ring.`,
          flood_wait: secs,
        })
      }
      return NextResponse.json({ ok: false, error: `Kod yuborib bo'lmadi: ${msg}` })
    }
  }

  // ── 2. OTP kodni tasdiqlash ───────────────────────────────────────────
  if (action === 'verify') {
    const { code } = body as { code: string }
    const pendingRaw = await kvGet('tg_userbot_pending')
    if (!pendingRaw) return NextResponse.json({ ok: false, error: 'Sessiya muddati tugadi. Qayta boshlang.' })

    let pending: { phone: string; phoneCodeHash: string }
    try { pending = JSON.parse(pendingRaw) } catch {
      return NextResponse.json({ ok: false, error: 'Sessiya xatosi. Qayta boshlang.' })
    }

    try {
      const client = makeClient()
      await client.connect()
      await client.invoke(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        new (await import('telegram/tl')).Api.auth.SignIn({
          phoneNumber: pending.phone,
          phoneCodeHash: pending.phoneCodeHash,
          phoneCode: code.trim(),
        }) as Parameters<typeof client.invoke>[0]
      )
      const sessionStr = client.session.save() as unknown as string
      await client.disconnect()

      await kvSet('tg_userbot_session', sessionStr)
      await kvDel('tg_userbot_pending')

      return NextResponse.json({ ok: true, step: 'done', message: 'Muvaffaqiyatli ulandi!' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      if (msg.includes('SESSION_PASSWORD_NEEDED')) {
        return NextResponse.json({ ok: true, step: '2fa', message: '2FA parol kerak' })
      }
      return NextResponse.json({ ok: false, error: `Kod noto'g'ri: ${msg}` })
    }
  }

  // ── 3. 2FA parol ─────────────────────────────────────────────────────
  if (action === '2fa') {
    const { password } = body as { password: string }
    const pendingRaw = await kvGet('tg_userbot_pending')
    if (!pendingRaw) return NextResponse.json({ ok: false, error: 'Sessiya muddati tugadi.' })

    const pending: { phone: string; phoneCodeHash: string } = JSON.parse(pendingRaw)
    try {
      const client = makeClient()
      await client.connect()
      // Re-signIn with password
      await client.signInWithPassword(
        { apiId: API_ID, apiHash: API_HASH },
        {
          password: async () => password,
          onError: async (err: Error) => { throw err },
        }
      )
      const sessionStr = client.session.save() as unknown as string
      await client.disconnect()

      await kvSet('tg_userbot_session', sessionStr)
      await kvDel('tg_userbot_pending')

      return NextResponse.json({ ok: true, step: 'done', message: 'Muvaffaqiyatli ulandi!' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ ok: false, error: `2FA xato: ${msg}` })
    }
  }

  // ── 4. Chiqish (disconnect) ───────────────────────────────────────────
  if (action === 'logout') {
    await kvDel('tg_userbot_session')
    await kvDel('tg_userbot_pending')
    return NextResponse.json({ ok: true, message: 'Chiqildi' })
  }

  return NextResponse.json({ ok: false, error: "Noma'lum amal" })
}
