'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Grid, Menu, X, Bookmark, FileText, Send, User, Bot, ChevronRight,
  LayoutDashboard, ShoppingBag, Car, PenTool, Coffee, Calculator,
  RefreshCw, Globe, MicOff, TrendingDown, TrendingUp, Trash2 } from 'lucide-react'

const N8N_WEBHOOK_URL = "/api/chat"

// ─── App commands ──────────────────────────────────────────────────────────
const APP_URLS: Record<string, { url: string; label: string }> = {
  uzum:    { url: 'https://uzum.uz',            label: 'Uzum' },
  yandex:  { url: 'https://go.yandex/',         label: 'Yandex Go' },
  taxi:    { url: 'https://go.yandex/',         label: 'Yandex Go' },
  lavka:   { url: 'https://lavka.yandex.ru/',   label: 'Yandex Lavka' },
  notion:  { url: 'https://notion.so',          label: 'Notion' },
  figma:   { url: 'https://figma.com',          label: 'Figma' },
}

const OPEN_WORDS = ['och', 'open', 'ocher', 'opendir', 'откры', 'запус', 'bor', 'ko\'r', 'show']

function detectAppCommand(text: string): string | null {
  const lower = text.toLowerCase()
  const hasOpenWord = OPEN_WORDS.some(w => lower.includes(w))
  if (!hasOpenWord) return null
  for (const [key, { url }] of Object.entries(APP_URLS)) {
    if (lower.includes(key)) return url
  }
  return null
}

// ─── Expense categories ─────────────────────────────────────────────────────
const CATEGORY_CONFIG: { keywords: string[]; icon: string; color: string }[] = [
  { keywords: ['kafe', 'qahva', 'coffee', 'restoran', 'tushlik', 'kechki', 'ovqat', 'еда', 'кафе'],      icon: '🍽️', color: 'orange' },
  { keywords: ['taxi', 'taksi', 'yandex go', 'transport', 'avtobus', 'metro', 'такси', 'транспорт'],     icon: '🚕', color: 'yellow' },
  { keywords: ['bozor', 'supermarket', 'oziq', 'mahsulot', 'groceries', 'продукты', 'магазин'],          icon: '🛒', color: 'green' },
  { keywords: ['kiyim', 'oyoq', 'brend', 'shopping', 'одежда', 'обувь'],                                 icon: '👕', color: 'purple' },
  { keywords: ['dori', 'dorixona', 'apteka', 'shifokor', 'лекарство', 'аптека'],                         icon: '💊', color: 'red' },
  { keywords: ['internet', 'telefon', 'aloqa', 'телефон', 'интернет'],                                   icon: '📱', color: 'blue' },
  { keywords: ['uy', 'kvartira', 'kommunal', 'ijara', 'аренда', 'квартира'],                             icon: '🏠', color: 'teal' },
  { keywords: ['sport', 'gym', 'fitness', 'спорт'],                                                      icon: '💪', color: 'green' },
  { keywords: ['ta\'lim', 'kurs', 'kitob', 'обучение', 'курс'],                                          icon: '📚', color: 'blue' },
  { keywords: ['bank', 'kredit', 'to\'lov', 'кредит'],                                                   icon: '🏦', color: 'gray' },
  { keywords: ['maosh', 'ish haqi', 'daromat', 'зарплата', 'доход'],                                     icon: '💰', color: 'green' },
]

function getCategoryStyle(name: string): { icon: string; colorClass: string } {
  const lower = name.toLowerCase()
  for (const cat of CATEGORY_CONFIG) {
    if (cat.keywords.some(k => lower.includes(k))) {
      const colorMap: Record<string, string> = {
        orange: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
        yellow: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
        green:  'bg-green-500/15 border-green-500/30 text-green-300',
        purple: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
        red:    'bg-red-500/15 border-red-500/30 text-red-300',
        blue:   'bg-blue-500/15 border-blue-500/30 text-blue-300',
        teal:   'bg-teal-500/15 border-teal-500/30 text-teal-300',
        gray:   'bg-gray-500/15 border-gray-500/30 text-gray-300',
      }
      return { icon: cat.icon, colorClass: colorMap[cat.color] || colorMap.gray }
    }
  }
  return { icon: '💸', colorClass: 'bg-gray-500/15 border-gray-500/30 text-gray-300' }
}

