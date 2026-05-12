// Telegram shaxsiy akkauntdagi barcha kontaktlar
import { NextResponse } from 'next/server'
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
