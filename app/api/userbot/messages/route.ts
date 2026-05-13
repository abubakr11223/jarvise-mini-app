// Telegram xabar yuborish va o'qish — kontakt va chatlar uchun
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

function resolveEntity(p: {
  chatId?: string; userId?: string; username?: string; phone?: string
}): string {
  if (p.username) return `@${p.username.replace('@', '')}`
  if (p.chatId)   return p.chatId
  if (p.phone)    return p.phone
  return p.userId!
}

// ── POST — xabar yoki ovoz yuborish ──────────────────────────────────────
export async function POST(req: NextRequest) {
  const session = await kvGet('tg_userbot_session')
  if (!session) return NextResponse.json({ ok: false, error: 'Ulangan emas.' })

  // Content-type ni tekshirish
  const ct = req.headers.get('content-type') || ''

  if (ct.includes('multipart/form-data')) {
    // ── Ovoz xabar (audio file) ────────────────────────────────────
    const form     = await req.formData()
    const audio    = form.get('audio') as File | null
    const target   = form.get('target') as string | null   // userId / chatId / @username
    const targetType = form.get('targetType') as string | null

    if (!audio || !target) {
      return NextResponse.json({ ok: false, error: 'audio va target kerak' })
    }

    try {
      const client = makeClient(session)
      await client.connect()

      const entity  = targetType === 'username' ? `@${target.replace('@','')}` : target
      const buffer  = Buffer.from(await audio.arrayBuffer())

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (client as any).sendFile(entity, {
        file:       buffer,
        fileName:   'voice.ogg',
        mimeType:   'audio/ogg',
        voiceNote:  true,
        forceDocument: false,
      })

      await client.disconnect()
      return NextResponse.json({ ok: true, sent: 'voice' })
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      return NextResponse.json({ ok: false, error: msg })
    }
  }

  // ── Matn xabar ────────────────────────────────────────────────────
  const body = await req.json().catch(() => ({})) as {
    userId?: string; chatId?: string; username?: string; phone?: string
    message: string; silent?: boolean
  }

  if (!body.message) return NextResponse.json({ ok: false, error: 'Xabar matni kerak' })
  if (!body.userId && !body.chatId && !body.username && !body.phone)
    return NextResponse.json({ ok: false, error: 'userId, chatId, username yoki phone kerak' })

  try {
    const client = makeClient(session)
    await client.connect()

    const entity = resolveEntity(body)
    await client.sendMessage(entity, {
      message: body.message,
      silent:  body.silent ?? false,
    })
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
  const chatId   = req.nextUrl.searchParams.get('chatId')
  const username = req.nextUrl.searchParams.get('username')
  const limit    = parseInt(req.nextUrl.searchParams.get('limit') || '40')

  if (!userId && !chatId && !username)
    return NextResponse.json({ ok: false, error: 'userId, chatId yoki username kerak' })

  try {
    const client = makeClient(session)
    await client.connect()

    const entity   = resolveEntity({ userId: userId||undefined, chatId: chatId||undefined, username: username||undefined })
    const messages = await client.getMessages(entity, { limit })
    await client.disconnect()

    const result = messages.map(m => ({
      id:   m.id,
      text: m.message || '',
      date: new Date(m.date * 1000).toLocaleString('ru-RU', {
              day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit'
            }),
      out:  m.out,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      from: (m as any).fromId ? String((m as any).fromId) : null,
      // Media type ko'rsatish uchun
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      media: (m as any).media ? (
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).media?.document?.mimeType?.includes('audio') ? '🎤 Ovoz xabar' :
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).media?.photo ? '🖼 Rasm' :
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (m as any).media?.document ? '📎 Fayl' : '📎 Media'
      ) : null,
    }))

    return NextResponse.json({ ok: true, messages: result })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg })
  }
}

// ── PUT — username/phone orqali foydalanuvchi qidirish ───────────────────
export async function PUT(req: NextRequest) {
  const session = await kvGet('tg_userbot_session')
  if (!session) return NextResponse.json({ ok: false, error: 'Ulangan emas.' })

  const body = await req.json().catch(() => ({})) as { query: string }
  const q    = (body.query || '').trim()
  if (!q) return NextResponse.json({ ok: false, error: 'Query kerak' })

  try {
    const client = makeClient(session)
    await client.connect()

    // @username yoki +telefon raqam
    const entity = q.startsWith('+') ? q : `@${q.replace('@','')}`

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const user = await client.getEntity(entity) as any
    await client.disconnect()

    return NextResponse.json({
      ok: true,
      user: {
        id:        String(user.id || ''),
        name:      [user.firstName, user.lastName].filter(Boolean).join(' ') || user.username || '',
        firstName: user.firstName || '',
        lastName:  user.lastName  || '',
        username:  user.username  || '',
        phone:     user.phone     || '',
        type:      user.className || 'User',
      }
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    // Topilmadi xatosi
    if (msg.includes('Cannot find') || msg.includes('USERNAME_NOT_OCCUPIED') || msg.includes('PHONE_NOT_OCCUPIED')) {
      return NextResponse.json({ ok: false, error: 'Foydalanuvchi topilmadi' })
    }
    return NextResponse.json({ ok: false, error: msg })
  }
}

// ── PATCH — ResolveUsername (channel/group uchun ham) ────────────────────
export async function PATCH(req: NextRequest) {
  const session = await kvGet('tg_userbot_session')
  if (!session) return NextResponse.json({ ok: false, error: 'Ulangan emas.' })

  const body = await req.json().catch(() => ({})) as { username: string }
  const uname = (body.username || '').replace('@','').trim()
  if (!uname) return NextResponse.json({ ok: false, error: 'Username kerak' })

  try {
    const client = makeClient(session)
    await client.connect()

    const result = await client.invoke(new Api.contacts.ResolveUsername({ username: uname }))
    await client.disconnect()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const peer = result as any
    const users = peer.users || []
    const chats = peer.chats || []
    const entity = users[0] || chats[0]
    if (!entity) return NextResponse.json({ ok: false, error: 'Topilmadi' })

    return NextResponse.json({
      ok: true,
      entity: {
        id:        String(entity.id || ''),
        name:      entity.title || [entity.firstName, entity.lastName].filter(Boolean).join(' ') || entity.username || '',
        username:  entity.username || '',
        type:      entity.className || '',
      }
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg })
  }
}
