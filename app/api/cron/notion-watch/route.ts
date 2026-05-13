// Notion o'zgarishlarini real-time kuzatish
// Har 5 daqiqada ishga tushadi (Vercel cron yoki tashqi cron)
// Yangi sahifa, status o'zgarishi, yangi DB — hammasi Telegramga keladi

import { NextRequest, NextResponse } from 'next/server'

export const runtime    = 'nodejs'
export const maxDuration = 55

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN
const OWNER_ID     = process.env.TELEGRAM_OWNER_CHAT_ID
const NOTION_TOKEN = process.env.NOTION_TOKEN
const REDIS_URL    = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN  = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

const SNAP_KEY   = 'notion_watch_snapshot'  // Redis key — oldingi holat
const CHAT_KEY   = 'jarvis_owner_chat_id'

// ── Redis helpers ─────────────────────────────────────────────────────────
async function rGet(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const r = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await r.json()
    return result ? String(result).replace(/^"|"$/g, '') : null
  } catch { return null }
}

async function rSet(key: string, value: string, ex?: number) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  const url = ex ? `${REDIS_URL}/set/${key}/ex/${ex}` : `${REDIS_URL}/set/${key}`
  await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: value,
  }).catch(() => {})
}

// ── Notion helpers ────────────────────────────────────────────────────────
const NH = (): Record<string, string> => ({
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
})

function getTitle(item: Record<string, unknown>): string {
  if (item.object === 'database') {
    return (item.title as Array<{ plain_text: string }>)?.[0]?.plain_text || 'Database'
  }
  const props = (item.properties || {}) as Record<string, Record<string, unknown>>
  const tp = Object.values(props).find(p => p?.type === 'title')
  const arr = tp?.title as Array<{ plain_text: string }> | undefined
  return arr?.[0]?.plain_text || ''
}

function getStatus(props: Record<string, Record<string, unknown>>): string {
  for (const p of Object.values(props)) {
    if (p?.type === 'status')   return (p.status  as { name: string })?.name || ''
    if (p?.type === 'select')   return (p.select   as { name: string })?.name || ''
    if (p?.type === 'checkbox') return (p.checkbox as boolean) ? 'Done' : 'Not started'
  }
  return ''
}

type NotionPage = {
  id:         string
  title:      string
  status:     string
  dbId:       string
  dbTitle:    string
  editedAt:   string
  createdAt:  string
  archived:   boolean
}

// Barcha DB lardan barcha sahifalarni olish
async function fetchAllPages(): Promise<NotionPage[]> {
  if (!NOTION_TOKEN) return []
  try {
    // 1. Barcha DB larni top
    const search = await fetch('https://api.notion.com/v1/search', {
      method: 'POST', headers: NH(), cache: 'no-store',
      body: JSON.stringify({
        filter: { property: 'object', value: 'database' },
        page_size: 30,
      }),
    }).then(r => r.json())

    const pages: NotionPage[] = []

    for (const db of (search.results || []) as Array<Record<string, unknown>>) {
      if (db.object !== 'database') continue
      const dbId    = String(db.id)
      const dbTitle = getTitle(db)

      // Har DB dagi sahifalarni olish
      const qr = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
        method: 'POST', headers: NH(), cache: 'no-store',
        body: JSON.stringify({
          page_size: 50,
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        }),
      }).then(r => r.json()).catch(() => ({ results: [] }))

      for (const pg of (qr.results || []) as Array<Record<string, unknown>>) {
        const props   = (pg.properties || {}) as Record<string, Record<string, unknown>>
        const title   = getTitle(pg)
        if (!title) continue

        pages.push({
          id:        String(pg.id),
          title,
          status:    getStatus(props),
          dbId,
          dbTitle,
          editedAt:  String(pg.last_edited_time || ''),
          createdAt: String(pg.created_time || ''),
          archived:  Boolean(pg.archived),
        })
      }
    }

    return pages
  } catch { return [] }
}

// ── Telegram xabar ───────────────────────────────────────────────────────
async function tgSend(chatId: string, text: string) {
  if (!BOT_TOKEN || !chatId) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'Markdown' }),
  }).catch(() => {})
}

