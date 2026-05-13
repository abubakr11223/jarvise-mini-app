import { NextRequest, NextResponse } from 'next/server'

const GROQ_API_KEY  = process.env.GROQ_API_KEY
const SERPER_KEY    = process.env.SERPER_API_KEY
const NOTION_TOKEN  = process.env.NOTION_TOKEN
const NOTION_PARENT = process.env.NOTION_PARENT_PAGE_ID
const N8N_URL       = process.env.N8N_WEBHOOK_URL ||
  'https://abusaidbakrdov.app.n8n.cloud/webhook/8bafdcfb-2d60-4698-ad3e-920c16074495'

const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

const TG_API_ID   = parseInt(process.env.TELEGRAM_API_ID   || '0')
const TG_API_HASH = process.env.TELEGRAM_API_HASH || ''

const NOTION_API = 'https://api.notion.com/v1'
const NH = () => ({
  'Authorization': `Bearer ${NOTION_TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
})

// ════════════════════════════════════════════════════════
//  WEB QIDIRISH
// ════════════════════════════════════════════════════════
async function webSearch(query: string): Promise<string> {
  try {
    if (SERPER_KEY) {
      const res = await fetch('https://google.serper.dev/search', {
        method: 'POST',
        headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: query, num: 5, gl: 'uz', hl: 'ru' }),
      })
      if (res.ok) {
        const d = await res.json()
        const parts: string[] = []
        if (d.answerBox?.answer)   parts.push(d.answerBox.answer)
        if (d.answerBox?.snippet)  parts.push(d.answerBox.snippet)
        if (d.knowledgeGraph?.description) parts.push(d.knowledgeGraph.description)
        ;(d.organic || []).slice(0, 4).forEach((r: { title: string; snippet: string }) =>
          parts.push(`${r.title}: ${r.snippet}`)
        )
        if (parts.length > 0) return parts.join('\n\n').slice(0, 2000)
      }
    }
    const r = await fetch(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`)
    const d = await r.json()
    const parts = [d.Answer, d.AbstractText, ...(d.RelatedTopics||[]).slice(0,2).map((t:{Text?:string})=>t.Text||'')].filter(Boolean)
    return parts.join('\n\n').slice(0, 800)
  } catch { return '' }
}

function isQuestion(text: string): boolean {
  if (text.trim().endsWith('?')) return true
  const qw = ['qanday','qancha','nima','nima u','kimdir','qaerda','qachon','qaysi',
               'что такое','как','сколько','кто такой','где','когда','почему','зачем',
               'расскажи','объясни','what is','how','who is','where','when','why',
               'курс','dollar','valyuta','ob-havo','pogoda','погода','narx','цена','price']
  return qw.some(w => text.toLowerCase().includes(w))
}

// ════════════════════════════════════════════════════════
//  KV (Redis) helpers
// ════════════════════════════════════════════════════════
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

// ════════════════════════════════════════════════════════
//  GROQ
// ════════════════════════════════════════════════════════
async function callGroq(
  messages: { role: string; content: string }[],
  opts?: { maxTokens?: number; temperature?: number; json?: boolean }
): Promise<string> {
  if (!GROQ_API_KEY) return ''
  try {
    const body: Record<string, unknown> = {
      model: 'llama-3.3-70b-versatile',
      messages,
      max_tokens:  opts?.maxTokens  ?? 1024,
      temperature: opts?.temperature ?? 0.7,
    }
    if (opts?.json) body.response_format = { type: 'json_object' }
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) return ''
    const d = await res.json()
    return d.choices?.[0]?.message?.content || ''
  } catch { return '' }
}

// ════════════════════════════════════════════════════════
//  NOTION HELPERS
// ════════════════════════════════════════════════════════

function extractNotionTitle(item: Record<string, unknown>): string {
  if (item.object === 'database')
    return (item.title as Array<{plain_text:string}>)?.[0]?.plain_text || 'Database'
  const props = (item.properties || {}) as Record<string, Record<string, unknown>>
  const tp = props['title'] || props['Title'] || props['Name'] || props['Nomi'] ||
    Object.values(props).find(p => p?.type === 'title')
  const arr = (tp?.title || item.title) as Array<{plain_text:string}> | undefined
  return arr?.[0]?.plain_text || 'Nomsiz'
}

