'use client'
import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Mic, X, Send, User, Bot, MicOff, TrendingDown, TrendingUp,
  Trash2, Clock, Search, HandCoins, CheckSquare, Square, MessageCircle,
  StickyNote, CheckCircle2, Plus, Camera, Home as HomeIcon, BarChart2, ShoppingCart,
  MoreHorizontal, ChevronRight, Megaphone, LayoutDashboard, Car,
  ShoppingBag, Coffee, FileText, Calculator, Filter, Tag,
  LayoutGrid, ExternalLink, RefreshCw, Globe } from 'lucide-react'
import { catStyle, CATS, parseAllExpenses, parseUserDebt, parseBudgetCommand } from '../lib/expense-parser'

// ── Custom category type ──────────────────────────────────────────────────
interface CustomCat { id: number; icon: string; label: string; keywords: string[] }

// ── Donut chart ───────────────────────────────────────────────────────────
const DONUT_COLORS = ['#6366f1','#a855f7','#ec4899','#f97316','#10b981','#0ea5e9','#eab308','#f43f5e','#84cc16','#06b6d4']
function DonutChart({ data, totalX }: { data:{pct:number;name:string}[]; totalX:number }) {
  if (!data.length) return null
  const cx=75,cy=75,R=65,r=42; let angle=-90
  const segs = data.map((d,i)=>{
    const deg=Math.max((d.pct/100)*360,0.5)
    const s=angle*Math.PI/180; const e=(angle+deg)*Math.PI/180; angle+=deg
    const x1=cx+R*Math.cos(s),y1=cy+R*Math.sin(s); const x2=cx+R*Math.cos(e),y2=cy+R*Math.sin(e)
    const ix1=cx+r*Math.cos(s),iy1=cy+r*Math.sin(s); const ix2=cx+r*Math.cos(e),iy2=cy+r*Math.sin(e)
    const lg=deg>180?1:0
    return { d:`M${x1.toFixed(1)},${y1.toFixed(1)} A${R},${R} 0 ${lg},1 ${x2.toFixed(1)},${y2.toFixed(1)} L${ix2.toFixed(1)},${iy2.toFixed(1)} A${r},${r} 0 ${lg},0 ${ix1.toFixed(1)},${iy1.toFixed(1)}Z`, color:DONUT_COLORS[i%DONUT_COLORS.length] }
  })
  const lbl=totalX>=1e6?`${(totalX/1e6).toFixed(1)}M`:totalX>=1e3?`${Math.round(totalX/1e3)}k`:String(totalX)
  return (
    <svg width="150" height="150" viewBox="0 0 150 150" style={{flexShrink:0}}>
      {segs.map((s,i)=><path key={i} d={s.d} fill={s.color} stroke="#0a0a0c" strokeWidth="2.5"/>)}
      <circle cx={cx} cy={cy} r={r-1} fill="#111114"/>
      <text x={cx} y={cy-6} textAnchor="middle" fill="white" fontSize="13" fontWeight="700">{lbl}</text>
      <text x={cx} y={cy+9} textAnchor="middle" fill="#6b7280" fontSize="9">so&apos;m xarajat</text>
    </svg>
  )
}

const N8N_WEBHOOK_URL = '/api/chat'

const APP_URLS: Record<string, string> = {
  uzum: 'https://uzum.uz', yandex: 'https://go.yandex/', taxi: 'https://go.yandex/',
  lavka: 'https://lavka.yandex.ru/', notion: 'https://notion.so', figma: 'https://figma.com',
}
const OPEN_WORDS = ['och','open','откры','запус',"ko'r",'bor']
function detectApp(text: string): string | null {
  const l = text.toLowerCase()
  if (!OPEN_WORDS.some(w => l.includes(w))) return null
  for (const [k,v] of Object.entries(APP_URLS)) if (l.includes(k)) return v
  return null
}

const EXPENSE_KW = ['xarajat','rashod','moliya','pul','sarf','qancha','расход','деньги','финанс','баланс']
const SHOP_KW    = ["xaridlar","ro'yxat","список","покупк","bozor"]

interface Expense  { id: number; name: string; amount: number; type: string; date: string }
interface Debt     { id: number; person: string; amount: number; dir: 'gave'|'borrowed'; note: string; date: string; paid?: boolean }
interface Note     { id: number; title: string; content: string; date: string }
interface ShopItem { id: number; text: string; done: boolean }
interface ISpeechRecognition extends EventTarget {
  lang: string; continuous: boolean; interimResults: boolean; maxAlternatives: number
  start(): void; stop(): void
  onstart: (() => void) | null; onend: (() => void) | null
  onresult: ((e: { results: SpeechRecognitionResultList; resultIndex: number }) => void) | null
  onerror: ((e: { error: string }) => void) | null
}
declare global { interface Window { SpeechRecognition: new () => ISpeechRecognition; webkitSpeechRecognition: new () => ISpeechRecognition } }

function load<T>(key: string, def: T): T { try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : def } catch { return def } }
function save(key: string, val: unknown) { try { localStorage.setItem(key, JSON.stringify(val)) } catch {} }
const today = () => new Date().toLocaleDateString('uz-UZ')
const fmtMoney = (n: number) => n >= 1_000_000 ? `${(n/1_000_000).toFixed(1)}M` : n >= 1_000 ? `${Math.round(n/1_000)}k` : String(n)

function hasWholeWord(text: string, word: string): boolean {
  const isLetter = (c: string) => /[а-яёА-ЯЁa-zA-ZЎўҚқҒғҲҳ]/.test(c)
  let idx = 0
  while ((idx = text.indexOf(word, idx)) !== -1) {
    const b = idx > 0 ? text[idx-1] : ' '; const a = idx+word.length < text.length ? text[idx+word.length] : ' '
    if (!isLetter(b) && !isLetter(a)) return true
    idx += word.length
  }
  return false
}

type Tab = 'home' | 'chat' | 'debts' | 'more'