// ─── Expense keywords (auto-show modal) ─────────────────────────────────────
const EXPENSE_QUERY_WORDS = [
  'xarajat', 'rashod', 'moliya', 'pul', 'sarf', 'qancha', 'jadval',
  'расход', 'трат', 'деньги', 'финанс', 'бюджет', 'balance', 'balans'
]

// ─── Types ───────────────────────────────────────────────────────────────────
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  start(): void; stop(): void; abort(): void
  onstart: (() => void) | null; onend: (() => void) | null
  onresult: ((e: { results: SpeechRecognitionResultList; resultIndex: number }) => void) | null
  onerror: ((e: { error: string }) => void) | null
}
declare global {
  interface Window {
    SpeechRecognition: new () => ISpeechRecognition
    webkitSpeechRecognition: new () => ISpeechRecognition
  }
}

export default function Home() {
  const [userData, setUserData] = useState<any>(null)
  const [isRecording, setIsRecording] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [voiceLang, setVoiceLang] = useState<'uz-UZ' | 'ru-RU'>('uz-UZ')

  const [isAppsOpen, setIsAppsOpen]   = useState(false)
  const [isKitobOpen, setIsKitobOpen] = useState(false)
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [expenseFilter, setExpenseFilter] = useState<'ALL' | 'XARAJAT' | 'DAROMAT'>('ALL')

  const [inputText, setInputText] = useState('')
  const [messages, setMessages] = useState<{ role: string; text: string }[]>([{
    role: 'ai',
    text: 'Salom! Men **JONKA** 🤖\n\nNima qila olaman:\n📊 **Xarajat** — "Kafe da 45,000 so\'m xarajat"\n📅 **Calendar** — "Ertaga 15:00 uchrashuv qo\'sh"\n📝 **Notion** — "Yangi sahifa: Loyiha"\n🔍 **Qidiruv** — "Python haqida ma\'lumot"\n📱 **Ilovalar** — "Uzum oч" yoki "Yandex oч"\n\n🇺🇿 O\'zbek va 🇷🇺 Rus tillarida gaplashish mumkin!\n\n**Sidebar → Ovoz tili** ni o\'zgartiring'
  }])

  const [expenses, setExpenses] = useState<{ id: number; name: string; amount: number; type: string }[]>([
    { id: 1, name: 'Ovqatlanish', amount: 50000, type: 'XARAJAT' },
  ])

  const [browserUrl, setBrowserUrl] = useState<string | null>(null)
  const [browserLoading, setBrowserLoading] = useState(false)
  const iframeRef     = useRef<HTMLIFrameElement>(null)
  const recognitionRef = useRef<ISpeechRecognition | null>(null)
  const chatEndRef    = useRef<HTMLDivElement>(null)
  const abortRef      = useRef<AbortController | null>(null)
  const [webApp, setWebApp] = useState<any>(null)

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [messages])

  useEffect(() => {
    if (typeof window === 'undefined') return
    import('@twa-dev/sdk').then(m => {
      const W = m.default
      W.ready(); W.expand()
      W.setHeaderColor('#111114'); W.setBackgroundColor('#111114')
      if (W.initDataUnsafe?.user) setUserData(W.initDataUnsafe.user)
      setWebApp(W)
    })
  }, [])

  const openApp = (url: string) => setBrowserUrl(url)

  const formatMessage = (text: string) =>
    text.split(/\\n|\n/).map((line, i, arr) => {
      const parts = line.split(/(\*\*.*?\*\*)/g)
      return (
        <span key={i}>
          {parts.map((p, j) =>
            p.startsWith('**') && p.endsWith('**')
              ? <strong key={j} className="text-white font-bold">{p.slice(2,-2)}</strong>
              : p
          )}
          {i < arr.length - 1 && <br />}
        </span>
      )
    })

  // ─── Xarajat so'rovini aniqlash ─────────────────────────────────────────
  const checkExpenseQuery = (text: string) => {
    const lower = text.toLowerCase()
    return EXPENSE_QUERY_WORDS.some(w => lower.includes(w))
  }

  // ─── Asosiy AI call ─────────────────────────────────────────────────────
  const sendToAI = async (text: string) => {
    if (!text.trim() || isLoading) return
    setInputText(''); setInterimText('')

    // Ilovani ochish buyrug'i
    const appUrl = detectAppCommand(text)
    if (appUrl) openApp(appUrl)

    // Xarajat jadvalini ko'rsatish
    if (checkExpenseQuery(text)) {
      setTimeout(() => setIsKitobOpen(true), 1200)
    }

    setMessages(prev => [...prev, { role: 'user', text }])
    setIsLoading(true)

    // Abort controller (10 soniya timeout)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const timer = setTimeout(() => abortRef.current?.abort(), 15000)

    try {
      const res = await fetch(N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          message: text,
          user_id: userData?.id || 0,
          username: userData?.username || userData?.first_name || 'Foydalanuvchi',
        }),
      })
      clearTimeout(timer)

      if (!res.ok) {
        const e = await res.json().catch(() => ({}))
        throw new Error((e as { error?: string }).error || `Xato: ${res.status}`)
      }

      const data = await res.json()
      let reply: string = data?.reply || data?.response || data?.text || data?.message || data?.output || ''

      if (reply) {
        // [OPEN:appname] — ilovani ochish
        const openMatch = reply.match(/\[OPEN:(\w+)\]/i)
        if (openMatch) {
          const key = openMatch[1].toLowerCase()
          if (APP_URLS[key]) openApp(APP_URLS[key].url)
          reply = reply.replace(/\[OPEN:\w+\]/gi, '').trim()
        }

        // [EXPENSE:...] — xarajat qo'shish
        const expMatch = reply.match(/\[EXPENSE:(.*?)\|(.*?)\|(.*?)\]/i)
        if (expMatch) {
          addExpense(expMatch[1].trim(), parseInt(expMatch[2].replace(/\D/g,''))||0, expMatch[3].trim().toUpperCase())
          reply = reply.replace(/\[EXPENSE:.*?\]/gi, '').trim()
        } else if (data?.expense) {
          const e = data.expense as { name: string; amount: number; type: string }
          addExpense(e.name, e.amount, e.type)
        }

        setMessages(prev => [...prev, { role: 'ai', text: reply }])
      } else {
        setMessages(prev => [...prev, { role: 'ai', text: '✅ Qabul qilindi!' }])
      }
    } catch (err: unknown) {
      clearTimeout(timer)
      if (err instanceof Error && err.name === 'AbortError') {
        setMessages(prev => [...prev, { role: 'ai', text: '⏱ Vaqt tugadi. Qayta urinib ko\'ring.' }])
      } else {
        const msg = err instanceof Error ? err.message : "Xato yuz berdi"
        setMessages(prev => [...prev, { role: 'ai', text: `❌ ${msg}` }])
      }
    } finally {
      setIsLoading(false)
    }
  }

  const addExpense = (name: string, amount: number, type: string) => {
    if (amount < 100) return
    setExpenses(prev => [{ id: Date.now(), name, amount, type }, ...prev])
  }

  const deleteExpense = (id: number) => setExpenses(prev => prev.filter(e => e.id !== id))

  // ─── Web Speech API ─────────────────────────────────────────────────────
  const toggleRecording = () => {
    if (isRecording) { recognitionRef.current?.stop(); return }

    const API = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)
    if (!API) {
      setMessages(prev => [...prev, { role: 'ai', text: '❌ Brauzeringiz ovoz tanishni qo\'llab-quvvatlamaydi. Chrome yoki Telegram ilovasini ishlating.' }])
      return
    }

    const r = new API()
    r.lang = voiceLang
    r.continuous = false
    r.interimResults = true
    r.maxAlternatives = 1

    let finalText = ''

    r.onstart  = () => { setIsRecording(true); setInterimText('') }
    r.onresult = (e) => {
      finalText = ''
      let interim = ''
      for (let i = 0; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript
        else interim += e.results[i][0].transcript
      }
      setInterimText(finalText || interim)
    }
    r.onend   = () => { setIsRecording(false); setInterimText(''); if (finalText.trim()) sendToAI(finalText.trim()) }
    r.onerror = (e) => {
      setIsRecording(false); setInterimText('')
      const m: Record<string, string> = {
        'no-speech':    '🔇 Ovoz eshitilmadi. Qayta urinib ko\'ring.',
        'audio-capture':'🎤 Mikrofon topilmadi.',
        'not-allowed':  '🔒 Mikrofon ruxsati yo\'q. Brauzer sozlamalarini oching.',
        'network':      '🌐 Internet muammosi.',
      }
      const msg = m[e.error]
      if (msg) setMessages(prev => [...prev, { role: 'ai', text: msg }])
    }

    r.start()
    recognitionRef.current = r
  }

  // ─── Expense stats ───────────────────────────────────────────────────────
  const totalXarajat  = expenses.filter(e => e.type === 'XARAJAT').reduce((s,e) => s + e.amount, 0)
  const totalDaromat  = expenses.filter(e => e.type !== 'XARAJAT').reduce((s,e) => s + e.amount, 0)
  const balance       = totalDaromat - totalXarajat
  const filteredExp   = expenseFilter === 'ALL' ? expenses : expenses.filter(e => e.type === expenseFilter)

  return (
    <main className="relative flex flex-col h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden">
      {isLoading && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 bg-[length:200%] animate-[shimmer_1.5s_infinite] z-50" />}

      {/* ── IN-APP BROWSER ── */}
      {browserUrl && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-white">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#111114] border-b border-gray-800 shrink-0">
            <button onClick={() => setBrowserUrl(null)} className="p-2 rounded-full bg-[#1a1a1f] active:bg-[#333]">
              <X size={16} className="text-white" />
            </button>
            <div className="flex-1 flex items-center gap-2 bg-[#1a1a1f] rounded-full px-3 py-1.5 overflow-hidden">
              <Globe size={11} className="text-gray-400 shrink-0" />
              <span className="text-[11px] text-gray-300 truncate">{browserUrl}</span>
            </div>
            <button onClick={() => { setBrowserLoading(true); if (iframeRef.current) iframeRef.current.src = browserUrl }}
              className="p-2 rounded-full bg-[#1a1a1f] active:bg-[#333]">
              <RefreshCw size={13} className="text-gray-400" />
            </button>
          </div>
          {browserLoading && <div className="h-0.5 bg-blue-500 animate-pulse" />}
          <iframe ref={iframeRef} src={browserUrl} className="flex-1 w-full border-0"
            onLoad={() => setBrowserLoading(false)} onLoadStart={() => setBrowserLoading(true)}
            allow="camera; microphone; geolocation; payment"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
          />
        </div>
      )}

      {/* ── SIDEBAR TOGGLE ── */}
      {!isSidebarOpen && (
        <button onClick={() => setIsSidebarOpen(true)}
          className="absolute left-0 top-[60%] -translate-y-1/2 bg-[#1a1a1f]/90 backdrop-blur-md border border-l-0 border-gray-700/80 px-1 py-5 rounded-r-2xl flex flex-col items-center gap-1 z-20 shadow-[4px_0_15px_rgba(0,0,0,0.5)] active:scale-95 transition-transform">
          <div className="w-1 h-6 bg-blue-500 rounded-full shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }} className="text-[9px] text-gray-300 font-bold tracking-widest uppercase">Super App</span>
        </button>
      )}

      {/* ── SIDEBAR ── */}
      <div className={`fixed inset-y-0 left-0 w-[280px] bg-[#111114] z-50 transform transition-transform duration-300 flex flex-col border-r border-gray-800 shadow-2xl ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="p-5 border-b border-gray-800 flex items-center gap-3 bg-[#1a1a1f]">
          <div className="w-11 h-11 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-base font-bold">
            {userData?.first_name?.charAt(0) || 'A'}
          </div>
          <div>
            <p className="font-bold text-sm">{userData?.first_name || 'Abubakr'}</p>
            <p className="text-[10px] text-blue-400 font-semibold">JONKA Pro</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-4 px-3 flex flex-col gap-1.5">
          {[
            { icon: <Calculator size={16} className="text-green-400"/>, label: 'Moliya / Xarajat', action: () => { setIsSidebarOpen(false); setIsKitobOpen(true) } },
            { icon: <FileText size={16} className="text-gray-200"/>, label: 'Notion Baza', action: () => { setIsSidebarOpen(false); openApp('https://notion.so') } },
            { icon: <LayoutDashboard size={16} className="text-blue-400"/>, label: 'Barcha Ilovalar', action: () => { setIsSidebarOpen(false); setIsAppsOpen(true) } },
          ].map(item => (
            <button key={item.label} onClick={item.action} className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#1a1a1f] active:bg-[#242429] transition-colors">
              <div className="flex items-center gap-3">{item.icon}<span className="text-sm font-medium">{item.label}</span></div>
              <ChevronRight size={15} className="text-gray-600" />
            </button>
          ))}

          {/* Ovoz tili */}
          <div className="mt-4 px-1">
            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Ovoz tili</p>
            <div className="flex gap-2">
              {(['uz-UZ', 'ru-RU'] as const).map(lang => (
                <button key={lang} onClick={() => setVoiceLang(lang)}
                  className={`flex-1 py-2 rounded-xl text-xs font-bold transition-colors ${voiceLang === lang ? 'bg-blue-600 text-white' : 'bg-[#1a1a1f] text-gray-400'}`}>
                  {lang === 'uz-UZ' ? "🇺🇿 O'zbek" : '🇷🇺 Русский'}
                </button>
              ))}
            </div>
          </div>

          {/* AI buyruqlar yordam */}
          <div className="mt-4 px-1 py-3 bg-[#1a1a1f] rounded-xl border border-gray-800">
            <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider mb-2">💡 Buyruq misollari</p>
            {[
              '"Kafe da 45,000 xarajat"',
              '"Ertaga 14:00 uchrashuv"',
              '"Uzum och"',
              '"Xarajatlarimni ko\'rsat"',
              '"Python nima?"',
            ].map(cmd => (
              <button key={cmd} onClick={() => { setIsSidebarOpen(false); setInputText(cmd.replace(/"/g,'')) }}
                className="block w-full text-left text-[11px] text-gray-400 py-1 hover:text-blue-400 transition-colors">
                {cmd}
              </button>
            ))}
          </div>
        </div>
      </div>
      {isSidebarOpen && <div onClick={() => setIsSidebarOpen(false)} className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm" />}

      {/* ── HEADER ── */}
      <header className="flex justify-between items-center w-full px-4 py-3.5 bg-[#111114] border-b border-gray-800/50 shrink-0">
        <button onClick={() => setIsSidebarOpen(true)} className="w-8 h-8 rounded-full border border-gray-700 bg-[#242429] flex justify-center items-center active:bg-[#333]">
          <Menu size={15} className="text-gray-400" />
        </button>
        <div className="flex flex-col items-center">
          <span className="text-white font-bold text-sm">JONKA ✨</span>
          <div className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
            <span className="text-[9px] text-green-400">{voiceLang === 'uz-UZ' ? "O'zbek" : 'Русский'}</span>
          </div>
        </div>
        <button onClick={() => setIsKitobOpen(true)}>
          <Bookmark size={19} className="text-gray-400 active:text-white" />
        </button>
      </header>

      {/* ── QUICK LINKS ── */}
      <div className="w-full overflow-x-auto scrollbar-hide shrink-0 bg-[#111114] pb-2.5 pt-2">
        <div className="flex gap-2 px-4 w-max">
          {[
            { icon: <Grid size={13} className="text-blue-400"/>, label: 'Super App', action: () => setIsAppsOpen(true), border: 'border-blue-500/30' },
            { icon: <ShoppingBag size={13} className="text-purple-400"/>, label: 'Uzum', action: () => openApp('https://uzum.uz'), border: 'border-gray-700' },
            { icon: <Car size={13} className="text-yellow-400"/>, label: 'Taxi', action: () => openApp('https://go.yandex/'), border: 'border-gray-700' },
          ].map(item => (
            <button key={item.label} onClick={item.action} className={`bg-[#1a1a1f] border ${item.border} rounded-full px-3.5 py-2 flex items-center gap-2 active:scale-95 transition-transform`}>
              {item.icon}
              <span className="text-xs font-medium">{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ── CHAT ── */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 pb-[90px]">
        {messages.map((msg, idx) => (
          <div key={idx} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
            <div className="flex items-center gap-1 mb-1 opacity-40 px-1">
              {msg.role === 'user' ? <User size={9}/> : <Bot size={9}/>}
              <span className="text-[8px] uppercase font-bold tracking-wider">{msg.role === 'user' ? 'Siz' : 'JONKA'}</span>
            </div>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
              msg.role === 'user'
                ? 'bg-blue-600 text-white rounded-tr-sm'
                : 'bg-[#1a1a1f] text-gray-200 rounded-tl-sm border border-gray-800/80'
            }`}>
              {msg.role === 'ai' ? formatMessage(msg.text) : msg.text}
            </div>
          </div>
        ))}

        {isLoading && (
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1 mb-1 opacity-40 px-1">
              <Bot size={9}/><span className="text-[8px] uppercase font-bold tracking-wider">JONKA</span>
            </div>
            <div className="bg-[#1a1a1f] border border-gray-800/80 rounded-2xl rounded-tl-sm px-4 py-3.5 flex gap-1.5 items-end">
              {[0,150,300].map(d => (
                <span key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* ── INPUT ── */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-4 pt-2 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/95 to-transparent z-10">
        {isRecording && (
          <div className="flex items-center gap-2 mb-2 px-3.5 py-2 bg-red-500/10 border border-red-500/30 rounded-2xl">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0" />
            <span className="text-red-300 text-[13px] flex-1 truncate">
              {interimText || (voiceLang === 'uz-UZ' ? '🎙 Gapiring...' : '🎙 Говорите...')}
            </span>
            <span className="text-[10px] text-red-400 shrink-0">{voiceLang === 'uz-UZ' ? 'UZ' : 'RU'}</span>
          </div>
        )}

        <div className="flex items-end gap-2">
          <div className="flex-1 bg-[#1a1a1f] rounded-3xl flex items-center px-4 border border-gray-700/80 shadow-lg min-h-[52px]">
            <input
              type="text" value={inputText}
              onChange={e => setInputText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendToAI(inputText) } }}
              placeholder={isRecording ? '🎤 Tinglanyapti...' : 'JONKA ga yozing...'}
              style={{ fontSize: '16px' }}
              className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 py-3.5"
            />
          </div>
          {inputText.trim() ? (
            <button onClick={() => sendToAI(inputText)} disabled={isLoading}
              className="w-[52px] h-[52px] shrink-0 rounded-full bg-blue-600 shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40">
              <Send size={19} className="text-white ml-[-2px]" />
            </button>
          ) : (
            <button onClick={toggleRecording}
              className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all duration-200 ${
                isRecording ? 'bg-red-500 shadow-red-500/40 scale-110' : 'bg-[#1a1a1f] border border-gray-700/80 active:scale-90'
              }`}>
              {isRecording ? <MicOff size={20} className="text-white"/> : <Mic size={21} className="text-blue-400"/>}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════
          MOLIYA MODALI — chiroyli kategoriya
          ══════════════════════════════════ */}
      {isKitobOpen && (
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          {/* Header */}
          <header className="flex justify-between items-center px-4 py-4 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2">
              <Calculator size={18} className="text-green-400"/>Moliya va Xarajat
            </h2>
            <button onClick={() => setIsKitobOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={18}/></button>
          </header>

          {/* Stats cards */}
          <div className="px-4 pt-4 grid grid-cols-3 gap-2 shrink-0">
            <div className="bg-red-500/10 border border-red-500/20 rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1"><TrendingDown size={12} className="text-red-400"/><span className="text-[10px] text-red-400">Xarajat</span></div>
              <p className="text-sm font-bold text-red-400">{totalXarajat.toLocaleString()}</p>
              <p className="text-[9px] text-gray-500">UZS</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1"><TrendingUp size={12} className="text-green-400"/><span className="text-[10px] text-green-400">Daromat</span></div>
              <p className="text-sm font-bold text-green-400">{totalDaromat.toLocaleString()}</p>
              <p className="text-[9px] text-gray-500">UZS</p>
            </div>
            <div className={`${balance >= 0 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-orange-500/10 border-orange-500/20'} border rounded-2xl p-3 flex flex-col gap-1`}>
              <p className={`text-[10px] ${balance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>Balans</p>
              <p className={`text-sm font-bold ${balance >= 0 ? 'text-blue-400' : 'text-orange-400'}`}>{balance >= 0 ? '+' : ''}{balance.toLocaleString()}</p>
              <p className="text-[9px] text-gray-500">UZS</p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex gap-2 px-4 pt-3 shrink-0">
            {(['ALL', 'XARAJAT', 'DAROMAT'] as const).map(f => (
              <button key={f} onClick={() => setExpenseFilter(f)}
                className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-colors ${expenseFilter === f ? 'bg-blue-600 text-white' : 'bg-[#1a1a1f] text-gray-400'}`}>
                {f === 'ALL' ? 'Hammasi' : f === 'XARAJAT' ? '📉 Xarajat' : '📈 Daromat'}
              </button>
            ))}
          </div>

          {/* Expense list */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-2">
            {filteredExp.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center gap-3 opacity-40">
                <Calculator size={48} strokeWidth={1}/>
                <p className="text-sm">Hozircha bo'sh</p>
              </div>
            ) : filteredExp.map(exp => {
              const { icon, colorClass } = getCategoryStyle(exp.name)
              return (
                <div key={exp.id} className="flex items-center gap-3 bg-[#111114] border border-gray-800/60 rounded-2xl px-4 py-3.5">
                  {/* Icon */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl border ${colorClass} shrink-0`}>
                    {icon}
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{exp.name}</p>
                    <p className={`text-xs font-medium mt-0.5 ${exp.type === 'XARAJAT' ? 'text-red-400' : 'text-green-400'}`}>
                      {exp.type === 'XARAJAT' ? '−' : '+'}{exp.amount.toLocaleString()} UZS
                    </p>
                  </div>
                  {/* Badge + delete */}
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`px-2 py-0.5 rounded-lg text-[9px] font-bold border ${exp.type === 'XARAJAT' ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-green-500/10 border-green-500/30 text-green-400'}`}>
                      {exp.type}
                    </span>
                    <button onClick={() => deleteExpense(exp.id)} className="p-1.5 rounded-lg bg-[#1a1a1f] active:bg-[#242429]">
                      <Trash2 size={13} className="text-gray-500"/>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════
          SUPER APP
          ══════════════════════════════ */}
      {isAppsOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md">
          <div className="w-full max-h-[78%] bg-[#111114] rounded-t-[28px] p-5 relative border-t border-gray-800 animate-slide-up shadow-2xl overflow-y-auto">
            <button onClick={() => setIsAppsOpen(false)} className="absolute top-4 right-4 p-2 bg-[#1a1a1f] rounded-full"><X size={18}/></button>
            <h2 className="text-xl font-bold mb-5 mt-1">Xizmatlar</h2>

            {[
              { title: '🛍 Marketpleys', apps: [
                { icon: <ShoppingBag size={22} className="text-purple-500"/>, label: 'Uzum', url: 'https://uzum.uz', bg: 'bg-purple-600/15 border-purple-500/25' },
                { icon: <Coffee size={22} className="text-yellow-500"/>, label: 'Lavka', url: 'https://lavka.yandex.ru/', bg: 'bg-yellow-500/15 border-yellow-500/25' },
              ]},
              { title: '🚕 Transport', apps: [
                { icon: <Car size={22} className="text-yellow-400"/>, label: 'Yandex Go', url: 'https://go.yandex/', bg: 'bg-yellow-500/15 border-yellow-500/25' },
              ]},
              { title: '📝 Ish va Baza', apps: [
                { icon: <FileText size={22} className="text-white"/>, label: 'Notion', url: 'https://notion.so', bg: 'bg-gray-600/15 border-gray-500/25' },
                { icon: <PenTool size={22} className="text-pink-400"/>, label: 'Figma', url: 'https://figma.com', bg: 'bg-pink-600/15 border-pink-500/25' },
              ]},
            ].map(section => (
              <div key={section.title} className="mb-5">
                <p className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">{section.title}</p>
                <div className="grid grid-cols-4 gap-3">
                  {section.apps.map(app => (
                    <button key={app.label} onClick={() => { setIsAppsOpen(false); openApp(app.url) }}
                      className="flex flex-col items-center gap-2 active:scale-90 transition-transform">
                      <div className={`w-14 h-14 ${app.bg} border rounded-[18px] flex items-center justify-center`}>{app.icon}</div>
                      <span className="text-[11px] text-gray-300">{app.label}</span>
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
