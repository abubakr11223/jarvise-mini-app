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
const CACHE_KEY  = 'tg_userbot_chats_v3'
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

    // ── Batch 1: GetDialogs to'g'ridan-to'g'ri API chaqiruvi (tez, ishonchli)
    const { Api } = await import('telegram/tl')
    let offsetDate = 0
    let offsetId   = 0
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let offsetPeer: any = new Api.InputPeerEmpty()
    const BATCH = 100

    for (let page = 0; page < 5; page++) {   // max 500 dialog (5 × 100)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const result = await (client as any).invoke(new Api.messages.GetDialogs({
        offsetDate,
        offsetId,
        offsetPeer,
        limit:       BATCH,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        hash:        0 as any,
        excludePinned: false,
        folderId:    undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      })) as any

      const dialogs  = result.dialogs  || []
      const messages = result.messages || []
      const users    = result.users    || []
      const chats    = result.chats    || []

      // Messages map
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msgMap = new Map<string, any>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const m of messages) msgMap.set(`${m.peerId?.userId||m.peerId?.chatId||m.peerId?.channelId}_${m.id}`, m)

      // Entity maps
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const userMap = new Map<string, any>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const chatMap = new Map<string, any>()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const u of users) userMap.set(String(u.id), u)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      for (const c of chats) chatMap.set(String(c.id), c)

      for (const dialog of dialogs) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const peer = dialog.peer as any
          const userId    = peer?.userId    ? String(peer.userId)    : null
          const chatId    = peer?.chatId    ? String(peer.chatId)    : null
          const channelId = peer?.channelId ? String(peer.channelId) : null
          const id = userId || chatId || channelId || ''
          if (!id || seen.has(id)) continue
          seen.add(id)

          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          let e: any = null
          if (userId)    e = userMap.get(userId)
          if (chatId)    e = chatMap.get(chatId)
          if (channelId) e = chatMap.get(channelId)
          if (!e) continue

          const cls = e.className || ''
          let type: TgChat['type'] = 'private'
          if      (cls === 'Channel' && e.megagroup)  type = 'supergroup'
          else if (cls === 'Channel')                 type = 'channel'
          else if (cls === 'Chat')                    type = 'group'
          else if (cls === 'User' && e.bot)           type = 'bot'

          const title = e.title
            || [e.firstName, e.lastName].filter(Boolean).join(' ').trim()
            || e.username || ''
          if (!title) continue

          // Oxirgi xabar
          const topMsg  = messages.find((m: { id: number }) => m.id === dialog.topMessage)
          const lastMsg  = (topMsg?.message || '').slice(0, 80)
          const lastDate = topMsg?.date
            ? new Date(topMsg.date * 1000).toLocaleString('ru-RU', {
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

      // Keyingi sahifa uchun offset
      if (dialogs.length < BATCH) break  // oxirgi batch
      const last = dialogs[dialogs.length - 1]
      offsetDate = messages.find((m: { id: number }) => m.id === last?.topMessage)?.date || offsetDate
      offsetId   = last?.topMessage || offsetId
      offsetPeer = last?.peer || offsetPeer
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
