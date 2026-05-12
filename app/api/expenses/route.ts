import { NextRequest, NextResponse } from 'next/server'

// Vercel KV yoki Upstash Redis (ikkalasini qo'llab-quvvatlaydi)
const REDIS_URL   = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

type Expense = { id: number; name: string; amount: number; type: string; date: string }

// Node.js global — bir process ichida tezkor xotira
declare global { var __jonka_exp: Expense[] | undefined }
if (!global.__jonka_exp) global.__jonka_exp = []

export async function kvGet(): Promise<Expense[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return []
  try {
    const res = await fetch(`${REDIS_URL}/get/jonka_expenses`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await res.json()
    return result ? JSON.parse(result) : []
  } catch { return [] }
}

async function kvSet(expenses: Expense[]) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  try {
    await fetch(`${REDIS_URL}/set/jonka_expenses`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(expenses),
    })
  } catch {}
}

export async function kvAdd(newExps: Expense[]) {
  // 1. Global xotiraga qo'sh (tezkor, setup siz ishlaydi)
  const memIds = new Set(global.__jonka_exp!.map(e => e.id))
  const toAddMem = newExps.filter(e => !memIds.has(e.id))
  global.__jonka_exp = [...toAddMem, ...global.__jonka_exp!].slice(0, 500)

  // 2. Redis ga saqlash (agar sozlangan bo'lsa)
  if (REDIS_URL && REDIS_TOKEN) {
    const existing   = await kvGet()
    const existingIds = new Set(existing.map(e => e.id))
    const toAdd      = newExps.filter(e => !existingIds.has(e.id))
    const merged     = [...toAdd, ...existing].slice(0, 500)
    await kvSet(merged)
  }
}

// GET — mini app ochilganda serverdan xarajatlarni oladi
export async function GET() {
  let expenses: Expense[] = [...(global.__jonka_exp || [])]

  // Redis dan ham olish va merge qilish
  if (REDIS_URL && REDIS_TOKEN) {
    const srv    = await kvGet()
    const ids    = new Set(expenses.map(e => e.id))
    const toAdd  = srv.filter(e => !ids.has(e.id))
    expenses     = [...toAdd, ...expenses].slice(0, 500)
    // Global ni yangilash
    global.__jonka_exp = expenses
  }

  return NextResponse.json({ expenses })
}

// POST — bot chat xarajat qo'shadi
export async function POST(request: NextRequest) {
  const { expenses: newExps } = await request.json() as { expenses: Expense[] }
  if (!Array.isArray(newExps) || newExps.length === 0) {
    return NextResponse.json({ ok: false }, { status: 400 })
  }
  await kvAdd(newExps)
  return NextResponse.json({ ok: true })
}

// DELETE — barcha xarajatlarni tozalash
export async function DELETE() {
  global.__jonka_exp = []
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      await fetch(`${REDIS_URL}/set/jonka_expenses`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
        body: JSON.stringify([]),
      })
    } catch {}
  }
  return NextResponse.json({ ok: true })
}
