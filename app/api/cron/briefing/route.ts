// Avtomatik ertalabki/kechki briefing — Vercel Cron + qo'lda ishga tushirish
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const maxDuration = 30

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const OWNER_ID    = process.env.TELEGRAM_OWNER_CHAT_ID   // /id buyrug'i bilan olinadi
const NOTION_TOKEN = process.env.NOTION_TOKEN
const REDIS_URL   = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

// ── Telegram ──────────────────────────────────────────────────────────────
async function tgSend(chat_id: string, text: string) {
  if (!BOT_TOKEN || !chat_id) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'Markdown' }),
  }).catch(() => {})
}

// ── Redis ─────────────────────────────────────────────────────────────────
async function redisGet(key: string): Promise<unknown> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const r = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await r.json()
    return result ? JSON.parse(result) : null
  } catch { return null }
}

// Raw string (not JSON) — owner chat_id uchun
async function redisGetRaw(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const r = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await r.json()
    return result ? String(result).replace(/^"|"$/g, '') : null
  } catch { return null }
}

// ── Notion helpers ────────────────────────────────────────────────────────
const NH = (): Record<string, string> => NOTION_TOKEN ? ({
  Authorization: `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
}) : ({ 'Content-Type': 'application/json', 'Notion-Version': '2022-06-28' })

function extractTitle(item: Record<string, unknown>): string {
  if (item.object === 'database') {
    return (item.title as Array<{plain_text:string}>)?.[0]?.plain_text || 'Database'
  }
  const props = (item.properties || {}) as Record<string, Record<string, unknown>>
  const titleProp = Object.values(props).find(p => p?.type === 'title')
  const arr = titleProp?.title as Array<{plain_text:string}> | undefined
  return arr?.[0]?.plain_text || 'Nomsiz'
}

async function notionGetTasks(): Promise<{title:string; status:string; db:string}[]> {
  if (!NOTION_TOKEN) return []
  try {
    // 1. Barcha itemlarni izla
    const search = await fetch('https://api.notion.com/v1/search', {
      method: 'POST', headers: NH(),
      body: JSON.stringify({ page_size: 20 }),
    }).then(r => r.json())

    const tasks: {title:string; status:string; db:string}[] = []

    for (const item of (search.results || []) as Array<Record<string, unknown>>) {
      if (item.object !== 'database') continue
      const dbTitle = extractTitle(item)

      // Har bir database'ni so'ra
      const qr = await fetch(`https://api.notion.com/v1/databases/${item.id}/query`, {
        method: 'POST', headers: NH(),
        body: JSON.stringify({
          page_size: 30,
          sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }],
        }),
      }).then(r => r.json()).catch(() => ({ results: [] }))

      for (const page of (qr.results || []) as Array<Record<string, unknown>>) {
        const props = (page.properties || {}) as Record<string, Record<string, unknown>>
        const title = extractTitle(page)
        if (!title) continue

        const statusProp = Object.values(props).find(p => p?.type === 'status' || p?.type === 'select')
        const status = (statusProp?.status as {name:string})?.name
          || (statusProp?.select as {name:string})?.name || ''

        tasks.push({ title, status, db: dbTitle })
      }
    }
    return tasks.slice(0, 30)
  } catch { return [] }
}

// ── Moliyaviy ma'lumot ────────────────────────────────────────────────────
async function getFinanceToday(): Promise<{totalX:number; totalD:number; topCat:string}> {
  try {
    type Expense = { type: string; amount: number; name: string; date: string }
    const all = (await redisGet('jonka_expenses') || []) as Expense[]
    const todayStr = new Date().toLocaleDateString('ru-RU')
    const todayExps = all.filter(e => e.date === todayStr)
    const totalX = todayExps.filter(e => e.type === 'XARAJAT').reduce((s, e) => s + e.amount, 0)
    const totalD = todayExps.filter(e => e.type === 'DAROMAT').reduce((s, e) => s + e.amount, 0)
    const catMap: Record<string, number> = {}
    todayExps.filter(e => e.type === 'XARAJAT').forEach(e => { catMap[e.name] = (catMap[e.name] || 0) + e.amount })
    const topCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    return { totalX, totalD, topCat }
  } catch { return { totalX: 0, totalD: 0, topCat: '' } }
}

async function getUnpaidDebts(): Promise<{person:string; amount:number; dir:string}[]> {
  try {
    type Debt = { paid: boolean; person: string; amount: number; dir: string }
    const all = (await redisGet('jonka_debts') || []) as Debt[]
    return all.filter(d => !d.paid).slice(0, 5).map(d => ({
      person: d.person, amount: d.amount, dir: d.dir,
    }))
  } catch { return [] }
}

