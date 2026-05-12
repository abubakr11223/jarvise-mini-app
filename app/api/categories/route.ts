import { NextRequest, NextResponse } from 'next/server'

const REDIS_URL   = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

export type CustomCat = { id: number; icon: string; label: string; keywords: string[] }

declare global { var __jonka_cats: CustomCat[] | undefined }
if (!global.__jonka_cats) global.__jonka_cats = []

async function kvGet(): Promise<CustomCat[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return []
  try {
    const res = await fetch(`${REDIS_URL}/get/jonka_categories`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await res.json()
    return result ? JSON.parse(result) : []
  } catch { return [] }
}

async function kvSet(cats: CustomCat[]) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  try {
    await fetch(`${REDIS_URL}/set/jonka_categories`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(cats),
    })
  } catch {}
}

export async function GET() {
  let cats: CustomCat[] = [...(global.__jonka_cats || [])]
  if (REDIS_URL && REDIS_TOKEN) {
    const srv = await kvGet()
    const ids = new Set(cats.map(c => c.id))
    const add = srv.filter(c => !ids.has(c.id))
    cats = [...add, ...cats]
    global.__jonka_cats = cats
  }
  return NextResponse.json({ categories: cats })
}

export async function POST(request: NextRequest) {
  const body = await request.json() as Partial<CustomCat>
  if (!body.label?.trim() || !body.icon) return NextResponse.json({ ok: false }, { status: 400 })

  const newCat: CustomCat = {
    id: Date.now(),
    icon: body.icon,
    label: body.label.trim(),
    keywords: body.keywords?.length ? body.keywords : [body.label.trim().toLowerCase()],
  }

  global.__jonka_cats = [newCat, ...(global.__jonka_cats || [])]

  if (REDIS_URL && REDIS_TOKEN) {
    const existing = await kvGet()
    await kvSet([newCat, ...existing])
  }

  return NextResponse.json({ ok: true, category: newCat })
}

export async function DELETE(request: NextRequest) {
  const { id } = await request.json() as { id: number }
  global.__jonka_cats = (global.__jonka_cats || []).filter(c => c.id !== id)

  if (REDIS_URL && REDIS_TOKEN) {
    const existing = await kvGet()
    await kvSet(existing.filter(c => c.id !== id))
  }

  return NextResponse.json({ ok: true })
}
