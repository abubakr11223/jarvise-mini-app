import { NextRequest, NextResponse } from 'next/server'
import { kvAdd, kvGet as kvGetExps } from '../expenses/route'
import { kvDebtAdd } from '../debts/route'
import { kvGetBudgets, kvSetBudget } from '../budgets/route'
import { parseAllExpenses, parseAllDebts, parseBudgetCommand, parseBankSMS } from '../../../lib/expense-parser'
import { buildBriefing } from '../cron/briefing/route'

const BOT_TOKEN    = process.env.TELEGRAM_BOT_TOKEN
const BOT_APP      = process.env.TELEGRAM_BOT_APP || 'app'
const BOT_USERNAME = process.env.TELEGRAM_BOT_USERNAME || 'hisob_shaxsiy_bot'
const N8N_URL      = process.env.N8N_WEBHOOK_URL ||
  'https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495'
const NOTION_TOKEN  = process.env.NOTION_TOKEN
const NOTION_PARENT = process.env.NOTION_PARENT_PAGE_ID
const REDIS_URL     = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN   = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

const today = () => new Date().toLocaleDateString('ru-RU')

// ── Redis yozish / o'qish ─────────────────────────────────────────────────
async function redisSet(key: string, value: string) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  await fetch(`${REDIS_URL}/set/${key}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: value,
  }).catch(() => {})
}

async function redisGetStr(key: string): Promise<string | null> {
  if (!REDIS_URL || !REDIS_TOKEN) return null
  try {
    const r = await fetch(`${REDIS_URL}/get/${key}`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await r.json()
    return result ? String(result).replace(/^"|"$/g, '') : null
  } catch { return null }
}

// ── Kirill → Lotin transliteratsiya (O'zbek ismlari uchun) ───────────────
function cyrToLat(s: string): string {
  const map: Record<string,string> = {
    'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'j','з':'z',
    'и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r',
    'с':'s','т':'t','у':'u','ф':'f','х':'x','ц':'ts','ч':'ch','ш':'sh','щ':'sh',
    'ъ':"'",'ы':'i','ь':'','э':'e','ю':'yu','я':'ya',
    'ў':'o\'','қ':'q','ғ':'g\'','ҳ':'h',
  }
  return s.toLowerCase().split('').map(c => map[c] ?? c).join('')
}

// Ismdan kelishik qo'shimchasini olib tashlash
function normName(s: string): string {
  return s.toLowerCase()
    // O'zbek: -ga, -ge, -ka, -ni, -ning
    .replace(/(?:ga|ge|ka|ke|ni|ning|da|dan|ga|ни|га|ге|ка|ке)$/i, '')
    // Rus: -у, -ю, -е, -и, -а, -я (dativ/genitiv)
    .replace(/[уюеияа]$/i, '')
    .trim()
}

// ── "Xga ayt Y" pattern — O'zbek va Rus ──────────────────────────────────
// Kontakt nomi bo'lmagan umumiy so'zlarni filter qilish
function isCommonWord(name: string): boolean {
  const n = name.toLowerCase()
  if (n.length < 2) return true
  // Rus: umumiy ot va olmoshlar (kontakt nomi emas)
  if (/^(?:задач|задан|задание|проект|список|файл|план|текст|код|данн|отчёт|отчет|инфо|открыт|актив|запис|заметк|встреч|документ|функц|сообщен|уведомл|кнопк|меню|страниц|разделе|результат|работ|процесс|вопрос|ответ|пункт|блок|секц|шаг|этап|пример|прикрепл|пр\.|п\.|нет|да|мне|тебе|нам|им|ему|ей|его|её|ее|нему|все|всё|всех|это|те|то|тому|нечто|такой)/.test(n)) return true
  // O'zbek: umumiy so'zlar
  if (/^(?:vazifa|topshiriq|loyiha|barcha|hamma|nima|qanday|ish|reja|hammasi|barchasi|hech|yo[''']q|ha|ok|bu|shu|u|men|sen|biz)/.test(n)) return true
  return false
}

function parseSendToContact(text: string): { name: string; message: string } | null {
  // 1. Rus tartibi: "скажи/передай [kim]га/у [nima]"
  //    "скажи сухроботу что я домой приду позже"
  const ruFirst = text.match(
    /(?:скажи|передай|напиши|отправь|сообщи)\s+([\wА-Яа-яЎўҚқҒғҲҳ']+?)(?:[уюеияа]|га|ге)?\s+(?:что\s+|чтобы\s+)?(.+)/i
  )
  if (ruFirst) {
    const name = normName(ruFirst[1])
    // Umumiy so'z bo'lsa — kontakt emas
    if (isCommonWord(name)) return null
    return { name, message: ruFirst[2].trim() }
  }

  // 2. O'zbek tartibi: "[kim]ga ayt/yoz/de [nima]"
  //    "Suxrobga ayt ertaga boraman"
  const uzFirst = text.match(
    /^([\wА-Яа-яЎўҚқҒғҲҳ']+?)(?:га|ге|ge|ga|ка|ke)\s+(?:ayt|ayting|de|deng|yoz|yuvor|yetkaz|jibor|передай|скажи|напиши)\s+(.+)/i
  )
  if (uzFirst) {
    const name = normName(uzFirst[1])
    if (isCommonWord(name)) return null
    return { name, message: uzFirst[2].trim() }
  }

  // 3. "[kim]га скажи / [kim]га де" — aralash
  const mixed = text.match(
    /^([\wА-Яа-яЎўҚқҒғҲҳ']+?)(?:га|ге|ge|ga)\s+(?:скажи|передай|de|ayt|yoz)\s+(.+)/i
  )
  if (mixed) {
    const name = normName(mixed[1])
    if (isCommonWord(name)) return null
    return { name, message: mixed[2].trim() }
  }

  return null
}

// ── Kontaktni nomdan izlash (Redis cache) ─────────────────────────────────
async function findContact(name: string): Promise<{ id: string; username: string; phone: string; name: string } | null> {
  const raw = await redisGetStr('tg_userbot_contacts_cache')
  if (!raw) return null
  try {
    const contacts: { id: string; name: string; firstName: string; username: string; phone: string }[] = JSON.parse(raw)

    const q      = name.toLowerCase()          // e.g. "сухроб"
    const qLat   = cyrToLat(q)                 // e.g. "suxrob"
    const qFirst = q.slice(0, 4)               // first 4 chars for fuzzy
    const qLatFirst = qLat.slice(0, 4)

    const score = (c: typeof contacts[0]) => {
      const cn  = c.name.toLowerCase()
      const cfn = c.firstName.toLowerCase()
      if (cn === q || cfn === q)               return 10  // to'liq mos
      if (cn === qLat || cfn === qLat)         return 10
      if (cn.startsWith(q) || cfn.startsWith(q))      return 8
      if (cn.startsWith(qLat) || cfn.startsWith(qLat)) return 8
      if (cn.includes(q) || cfn.includes(q))  return 6
      if (cn.includes(qLat) || cfn.includes(qLat)) return 6
      // Kirill kontakt, Lotin qidiruv (yoki aksincha)
      const cnLat = cyrToLat(cn)
      if (cnLat.startsWith(qLat) || cnLat.includes(qLat)) return 5
      if (cn.startsWith(qFirst) || cfn.startsWith(qFirst))   return 3
      if (cn.startsWith(qLatFirst) || cfn.startsWith(qLatFirst)) return 3
      return 0
    }

    const best = contacts.map(c => ({ c, s: score(c) })).filter(x => x.s > 0).sort((a,b)=>b.s-a.s)[0]
    return best?.c || null
  } catch { return null }
}

// ── ElevenLabs TTS → Ovoz (Buffer) ───────────────────────────────────────
async function generateTTS(text: string): Promise<Buffer | null> {
  const EL = process.env.ELEVENLABS_API_KEY
  if (!EL) return null
  try {
    const res = await fetch('https://api.elevenlabs.io/v1/text-to-speech/21m00Tcm4TlvDq8ikWAM', {
      method: 'POST',
      headers: { 'xi-api-key': EL, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text,
        model_id: 'eleven_multilingual_v2',
        voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        output_format: 'mp3_44100_128',
      }),
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      console.error('ElevenLabs TTS error:', res.status, err)
      return null
    }
    return Buffer.from(await res.arrayBuffer())
  } catch (e) {
    console.error('ElevenLabs TTS exception:', e)
    return null
  }
}

// ── Userbot orqali xabar (matn yoki ovoz) yuborish ───────────────────────
async function sendViaUserbot(
  contact: { id: string; username: string; phone: string; name: string },
  message: string,
  asVoice = false
): Promise<{ ok: boolean; sentAsVoice: boolean }> {
  const sessionStr = await redisGetStr('tg_userbot_session')
  if (!sessionStr) return { ok: false, sentAsVoice: false }

  const API_ID   = parseInt(process.env.TELEGRAM_API_ID || '0')
  const API_HASH = process.env.TELEGRAM_API_HASH || ''
  if (!API_ID || !API_HASH) return { ok: false, sentAsVoice: false }

  try {
    const { TelegramClient } = await import('telegram')
    const { StringSession }  = await import('telegram/sessions')

    const client = new TelegramClient(
      new StringSession(sessionStr), API_ID, API_HASH,
      { connectionRetries: 2, timeout: 20 }
    )
    await client.connect()

    const entity = contact.username
      ? `@${contact.username.replace('@', '')}`
      : contact.phone || contact.id

    // Ovozli xabar: TTS → sendFile
    if (asVoice) {
      const audio = await generateTTS(message)
      if (audio) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (client as any).sendFile(entity, {
            file: audio,
            fileName: 'voice.mp3',
            voiceNote: true,
            forceDocument: false,
          })
          await client.disconnect()
          return { ok: true, sentAsVoice: true }
        } catch (voiceErr) {
          console.error('sendFile voice error:', voiceErr)
          // Fallback: matn yuborish
          await client.sendMessage(entity, { message })
          await client.disconnect()
          return { ok: true, sentAsVoice: false }
        }
      }
    }

    // Oddiy matn xabar
    await client.sendMessage(entity, { message })
    await client.disconnect()
    return { ok: true, sentAsVoice: false }
  } catch (e) {
    console.error('sendViaUserbot error:', e)
    return { ok: false, sentAsVoice: false }
  }
}

// ── Raqam formatlash: 1500000 → "1.5M", 277000 → "277k" ─────────────────
function fmtN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`
  return String(n)
}

