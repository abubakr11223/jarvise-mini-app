// Bank email notification → avtomatik xarajat parser
// n8n Gmail Trigger → POST shu endpointga → Redis saqlaydi → Telegram xabar yuboradi

import { NextRequest, NextResponse } from 'next/server'
import { parseBankSMS, parseAllExpenses } from '../../../lib/expense-parser'
import { kvAdd }                           from '../expenses/route'
import { kvGetBudgets }                    from '../budgets/route'
import { kvGet as kvGetExps }              from '../expenses/route'

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN
const today     = () => new Date().toLocaleDateString('ru-RU')

function fmtN(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000)     return `${Math.round(n / 1_000)}k`
  return String(n)
}

// HTML teglarini olib tashlash
function stripHtml(html: string): string {
  return html
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

async function tgSend(chat_id: number, text: string) {
  if (!BOT_TOKEN || !chat_id) return
  await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id, text, parse_mode: 'Markdown' }),
  })
}

// Byudjet ogohlantirish
async function budgetAlert(expName: string, amount: number, lang: 'ru' | 'uz'): Promise<string> {
  try {
    const budgets = await kvGetBudgets()
    const limit   = budgets[expName]
    if (!limit) return ''
    const all    = await kvGetExps()
    const now    = new Date()
    const mTag   = `.${String(now.getMonth()+1).padStart(2,'0')}.${now.getFullYear()}`
    const spent  = all.filter(e => e.type === 'XARAJAT' && e.name === expName && e.date.includes(mTag))
                      .reduce((s, e) => s + e.amount, 0)
    const pct    = Math.round(spent / limit * 100)
    if (pct >= 100) return lang === 'ru'
      ? `\n🚨 *${expName}*: лимит ПРЕВЫШЕН (${pct}%)`
      : `\n🚨 *${expName}*: limit OSHDI (${pct}%)`
    if (pct >= 80) return lang === 'ru'
      ? `\n⚠️ *${expName}*: ${pct}% лимита использовано`
      : `\n⚠️ *${expName}*: limit ${pct}% ishlatildi`
  } catch {}
  return ''
}

export async function POST(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const chatIdParam = searchParams.get('chat_id') || searchParams.get('uid')
    const chatId = chatIdParam ? Number(chatIdParam) : 0

    const body = await request.json() as {
      // n8n Gmail node formati
      subject?:    string
      text?:       string
      html?:       string
      body?:       string
      snippet?:    string
      from?:       string
      // Resend / Mailgun formati
      plain?:      string
      'body-plain'?: string
      sender?:     string
    }

    // Email matnini ajratish (HTML > tekst)
    let raw = (
      body.text       ||
      body.plain      ||
      body['body-plain'] ||
      body.snippet    ||
      (body.html ? stripHtml(body.html) : '') ||
      body.body       || ''
    ).trim()

    if (!raw) return NextResponse.json({ ok: false, error: 'No email body' }, { status: 400 })

    // Subject qo'shamiz — ayrim banklar summa subjectda bo'ladi
    if (body.subject) raw = body.subject + '\n' + raw

    // ── Bank SMS formatini sinab ko'ramiz ────────────────────────────────
    let expName = ''
    let amount  = 0
    let expType: 'XARAJAT' | 'DAROMAT' = 'XARAJAT'
    let merchant = ''
    let balance: number | undefined

    const bankSMS = parseBankSMS(raw)
    if (bankSMS) {
      expName  = bankSMS.type === 'credit' ? 'Daromat' : (bankSMS.category || 'Boshqa')
      amount   = bankSMS.amount
      expType  = bankSMS.type === 'credit' ? 'DAROMAT' : 'XARAJAT'
      merchant = bankSMS.merchant
      balance  = bankSMS.balance
    } else {
      // Oddiy xarajat formatini sinab ko'ramiz
      const exps = parseAllExpenses(raw)
      if (exps.length === 0) {
        return NextResponse.json({ ok: false, error: 'No transaction found in email' }, { status: 422 })
      }
      expName = exps[0].name
      amount  = exps[0].amount
      expType = exps[0].type
    }

    // Redis ga saqlash
    await kvAdd([{ id: Date.now(), name: expName, amount, type: expType, date: today() }])

    // Telegram xabar
    if (chatId) {
      const lang: 'ru' | 'uz' = /[а-яё]/i.test(raw) ? 'ru' : 'uz'
      const sign  = expType === 'DAROMAT' ? '💚 +' : '💸 −'
      const from  = body.from || body.sender || ''
      const alert = await budgetAlert(expName, amount, lang)
      const msg   =
        `📧 *Email orqali avtomatik saqlandi*\n\n` +
        (from    ? `📨 ${from.slice(0, 40)}\n`              : '') +
        `${sign}${fmtN(amount)} so'm\n` +
        (merchant ? `🏪 ${merchant}\n`                      : '') +
        `📂 ${expName}` +
        (balance  ? `\n💰 Qoldiq: ${fmtN(balance)} so'm`   : '') +
        alert
      await tgSend(chatId, msg)
    }

    return NextResponse.json({ ok: true, saved: { name: expName, amount, type: expType } })
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e) }, { status: 500 })
  }
}

// GET — n8n yoki Zapier uchun test
export async function GET() {
  return NextResponse.json({ ok: true, message: 'Email Import Endpoint aktiv ✅' })
}