// Sahifa/papkani nomi bo'yicha qidirish
async function notionSearchPage(query: string): Promise<{id:string; title:string; url:string; type:string} | null> {
  if (!NOTION_TOKEN) return null
  try {
    const res = await fetch(`${NOTION_API}/search`, {
      method: 'POST', headers: NH(),
      body: JSON.stringify({ query, page_size: 5 }),
    }).then(r => r.json())
    const results = (res.results || []) as Record<string, unknown>[]
    if (!results.length) return null
    // Eng yaqin nomni topamiz
    const ql = query.toLowerCase()
    const best = results.find(r => extractNotionTitle(r).toLowerCase().includes(ql)) || results[0]
    return {
      id:    best.id as string,
      title: extractNotionTitle(best),
      url:   best.url as string || '',
      type:  best.object as string,
    }
  } catch { return null }
}

// Sahifa bloklar matnini olish (tahlil uchun)
async function notionReadPageText(pageId: string): Promise<string> {
  if (!NOTION_TOKEN) return ''
  try {
    const res = await fetch(`${NOTION_API}/blocks/${pageId}/children?page_size=100`, {
      headers: { Authorization: `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
    }).then(r => r.json())
    const blocks = (res.results || []) as Record<string, unknown>[]
    const lines: string[] = []
    for (const b of blocks) {
      const t = b.type as string
      const c = (b[t] || {}) as Record<string, unknown>
      const text = (c.rich_text as Array<{plain_text:string}>||[]).map(r=>r.plain_text).join('')
      if (text) lines.push(text)
      else if (t==='child_page') lines.push(`📄 ${(c as {title:string}).title}`)
      else if (t==='child_database') lines.push(`🗃 ${(c as {title:string}).title}`)
    }
    // Database bo'lsa — uning itemlarini ham olamiz
    if (!lines.length) {
      const qRes = await fetch(`${NOTION_API}/databases/${pageId}/query`, {
        method: 'POST', headers: NH(),
        body: JSON.stringify({ page_size: 30 }),
      }).then(r => r.json()).catch(() => ({ results: [] }))
      for (const p of (qRes.results || []) as Record<string, unknown>[]) {
        lines.push(extractNotionTitle(p))
      }
    }
    return lines.join('\n').slice(0, 3000)
  } catch { return '' }
}

// Sahifalar ro'yxatini olish
async function notionListPages(): Promise<{title:string; type:string; emoji?:string}[]> {
  if (!NOTION_TOKEN) return []
  try {
    const res = await fetch(`${NOTION_API}/search`, {
      method: 'POST', headers: NH(),
      body: JSON.stringify({ page_size: 20, sort: { direction:'descending', timestamp:'last_edited_time' } }),
    }).then(r => r.json())
    return (res.results || []).map((item: Record<string, unknown>) => {
      const icon = item.icon as {type?:string;emoji?:string}|null
      return {
        title: extractNotionTitle(item),
        type:  item.object as string,
        emoji: icon?.type==='emoji' ? icon.emoji : undefined,
      }
    }).filter((p: {title:string}) => p.title && !p.title.includes('JONKA'))
  } catch { return [] }
}

// ════════════════════════════════════════════════════════
//  NOTION BUYRUQLARINI ANIQLASH
// ════════════════════════════════════════════════════════
const NOTION_KW = ['notion','нотион','notionga','notiondan','notiondagi','нотионга','нотионда']
const CREATE_KW = ['yangi','yaratq','yaratib','qur','och','ochib','new','создай','созда','открой','сделай']
const ADD_KW    = ["qo'y","qo'sh",'qosh','yaz','yozib','quy','добавь','добави','напиши','запиши','допиши']
const READ_KW   = ['tahlil','o\'qi','oqi','ko\'rsat','ko\'rsatq','прочитай','покажи','анализ','нима бор',
                   'nima bor','что там','qanday','расскажи о','ichida nima']
const LIST_KW   = ["ro'yxat",'royhyat','список','list','barchasi','все','hammasi','qanaqalar']

function detectNotionAction(text: string): string | null {
  const l = text.toLowerCase()
  if (!NOTION_KW.some(w => l.includes(w))) return null
  if (CREATE_KW.some(w => l.includes(w))) return 'create'
  if (ADD_KW.some(w => l.includes(w)))    return 'add'
  if (READ_KW.some(w => l.includes(w)))   return 'read'
  if (LIST_KW.some(w => l.includes(w)))   return 'list'
  return 'general'
}

// Groq orqali buyruqni tahlil qilish — JSON
async function parseNotionCommand(userMsg: string): Promise<{
  action: string; title: string; content: string; emoji: string
}> {
  const raw = await callGroq([
    {
      role: 'system',
      content: `Foydalanuvchi Notion buyrug'ini JSON ga aylantir. FAQAT JSON qaytar, boshqa hech narsa yozma.
Format: {"action":"create"|"add"|"read"|"list","title":"sahifa nomi","content":"qo'shiladigan matn","emoji":"📄"}
- action=create: yangi sahifa/papka yaratish
- action=add: mavjud sahifaga matn qo'shish
- action=read: sahifani o'qib tahlil qilish
- action=list: barcha sahifalarni ko'rsatish
- title: sahifa/papka nomi (bo'sh bo'lsa "")
- content: qo'shiladigan matn (bo'sh bo'lsa "")
- emoji: mos emoji (yaratishda)`
    },
    { role: 'user', content: userMsg }
  ], { maxTokens: 200, temperature: 0.1, json: true })

  try {
    return JSON.parse(raw) as { action: string; title: string; content: string; emoji: string }
  } catch {
    return { action: 'general', title: '', content: '', emoji: '📄' }
  }
}

// ── Notion buyruqni bajarish ──────────────────────────────────────────────
async function executeNotionCommand(
  cmd: { action: string; title: string; content: string; emoji: string },
  lang: string
): Promise<string> {
  const t = (key: string, uz: string, ru: string) => lang === 'ru' ? ru : uz

  if (!NOTION_TOKEN) {
    return t('', '❌ Notion ulanmagan. Avval NOTION_TOKEN ni sozlang.', '❌ Notion не подключён. Сначала настройте NOTION_TOKEN.')
  }

  // ── 1. LIST ──────────────────────────────────────────────────────────────
  if (cmd.action === 'list') {
    const pages = await notionListPages()
    if (!pages.length) return t('', '📋 Notion da sahifalar topilmadi.', '📋 Страниц в Notion не найдено.')
    const lines = pages.slice(0, 15).map(p => `${p.emoji || (p.type==='database'?'🗃':'📄')} ${p.title}`).join('\n')
    return t('', `📋 **Notion sahifalari:**\n${lines}`, `📋 **Страницы в Notion:**\n${lines}`)
  }

  // ── 2. CREATE ────────────────────────────────────────────────────────────
  if (cmd.action === 'create') {
    if (!cmd.title) {
      return t('', '❓ Sahifa nomini ayting: masalan "Notion da Loyihalar 2025 nomli yangi sahifa och"',
               '❓ Укажите название: например "Создай в Notion страницу Проекты 2025"')
    }
    if (!NOTION_PARENT) {
      return t('', '❌ NOTION_PARENT_PAGE_ID sozlanmagan. Vercel Environment Variables ga qo\'shing.',
               '❌ NOTION_PARENT_PAGE_ID не настроен.')
    }
    try {
      const res = await fetch(`${NOTION_API}/pages`, {
        method: 'POST', headers: NH(),
        body: JSON.stringify({
          parent: { page_id: NOTION_PARENT },
          icon: { type: 'emoji', emoji: cmd.emoji || '📄' },
          properties: { title: [{ type: 'text', text: { content: cmd.title } }] },
          children: cmd.content ? [{
            object: 'block', type: 'paragraph',
            paragraph: { rich_text: [{ type: 'text', text: { content: cmd.content } }] }
          }] : [],
        }),
      }).then(r => r.json())
      if (res.id) {
        const url = `https://notion.so/${(res.id as string).replace(/-/g,'')}`
        return t('', `✅ **"${cmd.title}"** sahifasi yaratildi!\n🔗 ${url}`,
                 `✅ Страница **"${cmd.title}"** создана!\n🔗 ${url}`)
      }
      return t('', '❌ Yaratib bo\'lmadi.', '❌ Не удалось создать.')
    } catch { return t('', '❌ Xato yuz berdi.', '❌ Произошла ошибка.') }
  }

  // ── 3. ADD ───────────────────────────────────────────────────────────────
  if (cmd.action === 'add') {
    if (!cmd.content) {
      return t('', '❓ Nima qo\'shishni ayting: masalan "Notion dagi Loyihalar sahifasiga — Yangi g\'oya: ..."',
               '❓ Укажите что добавить: например "В Notion в страницу Проекты добавь — Новая идея: ..."')
    }
    const target = cmd.title ? await notionSearchPage(cmd.title) : null
    if (!target) {
      // Sahifa topilmasa — PARENT ga qo'shamiz
      if (!NOTION_PARENT) {
        return t('', `❌ "${cmd.title || 'sahifa'}" topilmadi va NOTION_PARENT_PAGE_ID yo\'q.`,
                 `❌ "${cmd.title || 'страница'}" не найдена.`)
      }
      const res = await fetch(`${NOTION_API}/blocks/${NOTION_PARENT}/children`, {
        method: 'PATCH', headers: NH(),
        body: JSON.stringify({ children: [{
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: cmd.content } }] }
        }] }),
      }).then(r => r.json())
      if (!res.object?.includes('error')) {
        return t('', `✅ Asosiy sahifaga qo\'shildi:\n_"${cmd.content.slice(0,100)}"_`,
                 `✅ Добавлено на главную страницу:\n_"${cmd.content.slice(0,100)}"_`)
      }
      return t('', '❌ Qo\'shib bo\'lmadi.', '❌ Не удалось добавить.')
    }
    const res = await fetch(`${NOTION_API}/blocks/${target.id}/children`, {
      method: 'PATCH', headers: NH(),
      body: JSON.stringify({ children: [{
        object: 'block', type: 'paragraph',
        paragraph: { rich_text: [{ type: 'text', text: { content: cmd.content } }] }
      }] }),
    }).then(r => r.json())
    if (!res.object?.includes('error')) {
      return t('', `✅ **"${target.title}"** sahifasiga qo\'shildi:\n_"${cmd.content.slice(0,100)}"_`,
               `✅ В **"${target.title}"** добавлено:\n_"${cmd.content.slice(0,100)}"_`)
    }
    return t('', '❌ Qo\'shib bo\'lmadi.', '❌ Не удалось добавить.')
  }

  // ── 4. READ / TAHLIL ────────────────────────────────────────────────────
  if (cmd.action === 'read') {
    const target = cmd.title ? await notionSearchPage(cmd.title) : null
    if (!target) {
      return t('', `❌ "${cmd.title || 'sahifa'}" topilmadi. Aniqroq nom ayting.`,
               `❌ "${cmd.title || 'страница'}" не найдена. Уточните название.`)
    }
    const pageText = await notionReadPageText(target.id)
    if (!pageText) {
      return t('', `📄 **"${target.title}"** sahifasi bo\'sh yoki hech narsa topilmadi.`,
               `📄 Страница **"${target.title}"** пустая или ничего не найдено.`)
    }
    // AI bilan tahlil qilamiz
    const analysis = await callGroq([
      {
        role: 'system',
        content: lang === 'ru'
          ? 'Проанализируй содержимое Notion страницы и дай краткое резюме на русском. Будь конкретен.'
          : "Notion sahifasi mazmunini tahlil qilib, qisqa va aniq xulosa ber. O'zbek tilida yoz.",
      },
      {
        role: 'user',
        content: `Sahifa nomi: "${target.title}"\n\nMazmun:\n${pageText}`
      }
    ], { maxTokens: 800 })

    const header = t('', `📄 **"${target.title}"** tahlili:`, `📄 Анализ **"${target.title}"**:`)
    return `${header}\n\n${analysis || pageText.slice(0, 500)}`
  }

  // ── GENERAL ──────────────────────────────────────────────────────────────
  return t('',
    '💡 Notion bilan ishlash uchun:\n• _"Notion da yangi sahifa och [nom]"_\n• _"Notion dagi [sahifa] ga [matn] qo\'y"_\n• _"Notion dagi [sahifa] ni tahlil qil"_\n• _"Notion dagi sahifalarni ko\'rsat"_',
    '💡 Для работы с Notion:\n• _"Создай в Notion страницу [название]"_\n• _"В Notion в [страницу] добавь [текст]"_\n• _"Проанализируй Notion страницу [название]"_\n• _"Покажи все страницы в Notion"_'
  )
}

