import { NextRequest, NextResponse } from 'next/server'

const TOKEN  = process.env.NOTION_TOKEN
const PARENT = process.env.NOTION_PARENT_PAGE_ID
const API    = 'https://api.notion.com/v1'

const H = () => ({
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json',
  'Notion-Version': '2022-06-28',
})

// In-process DB ID cache (warm across requests on same instance)
const cache: Record<string, string> = {}

const DB_CONFIGS = {
  expenses: {
    title: '💰 Xarajatlar — JONKA',
    emoji: '💰',
    properties: {
      'Nomi':       { title: {} },
      'Summa':      { number: { format: 'number' } },
      'Turi':       { select: { options: [{ name: 'XARAJAT', color: 'red' }, { name: 'DAROMAT', color: 'green' }] } },
      'Kategoriya': { select: { options: [] } },
      'Sana':       { date: {} },
    },
  },
  debts: {
    title: '🤝 Qarzlar — JONKA',
    emoji: '🤝',
    properties: {
      "Shaxs":       { title: {} },
      'Summa':       { number: {} },
      "Yo'nalish":   { select: { options: [{ name: 'Men berdim', color: 'green' }, { name: 'Men oldim', color: 'red' }] } },
      'Holat':       { select: { options: [{ name: 'Faol', color: 'yellow' }, { name: "To'langan", color: 'green' }] } },
      'Izoh':        { rich_text: {} },
      'Sana':        { date: {} },
    },
  },
  notes: {
    title: '📓 Eslatmalar — JONKA',
    emoji: '📓',
    properties: {
      'Sarlavha': { title: {} },
      'Matn':     { rich_text: {} },
      'Sana':     { date: {} },
    },
  },
  projects: {
    title: '🚀 Loyihalar — JONKA',
    emoji: '🚀',
    properties: {
      'Nomi':   { title: {} },
      'Holat':  { select: { options: [{ name: 'Aktiv', color: 'green' }, { name: 'Tugatildi', color: 'gray' }] } },
      'Izoh':   { rich_text: {} },
      'Sana':   { date: {} },
    },
  },
}

async function getOrCreateDB(type: keyof typeof DB_CONFIGS): Promise<string | null> {
  if (!TOKEN) return null

  // 1. Env var override
  const envKey: Record<string, string | undefined> = {
    expenses: process.env.NOTION_EXPENSES_DB_ID,
    debts:    process.env.NOTION_DEBTS_DB_ID,
    notes:    process.env.NOTION_NOTES_DB_ID,
    projects: process.env.NOTION_PROJECTS_DB_ID,
  }
  if (envKey[type]) return envKey[type]!
  if (cache[type]) return cache[type]

  // 2. Search existing
  try {
    const cfg = DB_CONFIGS[type]
    const search = await fetch(`${API}/search`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ query: cfg.title, filter: { property: 'object', value: 'database' } }),
    }).then(r => r.json())
    if (search.results?.length > 0) { cache[type] = search.results[0].id; return cache[type] }
  } catch {}

  // 3. Create (only if PARENT is set)
  if (!PARENT) return null
  try {
    const cfg = DB_CONFIGS[type]
    const res = await fetch(`${API}/databases`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        parent: { page_id: PARENT },
        icon: { type: 'emoji', emoji: cfg.emoji },
        title: [{ type: 'text', text: { content: cfg.title } }],
        properties: cfg.properties,
      }),
    }).then(r => r.json())
    if (res.id) { cache[type] = res.id; return cache[type] }
  } catch {}
  return null
}

const today = () => new Date().toISOString().split('T')[0]

