'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Grid, Menu, X, Bookmark, FileText, Send, User, Bot, ChevronRight,
  LayoutDashboard, ShoppingBag, Car, PenTool, Coffee, Calculator,
  MicOff, TrendingDown, TrendingUp, Trash2, Clock, Search,
  HandCoins, CheckSquare, Square, MessageCircle, Megaphone } from 'lucide-react'

const N8N_WEBHOOK_URL = "/api/chat"

// ─── App commands ─────────────────────────────────────────────────────────────
const APP_URLS: Record<string, { url: string }> = {
  uzum:   { url: 'https://uzum.uz' },
  yandex: { url: 'https://go.yandex/' },
  taxi:   { url: 'https://go.yandex/' },
  lavka:  { url: 'https://lavka.yandex.ru/' },
  notion: { url: 'https://notion.so' },
  figma:  { url: 'https://figma.com' },
}
const OPEN_WORDS = ['och', 'open', 'откры', 'запус', "ko'r", 'bor']
function detectApp(text: string): string | null {
  const l = text.toLowerCase()
  if (!OPEN_WORDS.some(w => l.includes(w))) return null
  for (const [k, v] of Object.entries(APP_URLS)) if (l.includes(k)) return v.url
  return null
}

// ─── Category icons ───────────────────────────────────────────────────────────
const CATS = [
  { kw: ['kafe','qahva','coffee','restoran','tushlik','ovqat','еда','кафе','завтрак','обед','ужин','перекус','ресторан','столовая','фастфуд','пицца','шаурма'], icon:'🍽️', c:'orange' },
  { kw: ['taxi','taksi','yandex go','transport','avtobus','metro','такси','транспорт','метро','автобус','маршрутка','бензин','парковка'], icon:'🚕', c:'yellow' },
  { kw: ['bozor','supermarket','oziq','mahsulot','groceries','продукты','магазин','супермаркет','рынок','продукт'], icon:'🛒', c:'green'  },
  { kw: ['kiyim','oyoq','brend','shopping','одежда','обувь','одежд','магазин одежды'], icon:'👕', c:'purple' },
  { kw: ['dori','dorixona','apteka','shifokor','лекарство','аптека','врач','больница','клиника'], icon:'💊', c:'red'    },
  { kw: ['internet','telefon','aloqa','интернет','телефон','связь','мобильный'], icon:'📱', c:'blue'   },
  { kw: ['uy','kvartira','kommunal','ijara','аренда','квартира','коммунал','жильё','дом'], icon:'🏠', c:'teal'   },
  { kw: ['sport','gym','fitness','спорт','фитнес','тренажёр','бассейн'], icon:'💪', c:'green'  },
  { kw: ["ta'lim",'kurs','kitob','обучение','курс','учёба','книга'], icon:'📚', c:'blue'   },
  { kw: ['maosh','ish haqi','зарплата','доход','получил','заработал','выплата'], icon:'💰', c:'green'  },
  { kw: ['кофе','чай','напиток'], icon:'☕', c:'orange' },
  { kw: ['развлечения','кино','театр','концерт','клуб'], icon:'🎬', c:'purple' },
]
const COLOR: Record<string, string> = {
  orange: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
  yellow: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
  green:  'bg-green-500/15 border-green-500/30 text-green-300',
  purple: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
  red:    'bg-red-500/15 border-red-500/30 text-red-300',
  blue:   'bg-blue-500/15 border-blue-500/30 text-blue-300',
  teal:   'bg-teal-500/15 border-teal-500/30 text-teal-300',
}
function catStyle(name: string) {
  const l = name.toLowerCase()
  for (const c of CATS) if (c.kw.some(k => l.includes(k))) return { icon: c.icon, cls: COLOR[c.c] || COLOR.blue }
  return { icon: '💸', cls: 'bg-gray-500/15 border-gray-500/30 text-gray-300' }
}

// ─── Amount parser — handles "45 ming", "45,000", "45 000", "45k" ─────────────
function parseAmount(text: string): number {
  const t = text.replace(/,/g, '')
  // "45 ming 500" or "45ming"
  const mingM = t.match(/(\d+)\s*ming(?:\s+(\d{1,3}))?/i)
  if (mingM) {
    const base = parseInt(mingM[1]) * 1000
    const rest = mingM[2] ? parseInt(mingM[2]) : 0
    if (base >= 1000) return base + rest
  }
  // "450k"
  const kM = t.match(/(\d+)\s*k\b/i)
  if (kM) { const v = parseInt(kM[1]) * 1000; if (v >= 1000) return v }
  // spaced "45 000"
  const spM = t.match(/\b(\d{2,3})\s+(\d{3})\b/)
  if (spM) { const v = parseInt(spM[1]) * 1000 + parseInt(spM[2]); if (v >= 1000) return v }
  // plain 4+ digit
  const plainM = t.match(/\b(\d{4,9})\b/)
  if (plainM) return parseInt(plainM[1])
  return 0
}

// ─── Local expense detector — NO AI needed ────────────────────────────────────
function parseUserExpense(text: string): { name: string; amount: number; type: 'XARAJAT' | 'DAROMAT' } | null {
  const lower = text.toLowerCase()
  const amount = parseAmount(text)
  if (!amount || amount < 500) return null

  const incomeKw  = ['maosh','oylik','daromat','kirim','tushdi','получил','зарплат','доход','topдим','topdim']
  const expKw     = ['xarajat','sarf',"to'l",'toladim','sotib','харч','потрат','купил','заплатил','rashod','xarj','uchun to']
  const catMatch  = CATS.some(c => c.kw.some(k => lower.includes(k)))

  const isIncome  = incomeKw.some(k => lower.includes(k))
  // "berdim" alone is debt direction, not expense — only count as expense when category matches
  const isBerdim  = lower.includes('berdim') || lower.includes('oldim')
  const isExpense = expKw.some(k => lower.includes(k)) || (catMatch && !isBerdim)

  if (!isIncome && !isExpense) return null
  // If "berdim"/"oldim" + looks like person name (UppercaseGa) → debt, not expense
  if (!isIncome && isBerdim && /[A-ZА-ЯЎҚҒҲ][a-zа-яўқғҳ]{2,}ga\b/.test(text) && !catMatch) return null

  const type: 'XARAJAT' | 'DAROMAT' = isIncome && !isExpense ? 'DAROMAT' : 'XARAJAT'

  let name = type === 'XARAJAT' ? 'Xarajat' : 'Daromat'
  for (const cat of CATS) {
    const kw = cat.kw.find(k => lower.includes(k))
    if (kw) { name = kw.charAt(0).toUpperCase() + kw.slice(1); break }
  }
  return { name, amount, type }
}

// ─── Multiple expenses in one message ────────────────────────────────────
function parseAllExpenses(text: string): { name: string; amount: number; type: 'XARAJAT' | 'DAROMAT' }[] {
  // Split by common multi-expense connectors (RU + UZ)
  const parts = text.split(/,\s*(?:плюс|и\s+ещё|и\s+еще|ещё|еще|также|плюс\s+ещё|\+)|;\s*|\bплюс\b(?!\s*$)|\bи\b(?=\s+\d)/gi)
    .map(p => p.trim()).filter(p => p.length > 3)

  if (parts.length > 1) {
    const results: { name: string; amount: number; type: 'XARAJAT' | 'DAROMAT' }[] = []
    for (const part of parts) {
      const exp = parseUserExpense(part)
      if (exp) results.push(exp)
    }
    if (results.length > 0) return results
  }

  // Fallback: scan full text for "на X" / "за X" patterns with amounts
  const naPattern = /(\d[\d\s,]*)\s*(?:сум|сумм|руб|рублей|тысяч|k|к)\s+(?:на|за)\s+([а-яёА-ЯЁ]+)/gi
  const matches = [...text.matchAll(naPattern)]
  if (matches.length > 1) {
    return matches.map(m => {
      const amount = parseAmount(m[1])
      const catWord = m[2].toLowerCase()
      let name = catWord.charAt(0).toUpperCase() + catWord.slice(1)
      for (const cat of CATS) {
        if (cat.kw.some(k => catWord.includes(k) || k.includes(catWord))) {
          name = cat.kw[0].charAt(0).toUpperCase() + cat.kw[0].slice(1)
          break
        }
      }
      return amount >= 500 ? { name, amount, type: 'XARAJAT' as const } : null
    }).filter(Boolean) as { name: string; amount: number; type: 'XARAJAT' | 'DAROMAT' }[]
  }

  const single = parseUserExpense(text)
  return single ? [single] : []
}

