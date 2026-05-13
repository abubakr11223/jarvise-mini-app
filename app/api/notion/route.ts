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

      // ── Rich text segment extractor (bold/italic/code/color/link)
      type Seg = {text:string; bold?:boolean; italic?:boolean; strikethrough?:boolean; underline?:boolean; code?:boolean; color?:string; href?:string}
      const extractSegs = (rt: unknown[]): Seg[] =>
        (rt || []).flatMap((r: unknown) => {
          const x = r as {plain_text:string; annotations?:{bold?:boolean;italic?:boolean;strikethrough?:boolean;underline?:boolean;code?:boolean;color?:string}; href?:string}
          if (!x.plain_text) return []
          return [{ text: x.plain_text,
            bold: x.annotations?.bold || undefined,
            italic: x.annotations?.italic || undefined,
            strikethrough: x.annotations?.strikethrough || undefined,
            underline: x.annotations?.underline || undefined,
            code: x.annotations?.code || undefined,
            color: (x.annotations?.color && x.annotations.color !== 'default') ? x.annotations.color : undefined,
            href: x.href || undefined,
          }]
        })

      type DBCell  = { text: string; color?: string; kind: string }
      type DBRow   = { id: string; icon?: string; title: string; url: string; cells: Record<string, DBCell> }
      type DBCol   = { name: string; type: string }

      type NBlock = {
        type:string; text:string; segments:Seg[];
        checked?:boolean; id:string; url?:string; has_children?:boolean;
        icon?:string; color?:string; src?:string;
        rows?:string[][]; hasColumnHeader?:boolean;
        children?: NBlock[]
        // ── database table ──────────────────────────────────────────────
        dbColumns?: DBCol[]
        dbRows?:    DBRow[]
      }

      // ── Parse single block
      const parseBlock = (b: Record<string, unknown>): NBlock => {
        const t  = b.type as string
        const c  = (b[t] || {}) as Record<string, unknown>
        const rt = (c.rich_text || []) as unknown[]
        const text = rt.map((r:unknown) => (r as {plain_text:string}).plain_text||'').join('')
        const segments = extractSegs(rt)
        const id = b.id as string
        const has_children = !!(b.has_children)

        if (t === 'child_page')     return { type:t, text:(c as {title:string}).title, segments:[], id }
        if (t === 'child_database') return { type:t, text:(c as {title:string}).title, segments:[], id }
        if (t === 'divider')        return { type:'divider', text:'', segments:[], id }
        if (t === 'to_do')          return { type:t, text, segments, checked:!!(c as {checked?:boolean}).checked, id }

        if (t === 'callout') {
          const ico = (c.icon||{}) as {type?:string; emoji?:string; external?:{url:string}}
          const icon = ico.type === 'emoji' ? (ico.emoji||'💡') : '💡'
          return { type:t, text, segments, id, icon, color:(c.color as string)||'gray_background' }
        }

        if (t === 'image') {
          const img = c as {type?:string; external?:{url:string}; file?:{url:string}; caption?:unknown[]}
          const src = img.type === 'external' ? (img.external?.url||'') : (img.file?.url||'')
          const cap = (img.caption||[]).map((r:unknown)=>(r as {plain_text:string}).plain_text||'').join('')
          return { type:t, text:cap, segments:[], id, src }
        }

        if (t === 'code') {
          return { type:t, text, segments:[], id, color:(c.language as string)||'' }
        }

        if (t === 'table') {
          return { type:t, text:'', segments:[], id, has_children,
            hasColumnHeader:!!(c as {has_column_header?:boolean}).has_column_header }
        }

        return { type:t, text, segments, id, has_children }
      }

      // ── Fetch ALL blocks with cursor pagination
      const fetchAll = async (blockId: string): Promise<Record<string, unknown>[]> => {
        const all: Record<string, unknown>[] = []
        let cursor: string | null = null
        do {
          const fetchUrl: string = `${API}/blocks/${blockId}/children?page_size=100${cursor ? `&start_cursor=${cursor}` : ''}`
          const res = await fetch(fetchUrl, { headers: hdr }).then(r => r.json())
          all.push(...(res.results || []))
          cursor = res.has_more ? (res.next_cursor as string) : null
        } while (cursor)
        return all
      }

      // ── Fetch full database as table (schema + rows) ─────────────────
      const fetchDBTable = async (dbId: string): Promise<NBlock | null> => {
        try {
          // 1. Schema + meta
          const [meta, qRes] = await Promise.all([
            fetch(`${API}/databases/${dbId}`, { headers: H() }).then(r => r.json()),
            fetch(`${API}/databases/${dbId}/query`, {
              method:'POST', headers:H(),
              body: JSON.stringify({ sorts:[{ timestamp:'last_edited_time', direction:'descending' }], page_size:30 }),
            }).then(r => r.json()),
          ])

          const dbTitle = extractTitle(meta)
          const iconObj = (meta.icon as {type?:string;emoji?:string}|null)
          const dbIcon  = iconObj?.type==='emoji' ? iconObj.emoji : '🗃'

          // 2. Columns — title bilan birgalikda (max 4 ustun + title)
          const schemaPropEntries = Object.entries(
            (meta.properties || {}) as Record<string, Record<string, unknown>>
          )
          // Title doim birinchi, qolganlarni oldingi tartibda olamiz
          const titleColName  = schemaPropEntries.find(([,p]) => p.type==='title')?.[0] || 'Name'
          const extraCols: DBCol[] = schemaPropEntries
            .filter(([,p]) => p.type !== 'title' && p.type !== 'created_time' && p.type !== 'last_edited_time')
            .slice(0, 4)
            .map(([name, p]) => ({ name, type: p.type as string }))
          const columns: DBCol[] = [{ name: titleColName, type: 'title' }, ...extraCols]

          // Notion API rang → {bg, fg}
          const notionColor = (c?: string): {bg:string;fg:string} => {
            const map: Record<string,{bg:string;fg:string}> = {
              blue:   {bg:'rgba(35,131,226,0.2)',   fg:'#529cca'},
              green:  {bg:'rgba(68,131,97,0.2)',    fg:'#4cc38a'},
              yellow: {bg:'rgba(203,145,47,0.2)',   fg:'#dfab01'},
              orange: {bg:'rgba(217,115,13,0.2)',   fg:'#d9730d'},
              red:    {bg:'rgba(212,76,71,0.2)',    fg:'#e03e3e'},
              purple: {bg:'rgba(144,101,176,0.2)',  fg:'#9065b0'},
              pink:   {bg:'rgba(173,26,114,0.2)',   fg:'#ad1a72'},
              brown:  {bg:'rgba(100,71,58,0.2)',    fg:'#64473a'},
              gray:   {bg:'rgba(120,120,120,0.15)', fg:'#787774'},
              default:{bg:'rgba(120,120,120,0.15)', fg:'#787774'},
            }
            return map[c||'default'] || map.default
          }

          // 3. Rows
          const dbRows: DBRow[] = (qRes.results || []).map((p: Record<string, unknown>) => {
            const title   = extractTitle(p)
            const pageId  = p.id as string
            const url     = `https://notion.so/${pageId.replace(/-/g,'')}`
            const icoObj  = (p as Record<string, unknown>).icon as {type?:string;emoji?:string}|null
            const icon    = icoObj?.type==='emoji' ? icoObj.emoji : undefined
            const props   = (p.properties||{}) as Record<string, Record<string, unknown>>
            const cells: Record<string, DBCell> = {}

            for (const col of extraCols) {
              const prop = props[col.name]
              if (!prop) { cells[col.name] = { text:'', kind: col.type }; continue }
              const kind = prop.type as string
              if (kind==='status') {
                const s = prop.status as {name?:string;color?:string}
                const cl = notionColor(s?.color)
                cells[col.name] = { text: s?.name||'', color: `${cl.bg}|${cl.fg}`, kind }
              } else if (kind==='select') {
                const s = prop.select as {name?:string;color?:string}
                const cl = notionColor(s?.color)
                cells[col.name] = { text: s?.name||'', color: `${cl.bg}|${cl.fg}`, kind }
              } else if (kind==='multi_select') {
                const ss = (prop.multi_select as {name?:string;color?:string}[])||[]
                const text = ss.map(s=>s.name||'').join(', ')
                const cl = ss[0] ? notionColor(ss[0].color) : notionColor()
                cells[col.name] = { text, color: `${cl.bg}|${cl.fg}`, kind }
              } else if (kind==='rich_text') {
                const txt = ((prop.rich_text as {plain_text:string}[])||[])[0]?.plain_text||''
                cells[col.name] = { text: txt.length > 40 ? txt.slice(0,40)+'…' : txt, kind: 'text' }
              } else if (kind==='date') {
                const d = (prop.date as {start?:string})?.start||''
                cells[col.name] = { text: d ? d.slice(0,10) : '', kind: 'date' }
              } else if (kind==='number') {
                cells[col.name] = { text: prop.number!=null ? String(prop.number) : '', kind: 'number' }
              } else if (kind==='checkbox') {
                cells[col.name] = { text: prop.checkbox ? '✅' : '⬜', kind: 'checkbox' }
              } else if (kind==='url') {
                cells[col.name] = { text: (prop.url as string)||'', kind: 'url' }
              } else if (kind==='people') {
                const pp = (prop.people as {name?:string}[])||[]
                cells[col.name] = { text: pp.map(x=>x.name||'').join(', '), kind: 'people' }
              } else {
                cells[col.name] = { text: '', kind }
              }
            }
            return { id: pageId, icon, title, url, cells }
          })

          return {
            type:'db_table', text: dbTitle, segments:[], id: dbId,
            icon: dbIcon, dbColumns: columns, dbRows,
          } as NBlock
        } catch { return null }
      }

      // ── Recursively expand blocks (columns, toggles, tables, DBs)
      const expandBlocks = async (rawBlocks: Record<string, unknown>[], depth=0): Promise<NBlock[]> => {
        const result: NBlock[] = []
        for (const b of rawBlocks) {
          const t = b.type as string

          // Transparent containers — inline
          if (t==='column_list' || t==='column' || t==='synced_block') {
            try {
              const ch = await fetchAll(b.id as string)
              result.push(...await expandBlocks(ch, depth))
            } catch {}
            continue
          }

          // Inline child database — full table
          if (t==='child_database') {
            const tbl = await fetchDBTable(b.id as string)
            if (tbl) result.push(tbl)
            continue
          }

          const parsed = parseBlock(b)

          // Toggle: fetch children (limit depth)
          if (t==='toggle' && b.has_children && depth < 3) {
            try {
              const ch = await fetchAll(b.id as string)
              parsed.children = await expandBlocks(ch, depth+1)
            } catch {}
          }

          // Table: fetch rows
          if (t==='table' && b.has_children) {
            try {
              const rowBlocks = await fetchAll(b.id as string)
              parsed.rows = rowBlocks.map((row: Record<string, unknown>) => {
                const rd = (row['table_row']||{}) as {cells?:unknown[][]}
                return (rd.cells||[]).map((cell:unknown[]) =>
                  (cell||[]).map((r:unknown)=>(r as {plain_text:string}).plain_text||'').join('')
                )
              })
            } catch {}
          }

          if (parsed.text || ['divider','image','table'].includes(t)) result.push(parsed)
        }
        return result
      }

      // Try fetching as page first; if it's actually a database, route to fetchDBTable
      const pageRes = await fetch(`${API}/pages/${id}`, { headers: H() }).then(r => r.json())

      // Database ID passed — or page API returned an error
      if (pageRes.object === 'database' || pageRes.object === 'error' || pageRes.status === 404) {
        const dbTable = await fetchDBTable(id)
        if (dbTable) {
          return NextResponse.json({
            ok: true, title: dbTable.text, emoji: dbTable.icon || '🗃',
            coverUrl: null, blocks: [dbTable], props: [],
            url: `https://notion.so/${id.replace(/-/g,'')}`,
          })
        }
        return NextResponse.json({ ok: false, error: 'Failed to read page or database' })
      }

      const rawBlocks = await fetchAll(id)

      const title   = extractTitle(pageRes)
      const iconObj = pageRes.icon as {type:string;emoji?:string} | null
      const emoji   = iconObj?.type === 'emoji' ? iconObj.emoji : null
      const cover   = pageRes.cover as {type?:string; external?:{url:string}; file?:{url:string}} | null
      const coverUrl = cover?.type==='external' ? cover.external?.url : cover?.file?.url || null

      // Extract page properties
      const propsRaw = (pageRes.properties||{}) as Record<string, Record<string, unknown>>
      const props: {name:string; value:string; type:string}[] = []
      for (const [name, prop] of Object.entries(propsRaw)) {
        const t = prop.type as string
        let value = ''
        if (t==='status')       value = (prop.status as {name:string})?.name || ''
        else if (t==='select')      value = (prop.select as {name:string})?.name || ''
        else if (t==='multi_select') value = ((prop.multi_select as {name:string}[])||[]).map(s=>s.name).join(', ')
        else if (t==='date')        value = (prop.date as {start:string})?.start || ''
        else if (t==='number')      value = prop.number != null ? String(prop.number) : ''
        else if (t==='checkbox')    value = prop.checkbox ? '✅' : '⬜'
        else if (t==='rich_text')   value = ((prop.rich_text as {plain_text:string}[])||[])[0]?.plain_text || ''
        else if (t==='title')       continue
        else if (t==='url')         value = (prop.url as string) || ''
        else if (t==='people')      value = ((prop.people as {name:string}[])||[]).map(p=>p.name).join(', ')
        if (value) props.push({ name, value, type:t })
      }

      const blocks = await expandBlocks(rawBlocks)
      return NextResponse.json({ ok:true, title, emoji, coverUrl, blocks, props, url: pageRes.url })
    } catch { return NextResponse.json({ ok:false, error:'Failed to read page' }) }
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