// ── Oy oxiriga prognoz: "bu tezlikda oyiga X so'm bo'ladi" ───────────────
async function buildInsight(
  saved: Array<{ name: string; amount: number; type: string }>,
  lang: 'ru' | 'uz'
): Promise<string> {
  try {
    const all = await kvGetExps()
    const now = new Date()
    // "DD.MM.YYYY" formatida → ".MM.YYYY" qismi
    const monthTag = `.${String(now.getMonth() + 1).padStart(2, '0')}.${now.getFullYear()}`
    const monthExps = all.filter(e => e.type === 'XARAJAT' && e.date.includes(monthTag))
    const totalMonth = monthExps.reduce((s, e) => s + e.amount, 0)

    const primaryCat = saved.find(e => e.type === 'XARAJAT')
    if (!primaryCat) return ''

    const catTotal = monthExps
      .filter(e => e.name === primaryCat.name)
      .reduce((s, e) => s + e.amount, 0)

    const day     = now.getDate()
    const days    = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    const proj    = day > 0 ? Math.round(catTotal / day * days) : catTotal

    if (lang === 'ru') {
      return `\n💡 Расходы на *${primaryCat.name}* в этом месяце: *${fmtN(catTotal)} so'm*` +
             (proj > catTotal ? `\n📈 Прогноз к концу месяца: ~${fmtN(proj)} so'm` : '') +
             `\n\n📊 Всего расходов за месяц: *${fmtN(totalMonth)} so'm*`
    } else {
      return `\n💡 Bu oy *${primaryCat.name}*: *${fmtN(catTotal)} so'm*` +
             (proj > catTotal ? `\n📈 Oy oxiriga prognoz: ~${fmtN(proj)} so'm` : '') +
             `\n\n📊 Oylik jami xarajat: *${fmtN(totalMonth)} so'm*`
    }
  } catch { return '' }
}

// ── Byudjet tekshiruvi — oshib ketsa ogohlantirish ────────────────────────
async function checkBudgetAlerts(
  savedExps: Array<{ name: string; amount: number; type: string }>,
  lang: 'ru' | 'uz'
): Promise<string> {
  try {
    const budgets = await kvGetBudgets()
    if (Object.keys(budgets).length === 0) return ''

    const all = await kvGetExps()
    const now = new Date()
    const monthTag = `.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
    const monthExps = all.filter(e => e.type==='XARAJAT' && e.date.includes(monthTag))

    const alerts: string[] = []

    for (const [cat, limit] of Object.entries(budgets)) {
      const spent = monthExps.filter(e => e.name===cat).reduce((s,e)=>s+e.amount, 0)
      if (spent === 0) continue
      const pct = Math.round(spent / limit * 100)

      if (pct >= 100) {
        alerts.push(lang==='ru'
          ? `🚨 *${cat}*: лимит ПРЕВЫШЕН!\n💸 Потрачено: ${fmtN(spent)} (план: ${fmtN(limit)}) — ${pct}%`
          : `🚨 *${cat}*: limit OSHIB KETDI!\n💸 Harchamlandi: ${fmtN(spent)} (reja: ${fmtN(limit)}) — ${pct}%`)
      } else if (pct >= 80) {
        const daysLeft = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate() - now.getDate()
        alerts.push(lang==='ru'
          ? `⚠️ *${cat}*: ${pct}% лимита использовано\n💡 До конца месяца: ${daysLeft} дн. Осталось: ${fmtN(limit-spent)}`
          : `⚠️ *${cat}*: limit ${pct}% ishlatildi\n💡 Oyga: ${daysLeft} kun qoldi. Qoldi: ${fmtN(limit-spent)}`)
      }
    }
    return alerts.length > 0 ? '\n\n' + alerts.join('\n') : ''
  } catch { return '' }
}

// ── Til aniqlash: Rus yoki O'zbek ─────────────────────────────────────────
function detectLang(text: string): 'ru' | 'uz' {
  const cyrillicCount = (text.match(/[а-яёА-ЯЁ]/g) || []).length
  const latinCount    = (text.match(/[a-zA-Z]/g) || []).length
  return cyrillicCount > latinCount ? 'ru' : 'uz'
}

// ── So'z chegarasi tekshiruvi (Cyrillic + Latin) ──────────────────────────
function hasWord(text: string, word: string): boolean {
  const isLetter = (c: string) => /[а-яёА-ЯЁa-zA-ZЎўҚқҒғҲҳ]/.test(c)
  let idx = 0
  while ((idx = text.indexOf(word, idx)) !== -1) {
    const before = idx > 0 ? text[idx - 1] : ' '
    const after  = idx + word.length < text.length ? text[idx + word.length] : ' '
    if (!isLetter(before) && !isLetter(after)) return true
    idx += word.length
  }
  return false
}

// ── Javobni tozalash ──────────────────────────────────────────────────────
function cleanReply(text: string): string {
  return text
    .replace(/\[EXPENSE:.*?\]/gi, '')
    .replace(/\bEXPENSE:[\w\sЀ-ӿÀ-ſ]+\|\d+\|\w+/gi, '')
    .replace(/\b(?:тысяч\s+)?(?:рублей|рубля|руб\.?)\b/gi, '')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
}

// ── Telegram API ──────────────────────────────────────────────────────────
async function tgPost(method: string, body: object) {
  if (!BOT_TOKEN) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

async function sendMessage(chat_id: number, text: string, extra?: object) {
  await tgPost('sendMessage', { chat_id, text, parse_mode: 'Markdown', ...extra })
}

async function sendPhoto(chat_id: number, photo: string, caption?: string) {
  await tgPost('sendPhoto', {
    chat_id, photo,
    ...(caption ? { caption: caption.slice(0, 1024), parse_mode: 'Markdown' } : {}),
  })
}

// ── Notion: universal type ─────────────────────────────────────────────────
type NotionItem = { id: string; title: string; url: string; type: string }
type NotionCmd =
  | { action: 'create'; title: string; emoji: string }
  | { action: 'list' }
  | { action: 'search'; query: string }
  | { action: 'read';   query: string }
  | { action: 'append'; pageQuery: string; content: string }

const NH = () => NOTION_TOKEN ? ({
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
} as Record<string, string>) : ({} as Record<string, string>)

// Extract title from raw Notion search result
function nTitle(item: Record<string, unknown>): string {
  if (item.object === 'database') {
    return (item.title as Array<{plain_text:string}>)?.[0]?.plain_text || 'Database'
  }
  const props = (item.properties || {}) as Record<string, Record<string, unknown>>
  const titleProp =
    props['title'] || props['Title'] || props['Name'] || props['Nomi'] ||
    Object.values(props).find(p => p?.type === 'title')
  const arr = (titleProp?.title || item.title) as Array<{plain_text:string}> | undefined
  return arr?.[0]?.plain_text || 'Nomsiz'
}

// List all accessible pages/databases
async function notionListItems(filter?: 'page' | 'database'): Promise<NotionItem[]> {
  if (!NOTION_TOKEN) return []
  try {
    const body: Record<string, unknown> = {
      page_size: 20,
      sort: { direction: 'descending', timestamp: 'last_edited_time' },
    }
    if (filter) body.filter = { property: 'object', value: filter }
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST', headers: NH(), body: JSON.stringify(body),
    })
    if (!res.ok) return []
    const d = await res.json()
    return (d.results || []).map((item: Record<string, unknown>) => ({
      id: item.id as string,
      title: nTitle(item),
      url: (item.url as string) || '',
      type: item.object as string,
    }))
  } catch { return [] }
}

// Search Notion by text query
async function notionSearchItems(query: string): Promise<NotionItem[]> {
  if (!NOTION_TOKEN) return []
  try {
    const res = await fetch('https://api.notion.com/v1/search', {
      method: 'POST', headers: NH(),
      body: JSON.stringify({ query, page_size: 10 }),
    })
    if (!res.ok) return []
    const d = await res.json()
    return (d.results || []).map((item: Record<string, unknown>) => ({
      id: item.id as string,
      title: nTitle(item),
      url: (item.url as string) || '',
      type: item.object as string,
    }))
  } catch { return [] }
}

// Read page blocks as plain text
async function notionReadBlocks(pageId: string, depth = 0): Promise<string> {
  if (!NOTION_TOKEN || depth > 2) return ''
  const hdr = { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' }
  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children?page_size=50`, { headers: hdr })
    if (!res.ok) return ''
    const d = await res.json()
    const lines: string[] = []
    for (const b of (d.results || []) as Array<Record<string, unknown>>) {
      const t = b.type as string
      const c = (b[t] || {}) as Record<string, unknown>
      if (t === 'column_list' || t === 'column') {
        const nested = await notionReadBlocks(b.id as string, depth + 1)
        if (nested) lines.push(nested)
      } else if (t === 'child_database') {
        const dbTitle = (c as {title?:string}).title || 'Database'
        lines.push(`\n📊 ${dbTitle}:`)
        try {
          const qr = await fetch(`https://api.notion.com/v1/databases/${b.id}/query`, {
            method: 'POST', headers: { ...hdr, 'Content-Type': 'application/json' },
            body: JSON.stringify({ page_size: 20 }),
          })
          const qd = await qr.json()
          for (const p of (qd.results || []) as Array<Record<string, unknown>>) {
            const props = (p.properties || {}) as Record<string, Record<string, unknown>>
            const titleProp = Object.values(props).find(pp => pp?.type === 'title')
            const title = (titleProp?.title as Array<{plain_text:string}>)?.[0]?.plain_text || ''
            const statusProp = Object.values(props).find(pp => pp?.type === 'status' || pp?.type === 'select')
            const status = (statusProp?.status as {name:string})?.name || (statusProp?.select as {name:string})?.name || ''
            if (title) lines.push(`  - ${title}${status ? ` [${status}]` : ''}`)
          }
        } catch {}
      } else if (t === 'child_page') {
        lines.push(`📄 ${c.title || ''}`)
      } else if (t === 'to_do') {
        const done = (c as {checked?:boolean}).checked ? '☑' : '☐'
        const txt2 = (c.rich_text as Array<{plain_text:string}>|undefined)?.map(r=>r.plain_text).join('') || ''
        if (txt2) lines.push(`${done} ${txt2}`)
      } else if (c.rich_text) {
        const txt = (c.rich_text as Array<{plain_text:string}>).map(r => r.plain_text).join('')
        if (txt.trim()) lines.push(txt)
      }
    }
    return lines.slice(0, 60).join('\n').slice(0, 2500)
  } catch { return '' }
}