// ─── Local debt detector — NO AI needed ──────────────────────────────────────
function parseUserDebt(text: string): { person: string; amount: number; dir: 'gave' | 'borrowed' } | null {
  const lower = text.toLowerCase()
  const amount = parseAmount(text)
  if (!amount || amount < 500) return null

  const gaveKw     = ['berdim', 'дал', 'дала', 'одолжил', 'отдал']
  const borrowedKw = ['oldim', 'взял', 'взяла', 'занял', 'qarzga oldim']

  const isGave     = gaveKw.some(k => lower.includes(k))
  const isBorrowed = borrowedKw.some(k => lower.includes(k))
  if (!isGave && !isBorrowed) return null

  // If expense keywords present → not a debt
  const expKw = ['xarajat','sarf','sotib','харч','потрат','купил','заплатил']
  if (expKw.some(k => lower.includes(k))) return null
  // If a category word present → expense (taxi, kafe, etc.)
  if (CATS.some(c => c.kw.some(k => lower.includes(k)))) return null

  const dir: 'gave' | 'borrowed' = isGave ? 'gave' : 'borrowed'

  // Extract person: word ending in "ga" (Uzbek dative case), prefer uppercase-start
  let person = "Noma'lum"
  const gaM = text.match(/([A-Za-zА-Яа-яЎўҚқҒғҲҳ]{2,})ga\b/u)
  if (gaM) {
    person = gaM[1]
  } else {
    for (const w of text.split(/\s+/)) {
      if (/^[A-ZА-ЯЎҚҒҲ]/.test(w) && w.length > 2) { person = w; break }
    }
  }
  return { person, amount, dir }
}

// ─── SMM quick prompts ────────────────────────────────────────────────────────
const SMM_PROMPTS = [
  { icon: '✍️', label: 'Post yoz',        tmpl: (p: string, t: string) => `${p} uchun post yoz: ${t}` },
  { icon: '#️⃣', label: 'Hashtaglar',     tmpl: (p: string, t: string) => `${p} post uchun 20 ta hashtag ber: ${t}` },
  { icon: '📅', label: 'Kontent reja',    tmpl: (p: string, t: string) => `${p} uchun 1 haftalik kontent reja tuz: ${t}` },
  { icon: '🎯', label: 'Reklama matni',   tmpl: (p: string, t: string) => `${p} uchun reklama matni yoz: ${t}` },
  { icon: '📝', label: 'Bio yoz',         tmpl: (_: string, t: string) => `SMM mutaxassisi uchun professional bio yoz: ${t}` },
  { icon: '💡', label: "Story g'oyalar",  tmpl: (p: string, t: string) => `${p} uchun 5 ta story g'oya ber: ${t}` },
  { icon: '🔥', label: 'Trend mavzular',  tmpl: (p: string, _: string) => `O'zbekistonda hozir ${p} da qaysi mavzular trend?` },
  { icon: '📊', label: 'Tahlil',          tmpl: (p: string, t: string) => `${p} post tahlili: ${t}` },
  { icon: '🖼️', label: 'Caption',         tmpl: (p: string, t: string) => `${p} rasm uchun caption yoz: ${t}` },
  { icon: '📣', label: "Elon matni",      tmpl: (p: string, t: string) => `${p} uchun e'lon matni yoz: ${t}` },
  { icon: '🤝', label: 'Hamkorlik',       tmpl: (_: string, t: string) => `Biznes hamkorlik taklifi xati yoz: ${t}` },
  { icon: '💬', label: 'Sharh javob',     tmpl: (_: string, t: string) => `Bu sharhga professional javob yoz: ${t}` },
]

const PLATFORMS = ['Instagram', 'Telegram', 'Facebook', 'TikTok', 'YouTube', 'LinkedIn']

// ─── Keyword detectors ────────────────────────────────────────────────────────
const EXPENSE_KW = ['xarajat','rashod','moliya','pul','sarf','qancha','jadval','расход','деньги','финанс','баланс','balance','balans']
const DEBT_KW    = ['berdim','qarz','oldim','berdi','беру','дал','занял','должен']
const SHOP_KW    = ["xaridlar","ro'yxat","список","покупк","supermarket","bozor ro"]

// ─── Types ────────────────────────────────────────────────────────────────────
interface Expense       { id: number; name: string; amount: number; type: string; date: string }
interface Debt          { id: number; person: string; amount: number; dir: 'gave' | 'borrowed'; note: string; date: string }
interface ShopItem      { id: number; text: string; done: boolean }
interface BrandProfile  { name: string; niche: string; audience: string; tone: string; platforms: string[]; language: 'uz' | 'ru' | 'both' }
interface ContentItem   { id: number; title: string; content: string; platform: string; date: string }
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  start(): void; stop(): void
  onstart: (() => void) | null; onend: (() => void) | null
  onresult: ((e: { results: SpeechRecognitionResultList; resultIndex: number }) => void) | null
  onerror: ((e: { error: string }) => void) | null
}
declare global { interface Window { SpeechRecognition: new () => ISpeechRecognition; webkitSpeechRecognition: new () => ISpeechRecognition } }

// ─── localStorage helpers ─────────────────────────────────────────────────────
function load<T>(key: string, def: T): T { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def } }
function save(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }
const today = () => new Date().toLocaleDateString('uz-UZ')