// ════════════════════════════════════════════════════════
//  TELEGRAM AI — kontaktni topib xabar yuborish
// ════════════════════════════════════════════════════════

// Buyruq kalit so'zlari
const TG_KW = [
  'ga ayt','ga yoz','ga xabar ber','ga yetkazib quy','ga yetkazib ber',
  'ga yubor','uchun yoz','ga telegramdan yoz','ga tg yoz',
  'скажи','напиши','отправь','передай','сообщи','напомни',
  'tell ','send to ','message to ',
]

function detectTelegramSend(text: string): boolean {
  const l = text.toLowerCase()
  return TG_KW.some(w => l.includes(w))
}

// Groq orqali kim + nima deyish kerakligini tahlil qilish
async function parseTgSendCommand(userMsg: string): Promise<{
  recipient: string; content: string
}> {
  const raw = await callGroq([
    {
      role: 'system',
      content: `Foydalanuvchi Telegram xabar yuborish buyrug'ini JSON ga aylantir.
Format: {"recipient":"shaxs ismi","content":"yuborish kerak bo'lgan xabar (faqat mazmun, assistant framing yo'q)"}
Misol1: "Abubakrga ayt bugun kech kelaman" → {"recipient":"Abubakr","content":"bugun kech kelaman"}
Misol2: "Saraga yoz ertaga uchrashuv 3da" → {"recipient":"Sara","content":"ertaga uchrashuv soat 3da"}
Misol3: "Скажи Даше что опоздаю" → {"recipient":"Даша","content":"опоздаю"}
FAQAT JSON qaytar.`,
    },
    { role: 'user', content: userMsg }
  ], { maxTokens: 150, temperature: 0.1, json: true })

  try { return JSON.parse(raw) as { recipient: string; content: string } }
  catch { return { recipient: '', content: '' } }
}

