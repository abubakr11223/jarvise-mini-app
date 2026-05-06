'use client'
import { useEffect, useState, useRef } from 'react'
import { Mic, Grid, Menu, X, Bookmark, FileText, Send, User, Bot, ChevronRight,
  LayoutDashboard, ShoppingBag, Car, PenTool, Coffee, Calculator,
  RefreshCw, Globe, MicOff, TrendingDown, TrendingUp, Trash2,
  HandCoins, CheckSquare, Square, MessageCircle, Megaphone } from 'lucide-react'

const N8N_WEBHOOK_URL = "/api/chat"

// ─── App commands ───────────────────────────────────────────────────────────
const APP_URLS: Record<string, { url: string }> = {
  uzum:   { url: 'https://uzum.uz' },
  yandex: { url: 'https://go.yandex/' },
  taxi:   { url: 'https://go.yandex/' },
  lavka:  { url: 'https://lavka.yandex.ru/' },
  notion: { url: 'https://notion.so' },
  figma:  { url: 'https://figma.com' },
}
const OPEN_WORDS = ['och', 'open', 'откры', 'запус', 'ko\'r', 'bor']
function detectApp(text: string): string | null {
  const l = text.toLowerCase()
  if (!OPEN_WORDS.some(w => l.includes(w))) return null
  for (const [k, v] of Object.entries(APP_URLS)) if (l.includes(k)) return v.url
  return null
}

// ─── Category icons ──────────────────────────────────────────────────────────
const CATS = [
  { kw: ['kafe','qahva','coffee','restoran','tushlik','ovqat','еда','кафе'], icon:'🍽️', c:'orange' },
  { kw: ['taxi','taksi','yandex go','transport','avtobus','metro','такси'], icon:'🚕', c:'yellow' },
  { kw: ['bozor','supermarket','oziq','mahsulot','groceries','продукты'], icon:'🛒', c:'green' },
  { kw: ['kiyim','oyoq','brend','shopping','одежда','обувь'],               icon:'👕', c:'purple' },
  { kw: ['dori','dorixona','apteka','shifokor','лекарство'],                icon:'💊', c:'red' },
  { kw: ['internet','telefon','aloqa','интернет'],                          icon:'📱', c:'blue' },
  { kw: ['uy','kvartira','kommunal','ijara','аренда'],                      icon:'🏠', c:'teal' },
  { kw: ['sport','gym','fitness','спорт'],                                  icon:'💪', c:'green' },
  { kw: ['ta\'lim','kurs','kitob','обучение'],                              icon:'📚', c:'blue' },
  { kw: ['maosh','ish haqi','зарплата','доход'],                            icon:'💰', c:'green' },
]
const COLOR: Record<string,string> = {
  orange:'bg-orange-500/15 border-orange-500/30 text-orange-300',
  yellow:'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
  green:'bg-green-500/15 border-green-500/30 text-green-300',
  purple:'bg-purple-500/15 border-purple-500/30 text-purple-300',
  red:'bg-red-500/15 border-red-500/30 text-red-300',
  blue:'bg-blue-500/15 border-blue-500/30 text-blue-300',
  teal:'bg-teal-500/15 border-teal-500/30 text-teal-300',
}
function catStyle(name:string){ const l=name.toLowerCase(); for(const c of CATS) if(c.kw.some(k=>l.includes(k))) return {icon:c.icon,cls:COLOR[c.c]||COLOR.blue}; return {icon:'💸',cls:'bg-gray-500/15 border-gray-500/30 text-gray-300'} }

// ─── SMM quick prompts ────────────────────────────────────────────────────────
const SMM_PROMPTS = [
  { icon:'✍️', label:'Post yoz',       tmpl:(p:string,t:string)=>`${p} uchun post yoz: ${t}` },
  { icon:'#️⃣', label:'Hashtaglar',    tmpl:(p:string,t:string)=>`${p} post uchun 20 ta hashtag ber: ${t}` },
  { icon:'📅', label:'Kontent reja',   tmpl:(p:string,t:string)=>`${p} uchun 1 haftalik kontent reja tuz: ${t}` },
  { icon:'🎯', label:'Reklama matni',  tmpl:(p:string,t:string)=>`${p} uchun reklama matni yoz: ${t}` },
  { icon:'📝', label:'Bio yoz',        tmpl:(_:string,t:string)=>`SMM mutaxassisi uchun professional bio yoz: ${t}` },
  { icon:'💡', label:'Story g\'oyalar',tmpl:(p:string,t:string)=>`${p} uchun 5 ta story g'oya ber: ${t}` },
  { icon:'🔥', label:'Trend mavzular', tmpl:(p:string,_:string)=>`O'zbekistonda hozir ${p} da qaysi mavzular trend?` },
  { icon:'📊', label:'Tahlil',         tmpl:(p:string,t:string)=>`${p} post tahlili: ${t}` },
  { icon:'🖼️', label:'Caption',        tmpl:(p:string,t:string)=>`${p} rasm uchun caption yoz: ${t}` },
  { icon:'📣', label:'Elon matni',     tmpl:(p:string,t:string)=>`${p} uchun e'lon matni yoz: ${t}` },
  { icon:'🤝', label:'Hamkorlik',      tmpl:(_:string,t:string)=>`Biznes hamkorlik taklifi xati yoz: ${t}` },
  { icon:'💬', label:'Sharh javob',    tmpl:(_:string,t:string)=>`Bu sharhga professional javob yoz: ${t}` },
]

const PLATFORMS = ['Instagram','Telegram','Facebook','TikTok','YouTube','LinkedIn']

// ─── Keyword detectors ────────────────────────────────────────────────────────
const EXPENSE_KW = ['xarajat','rashod','moliya','pul','sarf','qancha','jadval','расход','деньги','финанс','баланс','balance']
const DEBT_KW    = ['berdim','qarz','oldim','berdi','беру','дал','занял','должен']
const SHOP_KW    = ['xaridlar','ro\'yxat','список','покупк','supermarket','bozor ro']

// ─── Types ────────────────────────────────────────────────────────────────────
interface Expense  { id:number; name:string; amount:number; type:string }
interface Debt     { id:number; person:string; amount:number; dir:'gave'|'borrowed'; note:string; date:string }
interface ShopItem { id:number; text:string; done:boolean }
interface BrandProfile { name:string; niche:string; audience:string; tone:string; platforms:string[]; language:'uz'|'ru'|'both' }
interface ContentItem  { id:number; title:string; content:string; platform:string; date:string }
interface ISpeechRecognition extends EventTarget {
  lang:string; continuous:boolean; interimResults:boolean; maxAlternatives:number
  start():void; stop():void
  onstart:(()=>void)|null; onend:(()=>void)|null
  onresult:((e:{results:SpeechRecognitionResultList;resultIndex:number})=>void)|null
  onerror:((e:{error:string})=>void)|null
}
declare global { interface Window { SpeechRecognition:new()=>ISpeechRecognition; webkitSpeechRecognition:new()=>ISpeechRecognition } }

// ─── localStorage helpers ─────────────────────────────────────────────────────
function load<T>(key:string, def:T):T { try{ const v=localStorage.getItem(key); return v?JSON.parse(v):def }catch{ return def } }
function save(key:string, val:unknown){ try{ localStorage.setItem(key,JSON.stringify(val)) }catch{} }

