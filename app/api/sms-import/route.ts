// iOS Shortcuts → SMS webhook
// Foydalanuvchi iPhone Shortcuts ilovasidan bank SMS ni shu endpointga yuboradi.
// Bot Telegram orqali tasdiqlash xabarini qaytaradi.

import { NextRequest, NextResponse } from 'next/server'
import { parseBankSMS }              from '../../../lib/expense-parser'
import { kvAdd }                     from '../expenses/route'

const BOT_TOKEN   = process.env.TELEGRAM_BOT_TOKEN
const REDIS_URL   = process.env.KV_REST_API_URL   || process.env.UPSTASH_REDIS_REST_URL
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN
const today       = () => new Date().toLocaleDateString('ru-RU')

function fmtN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`
  return String(n)
}

async function tgSend(chat_id: number, text: string) {
  if (!BOT_TOKEN || !chat_id) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'Markdown' }),
  })
}

// Karta balansini yangilash
async function updateCardBalance(last4: string, balance: number) {
  if (!REDIS_URL || !REDIS_TOKEN || !last4) return
  try {
    const res   = await fetch(`${REDIS_URL}/get/jonka_cards`, {
      headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, cache: 'no-store',
    })
    const { result } = await res.json()
    if (!result) return
    const cards = JSON.parse(result)
    const now   = new Date().toLocaleString('ru-RU', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })
    const updated = cards.map((c: { last4: string; balance?: number; lastBalanceDate?: string }) =>
      c.last4 === last4 ? { ...c, balance, lastBalanceDate: now } : c
    )
    await fetch(`${REDIS_URL}/set/jonka_cards`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'text/plain' },
      body: JSON.stringify(updated),
    })
  } catch {}
}

export async function POST(request: NextRequest) {
  try {
    const body     = await request.json() as { sms?: string; text?: string; chat_id?: number | string }
    const smsText  = (body.sms || body.text || '').trim()
    if (!smsText)  return NextResponse.json({ ok: false, error: 'No SMS text' }, { status: 400 })

    const parsed = parseBankSMS(smsText)
    if (!parsed)   return NextResponse.json({ ok: false, error: 'Not a bank SMS' }, { status: 422 })

    const expName = parsed.type === 'credit' ? 'Daromat' : (parsed.category || 'Boshqa')
    const expType = parsed.type === 'credit' ? 'DAROMAT' : 'XARAJAT'

    await kvAdd([{
      id:     Date.now(),
      name:   expName,
      amount: parsed.amount,
      type:   expType,
      date:   today(),
      card:   parsed.card,
      bank:   parsed.bank,
    }])

    // Karta balansini yangilash
    if (parsed.card && parsed.balance) {
      await updateCardBalance(parsed.card, parsed.balance)
    }

    // Telegram ga xabar
    const chatId = body.chat_id ? Number(body.chat_id) : 0
    if (chatId) {
      const sign = parsed.type === 'credit' ? '💚 +' : '💸 −'
      const msg  = `📱 *iOS SMS dan avtomatik saqlandi*\n\n` +
        (parsed.bank     ? `🏦 ${parsed.bank}${parsed.card ? ` · \\*${parsed.card}` : ''}\n` : '') +
        `${sign}${fmtN(parsed.amount)} so'm\n` +
        (parsed.merchant ? `🏪 ${parsed.merchant}\n`                                          : '') +
        `📂 ${expName}` +
        (parsed.balance  ? `\n💰 Qoldiq: ${fmtN(parsed.balance)} so'm`                       : '')
      await tgSend(chatId, msg)
    }

    return NextResponse.json({ ok: true, saved: { name: expName, amount: parsed.amount, type: expType, card: parsed.card } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// GET — iOS Shortcut test qilish uchun
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const sms = searchParams.get('sms') || ''
  if (!sms)  return NextResponse.json({ ok: true, message: 'SMS Import Endpoint aktiv ✅' })
  const parsed = parseBankSMS(sms)
  return NextResponse.json({ ok: !!parsed, parsed })
}