// Contacts yoki chats Redis cache dan recipient qidirish
async function findTgRecipient(name: string): Promise<{
  id: string; title: string; username: string; type: string
} | null> {
  const nl = name.toLowerCase().trim()
  if (!nl) return null

  // 1. Contacts cache
  const cJson = await kvGet('tg_userbot_contacts_cache')
  if (cJson) {
    try {
      const contacts = JSON.parse(cJson) as Array<{
        id: string; name: string; firstName: string; lastName: string; username: string
      }>
      const m = contacts.find(c =>
        c.name.toLowerCase().includes(nl) ||
        c.firstName.toLowerCase().includes(nl) ||
        (c.lastName && c.lastName.toLowerCase().includes(nl)) ||
        (c.username && c.username.toLowerCase().includes(nl))
      )
      if (m) return { id: m.id, title: m.name, username: m.username, type: 'private' }
    } catch {}
  }

  // 2. Chats cache
  const chJson = await kvGet('tg_userbot_chats_v3')
  if (chJson) {
    try {
      const chats = JSON.parse(chJson) as Array<{
        id: string; title: string; username: string; type: string
      }>
      const m = chats.find(c =>
        c.title.toLowerCase().includes(nl) ||
        (c.username && c.username.toLowerCase().includes(nl))
      )
      if (m) return { id: m.id, title: m.title, username: m.username, type: m.type }
    } catch {}
  }

  return null
}