export default function Home() {
  const [userData,   setUserData]   = useState<{ id?: number; username?: string; first_name?: string } | null>(null)
  const [isLoading,  setIsLoading]  = useState(false)
  const [isRecording,setIsRecording]= useState(false)
  const [interimText,setInterimText]= useState('')
  const [voiceLang,  setVoiceLang]  = useState<'uz-UZ' | 'ru-RU'>('ru-RU')
  const [inputText,  setInputText]  = useState('')
  const [voiceCountdown, setVoiceCountdown] = useState<number | null>(null)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [searchHistory, setSearchHistory] = useState<string[]>(() => load('j_history', []))

  // Modals
  const [sidebar,   setSidebar]    = useState(false)
  const [appsOpen,  setAppsOpen]   = useState(false)
  const [expOpen,   setExpOpen]    = useState(false)
  const [debtOpen,  setDebtOpen]   = useState(false)
  const [shopOpen,  setShopOpen]   = useState(false)
  const [smmOpen,   setSmmOpen]    = useState(false)

  // Data
  const [messages,  setMessages]  = useState<{ role: string; text: string }[]>([{ role: 'ai', text: "Salom! Men **JONKA** 🤖\n\nNima qila olaman:\n💰 **Xarajat** — \"Kafeda 45 ming xarajat\"\n💼 **Qarz** — \"Rashidga 50 ming berdim\"\n🛒 **Xaridlar** — \"Xaridlar ro'yxatiga non qo'sh\"\n📱 **SMM** — \"Instagram uchun post yoz\"\n📊 **Hisobot** — \"Xarajatlarimni ko'rsat\"\n🔍 **Qidiruv** — \"Dollar kursi qancha\"\n\n🇺🇿 O'zbek | 🇷🇺 Русский — ikkalasini tushunaman!" }])
  const [expenses,  setExpenses]  = useState<Expense[]>(() => load('j_exp', []))
  const [debts,     setDebts]     = useState<Debt[]>(() => load('j_debt', []))
  const [shopItems, setShopItems] = useState<ShopItem[]>(() => load('j_shop', []))
  const [budget,    setBudget]    = useState<number>(() => load('j_budget', 0))
  const [budgetInput, setBudgetInput] = useState('')
  const [expFilter, setExpFilter] = useState<'ALL' | 'XARAJAT' | 'DAROMAT'>('ALL')

  // Brand + Content Bank
  const [brand,       setBrand]       = useState<BrandProfile>(() => load('j_brand', { name: '', niche: '', audience: '', tone: 'hazilkash va trendy', platforms: ['Instagram'], language: 'uz' }))
  const [contentBank, setContentBank] = useState<ContentItem[]>(() => load('j_bank', []))
  const [smmTab,      setSmmTab]      = useState<'campaign' | 'profile' | 'bank'>('campaign')
  const [campaignGoal,  setCampaignGoal]  = useState<'sell' | 'brand' | 'engage' | 'hook' | 'viral'>('sell')
  const [campaignTopic, setCampaignTopic] = useState('')
  const [hookTopic,     setHookTopic]     = useState('')
  const [bankPreview,   setBankPreview]   = useState<ContentItem | null>(null)
  const [smmPlatform,   setSmmPlatform]   = useState('Instagram')

  // Debt form
  const [debtForm, setDebtForm] = useState<{ person: string; amount: string; dir: 'gave' | 'borrowed'; note: string }>({ person: '', amount: '', dir: 'gave', note: '' })
  const [shopInput, setShopInput] = useState('')

  const webAppRef       = useRef<{ openLink?: (url: string) => void } | null>(null)
  const recognitionRef  = useRef<ISpeechRecognition | null>(null)
  const mediaRecorderRef= useRef<MediaRecorder | null>(null)
  const audioChunksRef  = useRef<BlobPart[]>([])
  const chatEndRef      = useRef<HTMLDivElement>(null)
  const abortRef        = useRef<AbortController | null>(null)
  const voiceTimerRef   = useRef<ReturnType<typeof setInterval> | null>(null)
  const pendingVoiceRef = useRef('')

  // Persist
  useEffect(() => { save('j_exp',     expenses)      }, [expenses])
  useEffect(() => { save('j_debt',    debts)         }, [debts])
  useEffect(() => { save('j_shop',    shopItems)     }, [shopItems])
  useEffect(() => { save('j_budget',  budget)        }, [budget])
  useEffect(() => { save('j_brand',   brand)         }, [brand])
  useEffect(() => { save('j_bank',    contentBank)   }, [contentBank])
  useEffect(() => { save('j_history', searchHistory) }, [searchHistory])
  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    import('@twa-dev/sdk').then(m => {
      const W = m.default; W.ready(); W.expand()
      W.setHeaderColor('#111114'); W.setBackgroundColor('#111114')
      if (W.initDataUnsafe?.user) setUserData(W.initDataUnsafe.user)
      webAppRef.current = W
    })
  }, [])

  // Telegram openLink — iframe o'rniga, barcha saytlar ishlaydi
  const openApp = (url: string) => {
    try {
      if (webAppRef.current?.openLink) {
        webAppRef.current.openLink(url)
      } else {
        window.open(url, '_blank')
      }
    } catch {
      window.open(url, '_blank')
    }
  }

  const fmt = (text: string) => text.split(/\\n|\n/).map((line, i, a) => (
    <span key={i}>
      {line.split(/(\*\*.*?\*\*)/g).map((p, j) =>
        p.startsWith('**') && p.endsWith('**')
          ? <strong key={j} className="text-white font-bold">{p.slice(2, -2)}</strong>
          : p
      )}
      {i < a.length - 1 && <br />}
    </span>
  ))

  // ─── Data helpers ─────────────────────────────────────────────────────────
  const addExpense = (name: string, amount: number, type: string) => {
    if (amount < 500) return
    setExpenses(p => [{ id: Date.now(), name, amount, type, date: today() }, ...p])
  }
  const addDebt = (person: string, amount: number, dir: 'gave' | 'borrowed', note: string) => {
    if (!person || amount < 100) return
    setDebts(p => [{ id: Date.now(), person, amount, dir, note, date: today() }, ...p])
  }
  const addShop = (text: string) => { if (!text.trim()) return; setShopItems(p => [...p, { id: Date.now(), text: text.trim(), done: false }]) }

  // ─── AI call ──────────────────────────────────────────────────────────────
  const addToHistory = (text: string) => {
    const t = text.trim()
    if (!t || t.length < 3) return
    setSearchHistory(p => [t, ...p.filter(h => h !== t)].slice(0, 30))
  }

  const sendToAI = async (text: string, skipLocalParse = false) => {
    if (!text.trim() || isLoading) return
    setInputText(''); setInterimText(''); setHistoryOpen(false)
    addToHistory(text)

    const lower = text.toLowerCase()
    const isViewCmd = lower.includes("ko'rsat") || lower.includes('корсат') || lower.includes('показ') || lower.includes('chiqar') || lower.includes('hisobot') || lower.includes('qancha')

    // App open
    const url = detectApp(text); if (url) openApp(url)

    // ── INSTANT LOCAL COMMANDS — no AI, instant response ──
    if (isViewCmd && EXPENSE_KW.some(w => lower.includes(w))) {
      const totX = expenses.filter(e => e.type === 'XARAJAT').reduce((s, e) => s + e.amount, 0)
      const totD = expenses.filter(e => e.type !== 'XARAJAT').reduce((s, e) => s + e.amount, 0)
      setMessages(p => [...p,
        { role: 'user', text },
        { role: 'ai', text: `💰 **Moliyaviy hisobot**\n\n📉 Xarajat: **${totX.toLocaleString()} UZS**\n📈 Daromat: **${totD.toLocaleString()} UZS**\n💎 Balans: **${(totD - totX).toLocaleString()} UZS**\n\n📊 Jami ${expenses.length} ta yozuv` }
      ])
      setExpOpen(true)
      return
    }
    if (isViewCmd && DEBT_KW.some(w => lower.includes(w))) {
      const net = debts.reduce((s, d) => d.dir === 'gave' ? s + d.amount : s - d.amount, 0)
      setMessages(p => [...p,
        { role: 'user', text },
        { role: 'ai', text: `🤝 **Qarz daftari**\n\n${net >= 0 ? `✅ Menga **${net.toLocaleString()} UZS** qarzdor` : `❗ Men **${Math.abs(net).toLocaleString()} UZS** qarzdorman`}\n\n📋 Jami ${debts.length} ta yozuv` }
      ])
      setDebtOpen(true)
      return
    }
    if (isViewCmd && SHOP_KW.some(w => lower.includes(w))) {
      const done = shopItems.filter(i => i.done).length
      setMessages(p => [...p,
        { role: 'user', text },
        { role: 'ai', text: `🛒 **Xaridlar ro'yxati**\n\n${shopItems.length} ta mahsulot · ${done} ta bajarildi` }
      ])
      setShopOpen(true)
      return
    }

    // ── INSTANT LOCAL PARSERS — expense/debt saved immediately ──
    if (!skipLocalParse) {
      const exps = parseAllExpenses(text)
      if (exps.length > 0) {
        exps.forEach(e => addExpense(e.name, e.amount, e.type))
        const lines = exps.map(e => `${e.type === 'XARAJAT' ? '📉' : '📈'} **${e.name}** — ${e.amount.toLocaleString()} UZS`).join('\n')
        setMessages(p => [...p,
          { role: 'user', text },
          { role: 'ai', text: `✅ **${exps.length > 1 ? `${exps.length} ta xarajat` : (exps[0].type === 'XARAJAT' ? 'Xarajat' : 'Daromat')} qo'shildi!**\n\n${lines}\n📅 ${today()}` }
        ])
        setTimeout(() => setExpOpen(true), 700)
        return
      }
      const debt = parseUserDebt(text)
      if (debt) {
        addDebt(debt.person, debt.amount, debt.dir, '')
        setMessages(p => [...p,
          { role: 'user', text },
          { role: 'ai', text: `✅ **Qarz qo'shildi!**\n\n👤 **${debt.person}**\n💰 ${debt.amount.toLocaleString()} UZS\n${debt.dir === 'gave' ? '➡️ Men berdim' : '⬅️ Men oldim'}\n📅 ${today()}` }
        ])
        return
      }
    }

    // Modal auto-open hints for AI queries
    if (EXPENSE_KW.some(w => lower.includes(w))) setTimeout(() => setExpOpen(true), 1200)
    if (DEBT_KW.some(w => lower.includes(w)))    setTimeout(() => setDebtOpen(true), 1200)
    if (SHOP_KW.some(w => lower.includes(w)))    setTimeout(() => setShopOpen(true), 1200)

    setMessages(p => [...p, { role: 'user', text }])
    setIsLoading(true)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const timer = setTimeout(() => abortRef.current?.abort(), 20000)

    const brandCtx = brand.name
      ? `[BRAND: "${brand.name}" | Soha: ${brand.niche || '?'} | Auditoriya: ${brand.audience || '?'} | Uslub: ${brand.tone || 'professional'} | Til: ${brand.language === 'both' ? "o'zbek+rus" : brand.language === 'ru' ? 'rus' : "o'zbek"}]`
      : ''
    const fullMsg = brandCtx ? `${brandCtx}\n\n${text}` : text

    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST', signal: abortRef.current.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: fullMsg, user_id: userData?.id || 0, username: userData?.username || userData?.first_name || 'Foydalanuvchi' }),
      })
      clearTimeout(timer)
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error((e as { error?: string }).error || `Xato: ${res.status}`) }

      const data = await res.json()
      let reply: string = data?.reply || data?.response || data?.text || data?.message || data?.output || ''

      if (reply) {
        const om = reply.match(/\[OPEN:(\w+)\]/i)
        if (om) { const k = om[1].toLowerCase(); if (APP_URLS[k]) openApp(APP_URLS[k].url); reply = reply.replace(/\[OPEN:\w+\]/gi, '').trim() }
        const em = reply.match(/\[EXPENSE:(.*?)\|(.*?)\|(.*?)\]/i)
        if (em) { addExpense(em[1].trim(), parseInt(em[2].replace(/\D/g, '')) || 0, em[3].trim().toUpperCase()); reply = reply.replace(/\[EXPENSE:.*?\]/gi, '').trim() }
        else if (data?.expense) { const e = data.expense as Expense; addExpense(e.name, e.amount, e.type) }
        const dm = reply.match(/\[DEBT:(.*?)\|(.*?)\|(.*?)\]/i)
        if (dm) { addDebt(dm[1].trim(), parseInt(dm[2].replace(/\D/g, '')) || 0, dm[3].trim() as 'gave' | 'borrowed', ''); reply = reply.replace(/\[DEBT:.*?\]/gi, '').trim() }
        const shm = reply.match(/\[SHOP:(.*?)\]/gi)
        if (shm) { shm.forEach(s => { const m = s.match(/\[SHOP:(.*?)\]/i); if (m) addShop(m[1].trim()) }); reply = reply.replace(/\[SHOP:.*?\]/gi, '').trim() }
        setMessages(p => [...p, { role: 'ai', text: reply }])
      } else {
        setMessages(p => [...p, { role: 'ai', text: '✅ Qabul qilindi!' }])
      }
    } catch (err: unknown) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(p => [...p, { role: 'ai', text: "⏱ Vaqt tugadi. Qayta urinib ko'ring." }])
      } else {
        setMessages(p => [...p, { role: 'ai', text: `❌ ${err instanceof Error ? err.message : 'Xato yuz berdi'}` }])
      }
    } finally { setIsLoading(false) }
  }

  // ─── Voice recording — show in input first, 2s countdown ─────────────────
  const cancelVoiceSend = () => {
    if (voiceTimerRef.current) clearInterval(voiceTimerRef.current)
    voiceTimerRef.current = null
    setVoiceCountdown(null)
    pendingVoiceRef.current = ''
  }

  const finishVoice = (text: string) => {
    setIsRecording(false); setInterimText('')
    if (!text.trim()) return
    setInputText(text.trim())
    pendingVoiceRef.current = text.trim()
    let count = 2
    setVoiceCountdown(count)
    voiceTimerRef.current = setInterval(() => {
      count--
      if (count <= 0) {
        clearInterval(voiceTimerRef.current!)
        voiceTimerRef.current = null
        setVoiceCountdown(null)
        const pending = pendingVoiceRef.current
        if (pending) { pendingVoiceRef.current = ''; setInputText(''); sendToAI(pending) }
      } else {
        setVoiceCountdown(count)
      }
    }, 1000)
  }

  const stopMediaRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
  }

  // MediaRecorder + Groq Whisper — Android Telegram WebView fallback
  const startMediaRecorderFn = async (existingStream?: MediaStream) => {
    let stream = existingStream
    if (!stream) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 } })
      } catch {
        setMessages(p => [...p, { role: 'ai', text: "🔒 Mikrofon ruxsati yo'q." }])
        return
      }
    }
    const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg;codecs=opus'
    let recorder: MediaRecorder
    try {
      recorder = new MediaRecorder(stream, { mimeType, audioBitsPerSecond: 32000 })
    } catch {
      stream.getTracks().forEach(t => t.stop())
      setMessages(p => [...p, { role: 'ai', text: "❌ Audio yozib bo'lmadi." }])
      return
    }
    audioChunksRef.current = []
    recorder.ondataavailable = (e) => { if (e.data.size > 0) audioChunksRef.current.push(e.data) }
    recorder.onstop = async () => {
      stream!.getTracks().forEach(t => t.stop())
      const blob = new Blob(audioChunksRef.current, { type: mimeType })
      audioChunksRef.current = []
      if (blob.size < 1000) { setIsRecording(false); setInterimText(''); return }
      setInterimText('🔄 Ovoz matnga aylantirilmoqda...')
      try {
        const fd = new FormData()
        fd.append('audio', blob, 'audio.webm')
        fd.append('language', voiceLang === 'ru-RU' ? 'ru' : 'uz')
        const res = await fetch('/api/transcribe', { method: 'POST', body: fd })
        const data = await res.json()
        finishVoice(data.text || '')
      } catch {
        setIsRecording(false); setInterimText('')
        setMessages(p => [...p, { role: 'ai', text: "❌ Ovozni matnga aylantirishda xato." }])
      }
    }
    try {
      recorder.start()
      mediaRecorderRef.current = recorder
      setIsRecording(true); setInterimText('🎙 Gapiring...')
    } catch {
      stream.getTracks().forEach(t => t.stop())
      setIsRecording(false); setInterimText('')
      setMessages(p => [...p, { role: 'ai', text: "❌ Mikrofon ishga tushmadi." }])
    }
  }

  const toggleRec = async () => {
    if (isRecording) {
      recognitionRef.current?.stop()
      stopMediaRecorder()
      return
    }
    cancelVoiceSend()

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      setMessages(p => [...p, { role: 'ai', text: "🔒 **Mikrofon ruxsati yo'q**\n\n📱 iPhone: Sozlamalar → Telegram → Mikrofon → yoqing\n🤖 Android: Telegram → Ilova sozlamalari → Ruxsatlar → Mikrofon" }])
      return
    }

    const SpeechAPI = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

    if (SpeechAPI) {
      // Web Speech API — try first, fall back to MediaRecorder on service-not-allowed
      stream.getTracks().forEach(t => t.stop())
      let r: ISpeechRecognition
      try { r = new SpeechAPI() } catch { await startMediaRecorderFn(); return }
      r.lang = voiceLang; r.continuous = false; r.interimResults = true; r.maxAlternatives = 1
      let fin = ''
      r.onresult = (e) => {
        fin = ''; let interim = ''
        for (let i = 0; i < e.results.length; i++) {
          if (e.results[i].isFinal) fin += e.results[i][0].transcript
          else interim += e.results[i][0].transcript
        }
        setInterimText(fin || interim)
      }
      r.onend = () => finishVoice(fin)
      r.onerror = async (e) => {
        setIsRecording(false); setInterimText('')
        if (e.error === 'service-not-allowed' || e.error === 'not-allowed') {
          await startMediaRecorderFn(); return
        }
        const errMap: Record<string, string> = {
          'no-speech':     "🔇 Ovoz eshitilmadi. Qayta urinib ko'ring.",
          'network':       '🌐 Tarmoq xatosi.',
          'aborted':       '',
          'audio-capture': '🎙 Mikrofon topilmadi.',
        }
        const msg = errMap[e.error]
        if (msg) setMessages(p => [...p, { role: 'ai', text: msg }])
      }
      try {
        r.start(); setIsRecording(true); setInterimText('')
        recognitionRef.current = r
      } catch { setIsRecording(false); await startMediaRecorderFn() }
    } else {
      // No Speech API — go straight to MediaRecorder (Android Telegram WebView)
      await startMediaRecorderFn(stream)
    }
  }

  // ─── Content bank ─────────────────────────────────────────────────────────
  const saveToBank = (content: string, platform: string = 'AI') => {
    const item: ContentItem = { id: Date.now(), title: content.slice(0, 50) + '...', content, platform, date: new Date().toLocaleDateString('uz-UZ') }
    setContentBank(p => [item, ...p.slice(0, 49)])
  }

  // ─── Campaign generator ───────────────────────────────────────────────────
  const createCampaign = () => {
    if (!campaignTopic.trim()) return
    const bp = brand
    const goalMap = { sell: 'Sotish/Konversiya', brand: 'Brend tanishlik', engage: 'Engagement/Reaction', hook: "Ko'zga tashlanadigan boshlanish (5 xil hook)", viral: "Viral kontent g'oyalari (5 ta variant)" }
    const langMap = { uz: "o'zbek", ru: 'rus', both: "o'zbek VA rus (ikkalasini alohida yoz)" }
    const prompt = `🚀 MARKETING KAMPANIYA YARATISH\n\n${bp.name ? `✦ Brand: "${bp.name}"\n` : ''}${bp.niche ? `✦ Soha: ${bp.niche}\n` : ''}${bp.audience ? `✦ Maqsadli auditoriya: ${bp.audience}\n` : ''}✦ Uslub: ${bp.tone || 'professional'}\n✦ Platform: ${smmPlatform}\n✦ Mavzu/Mahsulot: ${campaignTopic}\n✦ Maqsad: ${goalMap[campaignGoal]}\n✦ Til: ${langMap[bp.language] || "o'zbek"}\n\nQuyidagi BARCHASINI yarating:\n1️⃣ ${smmPlatform} post matni (emoji bilan, caption tayyor)\n2️⃣ 10 ta hashtag (3 katta + 4 o'rta + 3 kichik)\n3️⃣ Story uchun 3 ta slide g'oyasi\n4️⃣ 3 ta call-to-action (CTA) variant\n5️⃣ Eng yaxshi post qo'yish vaqti${bp.language === 'both' ? "\n6️⃣ Barcha narsalarni RU tilida ham yoz" : ''}`
    setSmmOpen(false); sendToAI(prompt, true)
  }

  // ─── Hook generator ───────────────────────────────────────────────────────
  const generateHooks = () => {
    if (!hookTopic.trim()) return
    const bp = brand
    const prompt = `📌 HOOK GENERATOR\n\nBrand: ${bp.name || 'Mening brendim'}\nMavzu: ${hookTopic}\nPlatform: ${smmPlatform}\n\nUshbu mavzu uchun 7 ta KUCHLI HOOK yoz (turli xil usullar bilan):\n1. Savol hook\n2. Statistika/raqam hook\n3. Qiziquvchanlik hook\n4. Muammo-yechim hook\n5. Shok qiluvchi dalil hook\n6. Trend/Hozirgi voqea hook\n7. Hazil/Emoji hook\n\nHar birini ${bp.language === 'ru' ? 'rus' : bp.language === 'both' ? "o'zbek va rus" : "o'zbek"} tilida yoz.`
    setSmmOpen(false); sendToAI(prompt, true)
  }

  // ─── Computed ─────────────────────────────────────────────────────────────
  const totalX      = expenses.filter(e => e.type === 'XARAJAT').reduce((s, e) => s + e.amount, 0)
  const totalD      = expenses.filter(e => e.type !== 'XARAJAT').reduce((s, e) => s + e.amount, 0)
  const balance     = totalD - totalX
  const filteredExp = expFilter === 'ALL' ? expenses : expenses.filter(e => e.type === expFilter)
  const netDebt     = debts.reduce((s, d) => d.dir === 'gave' ? s + d.amount : s - d.amount, 0)
  const budgetUsed  = budget > 0 ? Math.min(100, Math.round(totalX / budget * 100)) : 0

  return (
    <main className="relative flex flex-col h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden">
      {isLoading && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 bg-[length:200%] animate-[shimmer_1.5s_infinite] z-50" />}


      {/* ══ SIDEBAR TOGGLE ══ */}
      {!sidebar && (
        <button onClick={() => setSidebar(true)} className="absolute left-0 top-[60%] -translate-y-1/2 bg-[#1a1a1f]/90 border border-l-0 border-gray-700/80 px-1 py-5 rounded-r-2xl flex flex-col items-center gap-1 z-20 active:scale-95 transition-transform">
          <div className="w-1 h-6 bg-blue-500 rounded-full" />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} className="text-[8px] text-gray-400 font-bold tracking-widest uppercase">Menu</span>
        </button>
      )}

      {/* ══ SIDEBAR ══ */}
      <div className={`fixed inset-y-0 left-0 w-[280px] bg-[#0d0d10] z-50 transform transition-transform duration-300 flex flex-col border-r border-gray-800/60 shadow-2xl ${sidebar ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-gray-800/60 flex items-center gap-3 bg-[#111114]">
          <div className="w-11 h-11 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-base font-bold shadow-lg">
            {userData?.first_name?.charAt(0) || 'A'}
          </div>
          <div>
            <p className="font-bold text-sm">{userData?.first_name || 'Abubakr'}</p>
            <p className="text-[10px] text-blue-400 font-semibold">JONKA Pro · SMM</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2.5 flex flex-col gap-1">
          {[
            { icon: <Calculator size={15} className="text-green-400" />,      label: '💰 Moliya / Xarajat',     action: () => { setSidebar(false); setExpOpen(true) } },
            { icon: <HandCoins size={15} className="text-yellow-400" />,      label: '🤝 Qarz Daftari',          action: () => { setSidebar(false); setDebtOpen(true) } },
            { icon: <CheckSquare size={15} className="text-blue-400" />,      label: "🛒 Xaridlar Ro'yxati",    action: () => { setSidebar(false); setShopOpen(true) } },
            { icon: <Megaphone size={15} className="text-pink-400" />,        label: '📱 SMM Tools',             action: () => { setSidebar(false); setSmmOpen(true) } },
            { icon: <FileText size={15} className="text-gray-200" />,         label: '📓 Notion Baza',           action: () => { setSidebar(false); openApp('https://notion.so') } },
            { icon: <LayoutDashboard size={15} className="text-indigo-400" />, label: '🚀 Barcha Ilovalar',      action: () => { setSidebar(false); setAppsOpen(true) } },
          ].map(i => (
            <button key={i.label} onClick={i.action} className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#1a1a1f] active:bg-[#242429] transition-colors">
              <div className="flex items-center gap-3">{i.icon}<span className="text-sm font-medium">{i.label}</span></div>
              <ChevronRight size={14} className="text-gray-600" />
            </button>
          ))}

          {/* Voice lang */}
          <div className="mt-3 px-1">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Ovoz tili</p>
            <div className="flex gap-2">
              {(['uz-UZ', 'ru-RU'] as const).map(l => (
                <button key={l} onClick={() => setVoiceLang(l)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${voiceLang === l ? 'bg-blue-600 text-white' : 'bg-[#1a1a1f] text-gray-400'}`}>
                  {l === 'uz-UZ' ? '🇺🇿 UZ' : '🇷🇺 RU'}
                </button>
              ))}
            </div>
          </div>

          {/* Quick prompts */}
          <div className="mt-3 p-3 bg-[#1a1a1f] rounded-xl border border-gray-800/60">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">💡 Tez buyruqlar</p>
            {[
              '"Kafeda 45 ming xarajat"',
              '"Rashidga 50 ming berdim"',
              '"Uzum och"',
              '"Dollar kursi qancha?"',
              '"Instagram post yoz: ..."',
              '"Xarajatlarimni ko\'rsat"',
            ].map(c => (
              <button key={c} onClick={() => { setSidebar(false); setInputText(c.replace(/"/g, '')) }} className="block w-full text-left text-[11px] text-gray-400 py-1 hover:text-blue-400">
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      {sidebar && <div onClick={() => setSidebar(false)} className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" />}

      {/* ══ HEADER ══ */}
      <header className="flex justify-between items-center w-full px-4 py-3 bg-[#111114] border-b border-gray-800/50 shrink-0">
        <button onClick={() => setSidebar(true)} className="w-8 h-8 rounded-full border border-gray-700 bg-[#242429] flex items-center justify-center active:bg-[#333]">
          <Menu size={15} className="text-gray-400" />
        </button>
        <div className="flex flex-col items-center">
          <span className="font-bold text-sm">JONKA ✨</span>
          <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" /><span className="text-[9px] text-green-400">Online · {voiceLang === 'uz-UZ' ? 'UZ' : 'RU'}</span></div>
        </div>
        <button onClick={() => setSmmOpen(true)} className="w-8 h-8 rounded-full border border-pink-500/40 bg-pink-500/10 flex items-center justify-center active:bg-pink-500/20">
          <Megaphone size={14} className="text-pink-400" />
        </button>
      </header>

      {/* ══ QUICK LINKS ══ */}
      <div className="w-full overflow-x-auto scrollbar-hide shrink-0 bg-[#111114] pb-2 pt-2">
        <div className="flex gap-2 px-4 w-max">
          {[
            { icon: <Grid size={12} className="text-blue-400" />,      label: 'Super App',  act: () => setAppsOpen(true),          b: 'border-blue-500/30' },
            { icon: <Megaphone size={12} className="text-pink-400" />,  label: 'SMM Tools',  act: () => setSmmOpen(true),            b: 'border-pink-500/30' },
            { icon: <ShoppingBag size={12} className="text-purple-400" />, label: 'Uzum',    act: () => openApp('https://uzum.uz'),  b: 'border-gray-700' },
            { icon: <Car size={12} className="text-yellow-400" />,      label: 'Taxi',       act: () => openApp('https://go.yandex/'), b: 'border-gray-700' },
          ].map(i => (
            <button key={i.label} onClick={i.act} className={`bg-[#1a1a1f] border ${i.b} rounded-full px-3.5 py-1.5 flex items-center gap-1.5 active:scale-95 transition-transform`}>
              {i.icon}<span className="text-[11px] font-medium">{i.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══ CHAT ══ */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 pb-[100px]">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1 mb-1 opacity-40 px-1">
              {msg.role === 'user' ? <User size={9} /> : <Bot size={9} />}
              <span className="text-[8px] uppercase font-bold tracking-wider">{msg.role === 'user' ? 'Siz' : 'JONKA'}</span>
            </div>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${msg.role === 'user' ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-[#1a1a1f] text-gray-200 rounded-tl-sm border border-gray-800/60'}`}>
              {msg.role === 'ai' ? fmt(msg.text) : msg.text}
            </div>
            {msg.role === 'ai' && idx > 0 && (
              <button onClick={() => saveToBank(msg.text, smmPlatform)}
                className="mt-1 ml-1 text-[10px] text-gray-600 hover:text-pink-400 flex items-center gap-1 transition-colors">
                <Bookmark size={10} /> Bankga saqlash
              </button>
            )}
          </div>
        ))}
        {isLoading && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1 mb-1 opacity-40 px-1"><Bot size={9} /><span className="text-[8px] uppercase font-bold tracking-wider">JONKA</span></div>
            <div className="bg-[#1a1a1f] border border-gray-800/60 rounded-2xl rounded-tl-sm px-4 py-3.5 flex gap-1.5">
              {[0, 150, 300].map(d => <span key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ══ INPUT ══ */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-4 pt-2 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/95 to-transparent z-10">

        {/* ── TARIX PANELI ── */}
        {historyOpen && searchHistory.length > 0 && (
          <div className="mb-2 bg-[#111114] border border-gray-800/80 rounded-2xl overflow-hidden shadow-2xl">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60">
              <div className="flex items-center gap-2">
                <Clock size={12} className="text-gray-500" />
                <span className="text-[11px] text-gray-400 font-semibold">So'nggi qidiruvlar</span>
              </div>
              <button onClick={() => { setSearchHistory([]); setHistoryOpen(false) }}
                className="text-[10px] text-red-400 px-2 py-0.5 bg-red-500/10 rounded-full">
                Tozalash
              </button>
            </div>
            <div className="max-h-[220px] overflow-y-auto">
              {searchHistory.map((h, i) => (
                <button key={i}
                  onClick={() => { setInputText(h); setHistoryOpen(false) }}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1a1a1f] active:bg-[#242429] transition-colors text-left group">
                  <Search size={12} className="text-gray-600 shrink-0 group-hover:text-blue-400" />
                  <span className="text-[13px] text-gray-300 truncate flex-1">{h}</span>
                  <button onClick={e => { e.stopPropagation(); setSearchHistory(p => p.filter((_, j) => j !== i)) }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded-lg transition-opacity">
                    <X size={10} className="text-gray-500" />
                  </button>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Voice recording indicator */}
        {isRecording && (
          <div className="flex items-center gap-2 mb-2 px-3.5 py-2 bg-red-500/10 border border-red-500/30 rounded-2xl">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
            <span className="text-red-300 text-[13px] flex-1 truncate">{interimText || (voiceLang === 'uz-UZ' ? '🎙 Gapiring...' : '🎙 Говорите...')}</span>
          </div>
        )}
        {/* Voice countdown banner */}
        {voiceCountdown !== null && (
          <div className="flex items-center gap-2 mb-2 px-3.5 py-2 bg-blue-500/10 border border-blue-500/30 rounded-2xl">
            <span className="text-blue-300 text-[12px] flex-1">📤 {voiceCountdown}s da yuboriladi...</span>
            <button onClick={() => { cancelVoiceSend(); }} className="text-[11px] text-red-400 font-bold px-2 py-0.5 bg-red-500/10 rounded-full">Bekor</button>
          </div>
        )}

        <div className="flex items-end gap-2">
          {/* Input */}
          <div className="flex-1 bg-[#1a1a1f] rounded-3xl flex items-center px-4 border border-gray-700/80 min-h-[52px] relative">
            {/* Tarix tugmasi — input ichida chapda */}
            {!inputText && searchHistory.length > 0 && (
              <button onMouseDown={e => { e.preventDefault(); setHistoryOpen(p => !p) }}
                className="shrink-0 p-1 mr-2 rounded-full transition-colors">
                <Clock size={14} className="text-gray-500" />
              </button>
            )}
            <input type="text" value={inputText}
              onChange={e => { setInputText(e.target.value); if (voiceCountdown !== null) cancelVoiceSend() }}
              onFocus={() => { if (!inputText && searchHistory.length > 0) setHistoryOpen(true) }}
              onBlur={() => setTimeout(() => setHistoryOpen(false), 150)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); cancelVoiceSend(); sendToAI(inputText) }
                if (e.key === 'Escape') setHistoryOpen(false)
              }}
              placeholder={isRecording ? '🎤 Tinglanyapti...' : 'JONKA ga yozing...'}
              style={{ fontSize: '16px' }}
              className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 py-3.5" />
          </div>

          {/* O'ngda: Send (matn bo'lsa) yoki Mic (har doim) */}
          {inputText.trim() ? (
            <button onClick={() => { cancelVoiceSend(); sendToAI(inputText) }} disabled={isLoading}
              className="w-[52px] h-[52px] shrink-0 rounded-full bg-blue-600 shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-90 disabled:opacity-40">
              <Send size={19} className="text-white ml-[-2px]" />
            </button>
          ) : (
            <button onClick={toggleRec}
              className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center transition-all shadow-lg ${
                isRecording
                  ? 'bg-red-500 scale-110 shadow-red-500/30'
                  : 'bg-[#1a1a1f] border border-gray-700/80 active:scale-90'
              }`}>
              {isRecording ? <MicOff size={20} className="text-white" /> : <Mic size={21} className="text-blue-400" />}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          💰 MOLIYA MODALI
      ══════════════════════════════════════════ */}
      {expOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3.5 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><Calculator size={16} className="text-green-400" />Moliya</h2>
            <button onClick={() => setExpOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={16} /></button>
          </header>
          {/* Stats */}
          <div className="px-4 pt-3 grid grid-cols-3 gap-2 shrink-0">
            {[
              { label: 'Xarajat', val: totalX, color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20',    icon: <TrendingDown size={11} className="text-red-400" /> },
              { label: 'Daromat', val: totalD, color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20', icon: <TrendingUp size={11} className="text-green-400" /> },
              { label: 'Balans',  val: balance, color: balance >= 0 ? 'text-blue-400' : 'text-orange-400', bg: balance >= 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-orange-500/10 border-orange-500/20', icon: null },
            ].map(s => (
              <div key={s.label} className={`${s.bg} border rounded-2xl p-3`}>
                <div className="flex items-center gap-1 mb-1">{s.icon}<p className={`text-[9px] ${s.color}`}>{s.label}</p></div>
                <p className={`text-sm font-bold ${s.color}`}>{s.val >= 0 ? '' : '-'}{Math.abs(s.val).toLocaleString()}</p>
                <p className="text-[8px] text-gray-500">UZS</p>
              </div>
            ))}
          </div>
          {/* Budget */}
          {budget > 0 && (
            <div className="px-4 pt-2 shrink-0">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>Oylik byudjet: {budget.toLocaleString()} UZS</span>
                <span className={budgetUsed > 80 ? 'text-red-400' : 'text-gray-400'}>{budgetUsed}%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${budgetUsed > 80 ? 'bg-red-500' : budgetUsed > 50 ? 'bg-yellow-500' : 'bg-green-500'}`} style={{ width: `${budgetUsed}%` }} />
              </div>
            </div>
          )}
          <div className="px-4 pt-2 flex gap-2 shrink-0">
            <input value={budgetInput} onChange={e => setBudgetInput(e.target.value)} placeholder="Oylik byudjet (UZS)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{ fontSize: '16px' }} />
            <button onClick={() => { const v = parseInt(budgetInput.replace(/\D/g, '')); if (v > 0) { setBudget(v); setBudgetInput('') } }} className="px-4 py-2 bg-blue-600 rounded-xl text-sm font-bold">Saqlash</button>
          </div>
          {/* Filter */}
          <div className="flex gap-2 px-4 pt-2 shrink-0">
            {(['ALL', 'XARAJAT', 'DAROMAT'] as const).map(f => (
              <button key={f} onClick={() => setExpFilter(f)} className={`px-3 py-1 rounded-full text-[11px] font-bold ${expFilter === f ? 'bg-blue-600 text-white' : 'bg-[#1a1a1f] text-gray-400'}`}>
                {f === 'ALL' ? 'Hammasi' : f === 'XARAJAT' ? '📉 Xarajat' : '📈 Daromat'}
              </button>
            ))}
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-2">
            {filteredExp.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30"><Calculator size={40} strokeWidth={1} /><p className="text-sm">Bo'sh</p></div>
            ) : filteredExp.map(exp => {
              const { icon, cls } = catStyle(exp.name)
              return (
                <div key={exp.id} className="flex items-center gap-3 bg-[#111114] border border-gray-800/60 rounded-2xl px-4 py-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${cls} shrink-0`}>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{exp.name}</p>
                    <p className={`text-xs font-medium ${exp.type === 'XARAJAT' ? 'text-red-400' : 'text-green-400'}`}>{exp.type === 'XARAJAT' ? '−' : '+'}{exp.amount.toLocaleString()} UZS</p>
                    {exp.date && <p className="text-[9px] text-gray-600">{exp.date}</p>}
                  </div>
                  <button onClick={() => setExpenses(p => p.filter(e => e.id !== exp.id))} className="p-1.5 rounded-lg bg-[#1a1a1f]"><Trash2 size={12} className="text-gray-500" /></button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          🤝 QARZ DAFTARI
      ══════════════════════════════════════════ */}
      {debtOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3.5 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><HandCoins size={16} className="text-yellow-400" />Qarz Daftari</h2>
            <button onClick={() => setDebtOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={16} /></button>
          </header>
          <div className="px-4 pt-3 grid grid-cols-2 gap-2 shrink-0">
            <div className={`${netDebt >= 0 ? 'bg-green-500/10 border-green-500/20' : 'bg-red-500/10 border-red-500/20'} border rounded-2xl p-3`}>
              <p className={`text-[9px] ${netDebt >= 0 ? 'text-green-400' : 'text-red-400'}`}>{netDebt >= 0 ? 'Menga qarzdor' : 'Men qarzdorman'}</p>
              <p className={`text-sm font-bold mt-1 ${netDebt >= 0 ? 'text-green-400' : 'text-red-400'}`}>{Math.abs(netDebt).toLocaleString()} UZS</p>
            </div>
            <div className="bg-[#1a1a1f] border border-gray-800 rounded-2xl p-3">
              <p className="text-[9px] text-gray-400">Jami yozuv</p>
              <p className="text-sm font-bold mt-1">{debts.length} ta</p>
            </div>
          </div>
          {/* Add form */}
          <div className="px-4 pt-3 shrink-0 space-y-2">
            <div className="flex gap-2">
              <input value={debtForm.person} onChange={e => setDebtForm(p => ({ ...p, person: e.target.value }))} placeholder="Kim? (Rashid)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{ fontSize: '16px' }} />
              <input value={debtForm.amount} onChange={e => setDebtForm(p => ({ ...p, amount: e.target.value }))} placeholder="Summa" type="number" className="w-28 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{ fontSize: '16px' }} />
            </div>
            <div className="flex gap-2">
              <button onClick={() => setDebtForm(p => ({ ...p, dir: 'gave' }))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${debtForm.dir === 'gave' ? 'bg-green-600 text-white' : 'bg-[#1a1a1f] text-gray-400'}`}>➡️ Men berdim</button>
              <button onClick={() => setDebtForm(p => ({ ...p, dir: 'borrowed' }))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${debtForm.dir === 'borrowed' ? 'bg-red-600 text-white' : 'bg-[#1a1a1f] text-gray-400'}`}>⬅️ Men oldim</button>
            </div>
            <div className="flex gap-2">
              <input value={debtForm.note} onChange={e => setDebtForm(p => ({ ...p, note: e.target.value }))} placeholder="Izoh (ixtiyoriy)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{ fontSize: '16px' }} />
              <button onClick={() => { addDebt(debtForm.person, parseInt(debtForm.amount) || 0, debtForm.dir, debtForm.note); setDebtForm({ person: '', amount: '', dir: 'gave', note: '' }) }} className="px-4 bg-blue-600 rounded-xl text-sm font-bold">Qo'sh</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-2">
            {debts.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30"><HandCoins size={40} strokeWidth={1} /><p className="text-sm">Bo'sh</p></div>
            ) : debts.map(d => (
              <div key={d.id} className="flex items-center gap-3 bg-[#111114] border border-gray-800/60 rounded-2xl px-4 py-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${d.dir === 'gave' ? 'bg-green-500/15 border border-green-500/30' : 'bg-red-500/15 border border-red-500/30'} shrink-0`}>
                  {d.dir === 'gave' ? '➡️' : '⬅️'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{d.person}</p>
                  <p className={`text-xs font-medium ${d.dir === 'gave' ? 'text-green-400' : 'text-red-400'}`}>{d.dir === 'gave' ? '+' : '−'}{d.amount.toLocaleString()} UZS</p>
                  {d.note && <p className="text-[10px] text-gray-500 truncate">{d.note}</p>}
                  <p className="text-[9px] text-gray-600">{d.date}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${d.dir === 'gave' ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>{d.dir === 'gave' ? 'Berdi' : 'Oldim'}</span>
                  <button onClick={() => setDebts(p => p.filter(x => x.id !== d.id))} className="p-1 rounded-lg bg-[#1a1a1f]"><Trash2 size={11} className="text-gray-500" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          🛒 XARIDLAR RO'YXATI
      ══════════════════════════════════════════ */}
      {shopOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3.5 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><ShoppingBag size={16} className="text-blue-400" />Xaridlar Ro'yxati</h2>
            <div className="flex gap-2">
              <button onClick={() => setShopItems(p => p.filter(i => !i.done))} className="text-[11px] text-gray-400 px-3 py-1.5 bg-[#1a1a1f] rounded-full">Bajarilganlarni o'chir</button>
              <button onClick={() => setShopOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={16} /></button>
            </div>
          </header>
          <div className="flex gap-2 px-4 pt-3 shrink-0">
            <input value={shopInput} onChange={e => setShopInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { addShop(shopInput); setShopInput('') } }}
              placeholder="Mahsulot qo'shing..." className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" style={{ fontSize: '16px' }} />
            <button onClick={() => { addShop(shopInput); setShopInput('') }} className="px-4 bg-blue-600 rounded-xl text-sm font-bold">+</button>
          </div>
          <div className="px-4 pt-2 flex gap-2 shrink-0">
            <span className="text-[11px] text-gray-400">{shopItems.filter(i => i.done).length}/{shopItems.length} bajarildi</span>
            {shopItems.length > 0 && <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden self-center"><div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${shopItems.length ? shopItems.filter(i => i.done).length / shopItems.length * 100 : 0}%` }} /></div>}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-2">
            {shopItems.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30"><ShoppingBag size={40} strokeWidth={1} /><p className="text-sm">Bo'sh ro'yxat</p></div>
            ) : [...shopItems.filter(i => !i.done), ...shopItems.filter(i => i.done)].map(item => (
              <button key={item.id} onClick={() => setShopItems(p => p.map(i => i.id === item.id ? { ...i, done: !i.done } : i))}
                className={`flex items-center gap-3 bg-[#111114] border rounded-xl px-4 py-3 transition-colors ${item.done ? 'border-gray-800/30 opacity-50' : 'border-gray-800/60'}`}>
                {item.done ? <CheckSquare size={18} className="text-green-400 shrink-0" /> : <Square size={18} className="text-gray-500 shrink-0" />}
                <span className={`text-sm flex-1 text-left ${item.done ? 'line-through text-gray-500' : 'text-white'}`}>{item.text}</span>
                <button onClick={e => { e.stopPropagation(); setShopItems(p => p.filter(i => i.id !== item.id)) }} className="p-1 rounded-lg"><Trash2 size={11} className="text-gray-600" /></button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          📱 SMM STUDIO
      ══════════════════════════════════════════ */}
      {smmOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><Megaphone size={15} className="text-pink-400" />SMM Studio</h2>
            <button onClick={() => setSmmOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={15} /></button>
          </header>
          <div className="flex border-b border-gray-800 shrink-0">
            {(['campaign', 'profile', 'bank'] as const).map(t => (
              <button key={t} onClick={() => setSmmTab(t)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${smmTab === t ? 'text-pink-400 border-b-2 border-pink-400 -mb-px' : 'text-gray-500'}`}>
                {t === 'campaign' ? '🚀 Kampaniya' : t === 'profile' ? '🏢 Brand Profil' : '💾 Kontent Bank'}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">

            {smmTab === 'campaign' && (<>
              {brand.name && (
                <div className="mb-3 px-3 py-2 bg-pink-500/10 border border-pink-500/20 rounded-xl flex items-center gap-2">
                  <span className="text-xs text-pink-300">🏢 <b>{brand.name}</b> · {brand.niche || '?'}</span>
                  <button onClick={() => setSmmTab('profile')} className="ml-auto text-[10px] text-pink-400 underline">O'zgartirish</button>
                </div>
              )}
              {!brand.name && (
                <div className="mb-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <p className="text-xs text-yellow-300">⚠️ <b>Brand profilingizni</b> kiriting — AI yaxshiroq kontent yozadi</p>
                  <button onClick={() => setSmmTab('profile')} className="text-[10px] text-yellow-400 underline mt-1">→ Profilni to'ldirish</button>
                </div>
              )}
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Platform</p>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {PLATFORMS.map(p => (
                  <button key={p} onClick={() => setSmmPlatform(p)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${smmPlatform === p ? 'bg-pink-600 border-pink-500 text-white' : 'bg-[#1a1a1f] border-gray-700 text-gray-400'}`}>
                    {p === 'Instagram' ? '📸' : p === 'Telegram' ? '✈️' : p === 'Facebook' ? '👤' : p === 'TikTok' ? '🎵' : p === 'YouTube' ? '▶️' : '💼'} {p}
                  </button>
                ))}
              </div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Mavzu / Mahsulot</p>
              <input value={campaignTopic} onChange={e => setCampaignTopic(e.target.value)}
                placeholder="Masalan: Yoz kolleksiyasi, 40% chegirma..."
                className="w-full bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none mb-3" style={{ fontSize: '16px' }} />
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Kampaniya maqsadi</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {([
                  { k: 'sell', icon: '💰', l: 'Sotish' },
                  { k: 'brand', icon: '👁', l: 'Brend' },
                  { k: 'engage', icon: '❤️', l: 'Engagement' },
                  { k: 'hook', icon: '🎣', l: 'Hook yoz' },
                  { k: 'viral', icon: '🔥', l: "Viral g'oya" },
                ] as const).map(g => (
                  <button key={g.k} onClick={() => setCampaignGoal(g.k)} className={`py-2 rounded-xl text-xs font-bold border transition-colors ${campaignGoal === g.k ? 'bg-pink-600 border-pink-500 text-white' : 'bg-[#1a1a1f] border-gray-700 text-gray-400'}`}>
                    {g.icon} {g.l}
                  </button>
                ))}
              </div>
              <button onClick={createCampaign} disabled={!campaignTopic.trim()}
                className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-pink-600/20 mb-3">
                ⚡ 1-CLICK KAMPANIYA YARATISH
              </button>
              <div className="p-3 bg-[#111114] border border-gray-800 rounded-2xl mb-3">
                <p className="text-[10px] text-gray-400 font-bold mb-2">🎣 HOOK GENERATOR — 7 xil boshlanish</p>
                <div className="flex gap-2">
                  <input value={hookTopic} onChange={e => setHookTopic(e.target.value)}
                    placeholder="Mavzu: moda, fitnes, ovqat..." className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-xs outline-none" style={{ fontSize: '16px' }} />
                  <button onClick={generateHooks} disabled={!hookTopic.trim()} className="px-4 py-2 bg-purple-600 rounded-xl text-xs font-bold disabled:opacity-40">Yaratish</button>
                </div>
              </div>
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Tezkor buyruqlar</p>
              <div className="grid grid-cols-3 gap-2">
                {SMM_PROMPTS.slice(0, 9).map(sp => (
                  <button key={sp.label} onClick={() => { setSmmOpen(false); sendToAI(sp.tmpl(smmPlatform, campaignTopic || '...'), true) }}
                    className="flex flex-col items-center gap-1 p-2.5 bg-[#111114] border border-gray-800/60 rounded-2xl active:scale-95 transition-transform">
                    <span className="text-xl">{sp.icon}</span>
                    <span className="text-[9px] text-gray-400 text-center leading-tight">{sp.label}</span>
                  </button>
                ))}
              </div>
            </>)}

            {smmTab === 'profile' && (<>
              <div className="p-3 mb-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-xs text-blue-300">💡 Brand profilingizni bir marta to'ldiring — AI har doim sizning brendingiz uslubida javob beradi</p>
              </div>
              {([
                { label: 'Brand nomi',          key: 'name'     as const, ph: 'Masalan: Abubakr Style' },
                { label: 'Soha / Niche',         key: 'niche'    as const, ph: 'Moda, fitnes, oziq-ovqat, texnologiya...' },
                { label: 'Maqsadli auditoriya',  key: 'audience' as const, ph: '18-35 yosh, ayollar, Toshkent...' },
                { label: 'Brand uslubi (Tone)',  key: 'tone'     as const, ph: 'Hazilkash, professional, trendy, jiddiy...' },
              ]).map(f => (
                <div key={f.key} className="mb-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{f.label}</p>
                  <input value={brand[f.key]} onChange={e => setBrand(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.ph} className="w-full bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" style={{ fontSize: '16px' }} />
                </div>
              ))}
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Asosiy platformalar</p>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {PLATFORMS.map(p => {
                  const sel = brand.platforms.includes(p)
                  return <button key={p} onClick={() => setBrand(b => ({ ...b, platforms: sel ? b.platforms.filter(x => x !== p) : [...b.platforms, p] }))}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${sel ? 'bg-pink-600 border-pink-500 text-white' : 'bg-[#1a1a1f] border-gray-700 text-gray-400'}`}>{p}</button>
                })}
              </div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Kontent tili</p>
              <div className="flex gap-2 mb-4">
                {([['uz', "🇺🇿 O'zbek"], ['ru', '🇷🇺 Русский'], ['both', '🇺🇿+🇷🇺 Ikkalasi']] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setBrand(b => ({ ...b, language: k }))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${brand.language === k ? 'bg-blue-600 text-white' : 'bg-[#1a1a1f] text-gray-400'}`}>{l}</button>
                ))}
              </div>
              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-[11px] text-green-300">✅ Profil <b>avtomatik saqlanadi</b>. Har bir AI so'rovi brand konteksti bilan yuboriladi.</p>
              </div>
            </>)}

            {smmTab === 'bank' && (<>
              {bankPreview && (
                <div className="fixed inset-0 z-[300] bg-[#0a0a0c] flex flex-col animate-slide-up">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-[#111114]">
                    <button onClick={() => setBankPreview(null)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={15} /></button>
                    <span className="text-sm font-bold flex-1 truncate">{bankPreview.platform}</span>
                    <button onClick={() => { setInputText(bankPreview.content.slice(0, 200)); setBankPreview(null); setSmmOpen(false) }} className="px-3 py-1.5 bg-blue-600 rounded-xl text-xs font-bold">Chat ga yuborish</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{bankPreview.content}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold">{contentBank.length} ta saqlangan kontent</p>
                {contentBank.length > 0 && <button onClick={() => setContentBank([])} className="text-[10px] text-red-400 px-3 py-1 bg-red-500/10 rounded-full">Barchasini o'chir</button>}
              </div>
              {contentBank.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-30">
                  <Bookmark size={40} strokeWidth={1} />
                  <p className="text-sm">Chat da AI javobini "Bankga saqlash" bosing</p>
                </div>
              ) : contentBank.map(item => (
                <div key={item.id} className="bg-[#111114] border border-gray-800/60 rounded-2xl p-3.5 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-pink-400 px-2 py-0.5 bg-pink-500/10 rounded-full">{item.platform}</span>
                    <span className="text-[9px] text-gray-500">{item.date}</span>
                  </div>
                  <p className="text-[12px] text-gray-300 line-clamp-2 mb-2">{item.content}</p>
                  <div className="flex gap-2">
                    <button onClick={() => setBankPreview(item)} className="flex-1 py-1.5 bg-[#1a1a1f] rounded-xl text-[10px] font-bold text-gray-300">Ko'rish</button>
                    <button onClick={() => setContentBank(p => p.filter(c => c.id !== item.id))} className="p-1.5 bg-[#1a1a1f] rounded-xl"><Trash2 size={12} className="text-gray-500" /></button>
                  </div>
                </div>
              ))}
            </>)}
          </div>
        </div>
      )}

      {/* ══ SUPER APP ══ */}
      {appsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md">
          <div className="w-full max-h-[78%] bg-[#111114] rounded-t-[28px] p-5 relative border-t border-gray-800 animate-slide-up shadow-2xl overflow-y-auto">
            <button onClick={() => setAppsOpen(false)} className="absolute top-4 right-4 p-2 bg-[#1a1a1f] rounded-full"><X size={16} /></button>
            <h2 className="text-xl font-bold mb-5 mt-1">Xizmatlar</h2>
            {[
              {
                title: '🛍 Marketpleys', apps: [
                  { icon: <ShoppingBag size={20} className="text-purple-500" />, label: 'Uzum',  url: 'https://uzum.uz',           bg: 'bg-purple-600/15 border-purple-500/25' },
                  { icon: <Coffee size={20} className="text-yellow-500" />,       label: 'Lavka', url: 'https://lavka.yandex.ru/',   bg: 'bg-yellow-500/15 border-yellow-500/25' },
                ]
              },
              {
                title: '🚕 Transport', apps: [
                  { icon: <Car size={20} className="text-yellow-400" />, label: 'Yandex Go', url: 'https://go.yandex/', bg: 'bg-yellow-500/15 border-yellow-500/25' },
                ]
              },
              {
                title: '📝 Ish va Baza', apps: [
                  { icon: <FileText size={20} className="text-white" />,        label: 'Notion',    url: 'https://notion.so',        bg: 'bg-gray-600/15 border-gray-500/25' },
                  { icon: <PenTool size={20} className="text-pink-400" />,      label: 'Figma',     url: 'https://figma.com',         bg: 'bg-pink-600/15 border-pink-500/25' },
                  { icon: <Megaphone size={20} className="text-orange-400" />,  label: 'Instagram', url: 'https://instagram.com',     bg: 'bg-orange-500/15 border-orange-500/25' },
                  { icon: <MessageCircle size={20} className="text-blue-400" />, label: 'Telegram', url: 'https://web.telegram.org',  bg: 'bg-blue-500/15 border-blue-500/25' },
                ]
              },
            ].map(sec => (
              <div key={sec.title} className="mb-5">
                <p className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">{sec.title}</p>
                <div className="grid grid-cols-4 gap-3">
                  {sec.apps.map(app => (
                    <button key={app.label} onClick={() => { setAppsOpen(false); openApp(app.url) }} className="flex flex-col items-center gap-2 active:scale-90 transition-transform">
                      <div className={`w-14 h-14 ${app.bg} border rounded-[18px] flex items-center justify-center`}>{app.icon}</div>
                      <span className="text-[10px] text-gray-300">{app.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </main>
  )
}