// Append paragraph to a page
async function notionAppend(pageId: string, content: string): Promise<boolean> {
  if (!NOTION_TOKEN) return false
  try {
    const res = await fetch(`https://api.notion.com/v1/blocks/${pageId}/children`, {
      method: 'PATCH', headers: NH(),
      body: JSON.stringify({
        children: [{ object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content } }] } }],
      }),
    })
    return res.ok
  } catch { return false }
}

// Create page (auto-discovers parent if not set)
async function notionCreatePage(
  title: string, emoji = '📄', parentId?: string
): Promise<{ ok: boolean; url?: string; id?: string }> {
  if (!NOTION_TOKEN) return { ok: false }
  let parent = parentId || NOTION_PARENT
  if (!parent) {
    const pages = await notionListItems('page')
    const first = pages.find(p => !p.title.includes('JONKA'))
    if (first) parent = first.id
  }
  if (!parent) return { ok: false }
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST', headers: NH(),
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: parent },
        icon: { type: 'emoji', emoji },
        properties: { title: { title: [{ text: { content: title } }] } },
      }),
    })
    if (!res.ok) return { ok: false }
    const d = await res.json()
    return { ok: !!d.id, url: d.url, id: d.id }
  } catch { return { ok: false } }
}

// ── Notion: Barcha sahifalar kontekstini yuklash ─────────────────────────
// Query bilan mos sahifalar to'liq kontent + barcha nomlari hamisha uzatiladi
async function buildRichNotionContext(query: string): Promise<string> {
  if (!NOTION_TOKEN) return ''
  try {
    const allItems = await notionListItems()
    if (allItems.length === 0) return ''

    const summary = allItems
      .map(i => `${i.type === 'database' ? '🗄' : '📄'} ${i.title}`)
      .join('\n')

    const qLower   = query.toLowerCase()
    const qWords   = qLower.split(/\s+/).filter(w => w.length > 2)

    // Queryga mos sahifalar — kontent yuklash
    const matched = allItems.filter(item => {
      const t = item.title.toLowerCase()
      return qWords.some(w => t.includes(w))
    })

    if (matched.length > 0) {
      const parts: string[] = [`📚 Notion bazasidagi barcha sahifalar:\n${summary}\n`]
      for (const page of matched.slice(0, 3)) {
        const content = await notionReadBlocks(page.id)
        if (content) parts.push(`\n### ${page.title}:\n${content}`)
      }
      return parts.join('').slice(0, 6000)
    }

    // Mos kelmasa — faqat ro'yxat (AI nima borligini biladi)
    return `📚 Notion bazasidagi sahifalar (${allItems.length} ta):\n${summary}`
  } catch { return '' }
}

