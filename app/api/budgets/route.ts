import { NextRequest, NextResponse } from 'next/server'

const REDIS_URL   = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

// { "Taksi": 3000000, "Ovqat": 5000000, ... }
export type BudgetMap = Record<string, number>

declare global { var __jonka_budgets: BudgetMap | undefined }
if (!global.__jonka_budgets) global.__jonka_budgets = {}

async function kvGet(): Promise<BudgetMap> {
  if (!REDIS_URL || !REDIS_TOKEN) return {}
  try {
    const res = await fetch(`${REDIS_URL}/get/jonka_budgets`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await res.json()
    return result ? JSON.parse(result) : {}
  } catch { return {} }
}

async function kvSet(b: BudgetMap) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  try {
    await fetch(`${REDIS_URL}/set/jonka_budgets`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(b),
    })
  } catch {}
}

export async function kvGetBudgets(): Promise<BudgetMap> {
  const mem = global.__jonka_budgets || {}
  if (REDIS_URL && REDIS_TOKEN) {
    const srv = await kvGet()
    const merged = { ...srv, ...mem }
    global.__jonka_budgets = merged
    return merged
  }
  return mem
}

export async function kvSetBudget(category: string, amount: number) {
  global.__jonka_budgets = { ...(global.__jonka_budgets || {}), [category]: amount }
  if (REDIS_URL && REDIS_TOKEN) {
    const existing = await kvGet()
    await kvSet({ ...existing, [category]: amount })
  }
}

export async function GET() {
  const budgets = await kvGetBudgets()
  return NextResponse.json({ budgets })
}

export async function POST(request: NextRequest) {
  const { category, amount } = await request.json() as { category: string; amount: number }
  if (!category || !amount || amount < 1000) return NextResponse.json({ ok: false }, { status: 400 })
  await kvSetBudget(category, amount)
  return NextResponse.json({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const { category } = await request.json() as { category: string }
  const b = global.__jonka_budgets || {}
  delete b[category]
  global.__jonka_budgets = b
  if (REDIS_URL && REDIS_TOKEN) {
    const existing = await kvGet()
    delete existing[category]
    await kvSet(existing)
  }
  return NextResponse.json({ ok: true })
}