// GramJS orqali xabar yuborish
async function sendTgMessage(
  recipientId: string, recipientUsername: string, text: string
): Promise<boolean> {
  if (!TG_API_ID || !TG_API_HASH) return false
  const session = await kvGet('tg_userbot_session')
  if (!session) return false

  try {
    const { TelegramClient } = await import('telegram')
    const { StringSession }  = await import('telegram/sessions')
    const client = new TelegramClient(
      new StringSession(session), TG_API_ID, TG_API_HASH,
      { connectionRetries: 2, timeout: 20 }
    )
    await client.connect()
    const entity = recipientUsername ? `@${recipientUsername.replace('@', '')}` : recipientId
    await client.sendMessage(entity, { message: text })
    await client.disconnect()
    return true
  } catch { return false }
}

// AI yordamida "assistant" xabarini compose qilish
async function composeTgMessage(
  recipientName: string, content: string, lang: string, ownerName = 'Suhrob'
): Promise<string> {
  const prompt = lang === 'ru'
    ? `Ты — умный ассистент ${ownerName}. Напиши короткое вежливое сообщение для "${recipientName}".
Суть: "${content}"
Представься как ассистент ${ownerName}. Пиши естественно, без лишних слов. Только сообщение.`
    : `Sen ${ownerName}ning aqlli yordamchisisan. "${recipientName}" uchun qisqa, muloyim xabar yoz.
Mazmun: "${content}"
${ownerName}ning yordamchisi sifatida tanish. Tabiiy yoz, keraksiz so'zsiz. Faqat xabar.`

  const msg = await callGroq([
    { role: 'system', content: prompt },
    { role: 'user',   content: content }
  ], { maxTokens: 200, temperature: 0.5 })

  return msg || content
}