// Status emoji
function statusEmoji(s: string): string {
  if (/done|complet|bajarildi|tugal|выполнено|завершен|finish/i.test(s)) return '✅'
  if (/progress|doing|jarayonda|bajarilmoqda|в процессе/i.test(s))        return '🔄'
  if (/cancel|arxiv|closed/i.test(s))                                      return '🗃'
  return '📝'
}

// ── Asosiy mantiq ─────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  // Auth tekshiruv
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    // tashqi cron uchun query param ham qabul qiladi
    const qsSecret = req.nextUrl.searchParams.get('secret')
    if (qsSecret !== cronSecret) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
  }

  if (!NOTION_TOKEN) {
    return NextResponse.json({ ok: false, error: 'NOTION_TOKEN sozlanmagan' })
  }

  // Chat ID
  const chatId = await rGet(CHAT_KEY) || OWNER_ID || ''
  if (!chatId) {
    return NextResponse.json({ ok: false, error: 'Chat ID topilmadi. /id yuboring.' })
  }

  try {
    // Hozirgi Notion holati
    const current = await fetchAllPages()
    if (current.length === 0) {
      return NextResponse.json({ ok: true, message: 'Sahifalar topilmadi' })
    }

    // Oldingi snapshot
    const snapRaw  = await rGet(SNAP_KEY)
    const snapshot: Record<string, NotionPage> = snapRaw ? JSON.parse(snapRaw) : null

    // Yangi snapshot (id → page map)
    const currentMap: Record<string, NotionPage> = {}
    current.forEach(p => { currentMap[p.id] = p })

    // Birinchi marta ishga tushganda — snapshot saqlab chiqamiz, xabar yubormaymiz
    if (!snapshot) {
      await rSet(SNAP_KEY, JSON.stringify(currentMap), 86400 * 7) // 7 kun
      return NextResponse.json({ ok: true, message: 'Dastlabki snapshot saqlandi', count: current.length })
    }

    // O'zgarishlarni aniqlash
    const changes: string[] = []

    for (const page of current) {
      const old = snapshot[page.id]

      if (!old) {
        // Yangi sahifa qo'shilgan
        if (!page.archived) {
          const dbInfo = page.dbTitle && page.dbTitle !== page.title ? ` _(${page.dbTitle})_` : ''
          changes.push(`➕ *Yangi:* ${page.title}${dbInfo}`)
        }
        continue
      }

      // Status o'zgardi
      if (old.status !== page.status && page.status && old.status) {
        const e = statusEmoji(page.status)
        const dbInfo = page.dbTitle && page.dbTitle !== page.title ? ` _(${page.dbTitle})_` : ''
        changes.push(`${e} *Status:* ${page.title}${dbInfo}\n   _${old.status} → ${page.status}_`)
      }

      // Arxivlandi (o'chirildi)
      if (!old.archived && page.archived) {
        changes.push(`🗑 *O'chirildi:* ${page.title}`)
      }

      // Nom o'zgardi
      if (old.title !== page.title && old.title && page.title) {
        changes.push(`✏️ *Nomi o'zgardi:* _${old.title}_ → *${page.title}*`)
      }
    }

    // Snapshotda bor, hozir yo'q (o'chirilgan) — lekin archived ham qarab ko'ramiz
    for (const [id, old] of Object.entries(snapshot)) {
      if (!currentMap[id] && !old.archived) {
        changes.push(`🗑 *O'chirildi:* ${old.title}`)
      }
    }

    // Snapshot yangilash
    await rSet(SNAP_KEY, JSON.stringify(currentMap), 86400 * 7)

    if (changes.length === 0) {
      return NextResponse.json({ ok: true, changes: 0 })
    }

    // Telegram xabar yuborish
    const limit = 10
    const shown = changes.slice(0, limit)
    const extra = changes.length > limit ? `\n_...va yana ${changes.length - limit} ta_` : ''

    const msg = `🔔 *Notion yangilandi* (${changes.length} ta o'zgarish)\n\n` +
      shown.join('\n') + extra

    await tgSend(chatId, msg)

    return NextResponse.json({ ok: true, changes: changes.length, sent: shown })

  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ ok: false, error: msg }, { status: 500 })
  }
}