export default function Home() {
  const [userData,  setUserData]  = useState<any>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isRecording,setIsRecording]=useState(false)
  const [interimText,setInterimText]=useState('')
  const [voiceLang,  setVoiceLang]=useState<'uz-UZ'|'ru-RU'>('uz-UZ')
  const [inputText,  setInputText]=useState('')

  // Modals
  const [sidebar,   setSidebar]   = useState(false)
  const [appsOpen,  setAppsOpen]  = useState(false)
  const [expOpen,   setExpOpen]   = useState(false)
  const [debtOpen,  setDebtOpen]  = useState(false)
  const [shopOpen,  setShopOpen]  = useState(false)
  const [smmOpen,   setSmmOpen]   = useState(false)
  const [browserUrl,setBrowserUrl]= useState<string|null>(null)
  const [browserLoading,setBrowserLoading]=useState(false)

  // Data (localStorage backed)
  const [messages, setMessages] = useState<{role:string;text:string}[]>([{role:'ai',text:'Salom! Men **JONKA** 🤖\n\nNima qila olaman:\n💰 **Xarajat** — "Kafe da 45,000 xarajat"\n💼 **Qarz** — "Rashidga 50,000 berdim"\n🛒 **Xaridlar** — "Xaridlar ro\'yxatiga non qo\'sh"\n📱 **SMM** — "Instagram uchun post yoz"\n📅 **Calendar** — "Ertaga 15:00 uchrashuv"\n📝 **Notion** — "Yangi sahifa: Loyiha"\n🔍 **Qidiruv** — "Dollar kursi qancha"\n\n🇺🇿 O\'zbek | 🇷🇺 Русский — ikkalasini tushunaman!'}])
  const [expenses,  setExpenses]  = useState<Expense[]>(()=>load('j_exp',[{id:1,name:'Ovqatlanish',amount:50000,type:'XARAJAT'}]))
  const [debts,     setDebts]     = useState<Debt[]>(()=>load('j_debt',[]))
  const [shopItems, setShopItems] = useState<ShopItem[]>(()=>load('j_shop',[]))
  const [budget,    setBudget]    = useState<number>(()=>load('j_budget',0))
  const [budgetInput,setBudgetInput]=useState('')
  const [expFilter, setExpFilter] = useState<'ALL'|'XARAJAT'|'DAROMAT'>('ALL')

  // Brand + Content Bank (localStorage)
  const [brand, setBrand] = useState<BrandProfile>(()=>load('j_brand',{name:'',niche:'',audience:'',tone:'hazilkash va trendy',platforms:['Instagram'],language:'uz'}))
  const [contentBank, setContentBank] = useState<ContentItem[]>(()=>load('j_bank',[]))
  const [smmTab, setSmmTab] = useState<'campaign'|'profile'|'bank'>('campaign')
  const [campaignGoal, setCampaignGoal] = useState<'sell'|'brand'|'engage'|'hook'|'viral'>('sell')
  const [campaignTopic, setCampaignTopic] = useState('')
  const [hookTopic, setHookTopic] = useState('')
  const [bankPreview, setBankPreview] = useState<ContentItem|null>(null)

  // SMM state
  const [smmPlatform,setSmmPlatform]=useState('Instagram')
  const [smmTopic,   setSmmTopic]  = useState('')

  // Debt form
  const [debtForm, setDebtForm] = useState<{person:string;amount:string;dir:'gave'|'borrowed';note:string}>({person:'',amount:'',dir:'gave',note:''})

  // Shop form
  const [shopInput, setShopInput] = useState('')

  const iframeRef      = useRef<HTMLIFrameElement>(null)
  const recognitionRef = useRef<ISpeechRecognition|null>(null)
  const chatEndRef     = useRef<HTMLDivElement>(null)
  const abortRef       = useRef<AbortController|null>(null)
  const [webApp, setWebApp] = useState<any>(null)

  // Persist
  useEffect(()=>{ save('j_exp',expenses) },[expenses])
  useEffect(()=>{ save('j_debt',debts) },[debts])
  useEffect(()=>{ save('j_shop',shopItems) },[shopItems])
  useEffect(()=>{ save('j_budget',budget) },[budget])
  useEffect(()=>{ save('j_brand',brand) },[brand])
  useEffect(()=>{ save('j_bank',contentBank) },[contentBank])
  useEffect(()=>{ chatEndRef.current?.scrollIntoView({behavior:'smooth'}) },[messages])

  useEffect(()=>{
    if(typeof window==='undefined') return
    import('@twa-dev/sdk').then(m=>{
      const W=m.default; W.ready(); W.expand()
      W.setHeaderColor('#111114'); W.setBackgroundColor('#111114')
      if(W.initDataUnsafe?.user) setUserData(W.initDataUnsafe.user)
      setWebApp(W)
    })
  },[])

  const openApp=(url:string)=>setBrowserUrl(url)

  const fmt=(text:string)=>text.split(/\\n|\n/).map((line,i,a)=>(
    <span key={i}>
      {line.split(/(\*\*.*?\*\*)/g).map((p,j)=>
        p.startsWith('**')&&p.endsWith('**')
          ?<strong key={j} className="text-white font-bold">{p.slice(2,-2)}</strong>
          :p
      )}
      {i<a.length-1&&<br/>}
    </span>
  ))

  // ─── AI call ─────────────────────────────────────────────────────────────
  const sendToAI=async(text:string)=>{
    if(!text.trim()||isLoading) return
    setInputText(''); setInterimText('')
    const url=detectApp(text); if(url) openApp(url)
    const l=text.toLowerCase()
    if(EXPENSE_KW.some(w=>l.includes(w))) setTimeout(()=>setExpOpen(true),1200)
    if(DEBT_KW.some(w=>l.includes(w)))    setTimeout(()=>setDebtOpen(true),1200)
    if(SHOP_KW.some(w=>l.includes(w)))    setTimeout(()=>setShopOpen(true),1200)

    setMessages(p=>[...p,{role:'user',text}])
    setIsLoading(true)
    abortRef.current?.abort()
    abortRef.current=new AbortController()
    const timer=setTimeout(()=>abortRef.current?.abort(),20000)

    // Brand kontekstini qo'shamiz — AI yaxshiroq javob beradi
    const brandCtx = brand.name
      ? `[BRAND: "${brand.name}" | Soha: ${brand.niche||'?'} | Auditoriya: ${brand.audience||'?'} | Uslub: ${brand.tone||'professional'} | Til: ${brand.language==='both'?"o'zbek+rus":brand.language==='ru'?'rus':"o'zbek"}]`
      : ''
    const fullMsg = brandCtx ? `${brandCtx}\n\n${text}` : text

    try{
      const res=await fetch(N8N_WEBHOOK_URL,{
        method:'POST', signal:abortRef.current.signal,
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:fullMsg, user_id:userData?.id||0, username:userData?.username||userData?.first_name||'Foydalanuvchi'}),
      })
      clearTimeout(timer)
      if(!res.ok){ const e=await res.json().catch(()=>({})); throw new Error((e as {error?:string}).error||`Xato: ${res.status}`) }

      const data=await res.json()
      let reply:string=data?.reply||data?.response||data?.text||data?.message||data?.output||''

      if(reply){
        // [OPEN:app]
        const om=reply.match(/\[OPEN:(\w+)\]/i)
        if(om){ const k=om[1].toLowerCase(); if(APP_URLS[k]) openApp(APP_URLS[k].url); reply=reply.replace(/\[OPEN:\w+\]/gi,'').trim() }
        // [EXPENSE:...]
        const em=reply.match(/\[EXPENSE:(.*?)\|(.*?)\|(.*?)\]/i)
        if(em){ addExpense(em[1].trim(),parseInt(em[2].replace(/\D/g,''))||0,em[3].trim().toUpperCase()); reply=reply.replace(/\[EXPENSE:.*?\]/gi,'').trim() }
        else if(data?.expense){ const e=data.expense as Expense; addExpense(e.name,e.amount,e.type) }
        // [DEBT:person|amount|gave/borrowed]
        const dm=reply.match(/\[DEBT:(.*?)\|(.*?)\|(.*?)\]/i)
        if(dm){ addDebt(dm[1].trim(),parseInt(dm[2].replace(/\D/g,''))||0,dm[3].trim() as 'gave'|'borrowed',''); reply=reply.replace(/\[DEBT:.*?\]/gi,'').trim() }
        // [SHOP:item]
        const shm=reply.match(/\[SHOP:(.*?)\]/gi)
        if(shm){ shm.forEach(s=>{ const m=s.match(/\[SHOP:(.*?)\]/i); if(m) addShop(m[1].trim()) }); reply=reply.replace(/\[SHOP:.*?\]/gi,'').trim() }

        setMessages(p=>[...p,{role:'ai',text:reply}])
      } else {
        setMessages(p=>[...p,{role:'ai',text:'✅ Qabul qilindi!'}])
      }
    }catch(err:unknown){
      clearTimeout(timer)
      if(err instanceof Error&&err.name==='AbortError'){
        setMessages(p=>[...p,{role:'ai',text:"⏱ Vaqt tugadi. Qayta urinib ko'ring."}])
      } else {
        const msg=err instanceof Error?err.message:"Xato yuz berdi"
        setMessages(p=>[...p,{role:'ai',text:`❌ ${msg}`}])
      }
    } finally { setIsLoading(false) }
  }

  // ─── Data helpers ────────────────────────────────────────────────────────
  const addExpense=(name:string,amount:number,type:string)=>{ if(amount<100) return; setExpenses(p=>[{id:Date.now(),name,amount,type},...p]) }
  const addDebt=(person:string,amount:number,dir:'gave'|'borrowed',note:string)=>{
    if(!person||amount<100) return
    setDebts(p=>[{id:Date.now(),person,amount,dir,note,date:new Date().toLocaleDateString('uz-UZ')},...p])
  }
  const addShop=(text:string)=>{ if(!text.trim()) return; setShopItems(p=>[...p,{id:Date.now(),text:text.trim(),done:false}]) }

  // ─── Web Speech API ───────────────────────────────────────────────────────
  const toggleRec=()=>{
    if(isRecording){ recognitionRef.current?.stop(); return }
    const API=typeof window!=='undefined'&&(window.SpeechRecognition||window.webkitSpeechRecognition)
    if(!API){ setMessages(p=>[...p,{role:'ai',text:"❌ Brauzeringiz ovoz tanishni qo'llab-quvvatlamaydi."}]); return }
    const r=new API(); r.lang=voiceLang; r.continuous=false; r.interimResults=true; r.maxAlternatives=1
    let fin=''
    r.onstart=()=>{ setIsRecording(true); setInterimText('') }
    r.onresult=(e)=>{ fin=''; let int=''; for(let i=0;i<e.results.length;i++){ if(e.results[i].isFinal) fin+=e.results[i][0].transcript; else int+=e.results[i][0].transcript } setInterimText(fin||int) }
    r.onend=()=>{ setIsRecording(false); setInterimText(''); if(fin.trim()) sendToAI(fin.trim()) }
    r.onerror=(e)=>{ setIsRecording(false); setInterimText(''); const m:Record<string,string>={'no-speech':"🔇 Ovoz eshitilmadi.",'not-allowed':"🔒 Mikrofon ruxsati yo'q.",'network':"🌐 Tarmoq xatosi."}; const msg=m[e.error]; if(msg) setMessages(p=>[...p,{role:'ai',text:msg}]) }
    r.start(); recognitionRef.current=r
  }

  // ─── Kontent bankga saqlash ──────────────────────────────────────────────
  const saveToBank=(content:string,platform:string='AI')=>{
    const item:ContentItem={id:Date.now(),title:content.slice(0,50)+'...',content,platform,date:new Date().toLocaleDateString('uz-UZ')}
    setContentBank(p=>[item,...p.slice(0,49)])
  }

  // ─── Campaign generator ──────────────────────────────────────────────────
  const createCampaign=()=>{
    if(!campaignTopic.trim()) return
    const bp=brand
    const goalMap={sell:'Sotish/Konversiya',brand:'Brend tanishlik',engage:'Engagement/Reaction',hook:"Ko'zga tashlanadigan boshlanish (5 xil hook)",viral:"Viral kontent g'oyalari (5 ta variant)"}
    const langMap={uz:"o'zbek",ru:'rus',both:"o'zbek VA rus (ikkalasini alohida yoz)"}
    const prompt=`🚀 MARKETING KAMPANIYA YARATISH

${bp.name?`✦ Brand: "${bp.name}"`:''}
${bp.niche?`✦ Soha: ${bp.niche}`:''}
${bp.audience?`✦ Maqsadli auditoriya: ${bp.audience}`:''}
✦ Uslub: ${bp.tone||'professional'}
✦ Platform: ${smmPlatform}
✦ Mavzu/Mahsulot: ${campaignTopic}
✦ Maqsad: ${goalMap[campaignGoal]}
✦ Til: ${langMap[bp.language]||"o'zbek"}

Quyidagi BARCHASINI yarating:
1️⃣ ${smmPlatform} post matni (emoji bilan, caption tayyor)
2️⃣ 10 ta hashtag (3 katta + 4 o'rta + 3 kichik)
3️⃣ Story uchun 3 ta slide g'oyasi
4️⃣ 3 ta call-to-action (CTA) variant
5️⃣ Eng yaxshi post qo'yish vaqti
${bp.language==='both'?'6️⃣ Barcha narsalarni RU tilida ham yoz':''}`
    setSmmOpen(false)
    sendToAI(prompt)
  }

  // ─── Hook generator ──────────────────────────────────────────────────────
  const generateHooks=()=>{
    if(!hookTopic.trim()) return
    const bp=brand
    const prompt=`📌 HOOK GENERATOR

Brand: ${bp.name||'Mening brendim'}
Mavzu: ${hookTopic}
Platform: ${smmPlatform}

Ushbu mavzu uchun 7 ta KUCHLI HOOK yoz (turli xil usullar bilan):
1. Savol hook
2. Statistika/raqam hook
3. Qiziquvchanlik hook
4. Muammo-yechim hook
5. Shok qiluvchi dalil hook
6. Trend/Hozirgi voqea hook
7. Hazil/Emoji hook

Har birini ${bp.language==='ru'?'rus':bp.language==='both'?"o'zbek va rus":"o'zbek"} tilida yoz.`
    setSmmOpen(false)
    sendToAI(prompt)
  }

  // ─── Computed values ─────────────────────────────────────────────────────
  const totalX=expenses.filter(e=>e.type==='XARAJAT').reduce((s,e)=>s+e.amount,0)
  const totalD=expenses.filter(e=>e.type!=='XARAJAT').reduce((s,e)=>s+e.amount,0)
  const balance=totalD-totalX
  const filteredExp=expFilter==='ALL'?expenses:expenses.filter(e=>e.type===expFilter)
  const netDebt=debts.reduce((s,d)=>d.dir==='gave'?s+d.amount:s-d.amount,0)
  const budgetUsed=budget>0?Math.min(100,Math.round(totalX/budget*100)):0

  return (
    <main className="relative flex flex-col h-screen bg-[#0a0a0c] text-white font-sans overflow-hidden">
      {isLoading&&<div className="absolute top-0 left-0 w-full h-0.5 bg-gradient-to-r from-blue-500 via-purple-500 to-blue-500 bg-[length:200%] animate-[shimmer_1.5s_infinite] z-50"/>}

      {/* ══ IN-APP BROWSER ══ */}
      {browserUrl&&(
        <div className="fixed inset-0 z-[200] flex flex-col">
          <div className="flex items-center gap-2 px-3 py-2 bg-[#111114] border-b border-gray-800 shrink-0">
            <button onClick={()=>setBrowserUrl(null)} className="p-2 rounded-full bg-[#1a1a1f]"><X size={15} className="text-white"/></button>
            <div className="flex-1 flex items-center gap-2 bg-[#1a1a1f] rounded-full px-3 py-1.5 overflow-hidden">
              <Globe size={10} className="text-gray-400 shrink-0"/>
              <span className="text-[11px] text-gray-300 truncate">{browserUrl}</span>
            </div>
            <button onClick={()=>{setBrowserLoading(true);if(iframeRef.current)iframeRef.current.src=browserUrl}} className="p-2 rounded-full bg-[#1a1a1f]"><RefreshCw size={12} className="text-gray-400"/></button>
          </div>
          {browserLoading&&<div className="h-0.5 bg-blue-500 animate-pulse"/>}
          <iframe ref={iframeRef} src={browserUrl} className="flex-1 w-full border-0 bg-white"
            onLoad={()=>setBrowserLoading(false)} onLoadStart={()=>setBrowserLoading(true)}
            allow="camera; microphone; geolocation; payment"
            sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-top-navigation-by-user-activation"
          />
        </div>
      )}

      {/* ══ SIDEBAR TOGGLE ══ */}
      {!sidebar&&(
        <button onClick={()=>setSidebar(true)} className="absolute left-0 top-[60%] -translate-y-1/2 bg-[#1a1a1f]/90 border border-l-0 border-gray-700/80 px-1 py-5 rounded-r-2xl flex flex-col items-center gap-1 z-20 active:scale-95 transition-transform">
          <div className="w-1 h-6 bg-blue-500 rounded-full"/>
          <span style={{writingMode:'vertical-rl',transform:'rotate(180deg)'}} className="text-[8px] text-gray-400 font-bold tracking-widest uppercase">Menu</span>
        </button>
      )}

      {/* ══ SIDEBAR ══ */}
      <div className={`fixed inset-y-0 left-0 w-[280px] bg-[#0d0d10] z-50 transform transition-transform duration-300 flex flex-col border-r border-gray-800/60 shadow-2xl ${sidebar?'translate-x-0':'-translate-x-full'}`}>
        <div className="p-5 border-b border-gray-800/60 flex items-center gap-3 bg-[#111114]">
          <div className="w-11 h-11 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-full flex items-center justify-center text-base font-bold shadow-lg">
            {userData?.first_name?.charAt(0)||'A'}
          </div>
          <div>
            <p className="font-bold text-sm">{userData?.first_name||'Abubakr'}</p>
            <p className="text-[10px] text-blue-400 font-semibold">JONKA Pro · SMM</p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto py-3 px-2.5 flex flex-col gap-1">
          {/* Main items */}
          {[
            {icon:<Calculator size={15} className="text-green-400"/>, label:'💰 Moliya / Xarajat', action:()=>{setSidebar(false);setExpOpen(true)}},
            {icon:<HandCoins size={15} className="text-yellow-400"/>, label:'🤝 Qarz Daftari',     action:()=>{setSidebar(false);setDebtOpen(true)}},
            {icon:<CheckSquare size={15} className="text-blue-400"/>, label:'🛒 Xaridlar Ro\'yxati',action:()=>{setSidebar(false);setShopOpen(true)}},
            {icon:<Megaphone size={15} className="text-pink-400"/>,   label:'📱 SMM Tools',        action:()=>{setSidebar(false);setSmmOpen(true)}},
            {icon:<FileText size={15} className="text-gray-200"/>,    label:'📓 Notion Baza',       action:()=>{setSidebar(false);openApp('https://notion.so')}},
            {icon:<LayoutDashboard size={15} className="text-indigo-400"/>,label:'🚀 Barcha Ilovalar',action:()=>{setSidebar(false);setAppsOpen(true)}},
          ].map(i=>(
            <button key={i.label} onClick={i.action} className="flex items-center justify-between w-full p-3 rounded-xl hover:bg-[#1a1a1f] active:bg-[#242429] transition-colors">
              <div className="flex items-center gap-3">{i.icon}<span className="text-sm font-medium">{i.label}</span></div>
              <ChevronRight size={14} className="text-gray-600"/>
            </button>
          ))}

          {/* Voice lang */}
          <div className="mt-3 px-1">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Ovoz tili</p>
            <div className="flex gap-2">
              {(['uz-UZ','ru-RU'] as const).map(l=>(
                <button key={l} onClick={()=>setVoiceLang(l)} className={`flex-1 py-2 rounded-xl text-xs font-bold ${voiceLang===l?'bg-blue-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>
                  {l==='uz-UZ'?"🇺🇿 UZ":'🇷🇺 RU'}
                </button>
              ))}
            </div>
          </div>

          {/* Quick prompts */}
          <div className="mt-3 p-3 bg-[#1a1a1f] rounded-xl border border-gray-800/60">
            <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">💡 Tez buyruqlar</p>
            {['"Kafe da 45,000 xarajat"','"Rashidga 50,000 berdim"','"Uzum och"','"Dollar kursi qancha?"','"Instagram post yoz: ..."','"Xarajatlarimni ko\'rsat"'].map(c=>(
              <button key={c} onClick={()=>{setSidebar(false);setInputText(c.replace(/"/g,''))}} className="block w-full text-left text-[11px] text-gray-400 py-1 hover:text-blue-400">
                {c}
              </button>
            ))}
          </div>
        </div>
      </div>
      {sidebar&&<div onClick={()=>setSidebar(false)} className="fixed inset-0 bg-black/60 z-40 backdrop-blur-sm"/>}

      {/* ══ HEADER ══ */}
      <header className="flex justify-between items-center w-full px-4 py-3 bg-[#111114] border-b border-gray-800/50 shrink-0">
        <button onClick={()=>setSidebar(true)} className="w-8 h-8 rounded-full border border-gray-700 bg-[#242429] flex items-center justify-center active:bg-[#333]">
          <Menu size={15} className="text-gray-400"/>
        </button>
        <div className="flex flex-col items-center">
          <span className="font-bold text-sm">JONKA ✨</span>
          <div className="flex items-center gap-1"><span className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse"/><span className="text-[9px] text-green-400">Online · {voiceLang==='uz-UZ'?"UZ":'RU'}</span></div>
        </div>
        <button onClick={()=>setSmmOpen(true)} className="w-8 h-8 rounded-full border border-pink-500/40 bg-pink-500/10 flex items-center justify-center active:bg-pink-500/20">
          <Megaphone size={14} className="text-pink-400"/>
        </button>
      </header>

      {/* ══ QUICK LINKS ══ */}
      <div className="w-full overflow-x-auto scrollbar-hide shrink-0 bg-[#111114] pb-2 pt-2">
        <div className="flex gap-2 px-4 w-max">
          {[
            {icon:<Grid size={12} className="text-blue-400"/>,    label:'Super App',  act:()=>setAppsOpen(true),  b:'border-blue-500/30'},
            {icon:<Megaphone size={12} className="text-pink-400"/>,label:'SMM Tools',  act:()=>setSmmOpen(true),   b:'border-pink-500/30'},
            {icon:<ShoppingBag size={12} className="text-purple-400"/>,label:'Uzum', act:()=>openApp('https://uzum.uz'), b:'border-gray-700'},
            {icon:<Car size={12} className="text-yellow-400"/>,   label:'Taxi',       act:()=>openApp('https://go.yandex/'), b:'border-gray-700'},
          ].map(i=>(
            <button key={i.label} onClick={i.act} className={`bg-[#1a1a1f] border ${i.b} rounded-full px-3.5 py-1.5 flex items-center gap-1.5 active:scale-95 transition-transform`}>
              {i.icon}<span className="text-[11px] font-medium">{i.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* ══ CHAT ══ */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3 pb-[90px]">
        {messages.map((msg,idx)=>(
          <div key={idx} className={`flex flex-col ${msg.role==='user'?'items-end':'items-start'}`}>
            <div className="flex items-center gap-1 mb-1 opacity-40 px-1">
              {msg.role==='user'?<User size={9}/>:<Bot size={9}/>}
              <span className="text-[8px] uppercase font-bold tracking-wider">{msg.role==='user'?'Siz':'JONKA'}</span>
            </div>
            <div className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${msg.role==='user'?'bg-blue-600 text-white rounded-tr-sm':'bg-[#1a1a1f] text-gray-200 rounded-tl-sm border border-gray-800/60'}`}>
              {msg.role==='ai'?fmt(msg.text):msg.text}
            </div>
            {msg.role==='ai'&&idx>0&&(
              <button onClick={()=>saveToBank(msg.text,smmPlatform)}
                className="mt-1 ml-1 text-[10px] text-gray-600 hover:text-pink-400 flex items-center gap-1 transition-colors">
                <Bookmark size={10}/> Bankga saqlash
              </button>
            )}
          </div>
        ))}
        {isLoading&&(
          <div className="flex flex-col items-start">
            <div className="flex items-center gap-1 mb-1 opacity-40 px-1"><Bot size={9}/><span className="text-[8px] uppercase font-bold tracking-wider">JONKA</span></div>
            <div className="bg-[#1a1a1f] border border-gray-800/60 rounded-2xl rounded-tl-sm px-4 py-3.5 flex gap-1.5">
              {[0,150,300].map(d=><span key={d} className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" style={{animationDelay:`${d}ms`}}/>)}
            </div>
          </div>
        )}
        <div ref={chatEndRef}/>
      </div>

      {/* ══ INPUT ══ */}
      <div className="absolute bottom-0 left-0 right-0 px-3 pb-4 pt-2 bg-gradient-to-t from-[#0a0a0c] via-[#0a0a0c]/95 to-transparent z-10">
        {isRecording&&(
          <div className="flex items-center gap-2 mb-2 px-3.5 py-2 bg-red-500/10 border border-red-500/30 rounded-2xl">
            <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse shrink-0"/>
            <span className="text-red-300 text-[13px] flex-1 truncate">{interimText||(voiceLang==='uz-UZ'?'🎙 Gapiring...':'🎙 Говорите...')}</span>
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex-1 bg-[#1a1a1f] rounded-3xl flex items-center px-4 border border-gray-700/80 min-h-[52px]">
            <input type="text" value={inputText} onChange={e=>setInputText(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();sendToAI(inputText)}}}
              placeholder={isRecording?'🎤 Tinglanyapti...':'JONKA ga yozing...'}
              style={{fontSize:'16px'}} className="bg-transparent border-none outline-none text-white w-full placeholder-gray-500 py-3.5"/>
          </div>
          {inputText.trim()?(
            <button onClick={()=>sendToAI(inputText)} disabled={isLoading} className="w-[52px] h-[52px] shrink-0 rounded-full bg-blue-600 shadow-lg shadow-blue-600/30 flex items-center justify-center active:scale-90 disabled:opacity-40">
              <Send size={19} className="text-white ml-[-2px]"/>
            </button>
          ):(
            <button onClick={toggleRec} className={`w-[52px] h-[52px] shrink-0 rounded-full flex items-center justify-center shadow-lg transition-all ${isRecording?'bg-red-500 scale-110':'bg-[#1a1a1f] border border-gray-700/80 active:scale-90'}`}>
              {isRecording?<MicOff size={20} className="text-white"/>:<Mic size={21} className="text-blue-400"/>}
            </button>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════
          💰 MOLIYA MODALI
      ══════════════════════════════════════════ */}
      {expOpen&&(
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3.5 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><Calculator size={16} className="text-green-400"/>Moliya</h2>
            <button onClick={()=>setExpOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={16}/></button>
          </header>
          {/* Stats */}
          <div className="px-4 pt-3 grid grid-cols-3 gap-2 shrink-0">
            {[
              {label:'Xarajat',val:totalX,color:'text-red-400',bg:'bg-red-500/10 border-red-500/20',icon:<TrendingDown size={11} className="text-red-400"/>},
              {label:'Daromat',val:totalD,color:'text-green-400',bg:'bg-green-500/10 border-green-500/20',icon:<TrendingUp size={11} className="text-green-400"/>},
              {label:'Balans',val:balance,color:balance>=0?'text-blue-400':'text-orange-400',bg:balance>=0?'bg-blue-500/10 border-blue-500/20':'bg-orange-500/10 border-orange-500/20',icon:null},
            ].map(s=>(
              <div key={s.label} className={`${s.bg} border rounded-2xl p-3`}>
                <div className="flex items-center gap-1 mb-1">{s.icon}<p className={`text-[9px] ${s.color}`}>{s.label}</p></div>
                <p className={`text-sm font-bold ${s.color}`}>{s.val>=0?'':'-'}{Math.abs(s.val).toLocaleString()}</p>
                <p className="text-[8px] text-gray-500">UZS</p>
              </div>
            ))}
          </div>
          {/* Budget */}
          {budget>0&&(
            <div className="px-4 pt-2 shrink-0">
              <div className="flex justify-between text-[10px] text-gray-400 mb-1">
                <span>Oylik byudjet: {budget.toLocaleString()} UZS</span>
                <span className={budgetUsed>80?'text-red-400':'text-gray-400'}>{budgetUsed}%</span>
              </div>
              <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div className={`h-full rounded-full transition-all ${budgetUsed>80?'bg-red-500':budgetUsed>50?'bg-yellow-500':'bg-green-500'}`} style={{width:`${budgetUsed}%`}}/>
              </div>
            </div>
          )}
          <div className="px-4 pt-2 flex gap-2 shrink-0">
            <input value={budgetInput} onChange={e=>setBudgetInput(e.target.value)} placeholder="Oylik byudjet (UZS)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}}/>
            <button onClick={()=>{const v=parseInt(budgetInput.replace(/\D/g,'')); if(v>0){setBudget(v);setBudgetInput('')}}} className="px-4 py-2 bg-blue-600 rounded-xl text-sm font-bold">Saqlash</button>
          </div>
          {/* Filter */}
          <div className="flex gap-2 px-4 pt-2 shrink-0">
            {(['ALL','XARAJAT','DAROMAT'] as const).map(f=>(
              <button key={f} onClick={()=>setExpFilter(f)} className={`px-3 py-1 rounded-full text-[11px] font-bold ${expFilter===f?'bg-blue-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>
                {f==='ALL'?'Hammasi':f==='XARAJAT'?'📉 Xarajat':'📈 Daromat'}
              </button>
            ))}
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-2">
            {filteredExp.length===0?(
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30"><Calculator size={40} strokeWidth={1}/><p className="text-sm">Bo'sh</p></div>
            ):filteredExp.map(exp=>{
              const {icon,cls}=catStyle(exp.name)
              return(
                <div key={exp.id} className="flex items-center gap-3 bg-[#111114] border border-gray-800/60 rounded-2xl px-4 py-3">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg border ${cls} shrink-0`}>{icon}</div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white truncate">{exp.name}</p>
                    <p className={`text-xs font-medium ${exp.type==='XARAJAT'?'text-red-400':'text-green-400'}`}>{exp.type==='XARAJAT'?'−':'+'}{exp.amount.toLocaleString()} UZS</p>
                  </div>
                  <button onClick={()=>setExpenses(p=>p.filter(e=>e.id!==exp.id))} className="p-1.5 rounded-lg bg-[#1a1a1f]"><Trash2 size={12} className="text-gray-500"/></button>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          🤝 QARZ DAFTARI
      ══════════════════════════════════════════ */}
      {debtOpen&&(
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3.5 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><HandCoins size={16} className="text-yellow-400"/>Qarz Daftari</h2>
            <button onClick={()=>setDebtOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={16}/></button>
          </header>
          {/* Net balance */}
          <div className="px-4 pt-3 grid grid-cols-2 gap-2 shrink-0">
            <div className={`${netDebt>=0?'bg-green-500/10 border-green-500/20':'bg-red-500/10 border-red-500/20'} border rounded-2xl p-3`}>
              <p className={`text-[9px] ${netDebt>=0?'text-green-400':'text-red-400'}`}>{netDebt>=0?'Menga qarzdor':'Men qarzdorman'}</p>
              <p className={`text-sm font-bold mt-1 ${netDebt>=0?'text-green-400':'text-red-400'}`}>{Math.abs(netDebt).toLocaleString()} UZS</p>
            </div>
            <div className="bg-[#1a1a1f] border border-gray-800 rounded-2xl p-3">
              <p className="text-[9px] text-gray-400">Jami yozuv</p>
              <p className="text-sm font-bold mt-1">{debts.length} ta</p>
            </div>
          </div>
          {/* Add form */}
          <div className="px-4 pt-3 shrink-0 space-y-2">
            <div className="flex gap-2">
              <input value={debtForm.person} onChange={e=>setDebtForm(p=>({...p,person:e.target.value}))} placeholder="Kim? (Rashid)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}}/>
              <input value={debtForm.amount} onChange={e=>setDebtForm(p=>({...p,amount:e.target.value}))} placeholder="Summa" type="number" className="w-28 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}}/>
            </div>
            <div className="flex gap-2">
              <button onClick={()=>setDebtForm(p=>({...p,dir:'gave'}))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${debtForm.dir==='gave'?'bg-green-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>➡️ Men berdim</button>
              <button onClick={()=>setDebtForm(p=>({...p,dir:'borrowed'}))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${debtForm.dir==='borrowed'?'bg-red-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>⬅️ Men oldim</button>
            </div>
            <div className="flex gap-2">
              <input value={debtForm.note} onChange={e=>setDebtForm(p=>({...p,note:e.target.value}))} placeholder="Izoh (ixtiyoriy)" className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-sm outline-none" style={{fontSize:'16px'}}/>
              <button onClick={()=>{addDebt(debtForm.person,parseInt(debtForm.amount)||0,debtForm.dir,debtForm.note);setDebtForm({person:'',amount:'',dir:'gave',note:''})}} className="px-4 bg-blue-600 rounded-xl text-sm font-bold">Qo'sh</button>
            </div>
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-4 flex flex-col gap-2">
            {debts.length===0?(
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30"><HandCoins size={40} strokeWidth={1}/><p className="text-sm">Bo'sh</p></div>
            ):debts.map(d=>(
              <div key={d.id} className="flex items-center gap-3 bg-[#111114] border border-gray-800/60 rounded-2xl px-4 py-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg ${d.dir==='gave'?'bg-green-500/15 border border-green-500/30':'bg-red-500/15 border border-red-500/30'} shrink-0`}>
                  {d.dir==='gave'?'➡️':'⬅️'}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white">{d.person}</p>
                  <p className={`text-xs font-medium ${d.dir==='gave'?'text-green-400':'text-red-400'}`}>{d.dir==='gave'?'+':'−'}{d.amount.toLocaleString()} UZS</p>
                  {d.note&&<p className="text-[10px] text-gray-500 truncate">{d.note}</p>}
                  <p className="text-[9px] text-gray-600">{d.date}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${d.dir==='gave'?'bg-green-500/10 text-green-400':'bg-red-500/10 text-red-400'}`}>{d.dir==='gave'?'Berdi':'Oldim'}</span>
                  <button onClick={()=>setDebts(p=>p.filter(x=>x.id!==d.id))} className="p-1 rounded-lg bg-[#1a1a1f]"><Trash2 size={11} className="text-gray-500"/></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          🛒 XARIDLAR RO'YXATI
      ══════════════════════════════════════════ */}
      {shopOpen&&(
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3.5 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><ShoppingBag size={16} className="text-blue-400"/>Xaridlar Ro'yxati</h2>
            <div className="flex gap-2">
              <button onClick={()=>setShopItems(p=>p.filter(i=>!i.done))} className="text-[11px] text-gray-400 px-3 py-1.5 bg-[#1a1a1f] rounded-full">Bajarilganlarni o'chir</button>
              <button onClick={()=>setShopOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={16}/></button>
            </div>
          </header>
          {/* Add */}
          <div className="flex gap-2 px-4 pt-3 shrink-0">
            <input value={shopInput} onChange={e=>setShopInput(e.target.value)}
              onKeyDown={e=>{if(e.key==='Enter'){addShop(shopInput);setShopInput('')}}}
              placeholder="Mahsulot qo'shing..." className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" style={{fontSize:'16px'}}/>
            <button onClick={()=>{addShop(shopInput);setShopInput('')}} className="px-4 bg-blue-600 rounded-xl text-sm font-bold">+</button>
          </div>
          {/* Stats */}
          <div className="px-4 pt-2 flex gap-2 shrink-0">
            <span className="text-[11px] text-gray-400">{shopItems.filter(i=>i.done).length}/{shopItems.length} bajarildi</span>
            {shopItems.length>0&&<div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden self-center"><div className="h-full bg-green-500 rounded-full transition-all" style={{width:`${shopItems.length?shopItems.filter(i=>i.done).length/shopItems.length*100:0}%`}}/></div>}
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto px-4 pt-2 pb-4 flex flex-col gap-2">
            {shopItems.length===0?(
              <div className="flex-1 flex flex-col items-center justify-center gap-2 opacity-30"><ShoppingBag size={40} strokeWidth={1}/><p className="text-sm">Bo'sh ro'yxat</p></div>
            ):[...shopItems.filter(i=>!i.done),...shopItems.filter(i=>i.done)].map(item=>(
              <button key={item.id} onClick={()=>setShopItems(p=>p.map(i=>i.id===item.id?{...i,done:!i.done}:i))}
                className={`flex items-center gap-3 bg-[#111114] border rounded-xl px-4 py-3 transition-colors ${item.done?'border-gray-800/30 opacity-50':'border-gray-800/60'}`}>
                {item.done?<CheckSquare size={18} className="text-green-400 shrink-0"/>:<Square size={18} className="text-gray-500 shrink-0"/>}
                <span className={`text-sm flex-1 text-left ${item.done?'line-through text-gray-500':'text-white'}`}>{item.text}</span>
                <button onClick={e=>{e.stopPropagation();setShopItems(p=>p.filter(i=>i.id!==item.id))}} className="p-1 rounded-lg"><Trash2 size={11} className="text-gray-600"/></button>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════
          📱 SMM TOOLS — KUCHLI MARKETING PANEL
      ══════════════════════════════════════════ */}
      {smmOpen&&(
        <div className="fixed inset-0 z-50 flex flex-col bg-[#0a0a0c] animate-slide-up">
          <header className="flex justify-between items-center px-4 py-3 border-b border-gray-800 bg-[#111114] shrink-0">
            <h2 className="text-base font-bold flex items-center gap-2"><Megaphone size={15} className="text-pink-400"/>SMM Studio</h2>
            <button onClick={()=>setSmmOpen(false)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={15}/></button>
          </header>

          {/* Tabs */}
          <div className="flex border-b border-gray-800 shrink-0">
            {(['campaign','profile','bank'] as const).map(t=>(
              <button key={t} onClick={()=>setSmmTab(t)}
                className={`flex-1 py-2.5 text-xs font-bold transition-colors ${smmTab===t?'text-pink-400 border-b-2 border-pink-400 -mb-px':'text-gray-500'}`}>
                {t==='campaign'?'🚀 Kampaniya':t==='profile'?'🏢 Brand Profil':'💾 Kontent Bank'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto px-4 pt-3 pb-6">

            {/* ── TAB: KAMPANIYA ── */}
            {smmTab==='campaign'&&(<>
              {/* Brand profil banner */}
              {brand.name&&(
                <div className="mb-3 px-3 py-2 bg-pink-500/10 border border-pink-500/20 rounded-xl flex items-center gap-2">
                  <span className="text-xs text-pink-300">🏢 <b>{brand.name}</b> · {brand.niche||'?'}</span>
                  <button onClick={()=>setSmmTab('profile')} className="ml-auto text-[10px] text-pink-400 underline">O'zgartirish</button>
                </div>
              )}
              {!brand.name&&(
                <div className="mb-3 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <p className="text-xs text-yellow-300">⚠️ <b>Brand profilingizni</b> kiriting — AI yaxshiroq kontent yozadi</p>
                  <button onClick={()=>setSmmTab('profile')} className="text-[10px] text-yellow-400 underline mt-1">→ Profilni to'ldirish</button>
                </div>
              )}

              {/* Platform */}
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Platform</p>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {PLATFORMS.map(p=>(
                  <button key={p} onClick={()=>setSmmPlatform(p)} className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors ${smmPlatform===p?'bg-pink-600 border-pink-500 text-white':'bg-[#1a1a1f] border-gray-700 text-gray-400'}`}>
                    {p==='Instagram'?'📸':p==='Telegram'?'✈️':p==='Facebook'?'👤':p==='TikTok'?'🎵':p==='YouTube'?'▶️':'💼'} {p}
                  </button>
                ))}
              </div>

              {/* Mavzu */}
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Mavzu / Mahsulot</p>
              <input value={campaignTopic} onChange={e=>setCampaignTopic(e.target.value)}
                placeholder="Masalan: Yoz kolleksiyasi, 40% chegirma..."
                className="w-full bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none mb-3" style={{fontSize:'16px'}}/>

              {/* Maqsad */}
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-1.5">Kampaniya maqsadi</p>
              <div className="grid grid-cols-3 gap-2 mb-3">
                {([
                  {k:'sell',icon:'💰',l:'Sotish'},
                  {k:'brand',icon:'👁',l:'Brend'},
                  {k:'engage',icon:'❤️',l:'Engagement'},
                  {k:'hook',icon:'🎣',l:'Hook yoz'},
                  {k:'viral',icon:'🔥',l:'Viral g\'oya'},
                ] as const).map(g=>(
                  <button key={g.k} onClick={()=>setCampaignGoal(g.k)} className={`py-2 rounded-xl text-xs font-bold border transition-colors ${campaignGoal===g.k?'bg-pink-600 border-pink-500 text-white':'bg-[#1a1a1f] border-gray-700 text-gray-400'}`}>
                    {g.icon} {g.l}
                  </button>
                ))}
              </div>

              {/* 1-Click Campaign */}
              <button onClick={createCampaign} disabled={!campaignTopic.trim()}
                className="w-full py-4 bg-gradient-to-r from-pink-600 to-purple-600 rounded-2xl text-base font-bold disabled:opacity-40 active:scale-[0.98] transition-transform shadow-lg shadow-pink-600/20 mb-3">
                ⚡ 1-CLICK KAMPANIYA YARATISH
              </button>

              {/* Hook generator */}
              <div className="p-3 bg-[#111114] border border-gray-800 rounded-2xl mb-3">
                <p className="text-[10px] text-gray-400 font-bold mb-2">🎣 HOOK GENERATOR — 7 xil boshlanish</p>
                <div className="flex gap-2">
                  <input value={hookTopic} onChange={e=>setHookTopic(e.target.value)}
                    placeholder="Mavzu: moda, fitnes, ovqat..." className="flex-1 bg-[#1a1a1f] border border-gray-700 rounded-xl px-3 py-2 text-xs outline-none" style={{fontSize:'16px'}}/>
                  <button onClick={generateHooks} disabled={!hookTopic.trim()} className="px-4 py-2 bg-purple-600 rounded-xl text-xs font-bold disabled:opacity-40">Yaratish</button>
                </div>
              </div>

              {/* Quick prompts */}
              <p className="text-[9px] text-gray-500 uppercase tracking-wider mb-2">Tezkor buyruqlar</p>
              <div className="grid grid-cols-3 gap-2">
                {SMM_PROMPTS.slice(0,9).map(sp=>(
                  <button key={sp.label} onClick={()=>{ setSmmOpen(false); sendToAI(sp.tmpl(smmPlatform,campaignTopic||'...')) }}
                    className="flex flex-col items-center gap-1 p-2.5 bg-[#111114] border border-gray-800/60 rounded-2xl active:scale-95 transition-transform">
                    <span className="text-xl">{sp.icon}</span>
                    <span className="text-[9px] text-gray-400 text-center leading-tight">{sp.label}</span>
                  </button>
                ))}
              </div>
            </>)}

            {/* ── TAB: BRAND PROFIL ── */}
            {smmTab==='profile'&&(<>
              <div className="p-3 mb-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                <p className="text-xs text-blue-300">💡 Brand profilingizni bir marta to'ldiring — AI har doim sizning brendingiz uslubida javob beradi</p>
              </div>
              {[
                {label:'Brand nomi',key:'name' as const,ph:'Masalan: Abubakr Style'},
                {label:'Soha / Niche',key:'niche' as const,ph:'Moda, fitnes, oziq-ovqat, texnologiya...'},
                {label:'Maqsadli auditoriya',key:'audience' as const,ph:'18-35 yosh, ayollar, Toshkent...'},
                {label:'Brand uslubi (Tone)',key:'tone' as const,ph:'Hazilkash, professional, trendy, jiddiy...'},
              ].map(f=>(
                <div key={f.key} className="mb-3">
                  <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">{f.label}</p>
                  <input value={brand[f.key]} onChange={e=>setBrand(p=>({...p,[f.key]:e.target.value}))}
                    placeholder={f.ph} className="w-full bg-[#1a1a1f] border border-gray-700 rounded-xl px-4 py-2.5 text-sm outline-none" style={{fontSize:'16px'}}/>
                </div>
              ))}

              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Asosiy platformalar</p>
              <div className="flex gap-1.5 flex-wrap mb-3">
                {PLATFORMS.map(p=>{
                  const sel=brand.platforms.includes(p)
                  return <button key={p} onClick={()=>setBrand(b=>({...b,platforms:sel?b.platforms.filter(x=>x!==p):[...b.platforms,p]}))}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border ${sel?'bg-pink-600 border-pink-500 text-white':'bg-[#1a1a1f] border-gray-700 text-gray-400'}`}>{p}</button>
                })}
              </div>

              <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Kontent tili</p>
              <div className="flex gap-2 mb-4">
                {([['uz',"🇺🇿 O'zbek"],['ru','🇷🇺 Русский'],['both','🇺🇿+🇷🇺 Ikkalasi']] as const).map(([k,l])=>(
                  <button key={k} onClick={()=>setBrand(b=>({...b,language:k}))} className={`flex-1 py-2 rounded-xl text-xs font-bold ${brand.language===k?'bg-blue-600 text-white':'bg-[#1a1a1f] text-gray-400'}`}>{l}</button>
                ))}
              </div>

              <div className="p-3 bg-green-500/10 border border-green-500/20 rounded-xl">
                <p className="text-[11px] text-green-300">✅ Profil <b>avtomatik saqlanadi</b>. Har bir AI so'rovi brand konteksti bilan yuboriladi.</p>
              </div>
            </>)}

            {/* ── TAB: KONTENT BANK ── */}
            {smmTab==='bank'&&(<>
              {bankPreview&&(
                <div className="fixed inset-0 z-[300] bg-[#0a0a0c] flex flex-col animate-slide-up">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-800 bg-[#111114]">
                    <button onClick={()=>setBankPreview(null)} className="p-2 bg-[#1a1a1f] rounded-full"><X size={15}/></button>
                    <span className="text-sm font-bold flex-1 truncate">{bankPreview.platform}</span>
                    <button onClick={()=>{setInputText(bankPreview.content.slice(0,200));setBankPreview(null);setSmmOpen(false)}} className="px-3 py-1.5 bg-blue-600 rounded-xl text-xs font-bold">Chat ga yuborish</button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <p className="text-sm text-gray-200 whitespace-pre-wrap leading-relaxed">{bankPreview.content}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center justify-between mb-3">
                <p className="text-sm font-bold">{contentBank.length} ta saqlangan kontent</p>
                {contentBank.length>0&&<button onClick={()=>setContentBank([])} className="text-[10px] text-red-400 px-3 py-1 bg-red-500/10 rounded-full">Barchasini o'chir</button>}
              </div>
              {contentBank.length===0?(
                <div className="flex flex-col items-center justify-center py-16 gap-3 opacity-30">
                  <Bookmark size={40} strokeWidth={1}/>
                  <p className="text-sm">Chat da AI javobini "Bankga saqlash" bosing</p>
                </div>
              ):contentBank.map(item=>(
                <div key={item.id} className="bg-[#111114] border border-gray-800/60 rounded-2xl p-3.5 mb-2">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold text-pink-400 px-2 py-0.5 bg-pink-500/10 rounded-full">{item.platform}</span>
                    <span className="text-[9px] text-gray-500">{item.date}</span>
                  </div>
                  <p className="text-[12px] text-gray-300 line-clamp-2 mb-2">{item.content}</p>
                  <div className="flex gap-2">
                    <button onClick={()=>setBankPreview(item)} className="flex-1 py-1.5 bg-[#1a1a1f] rounded-xl text-[10px] font-bold text-gray-300">Ko'rish</button>
                    <button onClick={()=>setContentBank(p=>p.filter(c=>c.id!==item.id))} className="p-1.5 bg-[#1a1a1f] rounded-xl"><Trash2 size={12} className="text-gray-500"/></button>
                  </div>
                </div>
              ))}
            </>)}
          </div>
        </div>
      )}

      {/* ══ SUPER APP ══ */}
      {appsOpen&&(
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 backdrop-blur-md">
          <div className="w-full max-h-[78%] bg-[#111114] rounded-t-[28px] p-5 relative border-t border-gray-800 animate-slide-up shadow-2xl overflow-y-auto">
            <button onClick={()=>setAppsOpen(false)} className="absolute top-4 right-4 p-2 bg-[#1a1a1f] rounded-full"><X size={16}/></button>
            <h2 className="text-xl font-bold mb-5 mt-1">Xizmatlar</h2>
            {[
              {title:'🛍 Marketpleys',apps:[
                {icon:<ShoppingBag size={20} className="text-purple-500"/>,label:'Uzum',url:'https://uzum.uz',bg:'bg-purple-600/15 border-purple-500/25'},
                {icon:<Coffee size={20} className="text-yellow-500"/>,label:'Lavka',url:'https://lavka.yandex.ru/',bg:'bg-yellow-500/15 border-yellow-500/25'},
              ]},
              {title:'🚕 Transport',apps:[
                {icon:<Car size={20} className="text-yellow-400"/>,label:'Yandex Go',url:'https://go.yandex/',bg:'bg-yellow-500/15 border-yellow-500/25'},
              ]},
              {title:'📝 Ish va Baza',apps:[
                {icon:<FileText size={20} className="text-white"/>,label:'Notion',url:'https://notion.so',bg:'bg-gray-600/15 border-gray-500/25'},
                {icon:<PenTool size={20} className="text-pink-400"/>,label:'Figma',url:'https://figma.com',bg:'bg-pink-600/15 border-pink-500/25'},
                {icon:<Megaphone size={20} className="text-orange-400"/>,label:'Instagram',url:'https://instagram.com',bg:'bg-orange-500/15 border-orange-500/25'},
                {icon:<MessageCircle size={20} className="text-blue-400"/>,label:'Telegram',url:'https://web.telegram.org',bg:'bg-blue-500/15 border-blue-500/25'},
              ]},
            ].map(sec=>(
              <div key={sec.title} className="mb-5">
                <p className="text-[11px] font-bold text-gray-400 mb-3 uppercase tracking-wider">{sec.title}</p>
                <div className="grid grid-cols-4 gap-3">
                  {sec.apps.map(app=>(
                    <button key={app.label} onClick={()=>{setAppsOpen(false);openApp(app.url)}} className="flex flex-col items-center gap-2 active:scale-90 transition-transform">
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