// Telegram buyrug'ini to'liq bajarish
async function executeTgSend(userMsg: string, lang: string, isVoice = false): Promise<string> {
  const t = (uz: string, ru: string) => lang === 'ru' ? ru : uz

  // 1. Parse
  const cmd = await parseTgSendCommand(userMsg)
  if (!cmd.recipient || !cmd.content) {
    return t(
      '❓ Kimga va nima deyishni aniqroq ayting. Masalan: _"Abubakrga ayt bugun kech kelaman"_',
      '❓ Уточните кому и что сказать. Например: _"Скажи Даше что опоздаю"_'
    )
  }

  // 2. Recipient qidirish
  const recipient = await findTgRecipient(cmd.recipient)
  if (!recipient) {
    return t(
      `❌ **"${cmd.recipient}"** kontaktlar orasida topilmadi.\n💡 Avval Telegram panelidagi kontaktlarni yangilang.`,
      `❌ **"${cmd.recipient}"** не найден среди контактов.\n💡 Обновите контакты в панели Telegram.`
    )
  }

  // 3. Xabarni compose qilish
  const composed = await composeTgMessage(recipient.title, cmd.content, lang)

  // 4. Yuborish
  const sent = await sendTgMessage(recipient.id, recipient.username, composed)

  if (!sent) {
    return t(
      `❌ Xabar yuborilmadi. Telegram ulangan emasmi?\n_Yubormoqchi bo'lgan xabar:_\n"${composed}"`,
      `❌ Сообщение не отправлено. Telegram подключён?\n_Текст сообщения:_\n"${composed}"`
    )
  }

  const modeIcon = isVoice ? '🎤' : '💬'
  return t(
    `${modeIcon} **${recipient.title}** ga xabar yuborildi!\n\n_"${composed}"_`,
    `${modeIcon} Сообщение отправлено **${recipient.title}**!\n\n_"${composed}"_`
  )
}

// ════════════════════════════════════════════════════════
//  ASOSIY SYSTEM PROMPT
// ════════════════════════════════════════════════════════
const SYSTEM = `Sen JONKA — aqlli shaxsiy moliya, hayot va Notion assistentisan.
Foydalanuvchi qaysi tilda yozsa — ALBATTA shu tilda qisqa va aniq javob ber.
Internet ma'lumoti berilsa — undan foydalanib dolzarb javob ber.
Moliya, investitsiya, hayot haqida savolda professional maslahat ber.
Notion buyruqlarini ham bajara olasan (yaratish, qo'shish, tahlil qilish).`

// ════════════════════════════════════════════════════════
//  MAIN HANDLER
// ════════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  try {
    const body    = await request.json() as Record<string, unknown>
    const userMsg = String(body.message || body.text || '').trim()
    if (!userMsg) return NextResponse.json({ reply: '' })

    const cyrCount = (userMsg.match(/[а-яёА-ЯЁ]/g)||[]).length
    const lang     = cyrCount > userMsg.length * 0.1 ? 'ru' : 'uz'

    // ── 1. Telegram xabar yuborish buyrug'i ──────────────────────────────
    const isVoice = !!(body.isVoice)
    if (detectTelegramSend(userMsg)) {
      const result = await executeTgSend(userMsg, lang, isVoice)
      return NextResponse.json({ reply: result })
    }

    // ── 2. Notion buyrug'ini tekshiramiz ──────────────────────────────────
    const notionAction = detectNotionAction(userMsg)
    if (notionAction) {
      const cmd = await parseNotionCommand(userMsg)
      const result = await executeNotionCommand(
        { ...cmd, action: cmd.action === 'general' ? notionAction : cmd.action },
        lang
      )
      return NextResponse.json({ reply: result })
    }

    // ── 2. Oddiy chat ─────────────────────────────────────────────────────
    const messages: { role: string; content: string }[] = [{ role: 'system', content: SYSTEM }]

    if (isQuestion(userMsg)) {
      const ctx = await webSearch(userMsg)
      if (ctx) {
        messages.push({
          role: 'system',
          content: lang === 'ru' ? `[Данные из интернета]:\n${ctx}` : `[Internet ma'lumoti]:\n${ctx}`,
        })
      }
    }

    messages.push({ role: 'user', content: userMsg })

    const groqReply = await callGroq(messages)
    if (groqReply) return NextResponse.json({ reply: groqReply })

    // Fallback: n8n
    try {
      const n8n = await fetch(N8N_URL, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (n8n.ok) {
        const d = await n8n.json() as Record<string, unknown>
        return NextResponse.json({ reply: String(d.reply||d.response||d.text||d.message||d.output||'✅') })
      }
    } catch {}

    return NextResponse.json({ reply: lang==='ru' ? '🤔 Попробуйте ещё раз.' : "🤔 Qayta urinib ko'ring." })
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 })
  }
}