// ── Notion buyrug'ini ajratish (to'liq) ──────────────────────────────────
function parseNotionCmd(text: string): NotionCmd | null {
  const lower = text.toLowerCase()
  if (!lower.includes('notion')) return null

  // List
  if (/notion.*(?:ko[ʻ']rsat|список|покажи|barcha|hammasi|list\b|ro[ʻ']yxat|sahifalar|страниц|sahifa(?:lar)?ni)/i.test(lower))
    return { action: 'list' }

  // Search
  if (/notion.*(?:qidir|qidirish|найди|ищи|поиск|search\b)/i.test(lower)) {
    const q = text.replace(/notion/gi,'').replace(/qidir\w*|найди|ищи|поиск|search\b/gi,'').replace(/\s+/g,' ').trim()
    return { action: 'search', query: q || text }
  }

  // Read / open
  if (/notion.*(?:o[ʻ']qi|прочитай|read\b|tarkib|ichidagi|содержимое|открой)/i.test(lower)) {
    const q = text.replace(/notion/gi,'').replace(/o['ʻ']qi\w*|прочитай|read\b|tarkib|содержимое|открой/gi,'').replace(/\s+/g,' ').trim()
    return { action: 'read', query: q }
  }

  // Append
  if (/notion.*(?:qo[ʻ']sh|добавь|напиши|yoz(?!d)|add\b|append\b)/i.test(lower)) {
    // "Notion [page]ga [content] qo'sh"
    const m = text.match(/notion\s+(.+?)\s+(?:ga|iga|ka|к|в)\s+(.+?)(?:\s+(?:qo['ʻ']sh|добавь).*)?$/i)
    if (m) return { action: 'append', pageQuery: m[1].trim(), content: m[2].trim() }
    const rest = text.replace(/notion/gi,'').replace(/qo['ʻ']sh\w*|добавь|напиши|yoz\b|add\b|append\b/gi,'').replace(/\s+/g,' ').trim()
    return { action: 'append', pageQuery: '', content: rest }
  }

  // Create
  if (/notion.*(?:yarat|создай|сделай|yangi\b|new\b|create\b)/i.test(lower)) {
    const quoteRu = text.match(/[«"„](.+?)[»""]/)
    const quoteEn = text.match(/"(.+?)"/)
    const afterNazv = text.match(/(?:названием|nomli|named?|под названием)\s+[«"]?([^»"]+)[»"]?/i)
    const afterColon = text.match(/[:：]\s*(.+)$/)
    let title = (quoteRu?.[1] || quoteEn?.[1] || afterNazv?.[1] || afterColon?.[1] || '').trim()
    if (!title) {
      title = text
        .replace(/notion/gi,'').replace(/yarat\w*|создай|сделай|yangi|new|create/gi,'')
        .replace(/sahifa|папку|папк|страниц|файл|fayl/gi,'').replace(/\s+/g,' ').trim()
      title = title.split(/\s+/).slice(-3).join(' ')
    }
    const isProject = /проект|loyiha|project/i.test(text)
    const isFolder  = /папк|folder/i.test(text)
    const isTask    = /задач|task|vazifa/i.test(text)
    const isDB      = /database|база|jadval/i.test(text)
    const emoji = isProject?'🚀':isFolder?'📁':isTask?'✅':isDB?'🗄️':'📄'
    return { action: 'create', title: title || 'Yangi sahifa', emoji }
  }

  return null
}

// ── Foto/screenshot dan matn va tranzaksiya ajratish (Groq Vision) ───────
async function analyzePhoto(file_id: string): Promise<string> {
  if (!BOT_TOKEN) return ''
  const GROQ = process.env.GROQ_API_KEY
  if (!GROQ) return ''
  try {
    const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${file_id}`)
      .then(r => r.json())
    if (!info.ok) return ''

    const imgBuf = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`)
      .then(r => r.arrayBuffer())
    const base64   = Buffer.from(imgBuf).toString('base64')
    const mimeType = (info.result.file_path as string).endsWith('.png') ? 'image/png' : 'image/jpeg'

    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-4-scout-17b-16e-instruct',
        messages: [{
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            { type: 'text', text:
              `Bu bank ilovasi, chek yoki to'lov screenshoti. ` +
              `Tranzaksiya ma'lumotlarini O'ZBEK tilida qisqa matn sifatida qaytaring, masalan: ` +
              `"Payme orqali 75000 so'm to'landi. Bolt taksi." ` +
              `Agar bank SMS matn ko'rsak, to'liq nusxa ko'chiring. ` +
              `Tranzaksiya yo'q bo'lsa FAQAT "null" deb yozing.`
            }
          ]
        }],
        max_tokens: 256,
        temperature: 0,
      }),
    })
    if (!res.ok) return ''
    const d = await res.json()
    const txt = (d.choices?.[0]?.message?.content || '').trim()
    return txt.toLowerCase() === 'null' ? '' : txt
  } catch { return '' }
}

// ── Ovozni matnga aylantirish ─────────────────────────────────────────────
async function transcribeVoice(file_id: string): Promise<string> {
  if (!BOT_TOKEN) return ''
  const ELEVENLABS = process.env.ELEVENLABS_API_KEY
  const GROQ       = process.env.GROQ_API_KEY

  const info = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/getFile?file_id=${file_id}`)
    .then(r => r.json())
  if (!info.ok) return ''

  const audio = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${info.result.file_path}`)
    .then(r => r.arrayBuffer())
  const blob = new Blob([audio], { type: 'audio/ogg' })

  if (ELEVENLABS) {
    const fd = new FormData()
    fd.append('file', blob, 'voice.ogg')
    fd.append('model_id', 'scribe_v1')
    // language_code YO'Q → auto-detect (O'zbek + Rus)
    fd.append('tag_audio_events', 'false')
    fd.append('num_speakers', '1')
    const res = await fetch('https://api.elevenlabs.io/v1/speech-to-text', {
      method: 'POST', headers: { 'xi-api-key': ELEVENLABS }, body: fd,
    })
    if (res.ok) { const d = await res.json(); if (d.text) return d.text }
  }
  if (GROQ) {
    const fd = new FormData()
    fd.append('file', blob, 'voice.ogg')
    fd.append('model', 'whisper-large-v3')
    // language YO'Q → Whisper auto-detect
    fd.append('response_format', 'json')
    fd.append('prompt', "xarajat, daromat, qarz, ming so'm, berdim, oldim, расход, доход, долг, зарплата, тысяч, сум")
    const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${GROQ}` }, body: fd,
    })
    if (res.ok) { const d = await res.json(); return d.text || '' }
  }
  return ''
}

// ── Web qidirish (DuckDuckGo / Serper.dev) ────────────────────────────────
async function webSearch(query: string): Promise<string> {
  try {
    const SERPER = process.env.SERPER_API_KEY
    if (SERPER) {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': SERPER, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5, gl: 'uz', hl: 'ru' }),
      })
      if (res.ok) {
        const d = await res.json()
        const parts: string[] = []
        if (d.answerBox?.answer)  parts.push(d.answerBox.answer)
        if (d.answerBox?.snippet) parts.push(d.answerBox.snippet)
        ;(d.organic || []).slice(0, 3).forEach((r: { title: string; snippet: string }) =>
          parts.push(`${r.title}: ${r.snippet}`)
        )
        if (parts.length) return parts.join('\n').slice(0, 1200)
      }
    }
    // DuckDuckGo fallback (bepul)
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
    const d = await r.json()
    const parts = [d.Answer, d.AbstractText, ...(d.RelatedTopics||[]).slice(0,2).map((t:{Text?:string})=>t.Text||'')].filter(Boolean)
    return parts.join('\n').slice(0, 800)
  } catch { return '' }
}

// ── Savol ekanligini tekshirish ───────────────────────────────────────────
function isQuestion(text: string): boolean {
  if (text.includes('?')) return true
  const qw = ['qanday','qancha','nima','nima u','kimdir','qaerda','qachon','qaysi',
               'что такое','как','сколько','кто такой','где','когда','почему','зачем',
               'what is','how','who is','where','when','why','tell me','объясни','расскажи']
  const lower = text.toLowerCase()
  return qw.some(w => lower.includes(w))
}

// ── n8n AI ga yuborish (8 soniya timeout) ────────────────────────────────
async function askAI(text: string, user_id: number, username: string, lang: 'ru' | 'uz'): Promise<string> {
  try {
    const ctrl  = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    // Til aniq ko'rsatiladi → AI albatta shu tilda javob beradi
    const langInstruction = lang === 'ru'
      ? '[ВАЖНО: Отвечай ТОЛЬКО на русском языке. Коротко и по делу, без лишних вопросов.]'
      : "[MUHIM: Faqat O'ZBEKCHA javob ber. Qisqa va aniq, ortiqcha savol berma.]"
    const msgWithLang = `${langInstruction}\n\n${text}`

    const res = await fetch(N8N_URL, {
      method: 'POST', signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: msgWithLang, user_id, username }),
    })
    clearTimeout(timer)
    if (!res.ok) return ''
    const d = await res.json()
    return d.reply || d.response || d.text || d.message || d.output || ''
  } catch { return '' }
}

export async function POST(request: NextRequest) {
  if (!BOT_TOKEN) return NextResponse.json({ ok: true })

  try {
    const update  = await request.json()
    const message = update.message
    if (!message) return NextResponse.json({ ok: true })

    const chat_id  = message.chat.id
    const from     = message.from
    const username = from?.username || from?.first_name || 'User'
    const user_id  = from?.id || 0

    let text = ''

    if (message.text) {
      text = message.text
    } else if (message.voice || message.audio) {
      const file_id = (message.voice ?? message.audio).file_id
      await sendMessage(chat_id, '🎙 ...')
      text = await transcribeVoice(file_id)
      if (!text) { await sendMessage(chat_id, '❌ Tushunilmadi. Matn yozing.'); return NextResponse.json({ ok: true }) }
      await sendMessage(chat_id, `📝 _"${text}"_`)
    } else if (message.photo || message.document) {
      // Screenshot / chek rasmi → Groq Vision bilan o'qish
      const photos = message.photo
      const file_id = photos ? photos[photos.length - 1].file_id : message.document.file_id
      await sendMessage(chat_id, '🔍 Screenshot tahlil qilinmoqda...')
      text = await analyzePhoto(file_id)
      if (!text) {
        const msg = detectLang('') === 'ru'
          ? '❌ Скриншот прочитать не удалось. Попробуйте чётче или перешлите SMS текстом.'
          : "❌ Screenshotni o'qib bo'lmadi. Aniqroq surat yuboring yoki SMS ni matn sifatida yo'llang."
        await sendMessage(chat_id, msg)
        return NextResponse.json({ ok: true })
      }
      await sendMessage(chat_id, `📝 _"${text}"_`)
    } else {
      return NextResponse.json({ ok: true })
    }

    const lower = text.toLowerCase()
    const lang  = detectLang(text)

    // ── /start — salomlashuv va barcha buyruqlar ─────────────────────────
    if (text.trim() === '/start') {
      const kb = { inline_keyboard: [[
        { text: '📊 Mini App', url: `https://t.me/${BOT_USERNAME}/${BOT_APP}` },
      ]] }
      await sendMessage(chat_id,
        `👋 *Salom, ${username}!* Men Jarvis — shaxsiy AI assistent.\n\n` +
        `🎙 *Ovoz bilan boshqaring:*\n` +
        `_"Taksi 50 000"_ — xarajat\n` +
        `_"Alibekka 200 ming berdim"_ — qarz\n` +
        `_"Ertalabki briefing"_ — bugungi hisobot\n` +
        `_"Rasm chiz: tog' manzarasi"_ — rasm yaratish\n` +
        `_"Notion tahlil qil"_ — Notion analiz\n\n` +
        `📋 *Buyruqlar:*\n` +
        `/briefing — hozir briefing olish\n` +
        `/id — Telegram ID (avtomatik briefing uchun)\n` +
        `/notion — Notion holati\n` +
        `/ios — iOS avtomatik SMS yo'riqnomasi\n\n` +
        `⏰ *Avtomatik briefing:*\n` +
        `Kuniga 2 marta — ertalab 9:00 va kechqurun 19:00\n` +
        `_(Avval /id yuboring — ID saqlanadi)_`,
        { reply_markup: kb }
      )
      return NextResponse.json({ ok: true })
    }

    // ── 0. Notion buyrug'i (to'liq: ro'yxat, qidiruv, o'qish, qo'shish, yaratish) ──
    const notionCmd = parseNotionCmd(text)
    if (notionCmd) {
      if (!NOTION_TOKEN) {
        await sendMessage(chat_id, lang === 'ru'
          ? '❌ Notion интеграция не настроена. Добавьте NOTION_TOKEN.'
          : '❌ Notion integratsiyasi sozlanmagan. NOTION_TOKEN env var qo\'shing.')
        return NextResponse.json({ ok: true })
      }

      // ── LIST ──────────────────────────────────────────────────────────
      if (notionCmd.action === 'list') {
        const items = await notionListItems()
        if (items.length === 0) {
          await sendMessage(chat_id, lang === 'ru'
            ? '📭 Нет доступных страниц.\n\n*Как дать доступ:*\n1. Откройте страницу в Notion\n2. Нажмите ••• (три точки) → Connections\n3. Выберите *jonka*'
            : '📭 Hech qanday sahifa yo\'q.\n\n*Qanday ulanish:*\n1. Notion sahifasini oching\n2. ••• (uch nuqta) → Connections bosing\n3. *jonka* ni tanlang')
        } else {
          const lines = items.map(i =>
            `${i.type === 'database' ? '🗄️' : '📄'} [${i.title}](${i.url})`
          ).join('\n')
          await sendMessage(chat_id, (lang === 'ru'
            ? `📚 *Notion — мои страницы (${items.length}):*\n\n`
            : `📚 *Notion sahifalarim (${items.length}):*\n\n`) + lines)
        }
        return NextResponse.json({ ok: true })
      }

      // ── SEARCH ────────────────────────────────────────────────────────
      if (notionCmd.action === 'search') {
        const items = await notionSearchItems(notionCmd.query)
        if (items.length === 0) {
          await sendMessage(chat_id, lang === 'ru'
            ? `🔍 По запросу *"${notionCmd.query}"* ничего не найдено.`
            : `🔍 *"${notionCmd.query}"* bo'yicha hech narsa topilmadi.`)
        } else {
          const lines = items.map(i =>
            `${i.type === 'database' ? '🗄️' : '📄'} [${i.title}](${i.url})`
          ).join('\n')
          await sendMessage(chat_id, (lang === 'ru'
            ? `🔍 *Найдено (${items.length}):*\n\n`
            : `🔍 *Topildi (${items.length}):*\n\n`) + lines)
        }
        return NextResponse.json({ ok: true })
      }

      // ── READ ──────────────────────────────────────────────────────────
      if (notionCmd.action === 'read') {
        const items = notionCmd.query
          ? await notionSearchItems(notionCmd.query)
          : await notionListItems('page')
        const page = items[0]
        if (!page) {
          await sendMessage(chat_id, lang === 'ru'
            ? '📭 Страница не найдена.'
            : '📭 Sahifa topilmadi.')
          return NextResponse.json({ ok: true })
        }
        const content = await notionReadBlocks(page.id)
        const body = content || (lang === 'ru' ? '_Страница пуста_' : '_Sahifa bo\'sh_')
        await sendMessage(chat_id,
          `📄 *${page.title}*\n\n${body}\n\n🔗 [${lang === 'ru' ? 'Открыть' : 'Ochish'}](${page.url})`)
        return NextResponse.json({ ok: true })
      }

      // ── APPEND ────────────────────────────────────────────────────────
      if (notionCmd.action === 'append') {
        const items = notionCmd.pageQuery
          ? await notionSearchItems(notionCmd.pageQuery)
          : await notionListItems('page')
        const page = items.find(i => i.type === 'page') || items[0]
        if (!page) {
          await sendMessage(chat_id, lang === 'ru'
            ? '❌ Страница не найдена.'
            : '❌ Sahifa topilmadi.')
          return NextResponse.json({ ok: true })
        }
        const ok2 = await notionAppend(page.id, notionCmd.content)
        await sendMessage(chat_id, ok2
          ? (lang === 'ru'
            ? `✅ *Добавлено в "${page.title}"*\n\n_"${notionCmd.content.slice(0, 300)}"_\n\n🔗 [Открыть](${page.url})`
            : `✅ *"${page.title}" sahifasiga qo'shildi*\n\n_"${notionCmd.content.slice(0, 300)}"_\n\n🔗 [Ochish](${page.url})`)
          : (lang === 'ru'
            ? '❌ Не удалось добавить в Notion.'
            : '❌ Notion\'ga qo\'shib bo\'lmadi.'))
        return NextResponse.json({ ok: true })
      }

      // ── CREATE ────────────────────────────────────────────────────────
      if (notionCmd.action === 'create') {
        const result = await notionCreatePage(notionCmd.title, notionCmd.emoji)
        await sendMessage(chat_id, result.ok
          ? (lang === 'ru'
            ? `✅ *Создано в Notion*\n\n${notionCmd.emoji} *${notionCmd.title}*${result.url ? `\n\n🔗 [Открыть](${result.url})` : ''}`
            : `✅ *Notion'da yaratildi*\n\n${notionCmd.emoji} *${notionCmd.title}*${result.url ? `\n\n🔗 [Ochish](${result.url})` : ''}`)
          : (lang === 'ru'
            ? '❌ Не удалось создать в Notion.\n\n💡 Откройте страницу → ••• → Connections → jonka'
            : '❌ Notion\'da yaratib bo\'lmadi.\n\n💡 Notion sahifasini oching → ••• → Connections → jonka'))
        return NextResponse.json({ ok: true })
      }
    }

    // ── 0b. Byudjet belgilash buyrug'i ───────────────────────────────────
    const budgetCmd = parseBudgetCommand(text)
    if (budgetCmd) {
      await kvSetBudget(budgetCmd.category, budgetCmd.amount)
      const msg = lang === 'ru'
        ? `✅ *Бюджет установлен*\n\n📂 Категория: *${budgetCmd.category}*\n💰 Лимит: *${budgetCmd.amount.toLocaleString()} so'm / месяц*\n\n💡 Я буду предупреждать когда достигнете 80% и 100% лимита.`
        : `✅ *Byudjet belgilandi*\n\n📂 Kategoriya: *${budgetCmd.category}*\n💰 Limit: *${budgetCmd.amount.toLocaleString()} so'm / oy*\n\n💡 80% va 100% ga yetganda ogohlantiraman.`
      await sendMessage(chat_id, msg)
      return NextResponse.json({ ok: true })
    }

    // ── 0c. Byudjetni ko'rish ─────────────────────────────────────────────
    if (/byudjet.*ko[ʻ']?r|бюджет.*посмотр|бюджет.*статус|byudjet.*holat|мои лимиты|my budget/i.test(lower)) {
      const budgets = await kvGetBudgets()
      if (Object.keys(budgets).length === 0) {
        const msg = lang === 'ru'
          ? `📊 Бюджеты не установлены.\n\nПример: _"Такси лимит 3 миллиона"_`
          : `📊 Byudjetlar belgilanmagan.\n\nMisol: _"Taksi byudjet 3 million"_`
        await sendMessage(chat_id, msg)
        return NextResponse.json({ ok: true })
      }
      const all = await kvGetExps()
      const now = new Date()
      const monthTag = `.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
      const monthExps = all.filter(e => e.type==='XARAJAT' && e.date.includes(monthTag))
      const lines = Object.entries(budgets).map(([cat, limit]) => {
        const spent = monthExps.filter(e=>e.name===cat).reduce((s,e)=>s+e.amount,0)
        const pct   = Math.round(spent/limit*100)
        const bar   = '▓'.repeat(Math.min(10,Math.round(pct/10))) + '░'.repeat(Math.max(0,10-Math.min(10,Math.round(pct/10))))
        const icon  = pct>=100?'🚨':pct>=80?'⚠️':'✅'
        return `${icon} *${cat}*\n${bar} ${pct}%\n${fmtN(spent)} / ${fmtN(limit)}`
      }).join('\n\n')
      const header = lang==='ru' ? `📊 *Бюджеты за месяц:*\n\n` : `📊 *Oylik byudjetlar:*\n\n`
      await sendMessage(chat_id, header + lines)
      return NextResponse.json({ ok: true })
    }

    // ── 0d. /notion — Notion holat va yo'riqnoma ─────────────────────────
    if (text.trim() === '/notion' || /^notion\s*$/i.test(text.trim())) {
      if (!NOTION_TOKEN) {
        await sendMessage(chat_id, lang === 'ru'
          ? '❌ *Notion не подключён*\n\nДобавьте токен: `npx vercel env add NOTION_TOKEN production`'
          : '❌ *Notion ulanmagan*\n\nToken qo\'shing: `npx vercel env add NOTION_TOKEN production`')
        return NextResponse.json({ ok: true })
      }
      const items = await notionListItems()
      const countLine = items.length > 0
        ? (lang === 'ru' ? `✅ *Подключено страниц: ${items.length}*\n\n` : `✅ *Ulangan sahifalar: ${items.length}*\n\n`)
        : (lang === 'ru' ? '⚠️ *Страницы не подключены*\n\n' : '⚠️ *Sahifalar ulanmagan*\n\n')

      const pageList = items.slice(0, 5).map(i =>
        `${i.type === 'database' ? '🗄️' : '📄'} ${i.title}`
      ).join('\n')

      const guide = lang === 'ru'
        ? `*Как подключить страницу:*\n1. Откройте страницу в Notion\n2. Нажмите ••• → Connections\n3. Выберите *jonka*\n\n*Команды:*\n_"Notion список"_ — показать страницы\n_"Notion найди [название]"_ — поиск\n_"Notion прочитай [название]"_ — открыть содержимое\n_"Notion [страница]га [текст] добавь"_ — дописать\n_"Notion создай [название]"_ — новая страница`
        : `*Sahifani ulash:*\n1. Notionda sahifani oching\n2. ••• → Connections bosing\n3. *jonka* ni tanlang\n\n*Buyruqlar:*\n_"Notion sahifalar"_ — sahifalar ro'yxati\n_"Notion [nom] qidir"_ — qidirish\n_"Notion [nom] o'qi"_ — tarkibni ko'rish\n_"Notion [sahifa]ga [matn] qo'sh"_ — qo'shish\n_"Notion [nom] yarat"_ — yangi sahifa`

      await sendMessage(chat_id, countLine + (pageList ? pageList + '\n\n' : '') + guide)
      return NextResponse.json({ ok: true })
    }

    // ── 0e. /id — foydalanuvchi chat_id sini ko'rsatish ─────────────────
    if (text.trim() === '/id' || text.trim() === '/myid') {
      // Chat ID ni Redis ga saqlash — briefing uchun (TELEGRAM_OWNER_CHAT_ID o'rniga)
      await redisSet('jarvis_owner_chat_id', String(chat_id))
      await sendMessage(chat_id,
        `🆔 *Sizning Telegram ID:* \`${chat_id}\`\n\n` +
        `✅ _ID saqlandi — ertalabki/kechki briefing ushbu chatga yuboriladi_\n\n` +
        `Bu ID ni iOS Shortcuts sozlamasida ishlatib, bank SMS larini avtomatik yuborishni sozlang.\n\n` +
        `/ios — yo'riqnoma\n/briefing — hozir briefing olish`)
      return NextResponse.json({ ok: true })
    }

    // ── 0e. /ios — iOS uchun to'liq avtomatik yo'riqnoma ────────────────
    if (text.trim() === '/ios' || /ios.*avtomat|avtomat.*ios|iphone.*avtomat|avtomat.*iphone|karta.*ios|ios.*karta/i.test(lower)) {
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://jarvise-mini-app-jf5u.vercel.app').replace(/\/$/, '')
      const msg =
        `📱 *iOS — Birorta tugma bosmasdan avtomat*\n\n` +
        `*🥇 Eng yaxshi yo'l: Gmail + n8n*\n` +
        `_(bir marta sozlash, keyin abadiy avtomat)_\n\n` +
        `*Qanday ishlaydi:*\n` +
        `Bank → Email yuboradi → n8n ushlab oladi → Jarvis saqlaydi → Telegram xabar keladi\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `*1️⃣  /id yuboring* — Telegram ID ni oling\n\n` +
        `*2️⃣  Bank ilovangizda* email bildirishnomalarni yoqing\n` +
        `_(Kapitalbank, Hamkorbank, Uzum Bank → Sozlamalar → Xabarnomalar → Email)_\n\n` +
        `*3️⃣  n8n ga kiring:* abusaidbakrdov.app.n8n.cloud\n` +
        `→ Import Workflow\n` +
        `→ URL: \`${appUrl}/gmail-bank-workflow.json\`\n\n` +
        `*4️⃣  Workflowda ikki joyni o'zgartiring:*\n` +
        `• \`YOUR_APP_URL\` → \`${appUrl}\`\n` +
        `• \`YOUR_TELEGRAM_CHAT_ID\` → sizning ID (/id dan)\n\n` +
        `*5️⃣  Gmail credentials qo'shing → Active qiling*\n\n` +
        `━━━━━━━━━━━━━━━━\n` +
        `✅ Tayyor! Endi bank emaili kelsa → 30 soniyada Telegramga xabar\n\n` +
        `*🥈 Zaxira: iOS Shortcuts (SMS uchun)*\n` +
        `Shortcuts → Automation → Personal Automation\n` +
        `→ Trigger: *Message* → Contains \`so'm\`\n` +
        `→ *Run Immediately* (Ask Before Running: OFF)\n` +
        `→ Amal: *Get Contents of URL* (POST)\n` +
        `   \`${appUrl}/api/sms-import\`\n` +
        `   JSON: {\`"sms"\`: [Message Body], \`"chat_id"\`: sizning ID}\n\n` +
        `⚡ Bu ham 100% avtomatik — bir marta sozlaysiz, keyin hech narsa qilmaysiz`
      await sendMessage(chat_id, msg)
      return NextResponse.json({ ok: true })
    }

    // ── 0f. /briefing — qo'lda yoki ovozli briefing ─────────────────────
    const isBriefingCmd =
      text.trim() === '/briefing' ||
      text.trim() === '/briefing morning' ||
      text.trim() === '/briefing evening' ||
      /(?:ertalabki\s+(?:briefing|hisobot)|kechki\s+(?:briefing|hisobot)|briefing\s+(?:yubor|chiq|ko[ʻ']rsat|ber)|bugungi\s+hisobot|kun\s+hisobot|hisobot\s+(?:yubor|ber|chiq)|daily\s+report|morning\s+report|evening\s+report)/i.test(lower) ||
      (/(?:briefing|брифинг|hisobot)/i.test(lower) && !/qanday|nima|bu\s+nima/i.test(lower))

    if (isBriefingCmd) {
      const isEvening =
        /kechki|evening|вечерн|kech\s|19:|18:|17:/i.test(lower) ||
        text.trim() === '/briefing evening'
      const type = isEvening ? 'evening' : 'morning'
      await sendMessage(chat_id, lang === 'ru'
        ? `📊 _Составляю ${type === 'evening' ? 'вечерний' : 'утренний'} отчёт..._`
        : `📊 _${type === 'evening' ? 'Kechki' : 'Ertalabki'} hisobot tayyorlanmoqda..._`)
      try {
        const msg = await buildBriefing(type)
        await sendMessage(chat_id, msg)
      } catch {
        await sendMessage(chat_id, lang === 'ru'
          ? '❌ Не удалось составить отчёт. Проверьте подключение Notion.'
          : "❌ Hisobot tayyorlab bo'lmadi. Notion ulanishini tekshiring.")
      }
      return NextResponse.json({ ok: true })
    }

    // ── 0g2. Kontaktga ovozli / matn xabar yuborish ──────────────────────
    // "Suxrobga ayt ertaga ishga boraman" / "Alishga yoz salom deb"
    const sendCmd = parseSendToContact(text)
    if (sendCmd) {
      const contact = await findContact(sendCmd.name)

      if (!contact) {
        await sendMessage(chat_id, lang === 'ru'
          ? `👤 *"${sendCmd.name}"* контакт-листе не найден.\n\n💡 Откройте Mini App → Контакты → синхронизируйте список`
          : `👤 *"${sendCmd.name}"* kontaktlar orasida topilmadi.\n\n💡 Mini App → Kontaktlar → ro'yxatni yangilang`)
        return NextResponse.json({ ok: true })
      }

      await sendMessage(chat_id, lang === 'ru'
        ? `📤 _Отправляю ${process.env.ELEVENLABS_API_KEY ? 'голосовое' : 'сообщение'} → *${contact.name}*..._`
        : `📤 _${contact.name}ga ${process.env.ELEVENLABS_API_KEY ? 'ovozli xabar' : 'xabar'} yuborilmoqda..._`)

      const isVoice = !!process.env.ELEVENLABS_API_KEY
      const sendResult = await sendViaUserbot(contact, sendCmd.message, isVoice)

      if (sendResult.ok) {
        const sentType = sendResult.sentAsVoice
          ? (lang === 'ru' ? 'Голосовое' : 'Ovozli xabar')
          : (lang === 'ru' ? 'Сообщение' : 'Xabar')
        await sendMessage(chat_id, lang === 'ru'
          ? `✅ *${sentType} отправлено!*\n\n👤 *${contact.name}*\n💬 _"${sendCmd.message.slice(0, 120)}"_`
          : `✅ *${sentType} yuborildi!*\n\n👤 *${contact.name}*\n💬 _"${sendCmd.message.slice(0, 120)}"_`)
      } else {
        await sendMessage(chat_id, lang === 'ru'
          ? `❌ Не удалось отправить. Убедитесь, что Telegram аккаунт подключён в Mini App → Контакты`
          : `❌ Yuborib bo'lmadi. Mini App → Kontaktlar bo'limida Telegram akkaunt ulanganligini tekshiring.`)
      }
      return NextResponse.json({ ok: true })
    }

    // ── 0h. Karta ulash / SMS yo'riqnomasi ───────────────────────────────
    if (/karta.*ul[ae]|karta.*bog[ʻ']|ulash.*karta|bind.*card|sms.*avtomat|avtomat.*sms|sms.*forward|karta.*qo[ʻ']sh|payme.*ul|uzum.*ul/i.test(lower)) {
      const msg = lang === 'ru'
        ? `💳 *Подключение карты — инструкция*\n\n` +
          `Банки Узбекистана (Kapitalbank, Hamkorbank, Uzum Bank и др.) не предоставляют открытый API. Но можно сделать *автоматически* через SMS:\n\n` +
          `*Как это работает:*\n` +
          `1️⃣ Банк отправляет SMS на каждую транзакцию\n` +
          `2️⃣ Перешлите SMS боту — он сам разберёт сумму, магазин и категорию\n` +
          `3️⃣ Expense сохраняется автоматически ✅\n\n` +
          `*📱 Android — полный автомат:*\n` +
          `Установите приложение *«SMS Forwarder»* или *«Auto SMS Forwarder»* из Play Store → настройте переадресацию SMS от вашего банка прямо в этот бот. Тогда все расходы фиксируются без участия человека.\n\n` +
          `*Поддерживаемые банки:*\n` +
          `Kapitalbank · Hamkorbank · Uzum Bank · Agrobank · Ipak Yo\'li · Xalq Bank · Asakabank · Aloqabank и другие\n\n` +
          `📌 _Просто перешлите SMS от банка в этот чат — остальное сделаю я_`
        : `💳 *Karta ulash — yo'riqnoma*\n\n` +
          `O'zbek banklari (Kapitalbank, Hamkorbank, Uzum Bank va boshqalar) ochiq API bermaydi. Lekin SMS orqali *avtomatik* ishlaydi:\n\n` +
          `*Qanday ishlaydi:*\n` +
          `1️⃣ Bank har bir operatsiyada SMS yuboradi\n` +
          `2️⃣ O'sha SMS ni botga yo'llang — miqdor, do'kon va kategoriyani o'zi ajratadi\n` +
          `3️⃣ Xarajat avtomatik saqlanadi ✅\n\n` +
          `*📱 Android — to'liq avtomat:*\n` +
          `Play Store dan *«SMS Forwarder»* ilovasini o'rnating → bankingiz SMS larini to'g'ridan-to'g'ri shu botga yuboradigan qilib sozlang. Shunda barcha xarajatlar odam qo'llanmay yoziladi.\n\n` +
          `*Qo'llab-quvvatlanadigan banklar:*\n` +
          `Kapitalbank · Hamkorbank · Uzum Bank · Agrobank · Ipak Yo'li · Xalq Bank · Asakabank · Aloqabank va boshqalar\n\n` +
          `📌 _Bank SMS ni shu chatga yo'llang — qolganini o'zim qilaman_`
      await sendMessage(chat_id, msg)
      return NextResponse.json({ ok: true })
    }

    // ── 0e. Bank SMS ajratish (yo'naltirilgan SMS yoki bank xabari) ──────
    const isForwarded = !!message.forward_date || !!message.forward_from || !!message.forward_sender_name
    const bankSMS = parseBankSMS(text)
    if (bankSMS) {
      const baseId = Date.now()
      const expName = bankSMS.type === 'credit' ? 'Daromat' : (bankSMS.category || 'Boshqa')
      const expType = bankSMS.type === 'credit' ? 'DAROMAT' : 'XARAJAT'

      await kvAdd([{
        id: baseId, name: expName, amount: bankSMS.amount,
        type: expType, date: today(),
      }])

      const typeIcon  = bankSMS.type === 'credit' ? '💚 +' : '💸 −'
      const bankLine  = bankSMS.bank ? `🏦 ${bankSMS.bank}${bankSMS.card ? ` · *${bankSMS.card}` : ''}` : ''
      const mLine     = bankSMS.merchant ? `🏪 ${bankSMS.merchant}` : ''
      const catLine   = `📂 ${expName}`
      const balLine   = bankSMS.balance ? `💰 Qoldiq: ${bankSMS.balance.toLocaleString()} so'm` : ''

      const budgetAlerts = await checkBudgetAlerts([{ name: expName, amount: bankSMS.amount, type: expType }], lang)

      const header = lang === 'ru'
        ? `💳 *Операция по карте сохранена!*\n\n`
        : `💳 *Karta operatsiyasi saqlandi!*\n\n`

      const lines = [bankLine, `${typeIcon}${bankSMS.amount.toLocaleString()} so'm`, mLine, catLine, balLine]
        .filter(Boolean).join('\n')

      const kb = { inline_keyboard: [[{ text: '📊 Mini appda ko\'rish', url: `https://t.me/${BOT_USERNAME}/${BOT_APP}` }]] }
      await sendMessage(chat_id, header + lines + budgetAlerts, { reply_markup: kb })
      return NextResponse.json({ ok: true })
    }

    // ── 1+2. Qarz VA Xarajatni bir vaqtda aniqlash ───────────────────────
    // Agar bitta xabarda ikkalasi ham bo'lsa (masalan "Хамиду дал 200$, такси 70 ming")
    // — ikkalasini ham saqlaymiz, n8n ga YUBORMANG
    const allDebts = parseAllDebts(text)
    const allExps  = parseAllExpenses(text)
    const hasDebts = allDebts.length > 0
    const hasExps  = allExps.length > 0

    if (hasDebts || hasExps) {
      const baseId    = Date.now()
      const debtKb    = { inline_keyboard: [[{ text: "🤝 Qarz Daftari", url: `https://t.me/${BOT_USERNAME}/${BOT_APP}?startapp=debts` }]] }
      const expKb     = { inline_keyboard: [[{ text: "📊 Mini appda ko'rish", url: `https://t.me/${BOT_USERNAME}/${BOT_APP}` }]] }
      const bothKb    = { inline_keyboard: [[
        { text: "🤝 Qarz Daftari", url: `https://t.me/${BOT_USERNAME}/${BOT_APP}?startapp=debts` },
        { text: "📊 Moliya",        url: `https://t.me/${BOT_USERNAME}/${BOT_APP}` },
      ]] }

      let lines = ''

      if (hasDebts) {
        await kvDebtAdd(allDebts.map((d, i) => ({
          id: baseId + i, person: d.person, amount: d.amount,
          dir: d.dir, note: '', date: today(), paid: false,
        })))
        const dirLabel = (d: { dir: string }) =>
          d.dir === 'gave'
            ? (lang === 'ru' ? '📤 Я отдал' : '📤 Men berdim')
            : (lang === 'ru' ? '📥 Я взял'  : '📥 Men oldim')
        lines += (lang === 'ru' ? '🤝 *Долги:*\n' : '🤝 *Qarzlar:*\n') +
          allDebts.map(d => `👤 ${d.person} — ${d.amount.toLocaleString()} · ${dirLabel(d)}`).join('\n')
      }

      if (hasExps) {
        const stored = allExps.map((e, i) => ({
          id: baseId + 1000 + i, name: e.name, amount: e.amount, type: e.type, date: today(),
        }))
        await kvAdd(stored)
        if (lines) lines += '\n\n'
        lines += (lang === 'ru' ? '💸 *Расходы:*\n' : '💸 *Xarajatlar:*\n') +
          stored.map(e => `${e.type === 'DAROMAT' ? '💰' : '💸'} ${e.name} — ${e.amount.toLocaleString()} so'm`).join('\n')
      }

      const savedLabel = lang === 'ru' ? '✅ Добавлено в отчёт' : '✅ Saqlandi'
      const kb = hasDebts && hasExps ? bothKb : hasDebts ? debtKb : expKb

      // Smart insight + byudjet ogohlantirish
      const insight      = hasExps ? await buildInsight(allExps, lang) : ''
      const budgetAlerts = hasExps ? await checkBudgetAlerts(allExps, lang) : ''
      await sendMessage(chat_id, `${lines}\n\n${savedLabel}${insight}${budgetAlerts}`, { reply_markup: kb })

      // n8n ga faqat Notion sync uchun (javobini ko'rsatmaymiz)
      if (hasExps) askAI(text, user_id, username, lang).catch(() => {})

    } else {
      // ── 3a. Xarajat hisoboti so'rovi → Redis dan to'g'ridan javob ───────
      const isReportQ =
        /(?:все|barcha|hammasi|все|жалпы|show|ko[ʻ']rsat|скажи|покажи|расскажи|вывод|вывести).*(?:расход|xarajat|трат|харч|statistic|hisobot|отчёт|статистик)/i.test(lower) ||
        /(?:расход|xarajat|трат|харч).*(?:все|barcha|hammasi|ko[ʻ']rsat|список|ro[ʻ']yxat|все|жалпы)/i.test(lower) ||
        /(?:отчёт|статистик|hisobot|statistik|qancha.*sarflad|сколько.*потрат|necha.*xarajat)/i.test(lower) ||
        /(?:мои расходы|mening xarajat|расходы за|xarajatlar hisobi)/i.test(lower)

      if (isReportQ) {
        const all     = await kvGetExps()
        const now     = new Date()
        const mTag    = `.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
        const mExps   = all.filter(e => e.date.includes(mTag))
        const xList   = mExps.filter(e => e.type==='XARAJAT')
        const dList   = mExps.filter(e => e.type==='DAROMAT')
        const totalX  = xList.reduce((s,e)=>s+e.amount,0)
        const totalD  = dList.reduce((s,e)=>s+e.amount,0)

        if (xList.length === 0 && dList.length === 0) {
          const msg = lang==='ru'
            ? `📊 В этом месяце записей нет.\n\nГолосом или текстом запишите расход: _"Такси 50 000"_`
            : `📊 Bu oy hali yozuv yo'q.\n\nOvoz yoki matn bilan yozing: _"Taksi 50 000"_`
          await sendMessage(chat_id, msg)
          return NextResponse.json({ ok: true })
        }

        // Kategoriya bo'yicha guruhlash
        const catMap: Record<string,number> = {}
        xList.forEach(e => { catMap[e.name] = (catMap[e.name]||0) + e.amount })
        const cats = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8)

        const budgets  = await kvGetBudgets()
        const catLines = cats.map(([name,amt]) => {
          const pct   = totalX ? Math.round(amt/totalX*100) : 0
          const limit = budgets[name]
          const bar   = limit
            ? ` [${Math.round(amt/limit*100)}% limit]`
            : ''
          const icon  = pct >= 30 ? '🔴' : pct >= 15 ? '🟡' : '🟢'
          return `${icon} ${name} — ${fmtN(amt)}${bar} (${pct}%)`
        }).join('\n')

        const recent = xList.slice(-5).reverse()
          .map(e=>`• ${e.name} — ${fmtN(e.amount)}`).join('\n')

        const header = lang==='ru'
          ? `📊 *Расходы за ${now.toLocaleString('ru',{month:'long'})}:*\n\n`
          : `📊 *${now.toLocaleString('uz',{month:'long'})} xarajatlari:*\n\n`

        const summary = lang==='ru'
          ? `💸 Всего расходов: *${fmtN(totalX)} so'm*` +
            (totalD ? `\n💰 Доходы: *${fmtN(totalD)} so'm*` : '') +
            `\n\n*По категориям:*\n${catLines}\n\n*Последние 5:*\n${recent}`
          : `💸 Jami xarajat: *${fmtN(totalX)} so'm*` +
            (totalD ? `\n💰 Daromat: *${fmtN(totalD)} so'm*` : '') +
            `\n\n*Kategoriya bo'yicha:*\n${catLines}\n\n*Oxirgi 5 ta:*\n${recent}`

        const kb = { inline_keyboard: [[{ text: '📊 Grafikda ko\'rish', url: `https://t.me/${BOT_USERNAME}/${BOT_APP}` }]] }
        await sendMessage(chat_id, header + summary, { reply_markup: kb })
        return NextResponse.json({ ok: true })
      }

      // ── 3b. Bot imkoniyatlari haqida savol → to'g'ridan javob ─────────
      // n8n AI bu funksiyalarni bilmaydi → o'zimiz javob beramiz
      const isCapabilityQ =
        /(?:лимит|бюджет|limit|byudjet).*(?:можешь|можно|будешь|умеешь|способен|реально|возможно|qoya olasan|bera olasanmi|mumkinmi|ishlaydi|qila olasanmi)/i.test(lower) ||
        /(?:можешь|будешь|умеешь).*(?:лимит|бюджет|сигнализир|предупрежд|оповещ|мониторить|отслеживать)/i.test(lower) ||
        /(?:сигнализировать|предупреждать|оповещать|мониторить|отслеживать).*(?:лимит|бюджет|расход|категор)/i.test(lower) ||
        /(?:автоматическ|фоновый|background).*(?:уведомлен|алерт|сигнал|limit|бюджет)/i.test(lower) ||
        /(?:процент.*дохода|дохода.*процент).*(?:категор|расход)/i.test(lower) ||
        /сейчас ты это будешь/i.test(lower) ||
        /возможно или нет.*(?:лимит|бюджет|сигнал)/i.test(lower)

      if (isCapabilityQ) {
        const budgets = await kvGetBudgets()
        const hasBudgets = Object.keys(budgets).length > 0
        const budgetList = hasBudgets
          ? '\n\n📂 *Hozir belgilangan limitlar:*\n' +
            Object.entries(budgets).map(([c, a]) => `  • ${c}: ${fmtN(a)} so'm/oy`).join('\n')
          : ''

        const msg = lang === 'ru'
          ? `✅ *Да, это уже работает!*\n\n` +
            `Вот что умею прямо сейчас:\n\n` +
            `*📊 Лимиты по категориям:*\n` +
            `Скажите голосом или текстом:\n` +
            `_"Такси лимит 3 миллиона"_\n` +
            `_"Лимит на еду 5 000 000"_\n` +
            `_"Бюджет транспорт 1.5 млн"_\n` +
            `→ Лимит сохраняется в Redis ✅\n\n` +
            `*🚨 Автоматические сигналы:*\n` +
            `Каждый раз при записи расхода я проверяю:\n` +
            `⚠️ При 80% лимита → предупреждение\n` +
            `🚨 При 100% → "ЛИМИТ ПРЕВЫШЕН!"\n\n` +
            `*📈 Процент от дохода:*\n` +
            `Скажите: _"Зарплата 10 миллионов"_ — я запишу.\n` +
            `Потом: _"Такси лимит 15% от дохода"_ — рассчитаю.\n\n` +
            `*📋 Посмотреть все лимиты:*\n` +
            `Напишите: _"мои бюджеты"_ или _"byudjet holat"_` +
            budgetList
          : `✅ *Ha, bu allaqachon ishlaydi!*\n\n` +
            `Hozir nima qila olaman:\n\n` +
            `*📊 Kategoriya limitlari:*\n` +
            `Ovoz yoki matn bilan ayting:\n` +
            `_"Taksi byudjet 3 million"_\n` +
            `_"Ovqat limiti 5 000 000"_\n` +
            `_"Transport uchun reja 1.5 mln"_\n` +
            `→ Limit Redisga saqlanadi ✅\n\n` +
            `*🚨 Avtomatik signallar:*\n` +
            `Har xarajat yozilganda tekshiraman:\n` +
            `⚠️ 80% ga yetganda → ogohlantirish\n` +
            `🚨 100% da → "LIMIT OSHDI!"\n\n` +
            `*📈 Daromad foizi:*\n` +
            `"Oylik 10 million" deng — yozib olaman.\n` +
            `"Taksi limiti daromadning 15%i" — hisoblayman.\n\n` +
            `*📋 Barcha limitlarni ko'rish:*\n` +
            `_"mening byudjetlarim"_ yoki _"byudjet holat"_ deng` +
            budgetList

        const kb = { inline_keyboard: [[
          { text: '📊 Byudjet belgilash', url: `https://t.me/${BOT_USERNAME}/${BOT_APP}` },
        ]] }
        await sendMessage(chat_id, msg, { reply_markup: kb })
        return NextResponse.json({ ok: true })
      }

      // ── 3c. Rasm chizish (Pollinations.ai — bepul, API key shart emas) ──
      const isImageRequest =
        /(?:rasm\s*(?:chiz|yarat|yasa|isl)|нарисуй|нарисовать|draw(?:\s+(?:me|a|an|the))?|generate\s*(?:an?\s+)?image|create\s*(?:an?\s+)?image|paint(?:\s+(?:me|a|an))?|картинк\w+|изображени\w+|фото.*(?:сделай|создай|нарисуй)|сгенерир\w+.*(?:картинк|изображен|рисун))/i.test(lower)

      if (isImageRequest) {
        const prompt = text
          .replace(/rasm\s*(?:chiz\w*|yarat\w*|yasa\w*|isl\w*)/gi, '')
          .replace(/нарисуй|нарисовать|рисунок|картинку|картинок|изображение/gi, '')
          .replace(/draw\s*(?:me\s*)?(?:a\s*|an\s*|the\s*)?|generate\s*(?:an?\s+)?image\s*(?:of\s*)?/gi, '')
          .replace(/create\s*(?:an?\s+)?image\s*(?:of\s*)?|paint\s*(?:me\s*)?(?:a\s*)?/gi, '')
          .replace(/сгенерируй|сделай.*(?:картинк|изображен)|создай.*(?:картинк|изображен)/gi, '')
          .replace(/\s+/g, ' ').trim()

        if (prompt) {
          await sendMessage(chat_id, lang === 'ru' ? '🎨 Рисую...' : '🎨 Rasm chizilmoqda...')
          const seed = Math.floor(Math.random() * 99999)
          const imageUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=1024&height=1024&nologo=true&seed=${seed}`
          try {
            await sendPhoto(chat_id, imageUrl, `🎨 _${prompt.slice(0, 200)}_`)
          } catch {
            await sendMessage(chat_id, `🎨 [${lang === 'ru' ? 'Изображение' : 'Rasm'}](${imageUrl})`)
          }
        } else {
          await sendMessage(chat_id, lang === 'ru'
            ? '🎨 Что нарисовать? Опишите: _"нарисуй закат над горами"_'
            : "🎨 Nima chizay? Tasvirlab bering: _\"tog' ustida quyosh botishi\"_")
        }
        return NextResponse.json({ ok: true })
      }

      // ── 3d. Notion tahlili — sahifa nomi yoki umumiy tahlil ─────────────
      // "ноушен/нотион" = Notion rus talaffuzi
      const normalizedLower = lower
        .replace(/ноушен\w*/gi, 'notion')
        .replace(/нотион\w*/gi, 'notion')
        .replace(/нэшн\w*/gi, 'notion')

      const hasFinancialKeyword = /расход|доход|трат|xarajat|daromat|деньги|пул|зарплат|маош|бюджет|byudjet/i.test(lower)

      const isNotionAnalysis =
        // Notion haqida savol (har qanday shakl)
        /notion/.test(normalizedLower) ||
        // "открой/покажи/вытащи/дай [мне] задачи/проекты/план"
        /(?:открой|открыть|покажи|показать|дай|выведи|вытащи|посмотри|найди|загрузи|прочитай)\s+(?:мне\s+|мои\s+|все\s+|всё\s+)?(?:задач|проект|план|страниц|раздел|todo|to-do|vazifa|список\s+дел)/i.test(lower) ||
        // "мои задачи" / "текущие проекты" / "активные задачи"
        /(?:мои|моих|текущие|открытые|активные|незавершенные|все мои|активных|bajarilmagan|ochiq)\s+(?:задач|проект|план|todo|vazifa)/i.test(lower) ||
        // "какие у меня задачи" / "что у меня открыто"
        /(?:какие|что|чего|сколько)\s+(?:у\s+меня\s+)?(?:задач|проект|план|todo|vazifa|открыт|активн)/i.test(lower) ||
        // Vazifalar/rejalar haqida (verb bilan)
        /(?:задач|задание|todo|to-do|task|vazifa|список дел).*(?:открой|открыт|активн|незаверш|есть|какие|покажи|посмотри|ko[ʻ']rsat)/i.test(lower) ||
        /(?:открыт|активн|незаверш|boshlanmagan|bajarilmagan).*(?:задач|task|vazifa)/i.test(lower) ||
        // Tahlil so'zlari
        /(?:анализ|проанализируй|analyze|tahlil).*(?:project|проект|задач|task|план|plan|раздел|section)/i.test(lower) ||
        /(?:project|проект|задач|task).*(?:анализ|проанализируй|analyze|tahlil)/i.test(lower) ||
        (/(?:проанализируй|tahlil qil)/i.test(lower) && !hasFinancialKeyword)

      if (isNotionAnalysis && NOTION_TOKEN) {
        const searchQ = text
          .replace(/проанализируй|анализируй|проанализ|анализ|analyze|tahlil qil|tahlil/gi, '')
          .replace(/ноушен\w*|нотион\w*|notion/gi, '')
          .replace(/section|раздел|bo[ʻ']lim/gi, '')
          .replace(/посмотри|покажи|скажи|какие|есть|открыт\w*|открой|показать|дай|выведи|вытащи|найди|загрузи|прочитай/gi, '')
          .replace(/\bмне\b|\bмои\b|\bмоих\b|\bвсе\b|\bвсё\b|\bнет\b|\bда\b|\bне\b|\bа\b|\bи\b/gi, '')
          .replace(/\s{2,}/g, ' ').trim()

        await sendMessage(chat_id, lang === 'ru'
          ? `🔍 Загружаю данные из Notion...`
          : `🔍 Notion'dan ma'lumot yuklanmoqda...`)

        // searchQ bo'sh bo'lsa — barcha sahifalar yuklanadi
        let notionData = ''
        if (!searchQ || searchQ.length < 3) {
          notionData = await buildRichNotionContext('project task план')
        } else {
          const pages = await notionSearchItems(searchQ)
          if (pages.length > 0) {
            const parts: string[] = []
            for (const pg of pages.slice(0, 3)) {
              const c = await notionReadBlocks(pg.id)
              if (c) parts.push(`## ${pg.title}:\n${c}`)
            }
            notionData = parts.join('\n\n---\n\n')
          }
          // Topilmasa umumiy kontekst
          if (!notionData) notionData = await buildRichNotionContext(searchQ)
        }

        if (notionData) {
          const ctx = lang === 'ru'
            ? `Данные из Notion:\n\n${notionData}\n\n[Вопрос пользователя]: ${text}`
            : `Notion ma'lumotlari:\n\n${notionData}\n\n[Foydalanuvchi savoli]: ${text}`
          const reply = await askAI(ctx, user_id, username, lang)
          if (reply) {
            await sendMessage(chat_id, cleanReply(reply))
          } else {
            // n8n javob bermasa — to'g'ridan Notion ma'lumotini chiqaramiz
            await sendMessage(chat_id, `📄 *Notion — natijalar:*\n\n${notionData.slice(0, 3800)}`)
          }
        } else {
          await sendMessage(chat_id, lang === 'ru'
            ? `📭 Данные в Notion не найдены.\n\n💡 Подключите страницу: ••• → Connections → jonka`
            : `📭 Notion'da ma'lumot topilmadi.\n\n💡 Sahifani ulang: ••• → Connections → jonka`)
        }
        return NextResponse.json({ ok: true })
      }

      // ── 3. Savol/buyruq → AI javob (Notion + web kontekst) ──────────────
      let queryText = text
      const contextParts: string[] = []

      // Notion konteksti — HAMISHA (AI nima borligini biladi)
      if (NOTION_TOKEN) {
        const nCtx = await buildRichNotionContext(text)
        if (nCtx) contextParts.push(lang === 'ru' ? `[Контекст из Notion]:\n${nCtx}` : `[Notion ma'lumotlari]:\n${nCtx}`)
      }

      // Web qidirish — savol bo'lsa
      if (isQuestion(text)) {
        const searchCtx = await webSearch(text)
        if (searchCtx) contextParts.push(lang === 'ru' ? `[Интернет]:\n${searchCtx}` : `[Internet]:\n${searchCtx}`)
      }

      if (contextParts.length > 0) {
        const userLabel = lang === 'ru' ? '[Сообщение пользователя]' : '[Foydalanuvchi xabari]'
        queryText = `${contextParts.join('\n\n')}\n\n${userLabel}: ${text}`
      }

      const rawReply = await askAI(queryText, user_id, username, lang)
      if (rawReply) {
        await sendMessage(chat_id, cleanReply(rawReply))
      } else {
        const msg = lang === 'ru' ? '🤔 Нет ответа. Попробуйте ещё раз.' : "🤔 Javob kelmadi. Qayta urinib ko'ring."
        await sendMessage(chat_id, msg)
      }
    }
  } catch (e) { console.error('TG webhook:', e) }

  return NextResponse.json({ ok: true })
}
