// SSE stream — QR login real-time (GramJS signInUserWithQrCode)
// Client EventSource bilan ulanadi, QR yangilanadi, login bo'lsa 'done' keladi
import { NextResponse } from 'next/server'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'

export const runtime  = 'nodejs'
export const maxDuration = 55   // Vercel Pro: 300s, Hobby: 60s

const API_ID    = parseInt(process.env.TELEGRAM_API_ID   || '0')
const API_HASH  = process.env.TELEGRAM_API_HASH          || ''
const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

async function kvSet(key: string, value: string) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  await fetch(`${REDIS_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: value,
  }).catch(() => {})
}

export async function GET() {
  if (!API_ID || !API_HASH) {
    return NextResponse.json({ error: 'API sozlanmagan' }, { status: 500 })
  }

  const enc = new TextEncoder()
  const send = (ctrl: ReadableStreamDefaultController, obj: object) => {
    ctrl.enqueue(enc.encode(`data: ${JSON.stringify(obj)}\n\n`))
  }

  const stream = new ReadableStream({
    async start(ctrl) {
      const client = new TelegramClient(
        new StringSession(''), API_ID, API_HASH,
        { connectionRetries: 3, timeout: 50 }
      )

      try {
        await client.connect()
        send(ctrl, { type: 'connected' })

        await client.signInUserWithQrCode(
          { apiId: API_ID, apiHash: API_HASH },
          {
            qrCode: async (qr) => {
              const token = Buffer.from(qr.token).toString('base64url')
              const tgUrl = `tg://login?token=${token}`
              send(ctrl, { type: 'qr', token, tgUrl })
            },
            password: async () => {
              // 2FA — oddiy parolni so'raymiz (keyingi versiyada)
              send(ctrl, { type: '2fa' })
              return ''
            },
            onError: async (err) => {
              send(ctrl, { type: 'error', error: err.message })
              return true
            },
          }
        )

        // Login muvaffaqiyatli
        const sessionStr = client.session.save() as unknown as string
        if (sessionStr && sessionStr.length > 10) {
          await kvSet('tg_userbot_session', sessionStr)

          // Foydalanuvchi ma'lumotlari
          try {
            const me = await client.getMe()
            send(ctrl, {
              type: 'done',
              user: {
                name: [me.firstName, me.lastName].filter(Boolean).join(' '),
                username: me.username,
                phone: me.phone,
              },
            })
          } catch {
            send(ctrl, { type: 'done' })
          }
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e)
        send(ctrl, { type: 'error', error: msg })
      } finally {
        await client.disconnect().catch(() => {})
        ctrl.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}
