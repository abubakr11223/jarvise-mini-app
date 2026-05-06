import { NextRequest, NextResponse } from 'next/server'

// Upstash Redis REST API (bepul, https://upstash.com)
const REDIS_URL   = process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN

type Expense = { id: number; name: string; amount: number; type: string; date: string }

async function kvGet(): Promise<Expense[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return []
  try {
    const res = await fetch(`${REDIS_URL}/get/j_expenses`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` },
    })
    const { result } = await res.json()
    return result ? JSON.parse(result) : []
  } catch { return [] }
}

async function kvSet(expenses: Expense[]) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  await fetch(`${REDIS_URL}/set/j_expenses`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(expenses),
  })
}

// GET — mini app serverdan xarajatlarni oladi
export async function GET() {
  const expenses = await kvGet()
  return NextResponse.json({ expenses })
}

// POST — bot chat yoki mini app xarajat qo'shadi
export async function POST(request: NextRequest) {
  const { expenses: newExps } = await request.json() as { expenses: Expense[] }
  if (!Array.isArray(newExps) || newExps.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  const existing  = await kvGet()
  const existingIds = new Set(existing.map(e => e.id))
  const toAdd     = newExps.filter(e => !existingIds.has(e.id))
  const merged    = [...toAdd, ...existing].slice(0, 500)
  await kvSet(merged)
  return NextResponse.json({ ok: true, added: toAdd.length })
}
