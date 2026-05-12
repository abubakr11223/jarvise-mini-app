import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'

const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN  || process.env.UPSTASH_REDIS_REST_TOKEN
const PAYME_KEY   = process.env.PAYME_MERCHANT_KEY  // optional: "merchant_id:secret"

export type Card = {
  id:       number
  last4:    string
  expiry:   string    // "MM/YY"
  holder:   string
  brand:    'uzcard' | 'humo' | 'visa' | 'mastercard' | 'other'
  token?:   string    // Payme token (if integrated)
  verified: boolean
  addedAt:  string
  color?:   string    // gradient id: blue, green, purple, etc.
}

// ── Redis helpers ─────────────────────────────────────────────────────────
async function kvGet(): Promise<Card[]> {
  if (!REDIS_URL || !REDIS_TOKEN) return []
  try {
    const res = await fetch(`${REDIS_URL}/get/jonka_cards`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await res.json()
    return result ? JSON.parse(result) : []
  } catch { return [] }
}

async function kvSet(cards: Card[]) {
  if (!REDIS_URL || !REDIS_TOKEN) return
  await fetch(`${REDIS_URL}/set/jonka_cards`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
    body: JSON.stringify(cards),
  }).catch(() => {})
}

// ── Card brand detection ──────────────────────────────────────────────────
function detectBrand(num: string): Card['brand'] {
  const n = num.replace(/\s/g, '')
  if (n.startsWith('8600') || n.startsWith('9860')) return 'uzcard'
  if (n.startsWith('9000'))                          return 'humo'
  if (n.startsWith('4'))                             return 'visa'
  if (n.startsWith('5') || n.startsWith('2'))        return 'mastercard'
  return 'other'
}

// ── Payme card.create ─────────────────────────────────────────────────────
async function paymeCreate(number: string, expiry: string) {
  if (!PAYME_KEY) return null
  try {
    const auth = Buffer.from(PAYME_KEY).toString('base64')
    const res  = await fetch('https://checkout.paycom.uz/api', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Date.now(), method: 'cards.create',
        params: {
          card: { number: number.replace(/\s/g,''), expire: expiry.replace('/','/') },
          amount: 100, save: true,
        },
      }),
    })
    const d = await res.json()
    return d.result?.card || null
  } catch { return null }
}

// ── Payme card.verify ─────────────────────────────────────────────────────
async function paymeVerify(token: string, code: string) {
  if (!PAYME_KEY) return false
  try {
    const auth = Buffer.from(PAYME_KEY).toString('base64')
    const res  = await fetch('https://checkout.paycom.uz/api', {
      method: 'POST',
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: Date.now(), method: 'cards.verify',
        params: { token, code },
      }),
    })
    const d = await res.json()
    return !!d.result?.card?.verify
  } catch { return false }
}

// ── GET — kartalar ro'yxati ───────────────────────────────────────────────
export async function GET() {
  const cards = await kvGet()
  return NextResponse.json({ ok: true, cards })
}

// ── POST — qo'shish / tasdiqlash / o'chirish ─────────────────────────────
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const { action } = body

  // ── ADD ──────────────────────────────────────────────────────────────────
  if (action === 'add') {
    const { number, expiry, holder, color } = body as { number:string; expiry:string; holder:string; color?:string }
    const clean = (number || '').replace(/\s/g, '')
    if (clean.length !== 16)  return NextResponse.json({ ok:false, error:'16 ta raqam kiriting' })
    if (!expiry)              return NextResponse.json({ ok:false, error:'Muddatini kiriting (MM/YY)' })

    const last4 = clean.slice(-4)
    const brand = detectBrand(clean)
    const cards = await kvGet()

    // Dublikat tekshiruv
    if (cards.some(c => c.last4 === last4 && c.expiry === expiry)) {
      return NextResponse.json({ ok:false, error:`Karta ****${last4} allaqachon qo'shilgan` })
    }

    // Payme integration
    if (PAYME_KEY) {
      const pc = await paymeCreate(clean, expiry)
      if (pc) {
        const newCard: Card = {
          id: Date.now(), last4, expiry, holder: holder||'',
          brand, token: pc.token, verified: false, color,
          addedAt: new Date().toLocaleDateString('ru-RU'),
        }
        await kvSet([newCard, ...cards])
        return NextResponse.json({ ok:true, card: newCard, otp_required: true, token: pc.token })
      }
    }

    // Payme yo'q — faqat ma'lumot saqlanadi
    const newCard: Card = {
      id: Date.now(), last4, expiry, holder: holder||'',
      brand, verified: true, color,
      addedAt: new Date().toLocaleDateString('ru-RU'),
    }
    await kvSet([newCard, ...cards])
    return NextResponse.json({ ok:true, card: newCard, otp_required: false })
  }

  // ── VERIFY OTP ────────────────────────────────────────────────────────────
  if (action === 'verify') {
    const { token, code } = body as { token:string; code:string }
    const ok = await paymeVerify(token, code)
    if (ok) {
      const cards   = await kvGet()
      const updated = cards.map(c => c.token === token ? { ...c, verified: true } : c)
      await kvSet(updated)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ ok:false, error:"Kod noto'g'ri yoki muddati o'tgan" })
  }

  // ── DELETE ────────────────────────────────────────────────────────────────
  if (action === 'delete') {
    const { id } = body as { id:number }
    const cards = await kvGet()
    await kvSet(cards.filter(c => c.id !== id))
    return NextResponse.json({ ok: true })
  }

  return NextResponse.json({ ok:false, error:'Noma\'lum amal' })
}