// ── POST — add item or execute command ────────────────────────────────────
export async function POST(request: NextRequest) {
  if (!TOKEN) return NextResponse.json({ ok: false, error: 'NOTION_TOKEN sozlanmagan' })

  const body = await request.json().catch(() => ({}))
  const { type, data } = body

  // ── Expense ──────────────────────────────────────────────────────────────
  if (type === 'expense') {
    const dbId = await getOrCreateDB('expenses')
    if (!dbId) return NextResponse.json({ ok: false, error: 'DB topilmadi' })
    const res = await fetch(`${API}/pages`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          'Nomi':       { title: [{ text: { content: data.name || 'Xarajat' } }] },
          'Summa':      { number: data.amount || 0 },
          'Turi':       { select: { name: data.type === 'DAROMAT' ? 'DAROMAT' : 'XARAJAT' } },
          'Kategoriya': { select: { name: data.name || 'Boshqa' } },
          'Sana':       { date: { start: today() } },
        },
      }),
    }).then(r => r.json())
    return NextResponse.json({ ok: !!res.id })
  }

  // ── Debt ─────────────────────────────────────────────────────────────────
  if (type === 'debt') {
    const dbId = await getOrCreateDB('debts')
    if (!dbId) return NextResponse.json({ ok: false })
    const res = await fetch(`${API}/pages`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          'Shaxs':      { title: [{ text: { content: data.person || "Noma'lum" } }] },
          'Summa':      { number: data.amount || 0 },
          "Yo'nalish":  { select: { name: data.dir === 'gave' ? 'Men berdim' : 'Men oldim' } },
          'Holat':      { select: { name: 'Faol' } },
          'Izoh':       { rich_text: data.note ? [{ text: { content: data.note } }] : [] },
          'Sana':       { date: { start: today() } },
        },
      }),
    }).then(r => r.json())
    return NextResponse.json({ ok: !!res.id })
  }

  // ── Note ─────────────────────────────────────────────────────────────────
  if (type === 'note') {
    const dbId = await getOrCreateDB('notes')
    if (!dbId) return NextResponse.json({ ok: false })
    const res = await fetch(`${API}/pages`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          'Sarlavha': { title: [{ text: { content: data.title || 'Eslatma' } }] },
          'Matn':     { rich_text: [{ text: { content: data.content || '' } }] },
          'Sana':     { date: { start: today() } },
        },
      }),
    }).then(r => r.json())
    return NextResponse.json({ ok: !!res.id })
  }

  // ── Voice command: create page or project ────────────────────────────────
  if (type === 'create_page') {
    const target = PARENT
    if (!target) return NextResponse.json({ ok: false, error: 'NOTION_PARENT_PAGE_ID sozlanmagan' })
    const res = await fetch(`${API}/pages`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        parent: { page_id: target },
        icon: { type: 'emoji', emoji: data.emoji || '📄' },
        properties: { title: [{ type: 'text', text: { content: data.title || 'Yangi sahifa' } }] },
        children: data.content ? [{
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: data.content } }] },
        }] : [],
      }),
    }).then(r => r.json())
    return NextResponse.json({ ok: !!res.id, url: res.url, id: res.id })
  }

  // ── Voice command: add to project DB ─────────────────────────────────────
  if (type === 'project') {
    const dbId = await getOrCreateDB('projects')
    if (!dbId) return NextResponse.json({ ok: false })
    const res = await fetch(`${API}/pages`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({
        parent: { database_id: dbId },
        properties: {
          'Nomi':  { title: [{ text: { content: data.name || 'Yangi loyiha' } }] },
          'Holat': { select: { name: 'Aktiv' } },
          'Izoh':  { rich_text: data.note ? [{ text: { content: data.note } }] : [] },
          'Sana':  { date: { start: today() } },
        },
      }),
    }).then(r => r.json())
    return NextResponse.json({ ok: !!res.id })
  }

  // ── Update existing page (edit content) ──────────────────────────────────
  if (type === 'update_page' && data.page_id) {
    const res = await fetch(`${API}/pages/${data.page_id}`, {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({ archived: false, properties: data.properties || {} }),
    }).then(r => r.json())
    if (data.content) {
      await fetch(`${API}/blocks/${data.page_id}/children`, {
        method: 'PATCH', headers: H(),
        body: JSON.stringify({ children: [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: data.content } }] } }] }),
      })
    }
    return NextResponse.json({ ok: !!res.id })
  }

  // ── Append content to existing page ──────────────────────────────────────
  if (type === 'append' && data.page_id && data.content) {
    const res = await fetch(`${API}/blocks/${data.page_id}/children`, {
      method: 'PATCH', headers: H(),
      body: JSON.stringify({
        children: [{
          object: 'block', type: 'paragraph',
          paragraph: { rich_text: [{ type: 'text', text: { content: data.content } }] }
        }]
      }),
    }).then(r => r.json())
    return NextResponse.json({ ok: !res.object?.includes('error') })
  }

  return NextResponse.json({ ok: false, error: 'Unknown type' })
}

// ── Notion item title extractor ───────────────────────────────────────────
function extractTitle(item: Record<string, unknown>): string {
  if (item.object === 'database')
    return (item.title as Array<{plain_text:string}>)?.[0]?.plain_text || 'Database'
  const props = (item.properties || {}) as Record<string, Record<string, unknown>>
  const tp = props['title'] || props['Title'] || props['Name'] || props['Nomi'] ||
    Object.values(props).find(p => p?.type === 'title')
  const arr = (tp?.title || item.title) as Array<{plain_text:string}> | undefined
  return arr?.[0]?.plain_text || 'Nomsiz'
}

