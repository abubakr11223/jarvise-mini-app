import { NextRequest, NextResponse } from 'next/server'

const REDIS_URL   = process.env.KV_REST_API_URL  || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN

type Debt = { id: number; person: string; amount: number; dir: 'gave' | 'borrowed'; note: string; date: string; paid?: boolean }

declare global { var __jonka_debts: Debt[] | undefined }
if (!global.__jonka_debts) global.__jonka_debts = []

const today = () => new Date().toLocaleDateString('ru-RU')

async function kvGet(): Promise<Debt[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return []
  try {
    const res = await fetch(`${REDIS_URL}/get/jonka_debts`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await res.json()
    return result ? JSON.parse(result) : []
  } catch { return [] }
}

async function kvSet(debts: Debt[]) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  try {
    await fetch(`${REDIS_URL}/set/jonka_debts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(debts),
    })
  } catch {}
}

export async function kvDebtAdd(newDebts: Debt[]) {
  const memIds = new Set(global.__jonka_debts!.map(d => d.id))
  const toAddMem = newDebts.filter(d => !memIds.has(d.id))
  global.__jonka_debts = [...toAddMem, ...global.__jonka_debts!].slice(0, 200)

  if (REDIS_URL && REDIS_TOKEN) {
    const existing = await kvGet()
    const existingIds = new Set(existing.map(d => d.id))
    const toAdd = newDebts.filter(d => !existingIds.has(d.id))
    const merged = [...toAdd, ...existing].slice(0, 200)
    await kvSet(merged)
  }
}

// GET
export async function GET() {
  let debts: Debt[] = [...(global.__jonka_debts || [])]
  if (REDIS_URL && REDIS_TOKEN) {
    const srv = await kvGet()
    const ids = new Set(debts.map(d => d.id))
    const toAdd = srv.filter(d => !ids.has(d.id))
    debts = [...toAdd, ...debts].slice(0, 200)
    global.__jonka_debts = debts
  }
  return NextResponse.json({ debts })
}

// POST
export async function POST(request: NextRequest) {
  const body = await request.json() as { debts?: Debt[]; person?: string; amount?: number; dir?: string; note?: string }

  let newDebts: Debt[] = []

  if (body.debts && Array.isArray(body.debts)) {
    newDebts = body.debts
  } else if (body.person) {
    // Single debt from bot
    newDebts = [{
      id: Date.now(),
      person: body.person,
      amount: body.amount || 0,
      dir: (body.dir as 'gave' | 'borrowed') || 'gave',
      note: body.note || '',
      date: today(),
      paid: false,
    }]
  }

  if (newDebts.length === 0) return NextResponse.json({ ok: false }, { status: 400 })
  await kvDebtAdd(newDebts)
  return NextResponse.json({ ok: true })
}

// DELETE — clear all
export async function DELETE() {
  global.__jonka_debts = []
  if (REDIS_URL && REDIS_TOKEN) {
    try {
      await fetch(`${REDIS_URL}/set/jonka_debts`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
        body: JSON.stringify([]),
      })
    } catch {}
  }
  return NextResponse.json({ ok: true })
}