export default function Home() {
  const [userData,    setUserData]    = useState<{ id?: number; username?: string; first_name?: string }|null>(null)
  const [isLoading,   setIsLoading]   = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [voiceLang,   setVoiceLang]   = useState<'uz-UZ'|'ru-RU'>('ru-RU')
  const [inputText,   setInputText]   = useState('')
  const [voiceCountdown, setVoiceCountdown] = useState<number|null>(null)
  const [historyOpen,  setHistoryOpen]  = useState(false)
  const [searchHistory,setSearchHistory]= useState<string[]>(() => load('j_history', []))
  const [activeTab,    setActiveTab]    = useState<Tab>('home')

  // Modals
  const [notesOpen,    setNotesOpen]    = useState(false)
  const [shopOpen,     setShopOpen]     = useState(false)
  const [appsOpen,     setAppsOpen]     = useState(false)
  const [smmOpen,      setSmmOpen]      = useState(false)
  const [inBrowserUrl, setInBrowserUrl] = useState<string|null>(null)

  // Data
  const [messages,   setMessages]   = useState<{role:string;text:string}[]>([])
  const [expenses,   setExpenses]   = useState<Expense[]>(() => load('j_exp', []))
  const [debts,      setDebts]      = useState<Debt[]>(() => load('j_debt', []))
  const [notes,      setNotes]      = useState<Note[]>(() => load('j_notes', []))
  const [noteInput,  setNoteInput]  = useState({ title:'', content:'' })
  const [scanLoading,setScanLoading]= useState(false)
  const [shopItems,  setShopItems]  = useState<ShopItem[]>(() => load('j_shop', []))
  const [budget,     setBudget]     = useState<number>(() => load('j_budget', 0))
  const [budgetInput,setBudgetInput]= useState('')
  const [debtForm,   setDebtForm]   = useState({ person:'', amount:'', dir:'gave' as 'gave'|'borrowed', note:'' })
  const [shopInput,  setShopInput]  = useState('')
  const [catOpen,    setCatOpen]    = useState(false)
  const [customCats, setCustomCats] = useState<CustomCat[]>(() => load('j_cats', []))
  const [catInput,   setCatInput]   = useState({ icon: '💡', label: '', keywords: '' })
  const [catBudgets, setCatBudgets] = useState<Record<string,number>>(() => load('j_catbudgets', {}))
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [budgetForm, setBudgetForm] = useState({ category: '', amount: '' })

  // ── Cards ────────────────────────────────────────────────────────────────
  type CardTx = { id:number; name:string; amount:number; type:string; date:string; card?:string; bank?:string }
  type CardItem = { id:number; last4:string; expiry:string; holder:string; brand:string; verified:boolean; addedAt:string; color?:string; balance?:number; lastBalanceDate?:string }
  type CardStats = { monthSpent:number; monthIncome:number; txs:CardTx[] }
  const CARD_GRADIENTS = [
    { id:'blue',   cls:'from-blue-700 via-blue-600 to-indigo-500',      label:'Ko\'k'     },
    { id:'green',  cls:'from-emerald-700 via-green-600 to-teal-500',    label:'Yashil'   },
    { id:'purple', cls:'from-purple-800 via-violet-600 to-indigo-500',  label:'Binafsha' },
    { id:'gold',   cls:'from-yellow-700 via-amber-600 to-orange-500',   label:'Oltin'    },
    { id:'rose',   cls:'from-rose-700 via-pink-600 to-fuchsia-500',     label:'Qizil'    },
    { id:'dark',   cls:'from-gray-800 via-slate-700 to-gray-600',       label:'Qora'     },
    { id:'teal',   cls:'from-teal-700 via-cyan-600 to-blue-500',        label:'Moviy'    },
    { id:'sunset', cls:'from-orange-700 via-red-600 to-pink-500',       label:'Quyosh'   },
  ]
  const getCardGradient = (c: CardItem) => {
    const found = CARD_GRADIENTS.find(g => g.id === c.color)
    if (found) return found.cls
    return c.brand==='uzcard'?'from-blue-700 via-blue-600 to-indigo-500':c.brand==='humo'?'from-emerald-700 via-green-600 to-teal-500':c.brand==='visa'?'from-yellow-700 via-amber-600 to-orange-500':'from-rose-700 via-pink-600 to-fuchsia-500'
  }
  const [cardsOpen,      setCardsOpen]      = useState(false)
  const [cards,          setCards]          = useState<CardItem[]>([])
  const [cardsLoading,   setCardsLoading]   = useState(false)
  const [cardStats,      setCardStats]      = useState<Record<string,CardStats>>({})
  const [cardForm,       setCardForm]       = useState({ number:'', expiry:'', holder:'' })
  const [cardColorPick,  setCardColorPick]  = useState('blue')
  const [cardOtp,        setCardOtp]        = useState('')
  const [cardOtpToken,   setCardOtpToken]   = useState('')
  const [cardStep,       setCardStep]       = useState<'list'|'add'|'otp'|'shortcut'>('list')
  const [cardError,      setCardError]      = useState('')
  const [cardAdding,     setCardAdding]     = useState(false)
  const [cardActiveIdx,  setCardActiveIdx]  = useState(0)

  // Live preview helpers
  const liveNum = cardForm.number.replace(/\s/g,'')
  const liveBrand = liveNum.startsWith('8600')||liveNum.startsWith('9860')?'UZCARD':liveNum.startsWith('9000')?'HUMO':liveNum.startsWith('4')?'VISA':liveNum.startsWith('5')?'MC':'CARD'
  const liveGrad = CARD_GRADIENTS.find(g=>g.id===cardColorPick)?.cls || 'from-blue-700 via-blue-600 to-indigo-500'
  const previewNumber = (() => {
    const d = liveNum.padEnd(16,'•')
    return [d.slice(0,4),d.slice(4,8),d.slice(8,12),d.slice(12,16)].join(' ')
  })()

  // Card expiry check (is expiring within 60 days)
  const isExpiringSoon = (expiry: string) => {
    const [m,y] = expiry.split('/'); if(!m||!y) return false
    const exp = new Date(2000+parseInt(y), parseInt(m)-1, 28)
    const diff = (exp.getTime() - Date.now()) / (1000*60*60*24)
    return diff < 60
  }

  const loadCards = async () => {
    setCardsLoading(true)
    try {
      const d = await fetch('/api/cards?txs=1').then(r=>r.json())
      if (d.ok) { setCards(d.cards || []); setCardStats(d.stats || {}) }
    } catch {}
    setCardsLoading(false)
  }

  const addCard = async () => {
    setCardError(''); setCardAdding(true)
    try {
      const d = await fetch('/api/cards', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'add', ...cardForm, color: cardColorPick }) }).then(r=>r.json())
      if (d.ok) {
        if (d.otp_required) { setCardOtpToken(d.token); setCardStep('otp') }
        else { setCards(p=>[{...d.card, color:cardColorPick},...p]); setCardForm({number:'',expiry:'',holder:''}); setCardStep('list') }
      } else { setCardError(d.error||'Xato') }
    } catch { setCardError('Ulanishda xato') }
    setCardAdding(false)
  }

  const verifyCardOtp = async () => {
    setCardError(''); setCardAdding(true)
    try {
      const d = await fetch('/api/cards', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action:'verify', token:cardOtpToken, code:cardOtp }) }).then(r=>r.json())
      if (d.ok) { await loadCards(); setCardStep('list'); setCardForm({number:'',expiry:'',holder:''}); setCardOtp('') }
      else { setCardError(d.error||"Kod noto'g'ri") }
    } catch { setCardError('Xato') }
    setCardAdding(false)
  }

  const deleteCard = async (id: number) => {
    await fetch('/api/cards', { method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ action:'delete', id }) })
    setCards(p=>p.filter(c=>c.id!==id))
    setCardActiveIdx(0)
  }

  // ── Userbot / Contacts & Chats ──────────────────────────────────────────
  type TgContact = { id:string; name:string; firstName:string; lastName:string; username:string; phone:string; online:boolean; lastSeen?:string }
  type TgChat    = { id:string; title:string; type:'private'|'group'|'supergroup'|'channel'; username:string; unread:number; lastMsg:string; lastDate:string; pinned:boolean; membersCount?:number }
  const [contactsOpen,    setContactsOpen]    = useState(false)
  const [contacts,        setContacts]        = useState<TgContact[]>([])
  const [chats,           setChats]           = useState<TgChat[]>([])
  const [chatsLoading,    setChatsLoading]    = useState(false)
  const [contactsTab,     setContactsTab]     = useState<'contacts'|'chats'>('contacts')
  const [contactsLoading, setContactsLoading] = useState(false)
  const [contactsStep,    setContactsStep]    = useState<'check'|'phone'|'code'|'2fa'|'qr'|'done'>('check')
  const [contactsPhone,   setContactsPhone]   = useState('+998')
  const [contactsCode,    setContactsCode]    = useState('')
  const [contacts2fa,     setContacts2fa]     = useState('')
  const [contactsUser,    setContactsUser]    = useState<{name:string;username:string;phone:string}|null>(null)
  const [contactsError,   setContactsError]   = useState('')
  const [contactsSearch,  setContactsSearch]  = useState('')
  const [selContact,      setSelContact]      = useState<TgContact|null>(null)
  const [selChat,         setSelChat]         = useState<TgChat|null>(null)
  const [chatHistory,     setChatHistory]     = useState<{id:number;text:string;date:string;out:boolean;from:string|null}[]>([])
  const [chatHistoryLoad, setChatHistoryLoad] = useState(false)
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false) // true = loaded (hatto bo'sh bo'lsa ham)
  const chatHistoryEndRef = useRef<HTMLDivElement|null>(null)
  const [contactMsg,      setContactMsg]      = useState('')
  const [sendingMsg,      setSendingMsg]      = useState(false)
  // Kontakt qo'shish (telefon orqali)
  const [addContactOpen,  setAddContactOpen]  = useState(false)
  const [addContactPhone, setAddContactPhone] = useState('+998')
  const [addContactName,  setAddContactName]  = useState('')
  const [addContactRes,   setAddContactRes]   = useState<{id:string;name:string;username:string;phone:string}|null>(null)
  const [addContactErr,   setAddContactErr]   = useState('')
  const [addContactLoad,  setAddContactLoad]  = useState(false)
  // Ovoz xabar
  const [isVoiceRec,      setIsVoiceRec]      = useState(false)
  const [voiceSeconds,    setVoiceSeconds]    = useState(0)
  const chatVoiceTimerRef = useRef<ReturnType<typeof setInterval>|null>(null)
  const voiceBlobRef  = useRef<Blob|null>(null)
  const [qrUrl,           setQrUrl]           = useState('')
  const [qrToken,         setQrToken]         = useState('')
  const qrPollRef = useRef<ReturnType<typeof setInterval>|null>(null)

  const openContacts = async () => {
    setContactsOpen(true); setContactsLoading(true); setContactsError('')
    try {
      const d = await fetch('/api/userbot/auth').then(r=>r.json())
      if (d.connected) {
        setContactsStep('done'); setContactsUser(d.user)
        loadContacts(); loadChats()
      } else { setContactsStep('phone') }
    } catch { setContactsStep('phone') }
    setContactsLoading(false)
  }

  const loadContacts = async () => {
    setContactsLoading(true)
    try {
      const d = await fetch('/api/userbot/contacts').then(r=>r.json())
      if (d.ok) setContacts(d.contacts || [])
    } catch {}
    setContactsLoading(false)
  }

  const loadChats = async (refresh = false) => {
    setChatsLoading(true)
    try {
      const d = await fetch(`/api/userbot/chats${refresh?'?refresh=1':''}`).then(r=>r.json())
      if (d.ok) setChats(d.chats || [])
    } catch {}
    setChatsLoading(false)
  }

  const contactsAuth = async (action: string, payload: Record<string,string>) => {
    setContactsError(''); setContactsLoading(true)
    try {
      const d = await fetch('/api/userbot/auth', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ action, ...payload }) }).then(r=>r.json())
      if (d.ok) {
        if (d.step==='code') setContactsStep('code')
        else if (d.step==='2fa') setContactsStep('2fa')
        else if (d.step==='done') { setContactsStep('done'); openContacts() }
      } else setContactsError(d.error || 'Xato')
    } catch { setContactsError('Ulanishda xato') }
    setContactsLoading(false)
  }

  // Telefon raqam orqali kontakt qo'shish (Telegramga import)
  const importContact = async () => {
    const phone = addContactPhone.trim()
    if (!phone || phone === '+998') return
    setAddContactLoad(true); setAddContactErr(''); setAddContactRes(null)
    try {
      const d = await fetch('/api/userbot/contacts', {
        method: 'POST', headers: {'Content-Type':'application/json'},
        body: JSON.stringify({ phone, firstName: addContactName.trim() || phone }),
      }).then(r=>r.json())
      if (d.ok && d.contact) {
        setAddContactRes(d.contact)
        // Contacts listini yangilash
        loadContacts()
      } else {
        setAddContactErr(d.error || 'Topilmadi')
      }
    } catch { setAddContactErr('Ulanishda xato') }
    setAddContactLoad(false)
  }

  const openFoundContact = (u: {id:string;name:string;username:string;phone:string}) => {
    const contact: TgContact = { id:u.id, name:u.name, firstName:u.name.split(' ')[0]||'', lastName:u.name.split(' ').slice(1).join(' ')||'', username:u.username, phone:u.phone, online:false }
    setAddContactOpen(false); setAddContactPhone('+998'); setAddContactName(''); setAddContactRes(null)
    setSelContact(contact); setSelChat(null); setContactMsg('')
    loadChatHistory(contact, null)
  }

  // Ovoz yozish boshlash
  const startVoiceRecord = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mr = new MediaRecorder(stream, { mimeType: MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm' })
      mediaRecorderRef.current = mr
      audioChunksRef.current   = []
      mr.ondataavailable = e => { if (e.data.size>0) audioChunksRef.current.push(e.data) }
      mr.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/ogg' })
        voiceBlobRef.current = blob
        stream.getTracks().forEach(t=>t.stop())
      }
      mr.start(100)
      setIsVoiceRec(true); setVoiceSeconds(0)
      chatVoiceTimerRef.current = setInterval(()=>setVoiceSeconds(s=>s+1), 1000)
    } catch { setContactsError('Mikrofon ruxsati kerak') }
  }

  // Ovoz yozishni to'xtatib yuborish
  const stopAndSendVoice = async () => {
    if (!mediaRecorderRef.current) return
    mediaRecorderRef.current.stop()
    if (chatVoiceTimerRef.current) clearInterval(chatVoiceTimerRef.current)
    setIsVoiceRec(false)
    setSendingMsg(true)
    // MediaRecorder to'xtagunicha kutish
    await new Promise(r=>setTimeout(r,300))
    try {
      const blob = voiceBlobRef.current
      if (!blob) { setSendingMsg(false); return }

      const target   = selContact || selChat
      const form     = new FormData()
      form.append('audio', blob, 'voice.ogg')
      if (selContact) {
        form.append('target',     selContact.username || selContact.id)
        form.append('targetType', selContact.username ? 'username' : 'userId')
      } else if (selChat) {
        form.append('target',     selChat.id)
        form.append('targetType', 'chatId')
      }

      if (!target) { setSendingMsg(false); return }
      const d = await fetch('/api/userbot/messages', { method:'POST', body: form }).then(r=>r.json())
      if (d.ok) {
        const now = new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
        setChatHistory(p=>[...p,{id:Date.now(),text:'',date:now,out:true,from:null}])
        setTimeout(()=>chatHistoryEndRef.current?.scrollIntoView({behavior:'smooth'}),80)
      } else {
        setContactsError(d.error||'Yuborib bo\'lmadi')
      }
    } catch { setContactsError('Xato') }
    setSendingMsg(false); voiceBlobRef.current = null
  }

  // Ovoz yozishni bekor qilish
  const cancelVoice = () => {
    if (mediaRecorderRef.current) { try { mediaRecorderRef.current.stop() } catch {} }
    if (chatVoiceTimerRef.current) clearInterval(chatVoiceTimerRef.current)
    mediaRecorderRef.current?.stream?.getTracks().forEach((t: MediaStreamTrack)=>t.stop())
    setIsVoiceRec(false); setVoiceSeconds(0); voiceBlobRef.current = null
  }

  const loadChatHistory = async (contact: TgContact|null, chat: TgChat|null) => {
    setChatHistory([]); setChatHistoryLoad(true); setChatHistoryLoaded(false)
    try {
      const params = contact
        ? `userId=${contact.id}${contact.username?`&username=${contact.username}`:''}`
        : `chatId=${chat!.id}${chat!.username?`&username=${chat!.username}`:''}`
      const d = await fetch(`/api/userbot/messages?${params}&limit=40`).then(r=>r.json())
      if (d.ok) {
        setChatHistory((d.messages||[]).reverse())
        setTimeout(()=>chatHistoryEndRef.current?.scrollIntoView({behavior:'smooth'}),100)
      }
    } catch {}
    setChatHistoryLoad(false); setChatHistoryLoaded(true)
  }

  const sendContactMsg = async () => {
    const target = selContact || selChat
    if (!target || !contactMsg.trim()) return
    setSendingMsg(true)
    try {
      const payload = selContact
        ? { userId: selContact.id, username: selContact.username||undefined, message: contactMsg }
        : { chatId: selChat!.id, username: selChat!.username||undefined, message: contactMsg }
      const d = await fetch('/api/userbot/messages', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload) }).then(r=>r.json())
      if (d.ok) {
        setContactMsg('')
        // Yuborilgan xabarni darhol history ga qo'sh
        const now = new Date().toLocaleString('ru-RU',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'})
        setChatHistory(p=>[...p,{id:Date.now(),text:contactMsg,date:now,out:true,from:null}])
        setTimeout(()=>chatHistoryEndRef.current?.scrollIntoView({behavior:'smooth'}),80)
      }
      else {
        const err = d.error || 'Yuborib bo\'lmadi'
        if (err.includes('PEER_FLOOD')) {
          setContactsError('⚠️ Telegram spam himoyasi: bu kontaktga hozircha xabar yubora olmaysiz. Bir necha soat kuting yoki avval oddiy Telegramdan xabar yuboring.')
        } else if (err.includes('USER_PRIVACY_RESTRICTED')) {
          setContactsError('🔒 Bu foydalanuvchi xabarlarni qabul qilishni cheklagan.')
        } else {
          setContactsError(err)
        }
      }
    } catch { setContactsError('Xato') }
    setSendingMsg(false)
  }

  const startQrLogin = () => {
    setContactsError(''); setContactsLoading(true)
    if (qrPollRef.current) clearInterval(qrPollRef.current)

    const es = new EventSource('/api/userbot/qr/stream')

    es.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data)
        if (d.type === 'connected') { setContactsLoading(false) }
        if (d.type === 'qr') {
          setQrToken(d.token); setQrUrl(d.tgUrl)
          setContactsStep('qr'); setContactsLoading(false)
        }
        if (d.type === 'done') {
          es.close()
          setContactsStep('done')
          if (d.user) setContactsUser(d.user)
          loadContacts()
        }
        if (d.type === 'error') {
          es.close()
          setContactsError(d.error || 'Xato')
          setContactsLoading(false)
        }
      } catch {}
    }
    es.onerror = () => {
      es.close()
      setContactsLoading(false)
      setContactsError('Ulanishda xato. Qayta urinib ko\'ring.')
    }

    // Ref ga saqlaymiz — modal yopilganda to'xtatish uchun
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (qrPollRef as any).current = { close: () => es.close() }
  }

  const filteredContacts = contacts.filter(c => {
    const q = contactsSearch.toLowerCase()
    return !q || c.name.toLowerCase().includes(q) || c.username.toLowerCase().includes(q) || c.phone.includes(q)
  })

  const filteredChats = chats.filter(c => {
    const q = contactsSearch.toLowerCase()
    return !q || c.title.toLowerCase().includes(q) || c.username.toLowerCase().includes(q)
  })

  // ── Gmail panel ──────────────────────────────────────────────────────────
  type GMsg = {id:string;subject:string;fromName:string;date:string;snippet:string;unread:boolean}
  type GMsgFull = GMsg & {body:string;html:string}
  const [gmailOpen,    setGmailOpen]    = useState(false)
  const [gmailMsgs,    setGmailMsgs]    = useState<GMsg[]>([])
  const [gmailMsg,     setGmailMsg]     = useState<GMsgFull|null>(null)
  const [gmailLoading, setGmailLoading] = useState(false)
  const [gmailQ,       setGmailQ]       = useState('')
  const [gmailSetup,   setGmailSetup]   = useState(false)

  // ── Notion panel ──────────────────────────────────────────────────────────
  // ── Notion types ──────────────────────────────────────────────────────────
  type NSeg = {text:string; bold?:boolean; italic?:boolean; strikethrough?:boolean; underline?:boolean; code?:boolean; color?:string; href?:string}
  type DBCell  = {text:string; color?:string; kind:string}
  type DBRow   = {id:string; icon?:string; title:string; url:string; cells:Record<string,DBCell>}
  type DBCol   = {name:string; type:string}
  type NBlock = {
    type:string; text:string; segments:NSeg[];
    checked?:boolean; id:string; url?:string;
    icon?:string; color?:string; src?:string;
    rows?:string[][]; hasColumnHeader?:boolean;
    children?: NBlock[]
    dbColumns?: DBCol[]
    dbRows?:    DBRow[]
  }
  type NPage = {id:string; title:string; url:string; emoji?:string|null}

  const [notionOpen,   setNotionOpen]   = useState(false)
  const [notionPages,  setNotionPages]  = useState<{id:string;title:string;url:string;type:string;emoji?:string|null;last_edited?:string}[]>([])
  const [notionPage,   setNotionPage]   = useState<NPage|null>(null)
  const [notionCover,  setNotionCover]  = useState<string|null>(null)
  const [notionPageStack, setNotionPageStack] = useState<NPage[]>([])
  const [notionBlocks, setNotionBlocks] = useState<NBlock[]>([])
  const [notionProps,  setNotionProps]  = useState<{name:string;value:string;type:string}[]>([])
  const [notionLoading,setNotionLoading]= useState(false)
  const [notionAppend, setNotionAppend] = useState('')
  const [notionNewTitle,setNotionNewTitle]=useState('')
  const [notionCreating,setNotionCreating]=useState(false)
  const [notionSearchQ, setNotionSearchQ]=useState('')
  const [notionWatchRunning, setNotionWatchRunning] = useState(false)
  const [notionWatchResult, setNotionWatchResult]   = useState<string|null>(null)
  const [openToggles, setOpenToggles]   = useState<Set<string>>(new Set())

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const webAppRef        = useRef<any>(null)
  const recognitionRef   = useRef<ISpeechRecognition|null>(null)
  const mediaRecorderRef = useRef<MediaRecorder|null>(null)
  const audioChunksRef   = useRef<BlobPart[]>([])
  const receiptInputRef  = useRef<HTMLInputElement>(null)
  const chatEndRef       = useRef<HTMLDivElement>(null)
  const abortRef         = useRef<AbortController|null>(null)
  const voiceTimerRef    = useRef<ReturnType<typeof setInterval>|null>(null)
  const pendingVoiceRef  = useRef('')

  useEffect(() => { save('j_exp',     expenses)      }, [expenses])
  useEffect(() => { save('j_debt',    debts)         }, [debts])
  useEffect(() => { save('j_shop',    shopItems)     }, [shopItems])
  useEffect(() => { save('j_budget',  budget)        }, [budget])
  useEffect(() => { save('j_history', searchHistory) }, [searchHistory])
  useEffect(() => { save('j_notes',   notes)         }, [notes])
  useEffect(() => { save('j_cats',       customCats) }, [customCats])
  useEffect(() => { save('j_catbudgets', catBudgets) }, [catBudgets])
  useEffect(() => {
    fetch('/api/budgets').then(r=>r.json()).then(({ budgets }) => {
      if (budgets && Object.keys(budgets).length>0) setCatBudgets(prev=>({...budgets,...prev}))
    }).catch(()=>{})
    fetch('/api/cards').then(r=>r.json()).then(d=>{if(d.ok&&d.cards?.length>0)setCards(d.cards)}).catch(()=>{})
    fetch('/api/categories').then(r=>r.json()).then(({ categories }) => {
      if (!Array.isArray(categories)||categories.length===0) return
      setCustomCats(prev => { const ids=new Set(prev.map(c=>c.id)); const add=categories.filter((c:CustomCat)=>!ids.has(c.id)); return add.length>0?[...add,...prev]:prev })
    }).catch(()=>{})
  }, [])
  useEffect(() => { if (activeTab === 'chat') chatEndRef.current?.scrollIntoView({ behavior:'smooth' }) }, [messages, activeTab])

  // Server sync
  useEffect(() => {
    fetch('/api/expenses').then(r=>r.json()).then(({ expenses: srv }) => {
      if (!Array.isArray(srv)||srv.length===0) return
      setExpenses(prev => { const ids=new Set(prev.map((e:Expense)=>e.id)); const add=srv.filter((e:Expense)=>!ids.has(e.id)); return add.length>0?[...add,...prev]:prev })
    }).catch(()=>{})
    fetch('/api/debts').then(r=>r.json()).then(({ debts: srv }) => {
      if (!Array.isArray(srv)||srv.length===0) return
      setDebts(prev => { const ids=new Set(prev.map((d:Debt)=>d.id)); const add=srv.filter((d:Debt)=>!ids.has(d.id)); return add.length>0?[...add,...prev]:prev })
    }).catch(()=>{})
  }, [])

  useEffect(() => {
    if (typeof window==='undefined') return
    import('@twa-dev/sdk').then(m => {
      const W=m.default; W.ready(); W.expand()
      W.setHeaderColor('#0a0a0c'); W.setBackgroundColor('#0a0a0c')
      if (W.initDataUnsafe?.user) setUserData(W.initDataUnsafe.user)
      if (W.initDataUnsafe?.start_param==='debts') { setActiveTab('debts') }
      webAppRef.current = W
    })
  }, [])

  const openApp = (url: string, tg?: boolean, special?: string) => {
    if (special === 'notion') {
      setNotionOpen(true); loadNotionPages(); return
    }
    if (special === 'gmail') {
      setGmailOpen(true); loadGmail(); return
    }
    if (special === 'contacts') {
      openContacts(); return
    }
    if (tg) {
      try { webAppRef.current?.openTelegramLink?.(url) } catch { window.open(url,'_blank') }
    } else {
      setInBrowserUrl(url)
    }
  }

  const loadGmail = async (q = 'in:inbox') => {
    setGmailLoading(true)
    try {
      const res = await fetch(`/api/gmail?action=list&q=${encodeURIComponent(q)}`)
      const d   = await res.json()
      if (d.setup_required) { setGmailSetup(true); setGmailMsgs([]) }
      else if (d.ok) { setGmailSetup(false); setGmailMsgs(d.messages || []) }
    } catch {}
    setGmailLoading(false)
  }

  const openGmailMsg = async (id: string) => {
    setGmailLoading(true)
    try {
      const res = await fetch(`/api/gmail?action=read&id=${id}`)
      const d   = await res.json()
      if (d.ok) setGmailMsg(d.message)
    } catch {}
    setGmailLoading(false)
  }

  const loadNotionPages = async () => {
    setNotionLoading(true)
    try {
      const res = await fetch('/api/notion?action=list')
      const d   = await res.json()
      if (d.ok) setNotionPages(d.items || [])
      else setNotionPages([])
    } catch { setNotionPages([]) }
    setNotionLoading(false)
  }

  const openNotionPage = async (pg: NPage, pushStack=true) => {
    if (pushStack && notionPage) setNotionPageStack(s => [...s, notionPage])
    setNotionPage(pg); setNotionLoading(true); setNotionBlocks([]); setNotionProps([]); setNotionCover(null); setOpenToggles(new Set())
    try {
      const res = await fetch(`/api/notion?action=read_page&id=${pg.id}`)
      const d   = await res.json()
      if (d.ok) {
        setNotionBlocks(d.blocks || [])
        setNotionProps(d.props || [])
        if (d.emoji && !pg.emoji) setNotionPage(p => p ? {...p, emoji: d.emoji} : p)
        if (d.coverUrl) setNotionCover(d.coverUrl)
      }
    } catch {}
    setNotionLoading(false)
  }

  const runNotionWatch = async () => {
    setNotionWatchRunning(true)
    setNotionWatchResult(null)
    try {
      const d = await fetch('/api/cron/notion-watch').then(r => r.json())
      if (!d.ok) setNotionWatchResult(`⚠️ ${d.error || d.message}`)
      else if (d.changes === 0) setNotionWatchResult('✅ O\'zgarish topilmadi')
      else if (d.message) setNotionWatchResult(`✅ ${d.message}`)
      else setNotionWatchResult(`🔔 ${d.changes} ta o'zgarish yuborildi!`)
    } catch { setNotionWatchResult('⚠️ Ulanmadi') }
    setNotionWatchRunning(false)
  }

  const notionGoBack = () => {
    if (notionPageStack.length > 0) {
      const prev = notionPageStack[notionPageStack.length - 1]
      setNotionPageStack(s => s.slice(0, -1))
      openNotionPage(prev, false)
    } else {
      setNotionPage(null); setNotionBlocks([]); setNotionProps([]); setNotionCover(null); setOpenToggles(new Set())
    }
  }

  const appendToNotionPage = async () => {
    if (!notionPage || !notionAppend.trim()) return
    try {
      await fetch('/api/notion', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'append', data:{ page_id: notionPage.id, content: notionAppend.trim() } })
      })
      setNotionAppend('')
      openNotionPage(notionPage) // refresh
    } catch {}
  }

  const createNotionPage = async () => {
    if (!notionNewTitle.trim()) return
    setNotionCreating(true)
    try {
      const res = await fetch('/api/notion', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ type:'create_page', data:{ title: notionNewTitle.trim(), emoji:'📄' } })
      })
      const d = await res.json()
      if (d.ok) { setNotionNewTitle(''); loadNotionPages() }
    } catch {}
    setNotionCreating(false)
  }

  const filteredNotionPages = notionSearchQ
    ? notionPages.filter(p => p.title.toLowerCase().includes(notionSearchQ.toLowerCase()))
    : notionPages

  const fmt = (text: string) => text.split(/\\n|\n/).map((line,i,a) => (
    <span key={i}>
      {line.split(/(\*\*.*?\*\*)/g).map((p,j) => p.startsWith('**')&&p.endsWith('**') ? <strong key={j} className="text-white font-bold">{p.slice(2,-2)}</strong> : p)}
      {i<a.length-1&&<br/>}
    </span>
  ))

  const syncNotion = async (type: string, data: object) => {
    try { await fetch('/api/notion', { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({type,data}) }) } catch {}
  }

  // ─── Stats ────────────────────────────────────────────────────────────────
  const totalX   = expenses.filter(e=>e.type==='XARAJAT').reduce((s,e)=>s+e.amount,0)
  const totalD   = expenses.filter(e=>e.type!=='XARAJAT').reduce((s,e)=>s+e.amount,0)
  const balance  = totalD - totalX
  const netDebt  = debts.filter(d=>!d.paid).reduce((s,d)=>d.dir==='gave'?s+d.amount:s-d.amount,0)
  const budgetUsed = budget>0 ? Math.min(100,Math.round(totalX/budget*100)) : 0

  const catStats = useMemo(() => {
    const xExp  = expenses.filter(e=>e.type==='XARAJAT')
    const total = xExp.reduce((s,e)=>s+e.amount,0)
    const map: Record<string,number> = {}
    // Har bir xarajat nomini standart kategoriyaga normalize qilamiz:
    // "Меню Сохрабак" → catStyle → label:"Ovqat" (меню keyword bor)
    // "Такси" → "Transport"; "Сохромаке" (unknown) → "Boshqa"
    xExp.forEach(e => {
      const normalized = catStyle(e.name).label
      map[normalized] = (map[normalized]||0) + e.amount
    })
    return Object.entries(map).sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([name,amount])=>({ name, amount, pct: total ? Math.round(amount/total*100) : 0 }))
  }, [expenses])

  // Group expenses by date
  const expByDate = useMemo(() => {
    const groups: Record<string,Expense[]> = {}
    expenses.slice(0, 30).forEach(e => {
      const d = e.date || today()
      if (!groups[d]) groups[d] = []
      groups[d].push(e)
    })
    return Object.entries(groups).slice(0, 7)
  }, [expenses])

  // ─── Data helpers ─────────────────────────────────────────────────────────
  const addExpense = (name: string, amount: number, type: string) => {
    if (amount<500) return
    const newExp = { id:Date.now(), name, amount, type, date:today() }
    setExpenses(p=>[newExp,...p])
    fetch('/api/expenses',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({expenses:[newExp]}) }).catch(()=>{})
    syncNotion('expense', newExp)
  }
  const addDebt = (person:string,amount:number,dir:'gave'|'borrowed',note:string) => {
    if (!person||amount<100) return
    const newDebt = { id:Date.now(), person, amount, dir, note, date:today() }
    setDebts(p=>[newDebt,...p])
    fetch('/api/debts',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({debts:[newDebt]})}).catch(()=>{})
    syncNotion('debt', newDebt)
  }
  const addShop = (text:string) => { if(!text.trim()) return; setShopItems(p=>[...p,{id:Date.now(),text:text.trim(),done:false}]) }
  const addToHistory = (t:string) => { const s=t.trim(); if(!s||s.length<3) return; setSearchHistory(p=>[s,...p.filter(h=>h!==s)].slice(0,30)) }

  // catStyle + custom categories
  const getCatStyle = (name: string) => {
    const lower = name.toLowerCase()
    for (const c of customCats) {
      if ((c.keywords||[]).some(k => lower.includes(k.toLowerCase())))
        return { icon: c.icon, cls: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300', label: c.label }
    }
    return catStyle(name)
  }
  const addCustomCat = async (cat: Omit<CustomCat,'id'>) => {
    const res = await fetch('/api/categories',{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(cat) })
    const d = await res.json()
    if (d.ok) setCustomCats(p=>[d.category,...p])
  }
  const removeCustomCat = async (id: number) => {
    setCustomCats(p=>p.filter(c=>c.id!==id))
    await fetch('/api/categories',{ method:'DELETE', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id}) }).catch(()=>{})
  }

  // ─── AI call ──────────────────────────────────────────────────────────────
  const sendToAI = async (text: string, skipLocalParse = false) => {
    if (!text.trim()||isLoading) return
    setInputText(''); setInterimText(''); setHistoryOpen(false)
    addToHistory(text)
    const lower = text.toLowerCase()

    const url = detectApp(text); if(url) openApp(url)

    if (!skipLocalParse) {
      // ── Byudjet/limit buyrug'i ────────────────────────────────────────
      const budgetCmd = parseBudgetCommand(text)
      if (budgetCmd) {
        setCatBudgets(p=>({...p,[budgetCmd.category]:budgetCmd.amount}))
        fetch('/api/budgets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:budgetCmd.category,amount:budgetCmd.amount})}).catch(()=>{})
        setMessages(p=>[...p,{role:'user',text},{role:'ai',text:`✅ **Limit belgilandi!**\n\n📂 **${budgetCmd.category}**\n💰 ${budgetCmd.amount.toLocaleString()} so'm / oy\n\n💡 Bu kategoriya ${budgetCmd.amount.toLocaleString()} so'mdan oshganda ogohlantiraman!`}])
        setBudgetOpen(false)
        return
      }

      const exps = parseAllExpenses(text)
      if (exps.length>0) {
        exps.forEach(e=>addExpense(e.name,e.amount,e.type))
        const lines = exps.map(e=>`${e.type==='XARAJAT'?'📉':'📈'} **${e.name}** — ${e.amount.toLocaleString()} so'm`).join('\n')
        setMessages(p=>[...p,{role:'user',text},{role:'ai',text:`✅ **${exps.length>1?`${exps.length} ta xarajat`:exps[0].type==='XARAJAT'?'Xarajat':'Daromat'} qo\'shildi!**\n\n${lines}\n📅 ${today()}`}])
        return
      }
      const debt = parseUserDebt(text)
      if (debt) {
        addDebt(debt.person,debt.amount,debt.dir,'')
        setMessages(p=>[...p,{role:'user',text},{role:'ai',text:`✅ **Qarz qo\'shildi!**\n\n👤 **${debt.person}**\n💰 ${debt.amount.toLocaleString()} so'm\n${debt.dir==='gave'?'📤 Men berdim':'📥 Men oldim'}\n📅 ${today()}`}])
        return
      }
      const debtPhrase = (hasWholeWord(lower,'berdim')||hasWholeWord(lower,'oldim')||hasWholeWord(lower,'qarz')||hasWholeWord(lower,'взял')||hasWholeWord(lower,'занял'))
        && !/(?:xarajat|sotib|купил|потрат|расход)/i.test(lower)
      if (debtPhrase) {
        setMessages(p=>[...p,{role:'user',text},{role:'ai',text:"🤝 **Qarz yozish**\n\nTo'liqroq kiriting:\n_\"Suxrob akaga 200 ming berdim\"_"}])
        setActiveTab('debts')
        return
      }
    }

    if (EXPENSE_KW.some(w=>lower.includes(w))) setActiveTab('home')
    if (SHOP_KW.some(w=>lower.includes(w))) setTimeout(()=>setShopOpen(true),1200)

    setMessages(p=>[...p,{role:'user',text}])
    setIsLoading(true)
    abortRef.current?.abort()
    abortRef.current = new AbortController()
    const timer = setTimeout(()=>abortRef.current?.abort(),20000)
    try {
      const res = await fetch(N8N_WEBHOOK_URL,{
        method:'POST', signal:abortRef.current.signal,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:text, user_id:userData?.id||0, username:userData?.username||userData?.first_name||'User'}),
      })
      clearTimeout(timer)
      if (!res.ok) throw new Error(`Xato: ${res.status}`)
      const data = await res.json()
      let reply: string = data?.reply||data?.response||data?.text||data?.message||data?.output||''
      if (reply) {
        const em = reply.match(/\[EXPENSE:(.*?)\|(.*?)\|(.*?)\]/i)
        if (em) { addExpense(em[1].trim(),parseInt(em[2].replace(/\D/g,''))||0,em[3].trim().toUpperCase()); reply=reply.replace(/\[EXPENSE:.*?\]/gi,'').trim() }
        setMessages(p=>[...p,{role:'ai',text:reply}])
      } else {
        setMessages(p=>[...p,{role:'ai',text:'✅ Qabul qilindi!'}])
      }
    } catch(err) {
      clearTimeout(timer)
      if (err instanceof Error&&err.name==='AbortError') setMessages(p=>[...p,{role:'ai',text:"⏱ Vaqt tugadi."}])
      else setMessages(p=>[...p,{role:'ai',text:`❌ ${err instanceof Error?err.message:'Xato'}`}])
    } finally { setIsLoading(false) }
  }

  // ─── Receipt scanner ──────────────────────────────────────────────────────
  const analyzeReceipt = async (file: File) => {
    setScanLoading(true)
    setMessages(p=>[...p,{role:'user',text:'📷 Chek rasmini yukladim'},{role:'ai',text:'🔍 Chek tahlil qilinmoqda...'}])
    try {
      const fd = new FormData(); fd.append('image',file)
      const res=await fetch('/api/analyze-receipt',{method:'POST',body:fd})
      const data=await res.json()
      if (data.items?.length>0) {
        const valid=data.items.filter((i:{name:string;amount:number})=>i.amount>=500)
        valid.forEach((i:{name:string;amount:number})=>addExpense(i.name,i.amount,'XARAJAT'))
        const lines=valid.map((i:{name:string;amount:number})=>`💸 ${i.name} — ${i.amount.toLocaleString()} so'm`).join('\n')
        const total=data.total||valid.reduce((s:number,i:{amount:number})=>s+i.amount,0)
        setMessages(p=>p.map((m,i)=>i===p.length-1?{role:'ai',text:`🧾 **Chek tahlil!**\n\n${lines}\n\n💰 **Jami: ${total.toLocaleString()} so'm**\n✅ ${valid.length} ta qo'shildi`}:m))
      } else {
        setMessages(p=>p.map((m,i)=>i===p.length-1?{role:'ai',text:"❌ Chekdan ma'lumot ajratib bo'lmadi."}:m))
      }
    } catch { setMessages(p=>p.map((m,i)=>i===p.length-1?{role:'ai',text:'❌ Xato. Qayta urinib ko\'ring.'}:m)) }
    finally { setScanLoading(false) }
  }

  // ─── Voice ────────────────────────────────────────────────────────────────
  const cancelVoiceSend = () => { if(voiceTimerRef.current) clearInterval(voiceTimerRef.current); voiceTimerRef.current=null; setVoiceCountdown(null); pendingVoiceRef.current='' }
  const finishVoice = (text: string) => {
    setIsRecording(false); setInterimText('')
    if (!text.trim()) return
    setInputText(text.trim()); pendingVoiceRef.current=text.trim()
    let count=2; setVoiceCountdown(count)
    voiceTimerRef.current=setInterval(()=>{ count--; if(count<=0){ clearInterval(voiceTimerRef.current!); voiceTimerRef.current=null; setVoiceCountdown(null); const p=pendingVoiceRef.current; if(p){pendingVoiceRef.current='';setInputText('');sendToAI(p)} } else setVoiceCountdown(count) },1000)
  }
  const stopMediaRecorder = () => { if(mediaRecorderRef.current&&mediaRecorderRef.current.state!=='inactive') mediaRecorderRef.current.stop() }
  const startMediaRecorderFn = async (existingStream?: MediaStream) => {
    let stream=existingStream
    if(!stream) { try { stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true}}) } catch { setMessages(p=>[...p,{role:'ai',text:"🔒 Mikrofon ruxsati yo'q."}]); return } }
    const mimeType=MediaRecorder.isTypeSupported('audio/webm;codecs=opus')?'audio/webm;codecs=opus':MediaRecorder.isTypeSupported('audio/webm')?'audio/webm':'audio/ogg;codecs=opus'
    let recorder: MediaRecorder
    try { recorder=new MediaRecorder(stream,{mimeType,audioBitsPerSecond:32000}) } catch { stream.getTracks().forEach(t=>t.stop()); setMessages(p=>[...p,{role:'ai',text:"❌ Audio yozib bo'lmadi."}]); return }
    audioChunksRef.current=[]
    recorder.ondataavailable=(e)=>{ if(e.data.size>0) audioChunksRef.current.push(e.data) }
    recorder.onstop=async()=>{
      stream!.getTracks().forEach(t=>t.stop())
      const blob=new Blob(audioChunksRef.current,{type:mimeType}); audioChunksRef.current=[]
      if(blob.size<1000){setIsRecording(false);setInterimText('');return}
      setInterimText('🔄 Ovoz matnga aylantirilmoqda...')
      try {
        const fd=new FormData(); fd.append('audio',blob,'audio.webm'); fd.append('language',voiceLang==='ru-RU'?'ru':'uz')
        const res=await fetch('/api/transcribe',{method:'POST',body:fd}); const data=await res.json(); finishVoice(data.text||'')
      } catch { setIsRecording(false);setInterimText('');setMessages(p=>[...p,{role:'ai',text:"❌ Ovozni matnga aylantirishda xato."}]) }
    }
    try { recorder.start(); mediaRecorderRef.current=recorder; setIsRecording(true); setInterimText('🎙 Gapiring...') }
    catch { stream.getTracks().forEach(t=>t.stop()); setIsRecording(false); setInterimText('') }
  }
  const toggleRec = async () => {
    if(isRecording){recognitionRef.current?.stop();stopMediaRecorder();return}
    cancelVoiceSend()
    let stream: MediaStream
    try { stream=await navigator.mediaDevices.getUserMedia({audio:true}) }
    catch { setMessages(p=>[...p,{role:'ai',text:"🔒 **Mikrofon ruxsati yo'q**\n\n📱 Sozlamalar → Telegram → Mikrofon"}]); return }
    const SpeechAPI=typeof window!=='undefined'&&(window.SpeechRecognition||window.webkitSpeechRecognition)
    if(SpeechAPI){
      stream.getTracks().forEach(t=>t.stop())
      let r: ISpeechRecognition
      try { r=new SpeechAPI() } catch { await startMediaRecorderFn(); return }
      r.lang=voiceLang; r.continuous=false; r.interimResults=true; r.maxAlternatives=1
      let fin=''
      r.onresult=(e)=>{ fin=''; let interim=''; for(let i=0;i<e.results.length;i++){ if(e.results[i].isFinal) fin+=e.results[i][0].transcript; else interim+=e.results[i][0].transcript } setInterimText(fin||interim) }
      r.onend=()=>finishVoice(fin)
      r.onerror=async(e)=>{ setIsRecording(false);setInterimText(''); if(e.error==='service-not-allowed'||e.error==='not-allowed'){await startMediaRecorderFn();return} if(e.error==='no-speech') setMessages(p=>[...p,{role:'ai',text:"🔇 Ovoz eshitilmadi."}]) }
      try { r.start();setIsRecording(true);setInterimText('');recognitionRef.current=r } catch { setIsRecording(false);await startMediaRecorderFn() }
    } else { await startMediaRecorderFn(stream) }
  }

  // ─── Input Bar ────────────────────────────────────────────────────────────
  const InputBar = () => (
    <div className="shrink-0 px-3 pb-[72px] pt-2 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/95 to-transparent">
      {isRecording && <div className="flex items-center gap-2 mb-2 px-3.5 py-2 bg-red-500/10 border border-red-500/30 rounded-2xl"><span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /><span className="text-red-300 text-[13px] flex-1 truncate">{interimText||'🎙 Gapiring...'}</span></div>}
      {voiceCountdown!==null && <div className="flex items-center gap-2 mb-2 px-3.5 py-2 bg-blue-500/10 border border-blue-500/30 rounded-2xl"><span className="text-blue-300 text-[12px] flex-1">📤 {voiceCountdown}s da yuboriladi...</span><button onClick={cancelVoiceSend} className="text-[11px] text-red-400 font-bold px-2 py-0.5 bg-red-500/10 rounded-full">Bekor</button></div>}
      <div className="flex items-end gap-2">
        <button onClick={()=>receiptInputRef.current?.click()} disabled={scanLoading||isLoading} className="w-[52px] h-[52px] shrink-0 rounded-full bg-[#1a1a1f] border border-gray-700/80 flex items-center justify-center active:scale-90 disabled:opacity-40">
          {scanLoading ? <span className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" /> : <Camera size={19} className="text-amber-400" />}
        </button>
        <input ref={receiptInputRef} type="file" accept="image/*" className="hidden" onChange={e=>{const f=e.target.files?.[0];if(f){analyzeReceipt(f);e.target.value=''}}} />
        <div className="flex-1 bg-[#1a1a1f] rounded-3xl flex items-center px-4 border border-gray-700/80 min-h-[52px] relative">
          {!inputText&&searchHistory.length>0 && <button onMouseDown={e=>{e.preventDefault();setHistoryOpen(p=>!p)}} className="shrink-0 p-1 mr-2"><Clock size={14} className="text-gray-500" /></button>}
          <input type="text" value={inputText}
            onChange={e=>{setInputText(e.target.value);if(voiceCountdown!==null)cancelVoiceSend()}}
            onFocus={()=>{if(!inputText&&searchHistory.length>0)setHistoryOpen(true)}}
            onBlur={()=>setTimeout(()=>setHistoryOpen(false),150)}
            onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();cancelVoiceSend();sendToAI(inputText)} if(e.key==='Escape')setHistoryOpen(false) }}
            placeholder={isRecording?'🎤 Tinglanyapti...':'JONKA ga yozing...'}
            style={{fontSize:'16px'}} className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 py-3.5" />
        </div>
        {inputText.trim()
          ? <button onClick={()=>{cancelVoiceSend();sendToAI(inputText)}} disabled={isLoading} className="w-[52px] h-[52px] shrink-0 rounded-full bg-blue-600 shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-90 disabled:opacity-40"><Send size={19} className="text-white" /></button>
          : <div className="flex flex-col items-center gap-1">
              <button onClick={toggleRec} className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center transition-all ${isRecording?'bg-red-500 scale-110':'bg-[#1a1a1f] border border-gray-700/80 active:scale-90'}`}>{isRecording?<MicOff size={20} className="text-white"/>:<Mic size={21} className="text-blue-400"/>}</button>
              <button onClick={()=>setVoiceLang(l=>l==='uz-UZ'?'ru-RU':'uz-UZ')} className="text-[13px] leading-none">{voiceLang==='uz-UZ'?'🇺🇿':'🇷🇺'}</button>
            </div>
        }
      </div>
      {/* History panel */}
      {historyOpen&&searchHistory.length>0 && (
        <div className="absolute bottom-[80px] left-3 right-3 bg-[#111114] border border-gray-800/80 rounded-2xl overflow-hidden shadow-2xl z-20">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-800/60">
            <div className="flex items-center gap-2"><Clock size={12} className="text-gray-500" /><span className="text-[11px] text-gray-400 font-semibold">So'nggi qidiruvlar</span></div>
            <button onClick={()=>{setSearchHistory([]);setHistoryOpen(false)}} className="text-[10px] text-red-400 px-2 py-0.5 bg-red-500/10 rounded-full">Tozalash</button>
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {searchHistory.map((h,i)=>(
              <button key={i} onClick={()=>{setInputText(h);setHistoryOpen(false)}} className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-[#1a1a1f] text-left group">
                <Search size={12} className="text-gray-600 shrink-0" /><span className="text-[13px] text-gray-300 truncate flex-1">{h}</span>
                <button onClick={e=>{e.stopPropagation();setSearchHistory(p=>p.filter((_,j)=>j!==i))}} className="opacity-0 group-hover:opacity-100 p-1 rounded-lg"><X size={10} className="text-gray-500" /></button>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )

  return (
    <main className="relative flex flex-col h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden">
      {isLoading && <div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 animate-pulse z-50" />}

      {/* ══ HEADER ══ */}
      <header className="flex justify-between items-center w-full px-4 py-3 bg-[#0a0a0c] border-b border-gray-800/50 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-sm font-bold">{userData?.first_name?.charAt(0)||'J'}</div>
          <div><p className="text-sm font-bold leading-none">{userData?.first_name||'JONKA'}</p><p className="text-[9px] text-blue-400">Pro · Online</p></div>
        </div>
        <div className="text-center"><span className="text-sm font-bold">JONKA ✨</span></div>
        <div className="flex gap-2">
          <button onClick={()=>setSmmOpen(true)} className="w-8 h-8 rounded-full border border-pink-500/40 bg-pink-500/10 flex items-center justify-center"><Megaphone size={14} className="text-pink-400" /></button>
        </div>
      </header>

      {/* ══ TAB CONTENT ══ */}
      <div className="flex-1 overflow-hidden relative">

        {/* ── HOME / DASHBOARD ── */}
        {activeTab==='home' && (
          <div className="h-full overflow-y-auto pb-[140px]">
            {/* Balance Card */}
            <div className="mx-4 mt-4">
              <div className={`rounded-3xl p-5 ${balance>=0?'bg-gradient-to-br from-green-900/40 to-[#111114] border border-green-500/20':'bg-gradient-to-br from-red-900/30 to-[#111114] border border-red-500/20'}`}>
                <p className="text-[11px] text-gray-400 mb-1">Umumiy balans</p>
                <p className={`text-4xl font-bold tracking-tight ${balance>=0?'text-green-400':'text-red-400'}`}>
                  {balance>=0?'+':''}{fmtMoney(Math.abs(balance))} <span className="text-lg font-normal opacity-70">so'm</span>
                </p>
                <div className="flex gap-4 mt-3">
                  <div><p className="text-[10px] text-green-400 flex items-center gap-1"><TrendingUp size={10}/>Daromat</p><p className="text-sm font-bold text-green-400">{fmtMoney(totalD)} so'm</p></div>
                  <div className="w-px bg-gray-700" />
                  <div><p className="text-[10px] text-red-400 flex items-center gap-1"><TrendingDown size={10}/>Xarajat</p><p className="text-sm font-bold text-red-400">{fmtMoney(totalX)} so'm</p></div>
                  {netDebt!==0 && <><div className="w-px bg-gray-700" /><div><p className="text-[10px] text-yellow-400 flex items-center gap-1"><HandCoins size={10}/>Qarz</p><p className="text-sm font-bold text-yellow-400">{fmtMoney(Math.abs(netDebt))} so'm</p></div></>}
                </div>
              </div>
            </div>

            {/* Budget bar */}
            {budget>0 && (
              <div className="mx-4 mt-3 bg-[#111114] border border-gray-800/60 rounded-2xl p-3">
                <div className="flex justify-between text-[10px] mb-1.5">
                  <span className="text-gray-400">Byudjet: {fmtMoney(budget)} so'm</span>
                  <span className={budgetUsed>80?'text-red-400':'text-gray-400'}>{budgetUsed}%</span>
                </div>
                <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all ${budgetUsed>80?'bg-red-500':budgetUsed>50?'bg-yellow-500':'bg-green-500'}`} style={{width:`${budgetUsed}%`}} />
                </div>
              </div>
            )}

            {/* Card mini-widget (only if cards loaded) */}
            {cards.length > 0 && (
              <div className="mx-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">💳 Kartalarim</p>
                  <button onClick={()=>{setCardsOpen(true);loadCards()}} className="text-[10px] text-blue-400">Barchasi →</button>
                </div>
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {cards.map(c=>(
                    <button key={c.id} onClick={()=>{setCardsOpen(true);loadCards()}}
                      className={`shrink-0 flex items-center gap-2.5 bg-gradient-to-r ${getCardGradient(c)} px-3 py-2.5 rounded-2xl active:scale-95 transition-transform`}>
                      <div className="w-7 h-5 bg-white/20 rounded-md flex items-center justify-center shrink-0">
                        <div className="w-4 h-3 border border-white/30 rounded-sm grid grid-cols-2 gap-px p-px">
                          <div className="bg-white/20"/><div className="bg-white/20"/>
                          <div className="bg-white/20"/><div className="bg-white/20"/>
                        </div>
                      </div>
                      <div>
                        <p className="text-[11px] font-mono text-white leading-none">••{c.last4}</p>
                        <p className="text-[9px] text-white/50 mt-0.5">{c.brand?.toUpperCase()||'CARD'}</p>
                      </div>
                    </button>
                  ))}
                  <button onClick={()=>{setCardsOpen(true);setCardStep('add');loadCards()}}
                    className="shrink-0 flex items-center gap-1 px-3 py-2.5 bg-[#1a1a1f] border border-dashed border-gray-700 rounded-2xl text-gray-500 text-xs active:scale-95">
                    <span className="text-base">+</span>
                  </button>
                </div>
              </div>
            )}

            {/* Budget set */}
            {budget===0 && (
              <div className="mx-4 mt-3 flex gap-2">
                <input value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} placeholder="Oylik byudjet belgilang..." className="flex-1 bg-[#111114] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}} />
                <button onClick={()=>{const v=parseInt(budgetInput.replace(/\D/g,''));if(v>0){setBudget(v);setBudgetInput('')}}} className="px-4 py-2 bg-blue-600/80 rounded-xl text-sm font-bold">Set</button>
              </div>
            )}

            {/* Category breakdown + Donut chart */}
            {catStats.length>0 && (
              <div className="mx-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Statistika</p>
                  <div className="flex gap-2">
                    <button onClick={()=>setBudgetOpen(true)} className="flex items-center gap-1 text-[10px] text-green-400 px-2.5 py-1 bg-green-500/10 rounded-full border border-green-500/20 active:scale-95">
                      📊 Limit
                    </button>
                    <button onClick={()=>setCatOpen(true)} className="flex items-center gap-1 text-[10px] text-blue-400 px-2.5 py-1 bg-blue-500/10 rounded-full border border-blue-500/20 active:scale-95">
                      <Filter size={9}/> Kat.
                    </button>
                  </div>
                </div>
                {/* Donut chart card */}
                <div className="bg-[#111114] border border-gray-800/60 rounded-2xl p-4 mb-3 flex items-center gap-4">
                  <DonutChart data={catStats} totalX={totalX}/>
                  <div className="flex-1 min-w-0 space-y-2.5">
                    {catStats.map((cat,i)=>(
                      <div key={i} className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full shrink-0" style={{backgroundColor:DONUT_COLORS[i%DONUT_COLORS.length]}}/>
                        <span className="text-[11px] text-gray-300 truncate flex-1">{cat.name}</span>
                        <span className="text-[11px] font-bold shrink-0" style={{color:DONUT_COLORS[i%DONUT_COLORS.length]}}>{cat.pct}%</span>
                      </div>
                    ))}
                  </div>
                </div>
                {/* Category bars with budget */}
                <div className="bg-[#111114] border border-gray-800/60 rounded-2xl overflow-hidden">
                  {catStats.map((cat,i) => {
                    const { icon, cls } = getCatStyle(cat.name)
                    const budgetLimit = catBudgets[cat.name]
                    const budgetPct   = budgetLimit ? Math.round(cat.amount/budgetLimit*100) : 0
                    const overBudget  = budgetPct >= 100
                    const nearBudget  = budgetPct >= 80
                    return (
                      <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i<catStats.length-1?'border-b border-gray-800/40':''}`}>
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm border ${cls} shrink-0 relative`}>
                          {icon}
                          {overBudget && <span className="absolute -top-1 -right-1 text-[9px]">🚨</span>}
                          {!overBudget && nearBudget && <span className="absolute -top-1 -right-1 text-[9px]">⚠️</span>}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex justify-between items-center mb-1">
                            <span className="text-[12px] font-medium truncate">{cat.name}</span>
                            <span className={`text-[11px] ml-2 shrink-0 ${overBudget?'text-red-400':nearBudget?'text-yellow-400':'text-gray-400'}`}>
                              {budgetLimit ? `${budgetPct}%` : `${cat.pct}%`}
                            </span>
                          </div>
                          <div className="h-1 bg-gray-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{
                              width: budgetLimit ? `${Math.min(100,budgetPct)}%` : `${cat.pct}%`,
                              backgroundColor: overBudget ? '#ef4444' : nearBudget ? '#eab308' : DONUT_COLORS[i%DONUT_COLORS.length]+'99'
                            }} />
                          </div>
                          {budgetLimit && <p className="text-[9px] text-gray-600 mt-0.5">{fmtMoney(cat.amount)} / {fmtMoney(budgetLimit)} limit</p>}
                        </div>
                        <div className="flex flex-col items-end shrink-0">
                          <span className={`text-[12px] font-bold ${overBudget?'text-red-400':nearBudget?'text-yellow-400':'text-gray-300'}`}>{fmtMoney(cat.amount)}</span>
                          {!budgetLimit && <button onClick={()=>{setBudgetForm({category:cat.name,amount:''});setBudgetOpen(true)}} className="text-[9px] text-blue-400 mt-0.5">+ limit</button>}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Recent transactions */}
            {expByDate.length>0 && (
              <div className="mx-4 mt-3 mb-2">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">So'nggi xarajatlar</p>
                {expByDate.map(([date, exps]) => (
                  <div key={date} className="mb-3">
                    <div className="flex justify-between items-center mb-1.5">
                      <p className="text-[10px] text-gray-500">{date}</p>
                      <p className="text-[10px] text-red-400">-{fmtMoney(exps.filter(e=>e.type==='XARAJAT').reduce((s,e)=>s+e.amount,0))} so'm</p>
                    </div>
                    <div className="bg-[#111114] border border-gray-800/60 rounded-2xl overflow-hidden">
                      {exps.slice(0,5).map((exp,i) => {
                        const { icon, cls } = getCatStyle(exp.name)
                        return (
                          <div key={exp.id} className={`flex items-center gap-3 px-4 py-3 ${i<exps.slice(0,5).length-1?'border-b border-gray-800/40':''}`}>
                            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-base border ${cls} shrink-0`}>{icon}</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[13px] font-medium text-white truncate">{exp.name}</p>
                              <p className="text-[10px] text-gray-500">{exp.type==='XARAJAT'?'Xarajat':'Daromat'}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className={`text-[13px] font-bold ${exp.type==='XARAJAT'?'text-red-400':'text-green-400'}`}>{exp.type==='XARAJAT'?'-':'+'}{fmtMoney(exp.amount)}</p>
                              <p className="text-[9px] text-gray-600">so'm</p>
                            </div>
                            <button onClick={()=>setExpenses(p=>p.filter(e=>e.id!==exp.id))} className="p-1 rounded-lg bg-[#1a1a1f] ml-1"><Trash2 size={11} className="text-gray-600" /></button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Kategoriyalar (har doim ko'rinadi) */}
            {expenses.length===0 && (
              <div className="mx-4 mt-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Kategoriyalar</p>
                  <button onClick={()=>setCatOpen(true)} className="flex items-center gap-1 text-[10px] text-blue-400 px-2.5 py-1 bg-blue-500/10 rounded-full border border-blue-500/20 active:scale-95">
                    <Filter size={9}/> Boshqarish
                  </button>
                </div>
                <div className="flex flex-col items-center justify-center py-12 opacity-30">
                  <BarChart2 size={48} strokeWidth={1} />
                  <p className="text-sm mt-3">Hali xarajat yo'q</p>
                  <p className="text-xs mt-1">Chat orqali yozing yoki 📷 chek tashlang</p>
                </div>
              </div>
            )}

            {/* Quick clear button */}
            {expenses.length>0 && (
              <div className="flex justify-center mt-2 mb-4">
                <button onClick={async()=>{if(!confirm("Barcha xarajatlarni o'chirasizmi?"))return;setExpenses([]);save('j_exp',[]);await fetch('/api/expenses',{method:'DELETE'}).catch(()=>{})}} className="text-[11px] text-red-400 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full">🗑 Barchasini tozalash</button>
              </div>
            )}
          </div>
        )}

        {/* ── CHAT ── */}
        {activeTab==='chat' && (
          <div className="h-full flex flex-col">
            <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3">
              {/* Empty state */}
              {messages.length===0 && !isLoading && (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-4 py-8 gap-4">
                  <div className="w-16 h-16 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-3xl flex items-center justify-center text-3xl shadow-lg shadow-blue-600/20">🤖</div>
                  <div>
                    <p className="text-base font-bold text-white">JONKA bilan suhbat</p>
                    <p className="text-[12px] text-gray-500 mt-1">Har qanday savol yozing yoki ovoz yuboring</p>
                  </div>
                  <div className="grid grid-cols-2 gap-2 w-full max-w-[280px]">
                    {[
                      {t:'💰 Xarajat yoz',e:'Kafeda 45 ming'},
                      {t:'💼 Qarz',e:'Rashidga 50 ming berdim'},
                      {t:'📊 Hisobot',e:'Bu oy qancha sarfladim'},
                      {t:'🌐 Savol',e:'Dollar kursi necha?'},
                    ].map(({t,e})=>(
                      <button key={e} onClick={()=>{setInputText(e)}}
                        className="bg-[#1a1a1f] border border-gray-800/60 rounded-2xl p-3 text-left active:scale-95 transition-transform">
                        <p className="text-[11px] font-semibold text-gray-300">{t}</p>
                        <p className="text-[10px] text-gray-600 mt-0.5 truncate">"{e}"</p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {messages.map((msg,idx)=>(
                <div key={idx} className={`flex flex-col ${msg.role==='user'?'items-end':'items-start'}`}>
                  <div className="flex items-center gap-1 mb-1 opacity-40 px-1">
                    {msg.role==='user'?<User size={9}/>:<Bot size={9}/>}
                    <span className="text-[8px] uppercase font-bold tracking-wider">{msg.role==='user'?'Siz':'JONKA'}</span>
                  </div>
                  <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${msg.role==='user'?'bg-blue-600 text-white rounded-tr-sm':'bg-[#1a1a1f] text-gray-200 rounded-tl-sm border border-gray-800/60'}`}>
                    {msg.role==='ai'?fmt(msg.text):msg.text}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-1 mb-1 opacity-40 px-1"><Bot size={9}/><span className="text-[8px] uppercase font-bold tracking-wider">JONKA</span></div>
                  <div className="bg-[#1a1a1f] border border-gray-800/60 rounded-2xl rounded-tl-sm px-4 py-3.5 flex gap-1.5">
                    {[0,150,300].map(d=><span key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>)}
                  </div>
                </div>
              )}
              <div ref={chatEndRef} />
            </div>
            <InputBar />
          </div>
        )}

        {/* ── DEBTS ── */}
        {activeTab==='debts' && (
          <div className="h-full flex flex-col pb-[80px]">
            <div className="px-4 pt-3 shrink-0">
              <div className="grid grid-cols-2 gap-2 mb-3">
                <div className={`${netDebt>=0?'bg-green-500/10 border-green-500/20':'bg-red-500/10 border-red-500/20'} border rounded-2xl p-3`}>
                  <p className={`text-[9px] ${netDebt>=0?'text-green-400':'text-red-400'}`}>{netDebt>=0?'Menga qarzdor':'Men qarzdorman'}</p>
                  <p className={`text-sm font-bold mt-1 ${netDebt>=0?'text-green-400':'text-red-400'}`}>{fmtMoney(Math.abs(netDebt))} so'm</p>
                </div>
                <div className="bg-[#1a1a1f] border border-gray-800 rounded-2xl p-3 flex flex-col justify-between">
                  <p className="text-[9px] text-gray-400">Jami yozuv</p>
                  <p className="text-sm font-bold mt-1">{debts.length} ta</p>
                </div>
              </div>
              <div className="space-y-2 mb-3">
                <div className="flex gap-2">
                  <input value={debtForm.person} onChange={e=>setDebtForm(p=>({...p,person:e.target.value}))} placeholder="Kim? (Rashid)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}} />
                  <input value={debtForm.amount} onChange={e=>setDebtForm(p=>({...p,amount:e.target.value}))} placeholder="Summa" type="number" className="w-28 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}} />
                </div>
                <div className="flex gap-2">
                  <button onClick={()=>setDebtForm(p=>({...p,dir:'gave'}))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${debtForm.dir==='gave'?'bg-green-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>➡️ Men berdim</button>
                  <button onClick={()=>setDebtForm(p=>({...p,dir:'borrowed'}))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${debtForm.dir==='borrowed'?'bg-red-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>⬅️ Men oldim</button>
                </div>
                <div className="flex gap-2">
                  <input value={debtForm.note} onChange={e=>setDebtForm(p=>({...p,note:e.target.value}))} placeholder="Izoh (ixtiyoriy)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}} />
                  <button onClick={()=>{addDebt(debtForm.person,parseInt(debtForm.amount)||0,debtForm.dir,debtForm.note);setDebtForm({person:'',amount:'',dir:'gave',note:''})}} className="px-4 bg-blue-600 rounded-xl text-sm font-bold">+</button>
                </div>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-4 pb-4 flex flex-col gap-2">
              {debts.length===0
                ? <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30 py-12"><HandCoins size={40} strokeWidth={1}/><p className="text-sm">Bo'sh</p><p className="text-xs text-center">Chatda "Rashidga 50 ming berdim" deb yozing</p></div>
                : <>
                    {debts.filter(d=>!d.paid).map(d=>(
                      <div key={d.id} className="flex items-center gap-3 bg-[#111114] border border-gray-800/60 rounded-2xl px-4 py-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${d.dir==='gave'?'bg-green-500/15 border border-green-500/30':'bg-red-500/15 border border-red-500/30'} shrink-0`}>{d.dir==='gave'?'⬆️':'⬇️'}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold">{d.person}</p>
                          <p className={`text-xs font-bold ${d.dir==='gave'?'text-green-400':'text-red-400'}`}>{d.dir==='gave'?'📤 Men berdim':'📥 Men oldim'} — {d.amount.toLocaleString()} so'm</p>
                          {d.note&&<p className="text-[10px] text-gray-500 truncate">{d.note}</p>}
                          <p className="text-[9px] text-gray-600">{d.date}</p>
                        </div>
                        <div className="flex flex-col items-end gap-1.5 shrink-0">
                          <button onClick={()=>setDebts(p=>p.map(x=>x.id===d.id?{...x,paid:true}:x))} className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1.5 bg-green-500/10 border border-green-500/20 rounded-xl text-green-400"><CheckCircle2 size={11}/> To'landi</button>
                          <button onClick={()=>setDebts(p=>p.filter(x=>x.id!==d.id))} className="p-1 rounded-lg bg-[#1a1a1f]"><Trash2 size={11} className="text-gray-500"/></button>
                        </div>
                      </div>
                    ))}
                    {debts.filter(d=>d.paid).length>0 && <>
                      <p className="text-[10px] text-gray-600 uppercase tracking-wider font-bold mt-1">To'langan</p>
                      {debts.filter(d=>d.paid).map(d=>(
                        <div key={d.id} className="flex items-center gap-3 bg-[#111114]/60 border border-gray-800/30 rounded-2xl px-4 py-3 opacity-50">
                          <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-gray-700/20 border border-gray-700/30 shrink-0"><CheckCircle2 size={16} className="text-gray-500"/></div>
                          <div className="flex-1 min-w-0"><p className="text-sm text-gray-400 line-through">{d.person}</p><p className="text-xs text-gray-600">{d.amount.toLocaleString()} so'm · {d.date}</p></div>
                          <button onClick={()=>setDebts(p=>p.filter(x=>x.id!==d.id))} className="p-1 rounded-lg bg-[#1a1a1f]"><Trash2 size={11} className="text-gray-600"/></button>
                        </div>
                      ))}
                    </>}
                    <div className="flex justify-center mt-2">
                      <button onClick={async()=>{if(!confirm("Barcha qarzlarni o'chirasizmi?"))return;setDebts([]);save('j_debt',[]);await fetch('/api/debts',{method:'DELETE'}).catch(()=>{})}} className="text-[11px] text-red-400 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-full">🗑 Barchasini tozalash</button>
                    </div>
                  </>
              }
            </div>
          </div>
        )}

        {/* ── MORE ── */}
        {activeTab==='more' && (
          <div className="h-full overflow-y-auto px-4 pt-4 pb-[100px]">
            {/* Notes */}
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">📓 Eslatmalar</p>
            <div className="space-y-2 mb-4">
              <div className="flex gap-2">
                <input value={noteInput.title} onChange={e=>setNoteInput(p=>({...p,title:e.target.value}))} placeholder="Sarlavha..." className="flex-1 bg-[#111114] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}} />
              </div>
              <div className="flex gap-2">
                <textarea value={noteInput.content} onChange={e=>setNoteInput(p=>({...p,content:e.target.value}))} placeholder="Eslatma matni..." rows={2} className="flex-1 bg-[#111114] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none resize-none" style={{fontSize:'16px'}} />
                <button onClick={()=>{ if(!noteInput.content.trim()) return; const n={id:Date.now(),title:noteInput.title||noteInput.content.slice(0,30),content:noteInput.content,date:today()}; setNotes(p=>[n,...p]); syncNotion('note',{title:n.title,content:n.content}); setNoteInput({title:'',content:''}) }} className="w-12 bg-amber-500 rounded-xl text-sm font-bold flex items-center justify-center"><Plus size={20}/></button>
              </div>
              {notes.map(n=>(
                <div key={n.id} className="bg-[#111114] border border-amber-500/20 rounded-2xl px-4 py-3">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-semibold text-amber-300 flex-1 truncate">{n.title}</p>
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-[9px] text-gray-600">{n.date}</span>
                      <button onClick={()=>setNotes(p=>p.filter(x=>x.id!==n.id))} className="p-1 rounded-lg bg-[#1a1a1f] ml-1"><Trash2 size={11} className="text-gray-500"/></button>
                    </div>
                  </div>
                  <p className="text-[13px] text-gray-300 whitespace-pre-wrap leading-relaxed">{n.content}</p>
                  <button onClick={()=>{setInputText(n.content.slice(0,200));setActiveTab('chat')}} className="mt-2 text-[10px] text-blue-400">→ Chatga yuborish</button>
                </div>
              ))}
            </div>

            {/* Shopping list */}
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">🛒 Xaridlar ro'yxati</p>
            <div className="mb-4">
              <div className="flex gap-2 mb-2">
                <input value={shopInput} onChange={e=>setShopInput(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){addShop(shopInput);setShopInput('')}}} placeholder="Mahsulot qo'shing..." className="flex-1 bg-[#111114] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}} />
                <button onClick={()=>{addShop(shopInput);setShopInput('')}} className="px-4 bg-blue-600 rounded-xl text-sm font-bold">+</button>
              </div>
              {shopItems.length>0 && <div className="flex justify-between text-[11px] text-gray-400 mb-2 px-1"><span>{shopItems.filter(i=>i.done).length}/{shopItems.length} bajarildi</span><button onClick={()=>setShopItems(p=>p.filter(i=>!i.done))} className="text-red-400">Bajarilganlarni o'chir</button></div>}
              <div className="flex flex-col gap-1.5">
                {[...shopItems.filter(i=>!i.done),...shopItems.filter(i=>i.done)].map(item=>(
                  <button key={item.id} onClick={()=>setShopItems(p=>p.map(i=>i.id===item.id?{...i,done:!i.done}:i))} className={`flex items-center gap-3 bg-[#111114] border rounded-xl px-4 py-3 ${item.done?'border-gray-800/30 opacity-50':'border-gray-800/60'}`}>
                    {item.done?<CheckSquare size={18} className="text-green-400 shrink-0"/>:<Square size={18} className="text-gray-500 shrink-0"/>}
                    <span className={`text-sm flex-1 text-left ${item.done?'line-through text-gray-500':'text-white'}`}>{item.text}</span>
                    <button onClick={e=>{e.stopPropagation();setShopItems(p=>p.filter(i=>i.id!==item.id))}} className="p-1 rounded-lg"><Trash2 size={11} className="text-gray-600"/></button>
                  </button>
                ))}
              </div>
            </div>

            {/* Apps */}
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">📱 Ilovalar</p>
            <div className="grid grid-cols-4 gap-3 mb-4">
              {[
                {icon:<ShoppingBag size={20} className="text-purple-400"/>,label:'Uzum',url:'https://t.me/uzummarketbot/market',bg:'bg-purple-500/10 border-purple-500/20',special:'tg'},
                {icon:<Car size={20} className="text-yellow-400"/>,label:'Taxi',url:'https://yandex.uz/maps/taxi/',bg:'bg-yellow-500/10 border-yellow-500/20',special:''},
                {icon:<FileText size={20} className="text-white"/>,label:'Notion',url:'',bg:'bg-gray-600/10 border-gray-500/20',special:'notion'},
                {icon:<span className="text-xl">✉️</span>,label:'Gmail',url:'',bg:'bg-red-500/10 border-red-500/20',special:'gmail'},
                {icon:<MessageCircle size={20} className="text-blue-400"/>,label:'TG Web',url:'https://web.telegram.org',bg:'bg-blue-500/10 border-blue-500/20',special:''},
                {icon:<Megaphone size={20} className="text-orange-400"/>,label:'Instagram',url:'https://instagram.com',bg:'bg-orange-500/10 border-orange-500/20',special:''},
                {icon:<User size={20} className="text-cyan-400"/>,label:'Kontaktlar',url:'',bg:'bg-cyan-500/10 border-cyan-500/20',special:'contacts'},
              ].map(app=>(
                <button key={app.label} onClick={()=>openApp(app.url,app.special==='tg',app.special!=='tg'?app.special:undefined)} className="flex flex-col items-center gap-2 active:scale-90 transition-transform">
                  <div className={`w-14 h-14 ${app.bg} border rounded-[18px] flex items-center justify-center`}>{app.icon}</div>
                  <span className="text-[10px] text-gray-300">{app.label}</span>
                </button>
              ))}
            </div>

            {/* Settings */}
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">⚙️ Sozlamalar</p>
            <div className="bg-[#111114] border border-gray-800/60 rounded-2xl overflow-hidden">
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/40">
                <span className="text-sm">Ovoz tili</span>
                <div className="flex gap-2">
                  {(['uz-UZ','ru-RU'] as const).map(l=>(
                    <button key={l} onClick={()=>setVoiceLang(l)} className={`px-3 py-1 rounded-full text-[11px] font-bold ${voiceLang===l?'bg-blue-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>{l==='uz-UZ'?'🇺🇿':'🇷🇺'}</button>
                  ))}
                </div>
              </div>
              <div className="flex items-center justify-between px-4 py-3 border-b border-gray-800/40">
                <span className="text-sm">Oylik byudjet</span>
                <div className="flex gap-2 items-center">
                  {budget>0&&<span className="text-xs text-gray-400">{fmtMoney(budget)} so'm</span>}
                  <input value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} placeholder="Belgilash..." className="w-28 bg-[#1a1a1f] border border-gray-700 rounded-lg px-2 py-1 text-sm outline-none text-right" style={{fontSize:'14px'}} />
                  <button onClick={()=>{const v=parseInt(budgetInput.replace(/\D/g,''));if(v>0){setBudget(v);setBudgetInput('')}}} className="px-3 py-1 bg-blue-600 rounded-lg text-xs font-bold">Set</button>
                </div>
              </div>
              <button onClick={async()=>{ setSmmOpen(true) }} className="flex items-center justify-between w-full px-4 py-3 border-b border-gray-800/40">
                <span className="text-sm">📱 SMM Tools</span><ChevronRight size={14} className="text-gray-600"/>
              </button>
              <button onClick={()=>{ setCardsOpen(true); loadCards() }} className="flex items-center justify-between w-full px-4 py-3">
                <span className="text-sm">💳 Kartalarim</span><ChevronRight size={14} className="text-gray-600"/>
              </button>
            </div>
          </div>
        )}

      </div>

      {/* ══ FLOATING APPS BUTTON ══ */}
      {activeTab!=='chat' && (
        <button onClick={()=>setAppsOpen(true)}
          className="absolute right-4 bottom-[74px] z-20 w-[52px] h-[52px] bg-gradient-to-br from-blue-600 to-purple-700 rounded-2xl shadow-2xl shadow-blue-700/40 flex items-center justify-center active:scale-90 transition-transform">
          <LayoutGrid size={22} className="text-white"/>
        </button>
      )}

      {/* ══ BOTTOM NAVIGATION ══ */}
      <nav className="absolute bottom-0 left-0 right-0 bg-[#0d0d10] border-t border-gray-800/60 flex items-center h-[64px] px-2 z-30 shrink-0">
        {([
          { tab:'home'  as Tab, icon:<HomeIcon size={22}/>,    label:'Asosiy'  },
          { tab:'chat'  as Tab, icon:<MessageCircle size={22}/>, label:'AI Chat' },
          { tab:'debts' as Tab, icon:<HandCoins size={22}/>,label:'Qarz'   },
          { tab:'more'  as Tab, icon:<MoreHorizontal size={22}/>,label:"Ko'proq"},
        ] as {tab:Tab;icon:React.ReactNode;label:string}[]).map(({tab,icon,label})=>(
          <button key={tab} onClick={()=>setActiveTab(tab)} className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 rounded-xl transition-all ${activeTab===tab?'text-blue-400':'text-gray-600 active:text-gray-400'}`}>
            <div className={`${activeTab===tab?'scale-110':''} transition-transform`}>{icon}</div>
            <span className={`text-[10px] font-medium ${activeTab===tab?'text-blue-400':'text-gray-600'}`}>{label}</span>
            {activeTab===tab && <div className="w-1 h-1 bg-blue-400 rounded-full mt-0.5"/>}
          </button>
        ))}
      </nav>

      {/* ══ CONTACTS MODAL ══ */}
      {contactsOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col backdrop-blur-sm" onClick={()=>setContactsOpen(false)}>
          <div className="flex-1 flex flex-col bg-[#0d0d10] mt-10 rounded-t-3xl overflow-hidden" onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-gray-800/60 shrink-0">
              <div>
                <h2 className="text-base font-bold text-white flex items-center gap-2">
                  💬 Telegram
                  {contactsUser && <span className="text-[10px] text-green-400 font-normal bg-green-500/10 px-2 py-0.5 rounded-full">● Ulangan</span>}
                </h2>
                {contactsUser && <p className="text-[11px] text-gray-500 mt-0.5">{contactsUser.name} {contactsUser.username?`@${contactsUser.username}`:''}</p>}
              </div>
              <div className="flex items-center gap-2">
                {contactsStep==='done' && <button onClick={()=>{ loadContacts(); loadChats(true) }} className="p-2 rounded-xl bg-[#1a1a1f] active:scale-90"><RefreshCw size={14} className="text-gray-400"/></button>}
                <button onClick={()=>setContactsOpen(false)} className="p-2 rounded-xl bg-[#1a1a1f] active:scale-90"><X size={14} className="text-gray-400"/></button>
              </div>
            </div>
            {/* Tab switcher */}
            {contactsStep==='done' && (
              <div className="flex gap-1 px-4 pt-2 pb-1 shrink-0">
                <button onClick={()=>setContactsTab('contacts')}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${contactsTab==='contacts'?'bg-blue-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>
                  👥 Kontaktlar {contacts.length>0 && <span className="opacity-60">({contacts.length})</span>}
                </button>
                <button onClick={()=>{ setContactsTab('chats'); if(chats.length < 10) loadChats(true) }}
                  className={`flex-1 py-2 rounded-xl text-xs font-semibold transition-all ${contactsTab==='chats'?'bg-blue-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>
                  💬 Chatlar {chats.length>0 && <span className="opacity-60">({chats.length})</span>}
                </button>
                {/* + Yangi kontakt */}
                <button onClick={()=>{setAddContactOpen(true);setAddContactPhone('+998');setAddContactName('');setAddContactRes(null);setAddContactErr('')}}
                  className="w-10 py-2 rounded-xl text-sm font-bold bg-[#1a1a1f] text-blue-400 active:scale-90">
                  +
                </button>
              </div>
            )}

            {/* Auth flow */}
            {contactsStep !== 'done' && (
              <div className="flex-1 flex flex-col items-center justify-center px-6 gap-4">
                {contactsLoading && <div className="text-gray-400 text-sm animate-pulse">Yuklanmoqda...</div>}
                {!contactsLoading && contactsStep === 'phone' && (
                  <>
                    <div className="text-center mb-2">
                      <div className="text-4xl mb-3">📱</div>
                      <p className="text-base font-bold text-white">Telegram akkauntni ulash</p>
                      <p className="text-[12px] text-gray-500 mt-1">Telefon raqamingizni kiriting</p>
                      <p className="text-[11px] text-gray-600 mt-1">Kerak: API ID va API Hash<br/>
                        <a href="https://my.telegram.org/apps" target="_blank" className="text-blue-400 underline">my.telegram.org/apps</a> dan oling</p>
                    </div>
                    {contactsError && <p className="text-red-400 text-xs text-center bg-red-500/10 px-3 py-2 rounded-xl">{contactsError}</p>}
                    <input value={contactsPhone} onChange={e=>setContactsPhone(e.target.value)}
                      placeholder="+998901234567" className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-4 py-3 text-center text-lg font-mono outline-none"
                      style={{fontSize:'18px'}} inputMode="tel" />
                    <button onClick={()=>contactsAuth('phone',{phone:contactsPhone})}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white text-sm active:scale-95">
                      Kod yuborish →
                    </button>
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex-1 h-px bg-gray-800"/>
                      <span className="text-[11px] text-gray-600">yoki</span>
                      <div className="flex-1 h-px bg-gray-800"/>
                    </div>
                    <button onClick={startQrLogin}
                      className="w-full py-3 bg-[#1a1a1f] border border-gray-700 rounded-2xl font-semibold text-white text-sm active:scale-95 flex items-center justify-center gap-2">
                      <span>📲</span> QR kod bilan kirish (tavsiya)
                    </button>
                  </>
                )}
                {!contactsLoading && contactsStep === 'code' && (
                  <>
                    <div className="text-center mb-2">
                      <div className="text-4xl mb-3">✉️</div>
                      <p className="text-base font-bold text-white">Telegram kodi</p>
                      <p className="text-[12px] text-gray-500 mt-1">Telegramga kelgan 5 xonali kodni kiriting</p>
                    </div>
                    {contactsError && <p className="text-red-400 text-xs text-center bg-red-500/10 px-3 py-2 rounded-xl">{contactsError}</p>}
                    <input value={contactsCode} onChange={e=>setContactsCode(e.target.value)}
                      placeholder="12345" className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-4 py-3 text-center text-2xl font-mono tracking-[0.3em] outline-none"
                      style={{fontSize:'22px'}} inputMode="numeric" maxLength={6} />
                    <button onClick={()=>contactsAuth('verify',{code:contactsCode})}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white text-sm active:scale-95">
                      Tasdiqlash ✓
                    </button>
                    <button onClick={()=>setContactsStep('phone')} className="text-gray-500 text-xs">← Orqaga</button>
                  </>
                )}
                {!contactsLoading && contactsStep === '2fa' && (
                  <>
                    <div className="text-center mb-2">
                      <div className="text-4xl mb-3">🔐</div>
                      <p className="text-base font-bold text-white">2FA Parol</p>
                      <p className="text-[12px] text-gray-500 mt-1">Ikki bosqichli tekshirish paroli</p>
                    </div>
                    {contactsError && <p className="text-red-400 text-xs text-center bg-red-500/10 px-3 py-2 rounded-xl">{contactsError}</p>}
                    <input type="password" value={contacts2fa} onChange={e=>setContacts2fa(e.target.value)}
                      placeholder="Parolni kiriting" className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-4 py-3 text-sm outline-none"
                      style={{fontSize:'16px'}} />
                    <button onClick={()=>contactsAuth('2fa',{password:contacts2fa})}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white text-sm active:scale-95">
                      Kirish →
                    </button>
                  </>
                )}

                {/* QR CODE ekrani */}
                {!contactsLoading && contactsStep === 'qr' && (
                  <>
                    <div className="text-center mb-2">
                      <div className="text-4xl mb-2">📱</div>
                      <p className="text-base font-bold text-white">QR kod bilan kiring</p>
                      <p className="text-[12px] text-gray-500 mt-1">Telefonda Telegram oching → tugmani bosing</p>
                    </div>
                    {contactsError && <p className="text-red-400 text-xs text-center bg-red-500/10 px-3 py-2 rounded-xl">{contactsError}</p>}

                    {/* QR image */}
                    <div className="flex justify-center my-2">
                      <div className="bg-white p-2 rounded-2xl">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrUrl)}`}
                          alt="QR" width={180} height={180} className="rounded-xl"
                        />
                      </div>
                    </div>

                    {/* Telegram orqali ochish (mobil uchun) */}
                    <a href={qrUrl}
                      className="w-full py-3.5 bg-gradient-to-r from-blue-600 to-purple-600 rounded-2xl font-bold text-white text-sm active:scale-95 text-center block">
                      📲 Telegramda ochish
                    </a>
                    <p className="text-[11px] text-gray-500 text-center animate-pulse mt-1">Kutilmoqda... ●</p>
                    <button onClick={()=>{ if(qrPollRef.current) clearInterval(qrPollRef.current); setContactsStep('phone') }}
                      className="text-gray-500 text-xs text-center mt-1">← Orqaga</button>
                  </>
                )}
              </div>
            )}

            {/* Contacts / Chats list */}
            {contactsStep === 'done' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Search */}
                <div className="px-4 py-2 shrink-0">
                  <div className="flex items-center gap-2 bg-[#1a1a1f] border border-gray-800 rounded-2xl px-3 py-2">
                    <Search size={14} className="text-gray-500 shrink-0"/>
                    <input value={contactsSearch} onChange={e=>setContactsSearch(e.target.value)}
                      placeholder={contactsTab==='contacts'?`${contacts.length} kontaktdan qidiring...`:`${chats.length} chatdan qidiring...`}
                      className="flex-1 bg-transparent outline-none text-sm text-white" style={{fontSize:'16px'}} />
                    {contactsSearch && <button onClick={()=>setContactsSearch('')}><X size={12} className="text-gray-500"/></button>}
                  </div>
                </div>

                {/* CONTACTS tab */}
                {contactsTab === 'contacts' && (
                  contactsLoading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm animate-pulse">Kontaktlar yuklanmoqda...</div>
                  ) : (
                    <div className="flex-1 overflow-y-auto px-4 pb-8">
                      {filteredContacts.length === 0 && <div className="text-center py-12 opacity-40 text-sm">Kontakt topilmadi</div>}
                      {filteredContacts.map(c=>(
                        <button key={c.id} onClick={()=>{setSelContact(c);setSelChat(null);setContactMsg('');loadChatHistory(c,null)}}
                          className="w-full flex items-center gap-3 py-3 border-b border-gray-800/40 active:bg-white/5 rounded-xl px-1 transition-colors">
                          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center shrink-0 text-base font-bold text-white">
                            {c.name.charAt(0).toUpperCase() || '?'}
                          </div>
                          <div className="flex-1 text-left min-w-0">
                            <p className="text-sm font-medium text-white truncate">{c.name || c.username || c.phone}</p>
                            <p className="text-[11px] text-gray-500 truncate">
                              {c.username ? `@${c.username}` : c.phone || ''}
                              {c.online && <span className="text-green-400 ml-1">● online</span>}
                              {!c.online && c.lastSeen && <span className="text-gray-600 ml-1">{c.lastSeen}</span>}
                            </p>
                          </div>
                          <ChevronRight size={14} className="text-gray-600 shrink-0"/>
                        </button>
                      ))}
                    </div>
                  )
                )}

                {/* CHATS tab */}
                {contactsTab === 'chats' && (
                  chatsLoading ? (
                    <div className="flex-1 flex items-center justify-center text-gray-400 text-sm animate-pulse">Chatlar yuklanmoqda...</div>
                  ) : (
                    <div className="flex-1 overflow-y-auto px-4 pb-8">
                      {filteredChats.length === 0 && <div className="text-center py-12 opacity-40 text-sm">Chat topilmadi</div>}
                      {filteredChats.map(c=>{
                        const typeIcon = c.type==='channel'?'📢':c.type==='supergroup'||c.type==='group'?'👥':'💬'
                        const gradFrom = c.type==='channel'?'from-pink-600 to-rose-700':c.type==='supergroup'||c.type==='group'?'from-green-600 to-teal-700':'from-indigo-600 to-blue-700'
                        return (
                          <button key={c.id} onClick={()=>{setSelChat(c);setSelContact(null);setContactMsg('');loadChatHistory(null,c)}}
                            className="w-full flex items-center gap-3 py-3 border-b border-gray-800/40 active:bg-white/5 rounded-xl px-1 transition-colors">
                            <div className={`w-10 h-10 rounded-full bg-gradient-to-br ${gradFrom} flex items-center justify-center shrink-0 text-base`}>
                              {typeIcon}
                            </div>
                            <div className="flex-1 text-left min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="text-sm font-medium text-white truncate flex-1">{c.title}</p>
                                {c.unread>0 && <span className="text-[10px] bg-blue-500 text-white rounded-full px-1.5 py-0.5 shrink-0">{c.unread}</span>}
                                {c.pinned && <span className="text-[10px] text-yellow-500 shrink-0">📌</span>}
                              </div>
                              <p className="text-[11px] text-gray-500 truncate">
                                {c.username ? `@${c.username} · ` : ''}
                                {c.membersCount ? `${c.membersCount.toLocaleString()} a'zo · ` : ''}
                                {c.lastMsg || c.lastDate}
                              </p>
                            </div>
                            <ChevronRight size={14} className="text-gray-600 shrink-0"/>
                          </button>
                        )
                      })}
                    </div>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contact / Chat — to'liq chat oynasi */}
      {(selContact || selChat) && (
        <div className="fixed inset-0 z-[60] bg-[#0c0c0f] flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800/60 shrink-0"
               style={{paddingTop:'calc(0.75rem + env(safe-area-inset-top,0px))'}}>
            <button onClick={()=>{setSelContact(null);setSelChat(null);setChatHistory([]);setChatHistoryLoaded(false)}}
              className="w-9 h-9 rounded-xl bg-[#1a1a1f] flex items-center justify-center active:scale-90 shrink-0">
              <span className="text-sm">←</span>
            </button>
            {selContact && (
              <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-600 to-purple-700 flex items-center justify-center text-sm font-bold text-white shrink-0">
                {selContact.name.charAt(0).toUpperCase()}
              </div>
            )}
            {selChat && (
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-lg bg-gradient-to-br shrink-0 ${selChat.type==='channel'?'from-pink-600 to-rose-700':selChat.type==='group'||selChat.type==='supergroup'?'from-green-600 to-teal-700':'from-indigo-600 to-blue-700'}`}>
                {selChat.type==='channel'?'📢':selChat.type==='group'||selChat.type==='supergroup'?'👥':'💬'}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{selContact?.name || selChat?.title}</p>
              <p className="text-[11px] text-gray-500 truncate">
                {selContact ? (selContact.username?`@${selContact.username}`:selContact.phone||'online') : ''}
                {selChat ? (selChat.membersCount?`${selChat.membersCount.toLocaleString()} a\'zo`:(selChat.username?`@${selChat.username}`:'')) : ''}
              </p>
            </div>
            <button onClick={()=>loadChatHistory(selContact,selChat)}
              className="w-9 h-9 rounded-xl bg-[#1a1a1f] flex items-center justify-center active:scale-90 shrink-0">
              <RefreshCw size={13} className={`text-gray-400 ${chatHistoryLoad?'animate-spin':''}`}/>
            </button>
          </div>

          {/* Quick templates — compact */}
          <div className="flex gap-1.5 px-3 py-2 overflow-x-auto shrink-0" style={{scrollbarWidth:'none'}}>
            {selContact && [
              { label:'💸 Qarz', msg:`Salom ${selContact.firstName||selContact.name}! Qarzni to'lashni eslatmoqchiman 🙏` },
              { label:'✅ OK', msg:'Yaxshi, kelishib oldik!' },
              { label:'⏰ Keyin', msg:'Hozir band, keyinroq javob beraman.' },
              { label:'📞 Qo\'ng\'iroq', msg:'Bir daqiqang bormi, qo\'ng\'iroq qilsam?' },
            ].map(q=>(
              <button key={q.label} onClick={()=>setContactMsg(q.msg)}
                className="shrink-0 px-3 py-1.5 bg-[#1a1a1f] border border-gray-800/40 rounded-full text-[11px] text-gray-300 active:scale-95">
                {q.label}
              </button>
            ))}
            {selChat && selChat.type !== 'private' && [
              { label:"📢 E'lon", msg:`📢 E'lon:\n\n` },
              { label:'📅 Jadval', msg:`Bugungi jadval:\n\n` },
              { label:'✅ Eslatma', msg:`⚡ Eslatma:\n\n` },
              { label:'🔔 Muhim', msg:`‼️ Muhim xabar:\n\n` },
            ].map(q=>(
              <button key={q.label} onClick={()=>setContactMsg(q.msg)}
                className="shrink-0 px-3 py-1.5 bg-[#1a1a1f] border border-gray-800/40 rounded-full text-[11px] text-gray-300 active:scale-95">
                {q.label}
              </button>
            ))}
          </div>

          {/* Xabarlar tarixi */}
          <div className="flex-1 overflow-y-auto px-3 py-2 space-y-1">
            {chatHistoryLoad && (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
              </div>
            )}
            {!chatHistoryLoad && chatHistory.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 gap-2">
                <span className="text-3xl opacity-30">💬</span>
                <p className="text-xs text-gray-600">
                  {chatHistoryLoaded ? 'Hali xabar yo\'q — birinchi bo\'ling!' : 'Yuklanmoqda...'}
                </p>
              </div>
            )}
            {chatHistory.map((msg, i) => (
              <div key={msg.id || i} className={`flex ${msg.out?'justify-end':'justify-start'}`}>
                <div className={`max-w-[75%] px-3 py-2 rounded-2xl ${msg.out
                  ? 'bg-blue-600 rounded-br-sm text-white'
                  : 'bg-[#1e1e24] border border-gray-800/40 rounded-bl-sm text-gray-100'
                }`}>
                  {msg.text ? (
                    <p className="text-[13px] leading-relaxed whitespace-pre-wrap break-words">{msg.text}</p>
                  ) : (
                    <p className="text-[12px] text-gray-500 italic">📎 Media</p>
                  )}
                  <p className={`text-[9px] mt-1 text-right ${msg.out?'text-blue-200':'text-gray-600'}`}>{msg.date}</p>
                </div>
              </div>
            ))}
            {/* Bog'liq qarz eslatma */}
            {selContact && debts.filter(d=>!d.paid&&d.person.toLowerCase().includes(selContact.name.toLowerCase().slice(0,4))).length>0 && (
              <div className="flex justify-center py-1">
                <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-3 py-1.5 text-[11px] text-yellow-400">
                  🤝 {debts.filter(d=>!d.paid&&d.person.toLowerCase().includes(selContact.name.toLowerCase().slice(0,4)))[0].dir==='gave'?'📤 Berdim':'📥 Oldim'}: {fmtMoney(debts.filter(d=>!d.paid&&d.person.toLowerCase().includes(selContact.name.toLowerCase().slice(0,4)))[0].amount)} so&apos;m
                </div>
              </div>
            )}
            <div ref={chatHistoryEndRef}/>
          </div>

          {/* Xabar yozish */}
          {contactsError && <p className="text-red-400 text-xs px-4 pb-1">{contactsError}</p>}

          {/* Ovoz yozish holati */}
          {isVoiceRec ? (
            <div className="flex items-center gap-3 px-4 py-3 border-t border-gray-800/60 bg-red-500/5 shrink-0"
                 style={{paddingBottom:'calc(0.75rem + env(safe-area-inset-bottom,0px))'}}>
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"/>
              <span className="text-sm text-red-400 font-mono flex-1">
                {String(Math.floor(voiceSeconds/60)).padStart(2,'0')}:{String(voiceSeconds%60).padStart(2,'0')} yozilmoqda...
              </span>
              <button onClick={cancelVoice} className="px-3 py-2 bg-[#1a1a1f] rounded-xl text-xs text-gray-400 active:scale-90">
                ✕ Bekor
              </button>
              <button onClick={stopAndSendVoice}
                className="px-4 py-2 bg-blue-600 rounded-xl text-xs font-bold text-white active:scale-90 flex items-center gap-1">
                <Send size={13}/> Yuborish
              </button>
            </div>
          ) : (
            <div className="flex gap-2 px-3 py-2 border-t border-gray-800/60 shrink-0"
                 style={{paddingBottom:'calc(0.5rem + env(safe-area-inset-bottom,0px))'}}>
              {/* Ovoz tugmasi */}
              <button onPointerDown={startVoiceRecord}
                className="w-11 h-11 self-end bg-[#1a1a1f] border border-gray-700 rounded-2xl flex items-center justify-center active:scale-90 shrink-0 active:bg-red-500/20 active:border-red-500/40">
                <span className="text-lg">🎤</span>
              </button>
              <textarea value={contactMsg} onChange={e=>setContactMsg(e.target.value)}
                onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendContactMsg()}}}
                placeholder={selChat?.type==='channel'?'Kanal posti...':'Xabar yozing...'} rows={1}
                className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-2xl px-4 py-3 text-sm outline-none resize-none focus:border-blue-500 transition-colors"
                style={{fontSize:'15px',maxHeight:'120px'}} />
              <button onClick={sendContactMsg} disabled={sendingMsg||!contactMsg.trim()}
                className="w-11 h-11 self-end bg-blue-600 rounded-2xl flex items-center justify-center active:scale-90 disabled:opacity-40 shrink-0">
                {sendingMsg ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/> : <Send size={16} className="text-white"/>}
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Kontakt qo'shish modal ── */}
      {addContactOpen && (
        <div className="fixed inset-0 z-[70] bg-black/80 flex items-end backdrop-blur-sm" onClick={()=>setAddContactOpen(false)}>
          <div className="w-full bg-[#111114] border-t border-gray-800 rounded-t-3xl p-5 pb-10" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-5"/>
            <h3 className="text-base font-bold text-white mb-1">➕ Yangi kontakt</h3>
            <p className="text-[12px] text-gray-500 mb-5">Telefon raqami kiriting — Telegramga qo'shiladi</p>

            <div className="space-y-3 mb-4">
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5">Telefon raqami *</p>
                <input
                  value={addContactPhone}
                  onChange={e=>setAddContactPhone(e.target.value)}
                  onKeyDown={e=>e.key==='Enter'&&importContact()}
                  placeholder="+998901234567"
                  className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-4 py-3.5 text-lg font-mono outline-none focus:border-blue-500 transition-colors"
                  style={{fontSize:'18px'}} inputMode="tel" autoFocus
                />
              </div>
              <div>
                <p className="text-[11px] text-gray-500 mb-1.5">Ismi (ixtiyoriy)</p>
                <input
                  value={addContactName}
                  onChange={e=>setAddContactName(e.target.value)}
                  placeholder="Ism Familiya"
                  className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-4 py-3 text-sm outline-none focus:border-blue-500 transition-colors"
                  style={{fontSize:'15px'}}
                />
              </div>
            </div>

            {addContactErr && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3 mb-3">
                <p className="text-xs text-red-400">⚠️ {addContactErr}</p>
              </div>
            )}

            {/* Qo'shildi natija */}
            {addContactRes && (
              <div className="bg-green-500/10 border border-green-500/20 rounded-2xl p-4 mb-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-green-600 to-teal-700 flex items-center justify-center text-xl font-bold text-white">
                    {addContactRes.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-white">✅ {addContactRes.name}</p>
                    <p className="text-[11px] text-green-400">Telegramga qo'shildi!</p>
                    {addContactRes.username && <p className="text-[11px] text-gray-400">@{addContactRes.username}</p>}
                  </div>
                </div>
                <button onClick={()=>openFoundContact(addContactRes!)}
                  className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-sm font-bold active:scale-95">
                  💬 Xabar yozish →
                </button>
              </div>
            )}

            {!addContactRes && (
              <button onClick={importContact}
                disabled={addContactLoad || addContactPhone.length < 8}
                className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 disabled:from-gray-700 disabled:to-gray-700 rounded-2xl text-sm font-bold active:scale-95 transition-all">
                {addContactLoad
                  ? <span className="flex items-center justify-center gap-2"><div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"/>Qo'shilmoqda...</span>
                  : '➕ Kontakt qo\'shish'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ══ SMM MODAL ══ */}
      {smmOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end backdrop-blur-sm" onClick={()=>setSmmOpen(false)}>
          <div className="w-full bg-[#111114] border-t border-gray-800 rounded-t-3xl p-5 pb-8" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-4" />
            <h3 className="text-sm font-bold mb-3 text-pink-400">📱 SMM Tez buyruqlar</h3>
            <div className="grid grid-cols-3 gap-2">
              {[
                {icon:'✍️',label:'Post yoz',prompt:(p:string)=>`${p} uchun professional post yoz.`},
                {icon:'#️⃣',label:'Hashtaglar',prompt:(p:string)=>`${p} uchun 20 ta hashtag ber.`},
                {icon:'🎣',label:'7 ta Hook',prompt:(p:string)=>`${p} uchun 7 xil kuchli hook yoz.`},
                {icon:'🎯',label:'Reklama',prompt:(p:string)=>`${p} uchun sotuvchi reklama matni.`},
                {icon:'📅',label:'Kontent reja',prompt:(p:string)=>`${p} uchun 1 haftalik kontent reja.`},
                {icon:'💡',label:"Story g'oyalar",prompt:(p:string)=>`${p} uchun 5 ta story g'oyasi.`},
                {icon:'🖼️',label:'Caption',prompt:(p:string)=>`${p} rasm uchun caption yoz.`},
                {icon:'📣',label:"E'lon",prompt:(p:string)=>`${p} uchun e'lon matni.`},
                {icon:'🔥',label:'Trend',prompt:(_:string)=>`O'zbekistonda hozir qaysi mavzular trend?`},
              ].map(sp=>(
                <button key={sp.label} onClick={()=>{setSmmOpen(false);setActiveTab('chat');sendToAI(sp.prompt('Instagram'),true)}}
                  className="flex flex-col items-center gap-1.5 p-3 bg-[#1a1a1f] border border-gray-800/60 rounded-2xl active:scale-95">
                  <span className="text-2xl">{sp.icon}</span>
                  <span className="text-[10px] text-gray-400 text-center leading-tight">{sp.label}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ══ CARDS MODAL ══ */}
      {cardsOpen && (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col backdrop-blur-sm">
          <div className="w-full bg-[#0c0c0f] flex-1 overflow-y-auto pb-10">

            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3">
              <div className="flex items-center gap-3">
                {cardStep !== 'list' && (
                  <button onClick={()=>{setCardStep('list');setCardError('')}} className="w-9 h-9 rounded-2xl bg-[#1a1a1f] flex items-center justify-center active:scale-90">
                    <span className="text-sm">←</span>
                  </button>
                )}
                <div>
                  <h3 className="text-base font-bold">
                    {cardStep==='list'?'💳 Kartalarim':cardStep==='otp'?'🔐 SMS Tasdiqlash':cardStep==='shortcut'?'📱 iOS Shortcut':'➕ Yangi karta'}
                  </h3>
                  <p className="text-[10px] text-gray-500">{cards.length} ta karta ulangan</p>
                </div>
              </div>
              <button onClick={()=>setCardsOpen(false)} className="w-9 h-9 rounded-2xl bg-[#1a1a1f] flex items-center justify-center active:scale-90"><X size={15}/></button>
            </div>

            {/* ── LIST VIEW ── */}
            {cardStep === 'list' && (
              <>
                {cardsLoading ? (
                  <div className="flex flex-col items-center justify-center py-20 gap-3">
                    <div className="w-10 h-10 border-2 border-blue-500 border-t-transparent rounded-full animate-spin"/>
                    <p className="text-gray-500 text-sm">Yuklanmoqda...</p>
                  </div>
                ) : cards.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-8 gap-4">
                    <div className="w-20 h-14 bg-gradient-to-br from-gray-700 to-gray-800 rounded-2xl flex items-center justify-center text-3xl">💳</div>
                    <p className="text-gray-400 text-sm font-medium">Hali karta qo'shilmagan</p>
                    <p className="text-gray-600 text-xs text-center">Uzcard, Humo, Visa va boshqa kartalarni qo'shing</p>
                  </div>
                ) : (
                  <>
                    {/* Card carousel */}
                    <div className="px-5 mb-3">
                      {/* Big card display */}
                      <div className={`relative bg-gradient-to-br ${getCardGradient(cards[cardActiveIdx]||cards[0])} rounded-3xl p-5 overflow-hidden shadow-2xl`} style={{aspectRatio:'1.6/1'}}>
                        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full"/>
                        <div className="absolute -right-4 bottom-4 w-24 h-24 bg-white/5 rounded-full"/>
                        <div className="absolute left-6 bottom-4 w-16 h-16 bg-black/10 rounded-full"/>
                        {/* Balans (agar SMS dan kelgan bo'lsa) */}
                        {(cards[cardActiveIdx]||cards[0]).balance != null && (
                          <div className="absolute top-4 right-5 text-right">
                            <p className="text-[9px] text-white/40 uppercase tracking-wider">Qoldiq</p>
                            <p className="text-base font-bold text-white drop-shadow">{fmtMoney((cards[cardActiveIdx]||cards[0]).balance!)}</p>
                            <p className="text-[8px] text-white/30">{(cards[cardActiveIdx]||cards[0]).lastBalanceDate||''}</p>
                          </div>
                        )}
                        {/* Chip */}
                        <div className="w-10 h-7 bg-white/20 rounded-lg mb-4 flex items-center justify-center">
                          <div className="w-6 h-4 border border-white/30 rounded grid grid-cols-2 gap-px p-0.5">
                            <div className="bg-white/20 rounded-sm"/><div className="bg-white/20 rounded-sm"/>
                            <div className="bg-white/20 rounded-sm"/><div className="bg-white/20 rounded-sm"/>
                          </div>
                        </div>
                        <p className="text-[14px] font-mono tracking-[0.18em] text-white mb-4 drop-shadow">
                          **** **** **** {(cards[cardActiveIdx]||cards[0]).last4}
                        </p>
                        <div className="flex items-end justify-between">
                          <div>
                            <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Karta egasi</p>
                            <p className="text-xs text-white font-medium drop-shadow">{(cards[cardActiveIdx]||cards[0]).holder || '—'}</p>
                          </div>
                          <div className="text-right">
                            <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Muddat</p>
                            <p className="text-xs text-white font-medium">{(cards[cardActiveIdx]||cards[0]).expiry}</p>
                          </div>
                          <div>
                            <p className="text-[10px] font-bold text-white/60 tracking-widest">
                              {(cards[cardActiveIdx]||cards[0]).brand?.toUpperCase()||'CARD'}
                            </p>
                            {isExpiringSoon((cards[cardActiveIdx]||cards[0]).expiry) && (
                              <p className="text-[9px] text-yellow-300 bg-yellow-500/20 rounded-full px-2 py-0.5 mt-1">⚠️ Muddati tugaydi</p>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Dots + mini cards */}
                      {cards.length > 1 && (
                        <div className="flex gap-2 mt-3 overflow-x-auto pb-1">
                          {cards.map((c,i) => (
                            <button key={c.id} onClick={()=>setCardActiveIdx(i)}
                              className={`shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${i===cardActiveIdx?'bg-white/10 border-white/20':'bg-[#1a1a1f] border-gray-800/60'}`}>
                              <div className={`w-4 h-4 rounded-full bg-gradient-to-br ${getCardGradient(c)}`}/>
                              <span className="text-xs font-mono text-gray-300">••{c.last4}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Stats strip */}
                    {cardStats[(cards[cardActiveIdx]||cards[0]).last4] && (
                      <div className="grid grid-cols-2 gap-2 px-5 mb-3">
                        <div className="bg-red-500/10 border border-red-500/20 rounded-2xl px-4 py-3">
                          <p className="text-[9px] text-red-400 uppercase tracking-wider mb-0.5">Bu oy xarajat</p>
                          <p className="text-sm font-bold text-red-300">{fmtMoney(cardStats[(cards[cardActiveIdx]||cards[0]).last4].monthSpent)}</p>
                        </div>
                        <div className="bg-green-500/10 border border-green-500/20 rounded-2xl px-4 py-3">
                          <p className="text-[9px] text-green-400 uppercase tracking-wider mb-0.5">Bu oy kirim</p>
                          <p className="text-sm font-bold text-green-300">{fmtMoney(cardStats[(cards[cardActiveIdx]||cards[0]).last4].monthIncome)}</p>
                        </div>
                      </div>
                    )}

                    {/* Quick actions */}
                    <div className="grid grid-cols-4 gap-2 px-5 mb-3">
                      {[
                        { icon:'💳', label:'Payme',     action:()=>setInBrowserUrl('https://payme.uz') },
                        { icon:'🔵', label:'Click',     action:()=>setInBrowserUrl('https://click.uz') },
                        { icon:'📱', label:'iOS Setup', action:()=>setCardStep('shortcut') },
                        { icon:'🗑', label:"O'chir",    action:()=>deleteCard((cards[cardActiveIdx]||cards[0]).id) },
                      ].map(a=>(
                        <button key={a.label} onClick={a.action}
                          className="flex flex-col items-center gap-1.5 py-3 bg-[#1a1a1f] border border-gray-800/60 rounded-2xl active:scale-95 transition-transform">
                          <span className="text-lg">{a.icon}</span>
                          <span className="text-[9px] text-gray-400">{a.label}</span>
                        </button>
                      ))}
                    </div>

                    {/* Recent transactions for active card */}
                    {(() => {
                      const actCard = cards[cardActiveIdx]||cards[0]
                      const st = cardStats[actCard.last4]
                      if (!st || st.txs.length === 0) return null
                      return (
                        <div className="px-5 mb-4">
                          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">So'nggi tranzaksiyalar</p>
                          <div className="space-y-1.5">
                            {st.txs.slice(0,8).map(tx=>(
                              <div key={tx.id} className="flex items-center gap-3 p-3 bg-[#1a1a1f] border border-gray-800/40 rounded-2xl">
                                <span className="text-base">{tx.type==='DAROMAT'?'💚':'💸'}</span>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-white truncate">{tx.name}</p>
                                  <p className="text-[10px] text-gray-600">{tx.date}</p>
                                </div>
                                <p className={`text-sm font-bold shrink-0 ${tx.type==='DAROMAT'?'text-green-400':'text-red-400'}`}>
                                  {tx.type==='DAROMAT'?'+':'-'}{fmtMoney(tx.amount)}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )
                    })()}

                    {/* All cards list */}
                    <div className="px-5 space-y-2 mb-4">
                      {cards.map((c,i)=>(
                        <button key={c.id} onClick={()=>setCardActiveIdx(i)}
                          className={`w-full flex items-center gap-3 p-3 rounded-2xl border transition-all ${i===cardActiveIdx?'bg-white/5 border-white/10':'bg-[#1a1a1f] border-gray-800/40'}`}>
                          <div className={`w-10 h-7 bg-gradient-to-br ${getCardGradient(c)} rounded-lg shrink-0`}/>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-mono text-white">**** **** **** {c.last4}</p>
                            <p className="text-[10px] text-gray-500">{c.holder||c.brand?.toUpperCase()} · {c.expiry}</p>
                          </div>
                          {c.balance != null && <span className="text-[10px] text-blue-400 font-mono shrink-0">{fmtMoney(c.balance)}</span>}
                          {c.verified ? <span className="text-[9px] text-green-400 bg-green-500/10 px-2 py-0.5 rounded-full ml-1">✓</span>
                            : <span className="text-[9px] text-yellow-400 bg-yellow-500/10 px-2 py-0.5 rounded-full ml-1">⏳</span>}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Add button */}
                <div className="px-5 space-y-2">
                  <button onClick={()=>{setCardStep('add');setCardError('');setCardForm({number:'',expiry:'',holder:''})}}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-sm font-bold active:scale-95 transition-transform shadow-lg shadow-blue-600/20">
                    ➕ Yangi karta qo'shish
                  </button>
                  <button onClick={()=>setCardStep('shortcut')}
                    className="w-full py-3 bg-[#1a1a1f] border border-gray-800/60 rounded-2xl text-sm font-medium text-gray-300 active:scale-95 transition-transform">
                    📱 iOS Shortcut — SMS avtoimport
                  </button>
                  <div className="mt-2 flex items-center gap-2 justify-center">
                    <span className="text-lg">🔐</span>
                    <p className="text-[11px] text-gray-600">To'liq raqam saqlanmaydi · Xavfsiz</p>
                  </div>
                </div>
              </>
            )}

            {/* ── iOS SHORTCUT SETUP ── */}
            {cardStep === 'shortcut' && (
              <div className="px-5 space-y-4">
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-3xl p-5">
                  <p className="text-sm font-bold text-blue-300 mb-1">📱 iOS Shortcuts bilan avtomatik import</p>
                  <p className="text-xs text-gray-400 leading-relaxed">Bank SMS kelganda Jarvis avtomatik xarajat sifatida yozadi. Balans ham yangilanadi.</p>
                </div>

                <div className="space-y-3">
                  <div className="bg-[#1a1a1f] border border-gray-800/60 rounded-2xl p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">1. Webhook URL</p>
                    <div className="bg-[#111114] rounded-xl px-3 py-2.5 flex items-center gap-2">
                      <code className="text-[11px] text-green-400 flex-1 break-all">
                        {typeof window !== 'undefined' ? window.location.origin : 'https://your-app.vercel.app'}/api/sms-import
                      </code>
                      <button
                        onClick={()=>{
                          const url = `${window.location.origin}/api/sms-import`
                          navigator.clipboard.writeText(url).catch(()=>{})
                        }}
                        className="shrink-0 text-[10px] text-blue-400 bg-blue-500/10 px-2 py-1 rounded-lg active:scale-90">
                        Nusxa
                      </button>
                    </div>
                  </div>

                  <div className="bg-[#1a1a1f] border border-gray-800/60 rounded-2xl p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-3">2. Qadamlar</p>
                    {[
                      { n:'1', t:'iPhone Shortcuts ilovasini oching' },
                      { n:'2', t:'Yangi Shortcut yarating (+)' },
                      { n:'3', t:'"Automation" → "Message" → filtri: Bank nomi' },
                      { n:'4', t:'"URL" ni yuqoridagi linkka o\'rnating' },
                      { n:'5', t:'Method: POST, Body: {"text": "Shortcut Input"}' },
                      { n:'6', t:'Saqlang — endi har SMS avtomatik keladi ✅' },
                    ].map(s=>(
                      <div key={s.n} className="flex gap-3 mb-2.5 last:mb-0">
                        <span className="w-5 h-5 bg-blue-500/20 text-blue-400 rounded-full text-[10px] flex items-center justify-center shrink-0 font-bold mt-0.5">{s.n}</span>
                        <p className="text-xs text-gray-300 leading-relaxed">{s.t}</p>
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#1a1a1f] border border-gray-800/60 rounded-2xl p-4">
                    <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">3. Test qiling</p>
                    <p className="text-xs text-gray-400 mb-3">Quyidagi bank SMS formatini yuborib ko'ring:</p>
                    <div className="bg-[#111114] rounded-xl px-3 py-2.5">
                      <code className="text-[10px] text-green-400 leading-relaxed">
                        Uzcard *1234 dan 50000 so&apos;m sarflandi. Qoldiq: 1500000 so&apos;m
                      </code>
                    </div>
                  </div>
                </div>

                <button onClick={()=>setCardStep('list')}
                  className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl text-sm font-bold active:scale-95 transition-transform">
                  ✅ Tushundim
                </button>
              </div>
            )}

            {/* ── ADD FORM ── */}
            {cardStep === 'add' && (
              <div className="px-5">
                {/* Live card preview */}
                <div className={`relative bg-gradient-to-br ${liveGrad} rounded-3xl p-5 mb-5 overflow-hidden shadow-xl transition-all duration-300`} style={{aspectRatio:'1.6/1'}}>
                  <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full"/>
                  <div className="absolute -right-4 bottom-4 w-24 h-24 bg-white/5 rounded-full"/>
                  <div className="w-9 h-6 bg-white/20 rounded-md mb-4 flex items-center justify-center">
                    <div className="w-5 h-3.5 border border-white/30 rounded-sm grid grid-cols-2 gap-px p-0.5">
                      <div className="bg-white/20 rounded-sm"/><div className="bg-white/20 rounded-sm"/>
                      <div className="bg-white/20 rounded-sm"/><div className="bg-white/20 rounded-sm"/>
                    </div>
                  </div>
                  <p className="text-[15px] font-mono tracking-[0.18em] text-white mb-5 transition-all">{previewNumber}</p>
                  <div className="flex items-end justify-between">
                    <div>
                      <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Egasi</p>
                      <p className="text-sm text-white">{cardForm.holder||'ISM FAMILIYA'}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">Muddat</p>
                      <p className="text-sm text-white">{cardForm.expiry||'MM/YY'}</p>
                    </div>
                    <p className="text-[11px] font-bold text-white/60 tracking-widest">{liveBrand}</p>
                  </div>
                </div>

                {/* Color picker */}
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Rang tanlang</p>
                <div className="flex gap-2 mb-5 overflow-x-auto pb-1">
                  {CARD_GRADIENTS.map(g=>(
                    <button key={g.id} onClick={()=>setCardColorPick(g.id)}
                      className={`shrink-0 flex flex-col items-center gap-1 transition-all`}>
                      <div className={`w-10 h-7 bg-gradient-to-br ${g.cls} rounded-xl ${cardColorPick===g.id?'ring-2 ring-white scale-110':'opacity-60'} transition-all`}/>
                      <span className="text-[8px] text-gray-500">{g.label}</span>
                    </button>
                  ))}
                </div>

                {/* Inputs */}
                <div className="space-y-3">
                  <div>
                    <p className="text-[11px] text-gray-500 mb-1.5">Karta raqami</p>
                    <input value={cardForm.number}
                      onChange={e=>{let v=e.target.value.replace(/\D/g,'').slice(0,16);v=v.replace(/(.{4})/g,'$1 ').trim();setCardForm(p=>({...p,number:v}))}}
                      placeholder="0000 0000 0000 0000" maxLength={19}
                      className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-4 py-3.5 text-base font-mono tracking-widest outline-none focus:border-blue-500 transition-colors"
                      style={{fontSize:'18px'}} inputMode="numeric"
                    />
                  </div>
                  <div className="flex gap-3">
                    <div className="w-28">
                      <p className="text-[11px] text-gray-500 mb-1.5">Muddat</p>
                      <input value={cardForm.expiry}
                        onChange={e=>{let v=e.target.value.replace(/\D/g,'').slice(0,4);if(v.length>2)v=v.slice(0,2)+'/'+v.slice(2);setCardForm(p=>({...p,expiry:v}))}}
                        placeholder="MM/YY" maxLength={5}
                        className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-3 py-3.5 text-base font-mono outline-none focus:border-blue-500 transition-colors"
                        style={{fontSize:'16px'}} inputMode="numeric"
                      />
                    </div>
                    <div className="flex-1">
                      <p className="text-[11px] text-gray-500 mb-1.5">Egasi (ixtiyoriy)</p>
                      <input value={cardForm.holder}
                        onChange={e=>setCardForm(p=>({...p,holder:e.target.value.toUpperCase()}))}
                        placeholder="ISM FAMILIYA"
                        className="w-full bg-[#1a1a1f] border border-gray-700 rounded-2xl px-3 py-3.5 text-sm font-mono outline-none focus:border-blue-500 transition-colors uppercase"
                        style={{fontSize:'14px'}}
                      />
                    </div>
                  </div>
                  {cardError && <p className="text-red-400 text-sm px-1">⚠️ {cardError}</p>}
                  <button onClick={addCard} disabled={cardAdding||liveNum.length!==16}
                    className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-600 disabled:from-gray-700 disabled:to-gray-700 rounded-2xl text-sm font-bold active:scale-95 transition-all shadow-lg shadow-blue-600/20">
                    {cardAdding ? '⏳ Tekshirilmoqda...' : '✅ Karta qo\'shish'}
                  </button>
                </div>
              </div>
            )}

            {/* ── OTP STEP ── */}
            {cardStep === 'otp' && (
              <div className="px-5">
                <div className="bg-[#1a1a1f] border border-gray-800/60 rounded-3xl p-6 mb-4">
                  <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">📱</span>
                  </div>
                  <p className="text-center text-sm text-white font-medium mb-1">SMS kod yuborildi</p>
                  <p className="text-center text-xs text-gray-500 mb-6">Telefon raqamingizga kelgan 6 ta raqamli kodni kiriting</p>
                  <input value={cardOtp}
                    onChange={e=>setCardOtp(e.target.value.replace(/\D/g,'').slice(0,6))}
                    placeholder="• • • • • •" maxLength={6}
                    className="w-full bg-[#111114] border border-gray-700 rounded-2xl px-4 py-4 text-center text-3xl font-mono tracking-[0.6em] outline-none focus:border-blue-500"
                    style={{fontSize:'28px'}} inputMode="numeric" autoFocus
                  />
                </div>
                {cardError && <p className="text-red-400 text-sm text-center mb-3">⚠️ {cardError}</p>}
                <button onClick={verifyCardOtp} disabled={cardAdding||cardOtp.length!==6}
                  className="w-full py-4 bg-gradient-to-r from-green-600 to-emerald-600 disabled:from-gray-700 disabled:to-gray-700 rounded-2xl text-sm font-bold active:scale-95 transition-all shadow-lg shadow-green-600/20">
                  {cardAdding ? '⏳ Tekshirilmoqda...' : '✅ Tasdiqlash'}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ IN-APP BROWSER (proxy orqali) ══ */}
      {inBrowserUrl && (
        <div className="fixed inset-0 z-[70] bg-[#0a0a0c] flex flex-col">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#111114] border-b border-gray-800/60 shrink-0"
               style={{paddingTop:'calc(0.5rem + env(safe-area-inset-top,0px))'}}>
            <button onClick={()=>setInBrowserUrl(null)}
              className="w-9 h-9 rounded-xl bg-[#1a1a1f] flex items-center justify-center shrink-0 active:scale-90">
              <X size={14} className="text-gray-400"/>
            </button>
            <div className="flex-1 flex items-center gap-2 bg-[#1a1a1f] rounded-xl px-3 py-2 min-w-0">
              <Globe size={10} className="text-gray-500 shrink-0"/>
              <span className="text-[11px] text-gray-400 truncate">{inBrowserUrl.replace(/^https?:\/\//,'')}</span>
            </div>
            {/* Yangilash */}
            <button onClick={()=>{ const u=inBrowserUrl; setInBrowserUrl(null); setTimeout(()=>setInBrowserUrl(u),50) }}
              className="w-9 h-9 rounded-xl bg-[#1a1a1f] flex items-center justify-center shrink-0 active:scale-90">
              <RefreshCw size={13} className="text-gray-400"/>
            </button>
            {/* Tashqi brauzerda ochish (zaxira) */}
            <button onClick={()=>{ try{ webAppRef.current?.openLink?.(inBrowserUrl,{try_instant_view:false}) }catch{ window.open(inBrowserUrl,'_blank') } }}
              className="w-9 h-9 rounded-xl bg-[#1a1a1f] flex items-center justify-center shrink-0 active:scale-90">
              <ExternalLink size={13} className="text-blue-400"/>
            </button>
          </div>
          {/* Proxy iframe — X-Frame-Options olib tashlangan */}
          <iframe
            key={inBrowserUrl}
            src={`/api/proxy?url=${encodeURIComponent(inBrowserUrl)}`}
            className="flex-1 w-full border-none"
            style={{background:'#fff'}}
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; geolocation; payment"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation allow-modals"
            title="In-app browser"
            onLoad={e => {
              // iframe dan "tashqi ochish" xabari kelsa — openLink qilamiz
              const win = (e.target as HTMLIFrameElement).contentWindow
              if (!win) return
              const handler = (msg: MessageEvent) => {
                if (msg.data?.type === 'OPEN_EXTERNAL' && msg.data.url) {
                  try{ webAppRef.current?.openLink?.(msg.data.url,{try_instant_view:false}) }
                  catch{ window.open(msg.data.url,'_blank') }
                  setInBrowserUrl(null)
                }
              }
              window.addEventListener('message', handler, { once: true })
            }}
          />
        </div>
      )}

      {/* ══ GMAIL PANEL ══ */}
      {gmailOpen && (
        <div className="fixed inset-0 z-[80] bg-[#0a0a0c] flex flex-col"
             style={{paddingTop:'env(safe-area-inset-top,0px)'}}>
          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 bg-[#111114] border-b border-gray-800/60 shrink-0">
            <button onClick={()=>{
              if (gmailMsg) setGmailMsg(null)
              else setGmailOpen(false)
            }} className="w-9 h-9 rounded-xl bg-[#1a1a1f] flex items-center justify-center active:scale-90">
              <X size={15} className="text-gray-400"/>
            </button>
            {!gmailMsg ? (
              <div className="flex-1 flex items-center gap-2 bg-[#1a1a1f] rounded-xl px-3 py-2 min-w-0">
                <Search size={12} className="text-gray-500 shrink-0"/>
                <input value={gmailQ} onChange={e=>setGmailQ(e.target.value)}
                  placeholder="Gmail qidirish..." onKeyDown={e=>e.key==='Enter'&&loadGmail(gmailQ||'in:inbox')}
                  className="flex-1 bg-transparent text-sm text-white placeholder-gray-600 outline-none"/>
              </div>
            ) : (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-white truncate">{gmailMsg.subject || '(no subject)'}</p>
                <p className="text-[10px] text-gray-500">{gmailMsg.fromName} · {gmailMsg.date}</p>
              </div>
            )}
            <button onClick={()=>loadGmail(gmailQ||'in:inbox')}
              className="w-9 h-9 rounded-xl bg-[#1a1a1f] flex items-center justify-center active:scale-90 shrink-0">
              <RefreshCw size={13} className={`text-gray-400 ${gmailLoading?'animate-spin':''}`}/>
            </button>
          </div>

          {/* Filter pills */}
          {!gmailMsg && !gmailSetup && (
            <div className="flex gap-2 px-4 py-2 overflow-x-auto shrink-0 border-b border-gray-800/40">
              {[
                {label:'📥 Inbox', q:'in:inbox'},
                {label:'⭐ Starred', q:'is:starred'},
                {label:'🏦 Bank', q:'from:bank OR uzumbank OR kapitalbank OR hamkorbank'},
                {label:'📦 Orders', q:'order OR buyurtma OR "to\'lov"'},
                {label:'📧 Unread', q:'is:unread'},
              ].map(f=>(
                <button key={f.q} onClick={()=>{setGmailQ(f.q);loadGmail(f.q)}}
                  className="px-3 py-1.5 bg-[#1a1a1f] border border-gray-800/40 rounded-full text-[11px] text-gray-300 whitespace-nowrap active:scale-95 shrink-0">
                  {f.label}
                </button>
              ))}
            </div>
          )}

          <div className="flex-1 overflow-y-auto">
            {/* Setup required */}
            {gmailSetup && (
              <div className="p-4 space-y-4">
                <div className="text-center py-4">
                  <div className="text-4xl mb-2">✉️</div>
                  <p className="text-sm font-semibold text-white">Gmail ni ulash</p>
                  <p className="text-xs text-gray-500 mt-1">Google OAuth orqali xavfsiz ulanish</p>
                </div>
                <div className="bg-[#1a1a1f] border border-blue-500/20 rounded-2xl p-4 space-y-2">
                  <p className="text-xs text-blue-400 font-bold uppercase">Bir marta bajaring:</p>
                  {[
                    '1. console.cloud.google.com da project yarating',
                    '2. Gmail API ni yoqing',
                    '3. OAuth 2.0 credentials yarating (Web app)',
                    '4. Redirect URI: jarvise-mini-app-jf5u.vercel.app/api/gmail/callback',
                    '5. GMAIL_CLIENT_ID va GMAIL_CLIENT_SECRET ni Vercel ga qo\'shing',
                    '6. Quyidagi tugmani bosing → Gmail ni authorize qiling',
                  ].map((s,i)=>(
                    <p key={i} className="text-xs text-gray-300 leading-relaxed">{s}</p>
                  ))}
                </div>
                <button onClick={()=>{ try{ webAppRef.current?.openLink?.(`${window.location.origin}/api/gmail/auth`,{try_instant_view:false}) }catch{ window.open('/api/gmail/auth','_blank') } }}
                  className="w-full py-3 bg-blue-600 rounded-2xl text-sm font-semibold text-white active:scale-95">
                  🔗 Gmail ni ulash (OAuth)
                </button>
                <p className="text-[10px] text-gray-600 text-center">
                  Parol talab qilinmaydi. Google sizning ruxsatingizni so&apos;raydi.
                </p>
              </div>
            )}

            {/* Loading */}
            {gmailLoading && !gmailSetup && (
              <div className="flex items-center justify-center py-16">
                <RefreshCw size={22} className="text-red-400 animate-spin"/>
              </div>
            )}

            {/* Email list */}
            {!gmailLoading && !gmailSetup && !gmailMsg && gmailMsgs.map(m=>(
              <button key={m.id} onClick={()=>openGmailMsg(m.id)}
                className={`w-full flex items-start gap-3 px-4 py-3 border-b border-gray-800/30 active:bg-gray-800/20 text-left ${m.unread?'bg-[#0f0f12]':''}`}>
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm shrink-0 mt-0.5 ${m.unread?'bg-red-500/20':'bg-[#1a1a1f]'}`}>
                  {m.fromName.charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <p className={`text-sm truncate ${m.unread?'font-semibold text-white':'text-gray-300'}`}>
                      {m.fromName}
                    </p>
                    <p className="text-[10px] text-gray-500 shrink-0">{m.date}</p>
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${m.unread?'text-gray-200':'text-gray-400'}`}>
                    {m.subject || '(no subject)'}
                  </p>
                  <p className="text-[11px] text-gray-600 truncate mt-0.5">{m.snippet}</p>
                </div>
                {m.unread && <div className="w-2 h-2 rounded-full bg-red-400 mt-2 shrink-0"/>}
              </button>
            ))}

            {/* Empty state */}
            {!gmailLoading && !gmailSetup && !gmailMsg && gmailMsgs.length === 0 && (
              <div className="text-center py-16">
                <div className="text-4xl mb-3">📭</div>
                <p className="text-sm text-gray-400">Email topilmadi</p>
              </div>
            )}

            {/* Email content */}
            {gmailMsg && !gmailLoading && (
              <div className="p-4">
                <div className="bg-[#111114] rounded-2xl p-4 mb-4">
                  <p className="text-base font-semibold text-white mb-1">{gmailMsg.subject}</p>
                  <p className="text-xs text-gray-500">✉️ {gmailMsg.fromName}</p>
                  <p className="text-xs text-gray-600">{gmailMsg.date}</p>
                </div>
                <div className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">
                  {gmailMsg.body || gmailMsg.snippet}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ NOTION PANEL ══ */}
      {notionOpen && (()=>{
        // ── Color maps ────────────────────────────────────────────────────
        const STATUS_COLORS: Record<string,{bg:string;color:string}> = {
          'Done':{bg:'rgba(68,131,97,0.2)',color:'#4cc38a'},
          'Completed':{bg:'rgba(68,131,97,0.2)',color:'#4cc38a'},
          'In progress':{bg:'rgba(35,131,226,0.2)',color:'#529cca'},
          'Not started':{bg:'rgba(120,120,120,0.15)',color:'#787774'},
          'High':{bg:'rgba(212,76,71,0.2)',color:'#e03e3e'},
          'Medium':{bg:'rgba(203,145,47,0.2)',color:'#dfab01'},
          'Low':{bg:'rgba(120,120,120,0.15)',color:'#787774'},
          'Planning':{bg:'rgba(144,101,176,0.2)',color:'#9065b0'},
          'Faol':{bg:'rgba(35,131,226,0.2)',color:'#529cca'},
          "To'langan":{bg:'rgba(68,131,97,0.2)',color:'#4cc38a'},
          'Aktiv':{bg:'rgba(35,131,226,0.2)',color:'#529cca'},
          'Tugatildi':{bg:'rgba(120,120,120,0.15)',color:'#787774'},
        }
        const CALLOUT_BG: Record<string,string> = {
          gray_background:'rgba(241,241,239,0.07)', brown_background:'rgba(244,238,238,0.07)',
          orange_background:'rgba(251,236,221,0.1)', yellow_background:'rgba(251,243,219,0.1)',
          green_background:'rgba(237,243,236,0.1)', blue_background:'rgba(231,243,248,0.1)',
          purple_background:'rgba(244,240,247,0.08)', pink_background:'rgba(249,238,243,0.08)',
          red_background:'rgba(253,235,236,0.08)', default:'rgba(241,241,239,0.07)',
        }
        const NOTION_COLORS: Record<string,string> = {
          red:'#e03e3e', orange:'#d9730d', yellow:'#dfab01', green:'#0f7b6c',
          blue:'#0b6e99', purple:'#6940a5', pink:'#ad1a72', gray:'#9b9a97', brown:'#64473a',
        }

        // ── RichText renderer
        const RichText = ({ segs, style }: { segs?: NSeg[]; style?: React.CSSProperties }) => {
          if (!segs || segs.length===0) return null
          return (
            <span style={style}>
              {segs.map((s, si) => {
                let el: React.ReactNode = s.text
                if (s.code) {
                  el = <code key={si} style={{background:'rgba(135,131,120,0.15)',borderRadius:'3px',padding:'0.1em 0.3em',fontFamily:'monospace',fontSize:'85%',color:'#eb5757'}}>{el}</code>
                } else {
                  const st: React.CSSProperties = {}
                  if (s.bold) st.fontWeight = '700'
                  if (s.italic) st.fontStyle = 'italic'
                  if (s.strikethrough) st.textDecoration = 'line-through'
                  if (s.underline) st.textDecoration = 'underline'
                  if (s.color) st.color = NOTION_COLORS[s.color] || s.color
                  if (s.href) el = <a key={si} href={s.href} target="_blank" rel="noreferrer" style={{...st,color:'#529cca',textDecoration:'underline'}}>{el}</a>
                  else if (Object.keys(st).length) el = <span key={si} style={st}>{el}</span>
                }
                return <React.Fragment key={si}>{el}</React.Fragment>
              })}
            </span>
          )
        }

        // ── Single block renderer
        const renderBlock = (b: NBlock, idx: number, nc: {n:number}): React.ReactNode => {
          const txt = b.text
          const segs = b.segments || []
          const base: React.CSSProperties = {color:'#e9e9e7'}
          const muted: React.CSSProperties = {color:'#9b9a97'}
          const RT = () => <RichText segs={segs.length?segs:undefined}/>

          if (b.type==='divider') return <div key={b.id||idx} style={{borderTop:'1px solid #2e2e2e',margin:'12px 0'}}/>

          // ── Full Notion-style database table ────────────────────────────
          if (b.type==='db_table' && b.dbColumns && b.dbRows) {
            nc.n = 0
            const cols = b.dbColumns
            const rowsData = b.dbRows
            const parseClr = (c?:string) => { if (!c) return null; const [bg,fg]=c.split('|'); return {bg,fg} }
            return (
              <div key={b.id||idx} className="my-3 rounded-xl overflow-hidden" style={{border:'1px solid #2e2e2e'}}>
                {/* DB Header */}
                <div className="flex items-center gap-2 px-3 py-2.5" style={{background:'#1e1e1e',borderBottom:'1px solid #2e2e2e'}}>
                  <span className="text-[16px]">{b.icon||'🗃'}</span>
                  <p className="text-[14px] font-semibold flex-1" style={{color:'#e9e9e7'}}>{txt}</p>
                  <span className="text-[11px] px-1.5 py-0.5 rounded-md" style={{background:'#2e2e2e',color:'#787774'}}>{rowsData.length}</span>
                  <button onClick={()=>b.id&&openNotionPage({id:b.id,title:txt,url:''})}
                    className="ml-1 w-6 h-6 flex items-center justify-center rounded-md active:bg-white/10">
                    <ExternalLink size={11} style={{color:'#787774'}}/>
                  </button>
                </div>
                {/* Table */}
                <div className="overflow-x-auto">
                  <table style={{width:'100%',borderCollapse:'collapse',minWidth:`${Math.max(320,cols.length*120)}px`}}>
                    <thead>
                      <tr style={{background:'#181818'}}>
                        {cols.map((col:{name:string;type:string}, ci:number) => (
                          <th key={ci} className="text-left px-3 py-1.5" style={{
                            color:'#555',borderBottom:'1px solid #2e2e2e',
                            fontSize:'10px',fontWeight:'600',textTransform:'uppercase',letterSpacing:'0.06em',
                            whiteSpace:'nowrap', width:col.type==='title'?'38%':undefined
                          }}>{col.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowsData.length===0 && (
                        <tr><td colSpan={cols.length} className="px-3 py-4 text-center text-[12px]" style={{color:'#444'}}>Bo&apos;sh</td></tr>
                      )}
                      {rowsData.map((row:DBRow, ri:number) => (
                        <tr key={row.id} onClick={()=>openNotionPage({id:row.id,title:row.title,url:row.url})}
                          className="active:bg-white/5" style={{borderBottom:'1px solid #1e1e1e',cursor:'pointer'}}>
                          {cols.map((col:{name:string;type:string}, ci:number) => {
                            if (col.type==='title') return (
                              <td key={ci} className="px-3 py-2">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-[13px] shrink-0">{row.icon||'📄'}</span>
                                  <span className="text-[13px] font-medium" style={{color:'#e9e9e7',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'140px',display:'block'}}>{row.title||'Nomsiz'}</span>
                                </div>
                              </td>
                            )
                            const cell = row.cells[col.name]
                            if (!cell?.text) return <td key={ci} className="px-3 py-2" style={{color:'#333',fontSize:'12px'}}>—</td>
                            const clr = parseClr(cell.color)
                            if (clr && ['status','select','multi_select'].includes(cell.kind)) return (
                              <td key={ci} className="px-3 py-2">
                                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium whitespace-nowrap"
                                  style={{background:clr.bg,color:clr.fg}}>{cell.text}</span>
                              </td>
                            )
                            return (
                              <td key={ci} className="px-3 py-2" style={{color:'#787774',fontSize:'12px',maxWidth:'140px',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{cell.text}</td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          }

          // ── Fallback: old db_header / db_item ────────────────────────
          if (b.type==='db_header') return (
            <div key={b.id||idx} className="pt-5 pb-1.5">
              <p className="text-xs font-semibold uppercase tracking-wider" style={{color:'#787774'}}>🗄 {txt}</p>
            </div>
          )

          if (b.type==='db_item') {
            nc.n = 0
            const match = txt.match(/^(.*?)\s{2}\[(.+)\]$/)
            const title = match ? match[1].trim() : txt
            const status = match ? match[2] : ''
            const sc = STATUS_COLORS[status] || {bg:'rgba(120,120,120,0.1)',color:'#9b9a97'}
            return (
              <button key={b.id||idx} onClick={()=>b.id&&openNotionPage({id:b.id,title,url:b.url||''})}
                className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg active:bg-white/5 text-left"
                style={{borderBottom:'1px solid #2e2e2e'}}>
                <span className="text-[15px] shrink-0">{b.icon||'📄'}</span>
                <p className="flex-1 text-[14px] truncate" style={base}>{title}</p>
                {status && <span className="text-[11px] px-2 py-0.5 rounded-md shrink-0 font-medium" style={{background:sc.bg,color:sc.color}}>{status}</span>}
                <ChevronRight size={12} style={{color:'#444'}}/>
              </button>
            )
          }

          if (b.type==='child_page'||b.type==='child_database') {
            nc.n = 0
            return (
              <button key={b.id||idx} onClick={()=>b.id&&openNotionPage({id:b.id,title:txt,url:b.url||''})}
                className="w-full flex items-center gap-2 py-1.5 rounded-lg active:bg-white/5 text-left">
                <span className="text-[15px]">{b.type==='child_database'?'🗃':'📄'}</span>
                <p className="text-[14px] flex-1" style={{color:'#2383e2'}}>{txt}</p>
                <ChevronRight size={12} style={{color:'#2383e2',opacity:0.5}}/>
              </button>
            )
          }

          if (b.type==='heading_1') { nc.n=0; return <h2 key={b.id||idx} className="text-xl font-bold pt-5 pb-1.5 leading-snug" style={base}>{segs.length?<RT/>:txt}</h2> }
          if (b.type==='heading_2') { nc.n=0; return <h3 key={b.id||idx} className="text-[16px] font-semibold pt-4 pb-1" style={base}>{segs.length?<RT/>:txt}</h3> }
          if (b.type==='heading_3') { nc.n=0; return <h4 key={b.id||idx} className="text-[13px] font-semibold pt-3 pb-0.5 uppercase tracking-wide" style={{color:'#787774'}}>{segs.length?<RT/>:txt}</h4> }

          if (b.type==='bulleted_list_item') {
            nc.n = 0
            return (
              <div key={b.id||idx} className="flex gap-2 py-0.5 items-start">
                <span className="shrink-0 mt-[4px]" style={{color:'#787774',fontSize:'11px'}}>•</span>
                <p className="text-[14px] leading-relaxed" style={base}>{segs.length?<RT/>:txt}</p>
              </div>
            )
          }

          if (b.type==='numbered_list_item') {
            nc.n++
            return (
              <div key={b.id||idx} className="flex gap-2 py-0.5 items-start">
                <span className="shrink-0 text-[13px] min-w-[18px] text-right" style={{color:'#787774'}}>{nc.n}.</span>
                <p className="text-[14px] leading-relaxed" style={base}>{segs.length?<RT/>:txt}</p>
              </div>
            )
          }

          if (b.type==='to_do') {
            nc.n = 0
            return (
              <div key={b.id||idx} className="flex gap-2.5 py-0.5 items-start">
                <span className="shrink-0 mt-[1px] text-[15px]">{b.checked?'✅':'⬜'}</span>
                <p className="text-[14px] leading-relaxed" style={b.checked?{color:'#787774',textDecoration:'line-through'}:base}>
                  {segs.length?<RT/>:txt}
                </p>
              </div>
            )
          }

          if (b.type==='quote') {
            nc.n = 0
            return (
              <div key={b.id||idx} className="my-1" style={{borderLeft:'3px solid #787774',paddingLeft:'12px'}}>
                <p className="text-[14px] italic leading-relaxed" style={muted}>{segs.length?<RT/>:txt}</p>
              </div>
            )
          }

          if (b.type==='callout') {
            nc.n = 0
            const bg = CALLOUT_BG[b.color||'default'] || CALLOUT_BG.default
            return (
              <div key={b.id||idx} className="flex gap-3 p-3 rounded-lg my-1" style={{background:bg,border:'1px solid rgba(255,255,255,0.06)'}}>
                <span className="text-[18px] shrink-0 mt-0.5">{b.icon||'💡'}</span>
                <p className="text-[14px] leading-relaxed" style={base}>{segs.length?<RT/>:txt}</p>
              </div>
            )
          }

          if (b.type==='code') {
            nc.n = 0
            return (
              <div key={b.id||idx} className="my-2 rounded-lg overflow-hidden" style={{background:'#1e1e1e'}}>
                {b.color && <div className="px-3 py-1 text-[10px] font-mono" style={{background:'#2a2a2a',color:'#787774',borderBottom:'1px solid #333'}}>{b.color}</div>}
                <pre className="p-3 text-[12px] overflow-x-auto leading-relaxed" style={{color:'#cdd9e5',fontFamily:'monospace'}}>{txt}</pre>
              </div>
            )
          }

          if (b.type==='image' && b.src) {
            nc.n = 0
            return (
              <div key={b.id||idx} className="my-2">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.src} alt={txt||'image'} className="w-full rounded-lg" style={{maxHeight:'300px',objectFit:'cover'}}/>
                {txt && <p className="text-[11px] text-center mt-1" style={{color:'#787774'}}>{txt}</p>}
              </div>
            )
          }

          if (b.type==='table' && b.rows) {
            nc.n = 0
            return (
              <div key={b.id||idx} className="my-2 overflow-x-auto">
                <table className="w-full text-[13px]" style={{borderCollapse:'collapse'}}>
                  <tbody>
                    {b.rows.map((row, ri) => (
                      <tr key={ri} style={{borderBottom:'1px solid #2e2e2e',background:ri===0&&b.hasColumnHeader?'rgba(255,255,255,0.04)':undefined}}>
                        {row.map((cell, ci) => (
                          <td key={ci} className="px-2.5 py-1.5" style={{color:ri===0&&b.hasColumnHeader?'#e9e9e7':'#9b9a97',fontWeight:ri===0&&b.hasColumnHeader?'600':undefined,borderRight:'1px solid #2e2e2e'}}>{cell}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          }

          if (b.type==='toggle') {
            nc.n = 0
            const isOpen = openToggles.has(b.id)
            return (
              <div key={b.id||idx} className="my-0.5">
                <button onClick={()=>setOpenToggles(s=>{const n=new Set(s); isOpen?n.delete(b.id):n.add(b.id); return n})}
                  className="w-full flex items-start gap-2 py-1 rounded-md active:bg-white/5 text-left">
                  <span className="shrink-0 mt-[4px] text-[9px]" style={{color:'#787774',display:'inline-block',transform:isOpen?'rotate(90deg)':'rotate(0deg)',transition:'transform 0.15s'}}>▶</span>
                  <p className="text-[14px] leading-relaxed flex-1 font-medium" style={base}>{segs.length?<RT/>:txt}</p>
                </button>
                {isOpen && b.children && b.children.length>0 && (
                  <div className="ml-4 pl-3" style={{borderLeft:'1px solid #2e2e2e'}}>
                    {(()=>{ const nc2={n:0}; return b.children!.map((ch,ci)=>renderBlock(ch,ci,nc2)) })()}
                  </div>
                )}
              </div>
            )
          }

          // Paragraph default
          nc.n = 0
          if (!txt && !segs.length) return null
          return <p key={b.id||idx} className="text-[14px] py-0.5 leading-relaxed" style={muted}>{segs.length?<RT/>:txt}</p>
        }

        // ── Last edited formatter
        const fmtDate = (iso?: string) => {
          if (!iso) return ''
          try {
            const d = new Date(iso), now = new Date()
            const h = (now.getTime()-d.getTime())/3600000
            if (h<1) return 'hozirgina'
            if (h<24) return `${Math.floor(h)}s oldin`
            if (h<48) return 'kecha'
            if (h<168) return `${Math.floor(h/24)} kun oldin`
            return d.toLocaleDateString('uz-UZ',{day:'2-digit',month:'short'})
          } catch { return '' }
        }

        return (
        <div className="fixed inset-0 z-[80] flex flex-col" style={{background:'#191919',paddingTop:'env(safe-area-inset-top,0px)'}}>

          {/* ── Header ── */}
          <div className="flex items-center gap-2 px-3 py-2.5 shrink-0" style={{borderBottom:'1px solid #2e2e2e'}}>
            <button onClick={()=>{ if(notionPage) notionGoBack(); else setNotionOpen(false) }}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-white/10">
              <X size={16} style={{color:'#787774'}}/>
            </button>
            <div className="flex-1 flex items-center gap-1 min-w-0 overflow-hidden">
              {notionPageStack.map((p,i)=>(
                <span key={i} className="flex items-center gap-1 shrink-0">
                  <button onClick={()=>{ const stack=notionPageStack.slice(0,i); setNotionPageStack(stack); openNotionPage(p,false) }}
                    className="text-[12px] truncate max-w-[80px]" style={{color:'#787774'}}>{p.emoji||'📄'} {p.title}</button>
                  <ChevronRight size={10} style={{color:'#444'}}/>
                </span>
              ))}
              <span className="text-[13px] font-medium truncate" style={{color:'#e9e9e7'}}>
                {notionPage ? `${notionPage.emoji||'📄'} ${notionPage.title}` : '📝 Notion'}
              </span>
            </div>
            {!notionPage && <button onClick={loadNotionPages} className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-white/10">
              <RefreshCw size={14} className={notionLoading?'animate-spin':''} style={{color:'#787774'}}/>
            </button>}
            {notionPage && <button onClick={()=>{ try{webAppRef.current?.openLink?.(notionPage.url,{try_instant_view:false})}catch{window.open(notionPage.url,'_blank')} }}
              className="w-8 h-8 rounded-lg flex items-center justify-center active:bg-white/10">
              <ExternalLink size={14} style={{color:'#787774'}}/>
            </button>}
          </div>

          <div className="flex-1 overflow-y-auto">

            {/* ══ PAGE LIST ══ */}
            {!notionPage && (
              <div>
                <div className="px-4 pt-3 pb-1">
                  <div className="flex items-center gap-2 p-3 rounded-xl" style={{background:'rgba(35,131,226,0.08)',border:'1px solid rgba(35,131,226,0.2)'}}>
                    <span className="text-sm">🔔</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium" style={{color:'#2383e2'}}>Real-time kuzatuv</p>
                      {notionWatchResult
                        ? <p className="text-[10px]" style={{color:'#787774'}}>{notionWatchResult}</p>
                        : <p className="text-[10px]" style={{color:'#787774'}}>Har 5 daqiqada avtomatik tekshiriladi</p>}
                    </div>
                    <button onClick={runNotionWatch} disabled={notionWatchRunning}
                      className="shrink-0 px-3 py-1.5 rounded-lg text-[11px] font-medium disabled:opacity-40"
                      style={{background:'rgba(35,131,226,0.2)',color:'#2383e2'}}>
                      {notionWatchRunning ? '⏳' : '▶ Test'}
                    </button>
                  </div>
                </div>
                <div className="px-4 pt-2 pb-1">
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{background:'#2e2e2e'}}>
                    <Search size={13} style={{color:'#787774'}}/>
                    <input value={notionSearchQ} onChange={e=>setNotionSearchQ(e.target.value)}
                      placeholder="Sahifalarni qidiring..." className="flex-1 bg-transparent text-sm outline-none" style={{color:'#e9e9e7',fontSize:'14px'}}/>
                    {notionSearchQ && <button onClick={()=>setNotionSearchQ('')} style={{color:'#787774',fontSize:'11px'}}>✕</button>}
                  </div>
                </div>
                <div className="px-4 pt-1 pb-3 flex gap-2">
                  <input value={notionNewTitle} onChange={e=>setNotionNewTitle(e.target.value)}
                    placeholder="+ Yangi sahifa nomi..." onKeyDown={e=>e.key==='Enter'&&createNotionPage()}
                    className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{background:'#2e2e2e',color:'#e9e9e7',fontSize:'14px'}}/>
                  <button onClick={createNotionPage} disabled={!notionNewTitle.trim()||notionCreating}
                    className="px-3 py-2 rounded-lg text-sm font-medium flex items-center gap-1 disabled:opacity-40" style={{background:'#2383e2',color:'white'}}>
                    {notionCreating?<RefreshCw size={12} className="animate-spin"/>:<Plus size={14}/>}
                  </button>
                </div>

                {notionLoading && <div className="flex justify-center py-10"><RefreshCw size={18} className="animate-spin" style={{color:'#787774'}}/></div>}
                {!notionLoading && notionPages.length===0 && (
                  <div className="px-4 py-8 text-center space-y-3">
                    <div className="text-3xl">🔗</div>
                    <p className="text-sm font-medium" style={{color:'#e9e9e7'}}>Notion ni ulang</p>
                    <p className="text-xs" style={{color:'#787774'}}>Life Planner → ••• → Connections → jonka</p>
                    <button onClick={loadNotionPages} className="px-4 py-2 rounded-lg text-sm" style={{background:'#2e2e2e',color:'#2383e2'}}>🔄 Qayta yuklash</button>
                  </div>
                )}
                {!notionLoading && filteredNotionPages.length>0 && (
                  <div className="px-2">
                    {filteredNotionPages.map(p => (
                      <button key={p.id} onClick={()=>openNotionPage(p)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg active:bg-white/5 text-left">
                        <span className="text-[18px] w-7 text-center shrink-0">
                          {p.emoji||(p.type==='database'?'🗃':'📄')}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] truncate" style={{color:'#e9e9e7'}}>{p.title}</p>
                          {p.last_edited && <p className="text-[11px] mt-0.5" style={{color:'#555'}}>{fmtDate(p.last_edited)}</p>}
                        </div>
                        <ChevronRight size={13} style={{color:'#444'}}/>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ══ PAGE CONTENT ══ */}
            {notionPage && (
              <div>
                {notionCover && (
                  <div className="w-full overflow-hidden" style={{height:'140px'}}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={notionCover} alt="cover" style={{width:'100%',height:'100%',objectFit:'cover'}}/>
                  </div>
                )}
                <div className={`px-5 pb-4 ${notionCover?'pt-4':'pt-9'}`}>
                  {notionPage.emoji && <div className={`text-5xl ${notionCover?'-mt-8 mb-3':'mb-3'}`}>{notionPage.emoji}</div>}
                  <h1 className="text-[26px] font-bold leading-tight" style={{color:'#e9e9e7'}}>{notionPage.title}</h1>
                </div>

                {notionProps.length > 0 && (
                  <div className="px-5 pb-4 space-y-2.5" style={{borderBottom:'1px solid #2e2e2e'}}>
                    {notionProps.map((p,i)=>{
                      const sc = STATUS_COLORS[p.value]
                      return (
                        <div key={i} className="flex items-start gap-3">
                          <span className="text-[12px] w-28 shrink-0 pt-0.5" style={{color:'#787774'}}>{p.name}</span>
                          {sc
                            ? <span className="text-[12px] px-2 py-0.5 rounded-md font-medium" style={{background:sc.bg,color:sc.color}}>{p.value}</span>
                            : <span className="text-[13px] leading-relaxed" style={{color:'#e9e9e7'}}>{p.value}</span>}
                        </div>
                      )
                    })}
                  </div>
                )}

                {notionLoading && <div className="flex justify-center py-10"><RefreshCw size={18} className="animate-spin" style={{color:'#787774'}}/></div>}
                {!notionLoading && notionBlocks.length===0 && (
                  <p className="px-5 py-4 text-[13px]" style={{color:'#555'}}>Sahifa bo&apos;sh — pastdan matn qo&apos;shing</p>
                )}
                {!notionLoading && (
                  <div className="px-5 pb-6 space-y-0.5">
                    {(()=>{ const nc={n:0}; return notionBlocks.map((b,i)=>renderBlock(b,i,nc)) })()}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* ── Append footer ── */}
          {notionPage && (
            <div className="px-4 py-3 shrink-0" style={{borderTop:'1px solid #2e2e2e',background:'#191919',paddingBottom:'calc(0.75rem + env(safe-area-inset-bottom,0px))'}}>
              <div className="flex gap-2 items-center">
                <input value={notionAppend} onChange={e=>setNotionAppend(e.target.value)}
                  placeholder="Sahifaga yozing..." onKeyDown={e=>e.key==='Enter'&&appendToNotionPage()}
                  className="flex-1 px-3 py-2 rounded-lg text-sm outline-none" style={{background:'#2e2e2e',color:'#e9e9e7',fontSize:'14px'}}/>
                <button onClick={appendToNotionPage} disabled={!notionAppend.trim()}
                  className="w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-40 shrink-0" style={{background:'#2383e2'}}>
                  <Send size={14} className="text-white"/>
                </button>
              </div>
            </div>
          )}
        </div>
        )
      })()}

      {/* ══ APPS SHEET ══ */}
      {appsOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end backdrop-blur-sm" onClick={()=>setAppsOpen(false)}>
          <div className="w-full bg-[#0d0d10] border-t border-gray-800/60 rounded-t-3xl pb-8 max-h-[85vh] overflow-y-auto" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mt-3 mb-4"/>
            <div className="flex items-center justify-between px-5 mb-4">
              <h3 className="text-sm font-bold">📱 Ilovalar</h3>
              <button onClick={()=>setAppsOpen(false)} className="w-7 h-7 rounded-full bg-gray-800 flex items-center justify-center"><X size={13}/></button>
            </div>
            {[
              { group: '🚕 Transport', apps: [
                { icon:'🚕', label:'Yandex Go',   url:'https://yandex.uz/maps/taxi/',  tg:false, special:'' },
                { icon:'🚗', label:'InDrive',      url:'https://t.me/indrive_bot',      tg:true,  special:'' },
                { icon:'🛵', label:'Wolt',         url:'https://wolt.com/uz',           tg:false, special:'' },
                { icon:'🍕', label:'Yandex Yem',  url:'https://eda.yandex.uz',         tg:false, special:'' },
              ]},
              { group: '🛍 Xarid', apps: [
                { icon:'🛒', label:'Uzum Market', url:'https://t.me/uzummarketbot/market', tg:true  },
                { icon:'🏪', label:'Korzinka',    url:'https://korzinka.uz',            tg:false },
                { icon:'📦', label:'OLX',         url:'https://olx.uz',                tg:false },
                { icon:'🛍', label:'Makro',       url:'https://makro.uz',              tg:false },
              ]},
              { group: '💳 Moliya', apps: [
                { icon:'💳', label:'Click',       url:'https://t.me/click_bot',        tg:true  },
                { icon:'💰', label:'Payme',        url:'https://payme.uz',              tg:false },
                { icon:'🏦', label:'Kapitalbank',  url:'https://kapitalbank.uz',        tg:false },
                { icon:'💵', label:'Valyuta',      url:'https://google.com/search?q=dollar+uzs+bugun', tg:false },
              ]},
              { group: '🎯 Ijtimoiy', apps: [
                { icon:'📸', label:'Instagram',   url:'https://instagram.com',         tg:false },
                { icon:'▶️', label:'YouTube',     url:'https://youtube.com',           tg:false },
                { icon:'🎵', label:'TikTok',      url:'https://tiktok.com',            tg:false },
                { icon:'🌐', label:'TG Web',      url:'https://web.telegram.org',      tg:false },
              ]},
              { group: '🛠 Vositalar', apps: [
                { icon:'📝', label:'Notion',  url:'',                       tg:false, special:'notion' },
                { icon:'✉️', label:'Gmail',   url:'',                       tg:false, special:'gmail'  },
                { icon:'🗺', label:'Maps',    url:'https://maps.google.com',tg:false, special:''       },
                { icon:'🎨', label:'Figma',   url:'https://figma.com',      tg:false, special:''       },
              ]},
            ].map(section => (
              <div key={section.group} className="px-4 mb-4">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">{section.group}</p>
                <div className="grid grid-cols-4 gap-3">
                  {section.apps.map(app=>(
                    <button key={app.label} onClick={()=>{setAppsOpen(false);openApp(app.url,app.tg,(app as {special?:string}).special)}} className="flex flex-col items-center gap-1.5 active:scale-90 transition-transform">
                      <div className="w-14 h-14 bg-[#1a1a1f] border border-gray-800/60 rounded-2xl flex items-center justify-center text-2xl shadow-md relative">
                        {app.icon}
                        {app.tg && <span className="absolute -top-1 -right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center text-[7px] font-bold">TG</span>}
                      </div>
                      <span className="text-[10px] text-gray-400 text-center leading-tight">{app.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══ BUDGET MODAL ══ */}
      {budgetOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-end backdrop-blur-sm" onClick={()=>setBudgetOpen(false)}>
          <div className="w-full bg-[#111114] border-t border-gray-800 rounded-t-3xl p-5 pb-10" onClick={e=>e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-700 rounded-full mx-auto mb-4"/>
            <h3 className="text-sm font-bold mb-4">📊 Oylik Limit Belgilash</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[10px] text-gray-400 uppercase font-bold mb-1 block">Kategoriya</label>
                <input value={budgetForm.category} onChange={e=>setBudgetForm(p=>({...p,category:e.target.value}))}
                  placeholder="Taksi, Ovqat, Kiyim..." className="w-full bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-3 text-sm outline-none" style={{fontSize:'16px'}}/>
              </div>
              <div>
                <label className="text-[10px] text-gray-400 uppercase font-bold mb-1 block">Oylik limit (so&apos;m)</label>
                <input value={budgetForm.amount} onChange={e=>setBudgetForm(p=>({...p,amount:e.target.value}))}
                  placeholder="3 000 000" type="number" className="w-full bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-3 text-sm outline-none" style={{fontSize:'16px'}}/>
              </div>
              <button onClick={async()=>{
                const cat=budgetForm.category.trim(); const amt=parseInt(budgetForm.amount.replace(/\D/g,''))
                if(!cat||!amt||amt<1000) return
                setCatBudgets(p=>({...p,[cat]:amt}))
                await fetch('/api/budgets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat,amount:amt})}).catch(()=>{})
                setBudgetOpen(false); setBudgetForm({category:'',amount:''})
              }} className="w-full py-3.5 bg-blue-600 rounded-2xl text-sm font-bold active:scale-95 transition-transform">
                ✅ Limitni saqlash
              </button>
            </div>
            {/* Existing budgets */}
            {Object.entries(catBudgets).length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] text-gray-500 uppercase font-bold mb-2">Belgilangan limitlar</p>
                <div className="space-y-2">
                  {Object.entries(catBudgets).map(([cat, amt])=>(
                    <div key={cat} className="flex items-center justify-between bg-[#1a1a1f] rounded-xl px-4 py-2.5">
                      <div>
                        <p className="text-[13px] font-medium">{cat}</p>
                        <p className="text-[11px] text-blue-400">{fmtMoney(amt)} so&apos;m / oy</p>
                      </div>
                      <button onClick={async()=>{
                        setCatBudgets(p=>{const n={...p};delete n[cat];return n})
                        await fetch('/api/budgets',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({category:cat})}).catch(()=>{})
                      }} className="p-1.5 rounded-lg bg-red-500/10"><Trash2 size={12} className="text-red-400"/></button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ CATEGORIES MODAL ══ */}
      {catOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 flex flex-col backdrop-blur-sm" onClick={()=>setCatOpen(false)}>
          <div className="flex-1 overflow-y-auto mt-16 bg-[#0d0d10] rounded-t-3xl flex flex-col" onClick={e=>e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 border-b border-gray-800/60 sticky top-0 bg-[#0d0d10] z-10">
              <div className="flex items-center gap-2">
                <Tag size={16} className="text-blue-400"/>
                <h2 className="text-sm font-bold">Kategoriyalar</h2>
              </div>
              <button onClick={()=>setCatOpen(false)} className="w-8 h-8 rounded-full bg-gray-800 flex items-center justify-center"><X size={14}/></button>
            </div>

            {/* Add new category form */}
            <div className="px-4 pt-4 pb-3 border-b border-gray-800/40">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Yangi kategoriya qo&apos;shish</p>
              <div className="flex gap-2 mb-2">
                <input value={catInput.icon} onChange={e=>setCatInput(p=>({...p,icon:e.target.value}))}
                  className="w-14 bg-[#1a1a1f] border border-gray-700 rounded-xl px-2 py-2.5 text-center text-xl outline-none" placeholder="💡" style={{fontSize:'22px'}} maxLength={2}/>
                <input value={catInput.label} onChange={e=>setCatInput(p=>({...p,label:e.target.value}))}
                  placeholder="Kategoriya nomi..." className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2.5 text-sm outline-none" style={{fontSize:'16px'}}/>
              </div>
              <div className="flex gap-2">
                <input value={catInput.keywords} onChange={e=>setCatInput(p=>({...p,keywords:e.target.value}))}
                  placeholder="Kalit so'zlar: kafe, qahva, coffee..." className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2.5 text-sm outline-none" style={{fontSize:'16px'}}/>
                <button onClick={async()=>{
                  if(!catInput.label.trim()) return
                  const kw=catInput.keywords.split(',').map(k=>k.trim()).filter(Boolean)
                  await addCustomCat({ icon:catInput.icon||'💡', label:catInput.label.trim(), keywords:kw.length?kw:[catInput.label.toLowerCase()] })
                  setCatInput({icon:'💡',label:'',keywords:''})
                }} className="px-4 bg-blue-600 rounded-xl text-sm font-bold active:scale-95">+</button>
              </div>
            </div>

            <div className="flex-1 px-4 py-3 pb-8 space-y-4">
              {/* User's custom categories */}
              {customCats.length>0 && (
                <div>
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Mening kategoriyalarim ({customCats.length})</p>
                  <div className="bg-[#111114] border border-gray-800/60 rounded-2xl overflow-hidden">
                    {customCats.map((cat,i)=>(
                      <div key={cat.id} className={`flex items-center gap-3 px-4 py-3 ${i<customCats.length-1?'border-b border-gray-800/40':''}`}>
                        <span className="text-xl shrink-0">{cat.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[13px] font-medium">{cat.label}</p>
                          {cat.keywords?.length>0&&<p className="text-[10px] text-gray-500 truncate">{cat.keywords.join(', ')}</p>}
                        </div>
                        <button onClick={()=>removeCustomCat(cat.id)} className="w-7 h-7 rounded-lg bg-red-500/10 flex items-center justify-center active:scale-90">
                          <Trash2 size={11} className="text-red-400"/>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Default categories */}
              <div>
                <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold mb-2">Standart kategoriyalar ({CATS.length})</p>
                <div className="bg-[#111114] border border-gray-800/60 rounded-2xl overflow-hidden">
                  {CATS.map((cat,i)=>(
                    <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i<CATS.length-1?'border-b border-gray-800/40':''}`}>
                      <span className="text-xl shrink-0">{cat.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-medium">{cat.label}</p>
                        <p className="text-[10px] text-gray-500 truncate">{cat.kw.slice(0,5).join(', ')}{cat.kw.length>5?'...':''}</p>
                      </div>
                      <span className="text-[10px] text-gray-600 shrink-0">standart</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
