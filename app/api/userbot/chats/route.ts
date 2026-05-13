// Barcha Telegram dialoglar — iterDialogs bilan to'liq ro'yxat
import { NextResponse } from 'next/server'
import { TelegramClient } from 'telegram'
import { StringSession } from 'telegram/sessions'

export const runtime    = 'nodejs'
export const maxDuration = 55

const API_ID    = parseInt(process.env.TELEGRAM_API_ID   || '0')
const API_HASH  = process.env.TELEGRAM_API_HASH          || ''
const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const CACHE_KEY  = 'tg_userbot_chats_v5'
const CACHE_TTL  = 300  // 5 daqiqa

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

export interface TgChat {
  id:           string
  title:        string
  type:         'private' | 'group' | 'supergroup' | 'channel' | 'bot'
  username:     string
  unread:       number
  lastMsg:      string
  lastDate:     string
  pinned:       boolean
  membersCount?: number
}

export async function GET(req: Request) {
  const url     = new URL(req.url)
  const refresh = url.searchParams.get('refresh') === '1'

  if (!refresh) {
    const cached = await kvGet(CACHE_KEY)
    if (cached) {
      try {
        const list = JSON.parse(cached)
        if (Array.isArray(list) && list.length > 0)
          return NextResponse.json({ ok: true, chats: list, total: list.length, cached: true })
      } catch {}
    }
  }

  const session = await kvGet('tg_userbot_session')
  if (!session) return NextResponse.json({ ok: false, error: 'Telegram ulangan emas.' })
  if (!API_ID || !API_HASH) return NextResponse.json({ ok: false, error: 'API sozlanmagan' })

  try {
    const client = new TelegramClient(
      new StringSession(session), API_ID, API_HASH,
      { connectionRetries: 3, timeout: 50 }
    )
    await client.connect()

    const allChats: TgChat[] = []
    const seen = new Set<string>()

    // client.getDialogs() — GramJS high-level metod, pagination o'zi boshqaradi
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dialogs = await (client as any).getDialogs({ limit: 500, offsetDate: 0 })

    for (const dialog of dialogs) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const e = dialog.entity as any
        if (!e) continue

        const id = String(e.id || dialog.id || '')
        if (!id || seen.has(id)) continue
        seen.add(id)

        const cls = e.className || ''
        let type: TgChat['type'] = 'private'
        if      (cls === 'Channel' && e.megagroup)  type = 'supergroup'
        else if (cls === 'Channel')                 type = 'channel'
        else if (cls === 'Chat')                    type = 'group'
        else if (cls === 'User' && e.bot)           type = 'bot'

        const title = dialog.title
          || [e.firstName, e.lastName].filter(Boolean).join(' ').trim()
          || e.username || ''
        if (!title) continue

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const lm       = dialog.message as any
        const lastMsg  = (lm?.message || '').slice(0, 80)
        const lastDate = lm?.date
          ? new Date(lm.date * 1000).toLocaleString('ru-RU', {
              day: '2-digit', month: '2-digit',
              hour: '2-digit', minute: '2-digit',
            })
          : ''

        allChats.push({
          id,
          title,
          type,
          username:     e.username || '',
          unread:       dialog.unreadCount || 0,
          lastMsg,
          lastDate,
          pinned:       !!dialog.pinned,
          membersCount: e.participantsCount || undefined,
        })
      } catch { continue }
    }

    await client.disconnect()

    // Saralash: pinned → unread → lastDate (descending)
    allChats.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1
      if (!a.pinned && b.pinned) return 1
      if (b.unread !== a.unread) return b.unread - a.unread
      if (a.lastDate && b.lastDate) return b.lastDate.localeCompare(a.lastDate)
      return 0
    })

    await kvSet(CACHE_KEY, JSON.stringify(allChats), CACHE_TTL)

    return NextResponse.json({ ok: true, chats: allChats, total: allChats.length, cached: false })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg })
  }
}