// ── GET — multi-action: expenses, list pages, search, read page ───────────
export async function GET(request: NextRequest) {
  if (!TOKEN) return NextResponse.json({ ok: false, error: 'NOTION_TOKEN sozlanmagan' })

  const { searchParams } = new URL(request.url)
  const action = searchParams.get('action')

  // ── List all accessible pages/databases ──────────────────────────────────
  if (action === 'list') {
    try {
      const filter = searchParams.get('filter') // 'page' | 'database' | null
      const allItems: Record<string, unknown>[] = []

      // 1. Agar PARENT set bo'lsa — uning ichidagi bloklarni ham olamiz
      if (PARENT) {
        try {
          const childRes = await fetch(`${API}/blocks/${PARENT}/children?page_size=50`, {
            headers: { 'Authorization': `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28' }
          }).then(r => r.json())
          for (const b of (childRes.results || []) as Record<string, unknown>[]) {
            if (b.type === 'child_page') {
              allItems.push({
                id: b.id, object: 'page',
                title: [{ plain_text: (b['child_page'] as {title:string}).title }],
                url: `https://notion.so/${(b.id as string).replace(/-/g,'')}`,
                last_edited_time: b.last_edited_time,
              })
            } else if (b.type === 'child_database') {
              allItems.push({
                id: b.id, object: 'database',
                title: [{ plain_text: (b['child_database'] as {title:string}).title }],
                url: `https://notion.so/${(b.id as string).replace(/-/g,'')}`,
                last_edited_time: b.last_edited_time,
              })
            }
          }
        } catch {}
      }

      // 2. Search API orqali qolganlarni olamiz
      const body: Record<string, unknown> = {
        page_size: 50,
        sort: { direction: 'descending', timestamp: 'last_edited_time' },
      }
      if (filter) body.filter = { property: 'object', value: filter }
      const searchRes = await fetch(`${API}/search`, {
        method: 'POST', headers: H(), body: JSON.stringify(body),
      }).then(r => r.json())

      for (const item of (searchRes.results || []) as Record<string, unknown>[]) {
        // Dublikat qo'shmaymiz
        if (!allItems.find(x => x.id === item.id)) allItems.push(item)
      }

      // JONKA DB larini oxiriga o'tkazamiz
      const sorted = [
        ...allItems.filter(i => !extractTitle(i).includes('JONKA')),
        ...allItems.filter(i => extractTitle(i).includes('JONKA')),
      ]

      const items = sorted.map((item) => {
        const icon = item.icon as {type:string;emoji?:string} | null
        const emoji = icon?.type === 'emoji' ? icon.emoji : null
        return {
          id: item.id, title: extractTitle(item), url: item.url, type: item.object,
          last_edited: item.last_edited_time, emoji,
        }
      })
      return NextResponse.json({ ok: true, items })
    } catch { return NextResponse.json({ ok: false, items: [] }) }
  }

  // ── Search by query ───────────────────────────────────────────────────────
  if (action === 'search') {
    const query = searchParams.get('q') || ''
    try {
      const res = await fetch(`${API}/search`, {
        method: 'POST', headers: H(),
        body: JSON.stringify({ query, page_size: 10 }),
      }).then(r => r.json())
      const items = (res.results || []).map((item: Record<string, unknown>) => ({
        id: item.id, title: extractTitle(item), url: item.url, type: item.object,
      }))
      return NextResponse.json({ ok: true, items, query })
    } catch { return NextResponse.json({ ok: false, items: [] }) }
  }

  // ── Read page blocks ──────────────────────────────────────────────────────
  if (action === 'read_page') {
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'id required' })
    try {
      const hdr = { Authorization: `Bearer ${TOKEN}`, 'Notion-Version': '2022-06-28' }

      // Helper: extract text from a block
      const blockText = (b: Record<string, unknown>) => {
        const t = b.type as string
        const c = (b[t] || {}) as Record<string, unknown>
        const text = c.rich_text
          ? (c.rich_text as Array<{plain_text:string}>).map(r => r.plain_text).join('')
          : t === 'child_page' ? (c as {title:string}).title
          : t === 'child_database' ? (c as {title:string}).title
          : ''
        return { type: t, text, checked: (c as {checked?:boolean}).checked, id: b.id as string }
      }

      // Helper: query a database and return its items as blocks
      const queryDatabase = async (dbId: string): Promise<{type:string;text:string;checked?:boolean;id?:string;url?:string}[]> => {
        try {
          const res = await fetch(`${API}/databases/${dbId}/query`, {
            method: 'POST', headers: H(),
            body: JSON.stringify({ sorts: [{ timestamp: 'last_edited_time', direction: 'descending' }], page_size: 20 }),
          }).then(r => r.json())
          return (res.results || []).map((p: Record<string, unknown>) => {
            const title = extractTitle(p)
            const props = (p.properties || {}) as Record<string, Record<string, unknown>>
            const status = Object.values(props).find(pp => pp?.type === 'status' || pp?.type === 'select')
            const statusName = (status?.status as {name:string})?.name || (status?.select as {name:string})?.name || ''
            const text = statusName ? `${title}  [${statusName}]` : title
            const pageId = (p.id as string)
            const url = `https://notion.so/${pageId.replace(/-/g,'')}`
            return { type: 'db_item', text, checked: false, id: pageId, url }
          }).filter((b: {text:string}) => b.text)
        } catch { return [] }
      }

      // Helper: recursively expand nested blocks (column_list → column → blocks)
      const expandBlocks = async (rawBlocks: Record<string, unknown>[]): Promise<{type:string;text:string;checked?:boolean}[]> => {
        const result: {type:string;text:string;checked?:boolean}[] = []
        for (const b of rawBlocks) {
          const t = b.type as string
          if (t === 'column_list' || t === 'column') {
            try {
              const cr = await fetch(`${API}/blocks/${b.id}/children?page_size=50`, { headers: hdr }).then(r => r.json())
              const nested = await expandBlocks(cr.results || [])
              result.push(...nested)
            } catch {}
          } else if (t === 'child_database') {
            // Show DB title as header
            const dbTitle = ((b['child_database'] as {title:string})?.title) || 'Database'
            result.push({ type: 'heading_3', text: `🗄 ${dbTitle}`, checked: false })
            // Query DB items
            const items = await queryDatabase(b.id as string)
            result.push(...items)
          } else {
            const parsed = blockText(b)
            if (parsed.text) result.push(parsed)
          }
        }
        return result
      }

      const [pageRes, blocksRes] = await Promise.all([
        fetch(`${API}/pages/${id}`, { headers: H() }).then(r => r.json()),
        fetch(`${API}/blocks/${id}/children?page_size=50`, { headers: hdr }).then(r => r.json()),
      ])
      const title = extractTitle(pageRes)
      const iconObj = pageRes.icon as {type:string;emoji?:string} | null
      const emoji = iconObj?.type === 'emoji' ? iconObj.emoji : null

      // Extract page properties (for database items)
      const propsRaw = (pageRes.properties || {}) as Record<string, Record<string, unknown>>
      const props: {name:string; value:string; type:string}[] = []
      for (const [name, prop] of Object.entries(propsRaw)) {
        const t = prop.type as string
        let value = ''
        if (t === 'status') value = (prop.status as {name:string})?.name || ''
        else if (t === 'select') value = (prop.select as {name:string})?.name || ''
        else if (t === 'multi_select') value = ((prop.multi_select as {name:string}[]) || []).map(s=>s.name).join(', ')
        else if (t === 'date') value = (prop.date as {start:string})?.start || ''
        else if (t === 'number') value = prop.number !== null ? String(prop.number) : ''
        else if (t === 'checkbox') value = prop.checkbox ? '✅' : '⬜'
        else if (t === 'rich_text') value = ((prop.rich_text as {plain_text:string}[]) || [])[0]?.plain_text || ''
        else if (t === 'title') continue // skip title, already extracted
        else if (t === 'url') value = prop.url as string || ''
        if (value) props.push({ name, value, type: t })
      }

      const blocks: {type:string;text:string;checked?:boolean;id?:string;url?:string}[] = await expandBlocks(blocksRes.results || [])
      return NextResponse.json({ ok: true, title, emoji, blocks, props, url: pageRes.url })
    } catch { return NextResponse.json({ ok: false, error: 'Failed to read page' }) }
  }

  // ── Default: read recent expenses from Notion DB ──────────────────────────
  const dbId = await getOrCreateDB('expenses')
  if (!dbId) return NextResponse.json({ ok: false, expenses: [] })

  try {
    const res = await fetch(`${API}/databases/${dbId}/query`, {
      method: 'POST', headers: H(),
      body: JSON.stringify({ sorts: [{ property: 'Sana', direction: 'descending' }], page_size: 100 }),
    }).then(r => r.json())

    const expenses = (res.results || []).map((p: Record<string, unknown>) => {
      const props = p.properties as Record<string, Record<string, unknown>>
      return {
        id: (p.id as string).replace(/-/g, '').slice(0, 13),
        name:   (props['Nomi']?.title as Array<{plain_text:string}>)?.[0]?.plain_text || 'Xarajat',
        amount: (props['Summa']?.number as number) || 0,
        type:   (props['Turi']?.select as {name:string})?.name || 'XARAJAT',
        date:   (props['Sana']?.date as {start:string})?.start || today(),
      }
    })
    return NextResponse.json({ ok: true, expenses })
  } catch { return NextResponse.json({ ok: false, expenses: [] }) }
}