function fmtN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`
  return String(n)
}

// ── Asosiy briefing qurish ────────────────────────────────────────────────
export async function buildBriefing(type: 'morning' | 'evening'): Promise<string> {
  const now   = new Date()
  const dateStr = now.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const dayName = now.toLocaleDateString('ru-RU', { weekday: 'long' })

  const [tasks, fin, debts] = await Promise.all([
    notionGetTasks(),
    getFinanceToday(),
    getUnpaidDebts(),
  ])

  if (type === 'morning') {
    // ── Ertalabki briefing ─────────────────────────────────────────
    const inProgress = tasks.filter(t =>
      /в процессе|in progress|doing|active|работа/i.test(t.status))
    const notStarted = tasks.filter(t =>
      /не начато|not started|todo|backlog|планир/i.test(t.status))
    const done = tasks.filter(t =>
      /выполнено|done|complete|завершен/i.test(t.status))

    let msg = `🌅 *Ertalabki briefing — ${dateStr}*\n`
    msg += `_${dayName.charAt(0).toUpperCase() + dayName.slice(1)}_\n\n`

    if (inProgress.length > 0) {
      msg += `🔄 *Davom etayotgan (${inProgress.length}):*\n`
      inProgress.slice(0, 5).forEach(t => {
        msg += `• ${t.title}${t.db !== t.title ? ` _(${t.db})_` : ''}\n`
      })
      msg += '\n'
    }

    if (notStarted.length > 0) {
      msg += `📋 *Boshlanmagan (${notStarted.length}):*\n`
      notStarted.slice(0, 5).forEach(t => {
        msg += `• ${t.title}${t.db !== t.title ? ` _(${t.db})_` : ''}\n`
      })
      msg += '\n'
    }

    if (done.length > 0) {
      msg += `✅ *Bajarilgan: ${done.length} ta*\n\n`
    }

    if (tasks.length === 0) {
      msg += `📭 _Notion'da vazifalar topilmadi_\n\n`
    }

    if (debts.length > 0) {
      msg += `🤝 *To'lanmagan qarzlar (${debts.length}):*\n`
      debts.forEach(d => {
        const dir = d.dir === 'gave' ? '📤 Men berdim' : '📥 Men oldim'
        msg += `• ${d.person} — ${fmtN(d.amount)} so'm ${dir}\n`
      })
      msg += '\n'
    }

    msg += `💡 _Yaxshi kun! Bugun ham kuchli bo'ling_ 💪\n`
    msg += `\n_/briefing — qo'lda briefing · /id — chat ID_`

    return msg

  } else {
    // ── Kechki hisobot ─────────────────────────────────────────────
    const done = tasks.filter(t =>
      /выполнено|done|complete|завершен/i.test(t.status))
    const inProgress = tasks.filter(t =>
      /в процессе|in progress|doing|active/i.test(t.status))

    let msg = `🌙 *Kechki hisobot — ${dateStr}*\n\n`

    if (done.length > 0) {
      msg += `✅ *Bajarilgan: ${done.length} ta vazifa*\n\n`
    }

    if (inProgress.length > 0) {
      msg += `🔄 *Hali davom etayotgan (${inProgress.length}):*\n`
      inProgress.slice(0, 5).forEach(t => {
        msg += `• ${t.title}\n`
      })
      msg += '\n'
    }

    if (fin.totalX > 0 || fin.totalD > 0) {
      msg += `💰 *Bugungi moliya:*\n`
      if (fin.totalX > 0) msg += `• Xarajat: *${fmtN(fin.totalX)} so'm*`
      if (fin.topCat)     msg += ` _(ko'proq: ${fin.topCat})_`
      if (fin.totalX > 0) msg += '\n'
      if (fin.totalD > 0) msg += `• Daromat: *${fmtN(fin.totalD)} so'm*\n`
      msg += '\n'
    }

    if (debts.length > 0) {
      msg += `🤝 *Eslatma — ${debts.length} ta to'lanmagan qarz*\n`
      debts.slice(0, 3).forEach(d => {
        msg += `• ${d.person} — ${fmtN(d.amount)} so'm\n`
      })
      msg += '\n'
    }

    msg += `🌙 _Yaxshi dam oling!_`
    return msg
  }
}

// ── GET — Cron yoki qo'lda chaqiruv ──────────────────────────────────────
export async function GET(req: NextRequest) {
  // Vercel Cron authentifikatsiyasi
  const authHeader = req.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const type = (req.nextUrl.searchParams.get('type') || 'morning') as 'morning' | 'evening'
  // Ustuvorlik: query param → env var → Redis (foydalanuvchi /id yuborgan)
  const redisChatId = await redisGetRaw('jarvis_owner_chat_id')
  const chatId = req.nextUrl.searchParams.get('chat_id') || OWNER_ID || redisChatId

  if (!chatId) {
    return NextResponse.json({
      ok: false,
      error: 'Chat ID topilmadi. Botga /id yuboring — keyingi briefingdan boshlab avtomatik ishlaydi.',
    })
  }

  try {
    const msg = await buildBriefing(type)
    await tgSend(chatId, msg)
    return NextResponse.json({ ok: true, type, sent_to: chatId })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}
