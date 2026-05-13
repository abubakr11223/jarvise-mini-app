// Telegram shaxsiy akkauntdagi barcha kontaktlar
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

async function kvSetObj(key: string, value: unknown, ex?: number) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  const url = ex ? `${REDIS_URL}/set/${key}/ex/${ex}` : `${REDIS_URL}/set/${key}`
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(value),
  }).catch(() => {})
}

export type TgContact = {
  id: string
  name: string
  firstName: string
  lastName: string
  username: string
  phone: string
  online: boolean
  lastSeen?: string
}

// GET — barcha kontaktlar
export async function GET() {
  const session = await kvGet('tg_userbot_session')
  if (!session) {
    return NextResponse.json({ ok: false, error: 'Ulangan emas. Avval /userbot sozlang.' })
  }

  // Cache tekshiruv (5 daqiqa)
  const cached = await kvGet('tg_userbot_contacts_cache')
  if (cached) {
    try {
      return NextResponse.json({ ok: true, contacts: JSON.parse(cached), cached: true })
    } catch {}
  }

  try {
    const client = new TelegramClient(
      new StringSession(session), API_ID, API_HASH,
      { connectionRetries: 2, timeout: 20 }
    )
    await client.connect()

    // Barcha kontaktlarni olish
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = await client.invoke(new Api.contacts.GetContacts({ hash: 0 as any }))
    await client.disconnect()

    if (!(result instanceof Api.contacts.Contacts)) {
      return NextResponse.json({ ok: true, contacts: [] })
    }

    const contacts: TgContact[] = (result.users as Api.User[])
      .filter(u => u instanceof Api.User)
      .map(u => ({
        id:        u.id?.toString() || '',
        name:      [u.firstName, u.lastName].filter(Boolean).join(' ') || u.username || '',
        firstName: u.firstName || '',
        lastName:  u.lastName  || '',
        username:  u.username  || '',
        phone:     u.phone     || '',
        online:    u.status instanceof Api.UserStatusOnline,
        lastSeen:  u.status instanceof Api.UserStatusOffline
          ? new Date(u.status.wasOnline * 1000).toLocaleDateString('ru-RU')
          : undefined,
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // 5 daqiqa cache
    await kvSetObj('tg_userbot_contacts_cache', contacts, 300)

    return NextResponse.json({ ok: true, contacts, total: contacts.length })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg })
  }
}

// POST — telefon raqam orqali kontakt qo'shish (Telegramga import)
export async function POST(req: NextRequest) {
  const session = await kvGet('tg_userbot_session')
  if (!session) return NextResponse.json({ ok: false, error: 'Ulangan emas.' })

  const body = await req.json().catch(() => ({})) as {
    phone: string; firstName?: string; lastName?: string
  }
  const phone = (body.phone || '').trim()
  if (!phone) return NextResponse.json({ ok: false, error: 'Telefon raqami kerak' })

  // Raqamni formatlash: + bilan boshlash
  const cleanPhone = phone.startsWith('+') ? phone : `+${phone}`

  try {
    const client = new TelegramClient(
      new StringSession(session), API_ID, API_HASH,
      { connectionRetries: 2, timeout: 20 }
    )
    await client.connect()

    // Telegramga import qilish
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const InputPhoneContact = Api.InputPhoneContact as any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const ImportContacts = Api.contacts.ImportContacts as any
    const result = await client.invoke(new ImportContacts({
      contacts: [new InputPhoneContact({
        clientId:  Date.now(),
        phone:     cleanPhone,
        firstName: body.firstName || cleanPhone,
        lastName:  body.lastName  || '',
      })],
    }))

    await client.disconnect()

    // Cache ni o'chirish (yangi kontakt qo'shildi)
    if (REDIS_URL && REDIS_TOKEN) {
      await fetch(`${REDIS_URL}/del/tg_userbot_contacts_cache`, {
        method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
      }).catch(() => {})
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = result as any
    const imported = res.imported || []
    const users    = (res.users || []) as Api.User[]

    if (imported.length === 0 && users.length === 0) {
      return NextResponse.json({ ok: false, error: 'Foydalanuvchi topilmadi. Bu raqam Telegramda ro\'yxatdan o\'tmagan.' })
    }

    const u = users[0] as Api.User | undefined
    return NextResponse.json({
      ok: true,
      contact: u ? {
        id:        u.id?.toString() || '',
        name:      [u.firstName, u.lastName].filter(Boolean).join(' ') || cleanPhone,
        firstName: u.firstName || '',
        lastName:  u.lastName  || '',
        username:  u.username  || '',
        phone:     u.phone     || cleanPhone,
        online:    false,
      } : null,
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg })
  }
}
