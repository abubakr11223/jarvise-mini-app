// Shared parser — server va client da ishlatiladi

export const CATS = [
  // ── Ovqat ─────────────────────────────────────────────────────────────────
  { kw: ['kafe','qahva','coffee','restoran','tushlik','ovqat','obedga','еда','кафе','завтрак','обед','ужин','перекус','ресторан','столовая','фастфуд','пицца','шаурма','суши','плов','лагман','самса','бургер','салат','soup','shorva','каша','хинкали','манты','нан','пити','мастава','димлама','меню','menu','oshxona','choyxona','хинкальная','шашлык','чайхана','нарын','дымляма'], icon:'🍽️', c:'orange', label:'Ovqat' },
  { kw: ['latte','cappuccino','espresso','чай','напиток','смузи','сок','кола','кофейня','starbucks','чайхана','qahvaxona'], icon:'☕', c:'orange', label:'Ichimlik' },
  { kw: ['доставка','deliver','yetkazib berish','wolt','food delivery','привезли'], icon:'🛵', c:'orange', label:'Yetkazib berish' },

  // ── Transport ─────────────────────────────────────────────────────────────
  { kw: ['taxi','taksi','yandex go','uber','bolt','transport','avtobus','metro','автобус','такси','транспорт','метро','маршрутка','бензин','парковка','поезд','электричка'], icon:'🚕', c:'yellow', label:'Transport' },

  // ── Oziq-ovqat do\'kon ────────────────────────────────────────────────────
  { kw: ['bozor','supermarket','oziq','mahsulot','groceries','продукты','магазин','супермаркет','рынок','korzinka','makro','хлеб','молоко','мясо','рис','овощи','фрукты','яйца','масло','сахар','мука'], icon:'🛒', c:'green', label:'Oziq-ovqat' },

  // ── Kiyim ─────────────────────────────────────────────────────────────────
  { kw: ['kiyim','oyoq kiyim','krossovka','брэнд','shopping','одежда','обувь','костюм','платье','джинсы','кроссовки','пальто','куртка','рубашка'], icon:'👕', c:'purple', label:'Kiyim' },

  // ── Salomatlik ────────────────────────────────────────────────────────────
  { kw: ['dori','dorixona','apteka','shifokor','лекарство','аптека','врач','больница','клиника','таблетки','анализ','поликлиника','kasalxona','tibbiy','стоматолог','tish'], icon:'💊', c:'red', label:'Salomatlik' },

  // ── Telefon / Internet ────────────────────────────────────────────────────
  { kw: ['internet','aloqa','интернет','связь','мобильный','симкарта','ucell','beeline','uzmobile','mobiuz'], icon:'📱', c:'blue', label:'Telefon/Net' },

  // ── Uy-joy ────────────────────────────────────────────────────────────────
  { kw: ['ijara','аренда','квартира','жильё','uy ijarasi','uy to\'lovi'], icon:'🏠', c:'teal', label:'Ijara' },
  { kw: ['kommunal','свет','газ','сув','электр','электричество','газовый','суммарный счёт'], icon:'⚡', c:'teal', label:'Kommunal' },

  // ── Sport ─────────────────────────────────────────────────────────────────
  { kw: ['sport','gym','fitness','спорт','фитнес','тренажёр','бассейн','йога','crossfit','футбол','tennis'], icon:'💪', c:'green', label:'Sport' },

  // ── Ta\'lim ───────────────────────────────────────────────────────────────
  { kw: ["ta'lim",'kurs','kitob','обучение','курс','учёба','книга','университет','тренинг','репетитор','english','ingliz','udemy','coursera'], icon:'📚', c:'blue', label:"Ta'lim" },

  // ── Ko\'ngil ochar ────────────────────────────────────────────────────────
  { kw: ['kino','театр','концерт','клуб','netflix','spotify','bilет','cinema','развлечения','oyun','игра','PlayStation'], icon:'🎬', c:'purple', label:"Ko'ngil ochar" },

  // ── Go\'zallik ────────────────────────────────────────────────────────────
  { kw: ['парикмахер','салон','beauty','косметика','маникюр','педикюр','barber','sartarosh','sooch','бровист'], icon:'💅', c:'pink', label:"Go'zallik" },

  // ── Sayohat ───────────────────────────────────────────────────────────────
  { kw: ['hotel','отель','гостиница','travel','sayohat','туризм','авиа','aviabilet','booking','airbnb'], icon:'✈️', c:'sky', label:'Sayohat' },

  // ── Texnika ───────────────────────────────────────────────────────────────
  { kw: ['laptop','ноутбук','компьютер','гаджет','электроника','apple','samsung','xiaomi','iphone','planshet','texnika','elektronika'], icon:'💻', c:'blue', label:'Texnika' },

  // ── Sovg\'a ───────────────────────────────────────────────────────────────
  { kw: ['подарок',"sovg'a",'gift','цветы','gul','tort','торт','birthday','туй','свадьба'], icon:'🎁', c:'pink', label:"Sovg'a" },

  // ── Bank / To\'lov ────────────────────────────────────────────────────────
  { kw: ['перевод','transfer','bank','карта','click','payme','uzcard','humo','swift','комиссия'], icon:'🏦', c:'blue', label:'Bank' },

  // ── Freelance ─────────────────────────────────────────────────────────────
  { kw: ['фриланс','проект','дизайн','монтаж','субтитры','freelance','dizayn','montaj','заказ выполнен'], icon:'🖥️', c:'indigo', label:'Freelance' },

  // ── Daromat ───────────────────────────────────────────────────────────────
  { kw: ['maosh','oylik','ish haqi','зарплата','зарплат','оклад','бонус','выплата','получил зарплату','daromat','kirim tushdi','pul tushdi','topdim'], icon:'💰', c:'green', label:'Daromat' },
]

export const COLOR: Record<string, string> = {
  orange: 'bg-orange-500/15 border-orange-500/30 text-orange-300',
  yellow: 'bg-yellow-500/15 border-yellow-500/30 text-yellow-300',
  green:  'bg-green-500/15 border-green-500/30 text-green-300',
  purple: 'bg-purple-500/15 border-purple-500/30 text-purple-300',
  red:    'bg-red-500/15 border-red-500/30 text-red-300',
  blue:   'bg-blue-500/15 border-blue-500/30 text-blue-300',
  teal:   'bg-teal-500/15 border-teal-500/30 text-teal-300',
  pink:   'bg-pink-500/15 border-pink-500/30 text-pink-300',
  sky:    'bg-sky-500/15 border-sky-500/30 text-sky-300',
  indigo: 'bg-indigo-500/15 border-indigo-500/30 text-indigo-300',
}

export function catStyle(name: string) {
  const l = name.toLowerCase()
  for (const c of CATS) if (c.kw.some(k => l.includes(k))) return { icon: c.icon, cls: COLOR[c.c] || COLOR.blue, label: c.label }
  return { icon: '💸', cls: 'bg-gray-500/15 border-gray-500/30 text-gray-300', label: 'Boshqa' }
}

export function parseAmount(text: string): number {
  const t = text.replace(/,/g, '').replace(/\s+/g, ' ')

  // "3 million" / "3 миллиона" / "3 mlrd" / "1.5 mln"
  const mM = t.match(/(\d+(?:[.]\d+)?)\s*(?:million|миллион|млн|mln)\b/i)
  if (mM) { const v = Math.round(parseFloat(mM[1]) * 1_000_000); if (v >= 1000) return v }

  // "3 milliard" / "1 mlrd"
  const mrdM = t.match(/(\d+(?:[.]\d+)?)\s*(?:milliard|миллиард|mlrd|mrd)\b/i)
  if (mrdM) { return Math.round(parseFloat(mrdM[1]) * 1_000_000_000) }

  // "45 ming" / "45 ming 500"
  const mingM = t.match(/(\d+)\s*ming(?:\s+(\d{1,3}))?/i)
  if (mingM) { const b = parseInt(mingM[1]) * 1000; const r = mingM[2] ? parseInt(mingM[2]) : 0; if (b >= 1000) return b + r }

  // "45k"
  const kM = t.match(/(\d+)\s*k\b/i)
  if (kM) { const v = parseInt(kM[1]) * 1000; if (v >= 1000) return v }

  // "тысяч"
  const tysM = t.match(/(\d+)\s*тысяч/i)
  if (tysM) { const v = parseInt(tysM[1]) * 1000; if (v >= 1000) return v }

  // "45 000" (space-separated thousands)
  const spM = t.match(/\b(\d{2,3})\s+(\d{3})\b/)
  if (spM) { const v = parseInt(spM[1]) * 1000 + parseInt(spM[2]); if (v >= 1000) return v }

  // "100 dollar/евро" valyuta
  const currM = t.match(/\b(\d{1,6})\s*(?:dollar|доллар|евро|euro|\$|€|рублей|рубл|сум|so['`]?m)/i)
  if (currM) { const v = parseInt(currM[1]); if (v > 0) return v }

  // plain large number
  const plainM = t.match(/\b(\d{4,9})\b/)
  if (plainM) return parseInt(plainM[1])
  return 0
}

export function parseUserExpense(text: string): { name: string; amount: number; type: 'XARAJAT' | 'DAROMAT' } | null {
  const lower = text.toLowerCase()
  const amount = parseAmount(text)
  if (!amount || amount < 500) return null

  const incomeKw = ['maosh','oylik','daromat','kirim','tushdi','получил','зарплат','доход','topdim','заработ','выплат','оклад','бонус']
  const expKw    = ['xarajat','sarf',"to'l",'toladim','sotib','харч','потрат','купил','заплатил','rashod','xarj','потратил','расход','трачу']
  const catMatch = CATS.some(c => c.kw.some(k => lower.includes(k)))

  const isIncome  = incomeKw.some(k => lower.includes(k))
  const isBerdim  = lower.includes('berdim') || lower.includes('oldim')
  const isExpense = expKw.some(k => lower.includes(k)) || (catMatch && !isBerdim)

  if (!isIncome && !isExpense) return null
  if (!isIncome && isBerdim && /[A-ZА-ЯЎҚҒҲ][a-zа-яўқғҳ]{2,}ga\b/.test(text) && !catMatch) return null

  const type: 'XARAJAT' | 'DAROMAT' = isIncome && !isExpense ? 'DAROMAT' : 'XARAJAT'

  let name = type === 'XARAJAT' ? 'Xarajat' : 'Daromat'
  for (const cat of CATS) {
    if (cat.kw.some(k => lower.includes(k))) { name = cat.label; break }
  }
  return { name, amount, type }
}

export function parseUserDebt(text: string): { person: string; amount: number; dir: 'gave' | 'borrowed' } | null {
  const lower = text.toLowerCase()
  const amount = parseAmount(text)
  if (!amount || amount < 100) return null

  // hasWord: butun so'z sifatida tekshirish ("создал" ichidagi "дал" noto'g'ri mos kelmasin)
  const isLetter = (c: string) => /[а-яёА-ЯЁa-zA-ZЎўҚқҒғҲҳ]/.test(c)
  const hw = (t: string, w: string) => {
    let i = 0
    while ((i = t.indexOf(w, i)) !== -1) {
      const b = i > 0 ? t[i-1] : ' '; const a = i+w.length < t.length ? t[i+w.length] : ' '
      if (!isLetter(b) && !isLetter(a)) return true
      i += w.length
    }
    return false
  }

  const gaveKw     = ['berdim','дал','дала','одолжил','отдал','берди','дали','давал']
  const borrowedKw = ['oldim','взял','взяла','занял','qarzga oldim','взял у','взяла у']
  const isGave     = gaveKw.some(k => hw(lower, k))
  const isBorrowed = borrowedKw.some(k => hw(lower, k))
  if (!isGave && !isBorrowed) return null

  // Agar faqat xarajat konteksti bo'lsa — qarz emas
  const expKw = ['xarajat','sarf','sotib','харч','купил','заплатил']
  if (expKw.some(k => lower.includes(k))) return null
  if (CATS.filter(c => c.label !== 'Daromat').some(c => c.kw.some(k => lower.includes(k)))) return null

  const dir: 'gave' | 'borrowed' = isGave ? 'gave' : 'borrowed'
  let person = "Noma'lum"

  // 1. "Suxrob akaga" → "Suxrob aka"
  const akaM = text.match(/([A-ZА-ЯЎҚҒҲa-zа-яўқғҳ]+)\s+(aka|opa|buviga|dadaga|singlimga)ga?\b/ui)
  // 2. Rus dativ: "Хамиду дал" / "Абакуру взял" → "Хамид" / "Абакур" (strip trailing "у")
  const datM = text.match(/([А-ЯA-Zа-яёa-z]{3,})у\s+(?:дал|дала|взял|взяла|отдал|отдала|одолжил)/ui)
  // 3. "у Хамида" (genitive after "у")
  const uM   = text.match(/у\s+([А-ЯЎҚҒҲа-яёўқғҳA-Za-z]{3,})/ui)
  // 4. "Rashidga" (Uzbek dative)
  const gaM  = text.match(/([A-Za-zА-Яа-яЎўҚқҒғҲҳ]{3,})ga\b/u)
  const skip  = ['man','sen','u','bu','shu','uni','bun','ular','ber','qarz','men','нег','нем','это','эти','двум']

  if (akaM) {
    person = akaM[1] + ' ' + akaM[2]
  } else if (datM) {
    // "хамид" → "Хамид"
    const raw = datM[1]
    person = raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase()
  } else if (uM) {
    const raw = uM[1]
    person = raw.charAt(0).toUpperCase() + raw.slice(1)
  } else if (gaM && !skip.some(s => gaM[1].toLowerCase().startsWith(s))) {
    person = gaM[1]
  } else {
    for (const w of text.split(/\s+/)) {
      if (/^[A-ZА-ЯЎҚҒҲ]/.test(w) && w.length > 2 &&
          !/^(Men|Sen|U|Bu|Shu|Ular|Я|Он|Она|Они|Мы|Вы|И|Ну|Но|Из)$/i.test(w) &&
          !skip.some(s => w.toLowerCase() === s)) { person = w; break }
    }
  }
  return { person, amount, dir }
}

// ── Byudjet / limit buyrug'ini ajratish ──────────────────────────────────
// "taksi uchun oylik limit 3 million" / "лимит на такси 3 миллиона"
export function parseBudgetCommand(text: string): { category: string; amount: number } | null {
  const lower = text.toLowerCase()
  const budgetKw = ['byudjet','бюджет','limit','лимит','chegara','reja','план','belgilayman',
                    'планирую','установи','установить','qoʻy','qoy','soʻm']
  if (!budgetKw.some(k => lower.includes(k))) return null

  const amount = parseAmount(text)
  if (!amount || amount < 10_000) return null   // min 10k — tasodifiy sonlarni o'tkazib yuborish

  const catMap: Record<string, string> = {
    'taksi':'Taksi','taxi':'Taksi','такси':'Taksi',
    'transport':'Transport','транспорт':'Transport','avtobus':'Transport','автобус':'Transport',
    'ovqat':'Ovqat','еда':'Ovqat','питание':'Ovqat','ресторан':'Ovqat','обед':'Ovqat',
    'kafe':'Ovqat','кафе':'Ovqat','restoran':'Ovqat','tushlik':'Ovqat',
    'oziq':'Oziq-ovqat','продукты':'Oziq-ovqat','магазин':'Oziq-ovqat','bozor':'Oziq-ovqat',
    'korzinka':'Oziq-ovqat','супермаркет':'Oziq-ovqat',
    'kiyim':'Kiyim','одежда':'Kiyim','обувь':'Kiyim','shopping':'Kiyim',
    'dori':'Salomatlik','apteka':'Salomatlik','здоровье':'Salomatlik','врач':'Salomatlik',
    'sport':'Sport','gym':'Sport','фитнес':'Sport','fitness':'Sport',
    'kommunal':'Kommunal','свет':'Kommunal','газ':'Kommunal','электр':'Kommunal','utility':'Kommunal',
    'ijara':'Ijara','аренда':'Ijara','квартира':'Ijara','rent':'Ijara',
    'internet':'Telefon/Net','связь':'Telefon/Net','телефон':'Telefon/Net','aloqa':'Telefon/Net',
    "ta'lim":'Ta\'lim','курс':'Ta\'lim','обучение':'Ta\'lim','kurs':'Ta\'lim',
    'kino':'Ko\'ngil ochar','развлечения':'Ko\'ngil ochar','entertainment':'Ko\'ngil ochar',
    "sovg'a":'Sovg\'a','подарок':'Sovg\'a','gift':'Sovg\'a',
    'bank':'Bank','click':'Bank','payme':'Bank','transfer':'Bank',
  }

  for (const [kw, cat] of Object.entries(catMap)) {
    if (lower.includes(kw)) return { category: cat, amount }
  }

  // Kategoriya topilmasa — katta harfli so'zni ism sifatida ola
  for (const w of text.split(/\s+/)) {
    if (/^[A-ZА-ЯЎҚҒҲ]/.test(w) && w.length > 3 && !/^\d/.test(w) &&
        !budgetKw.some(k => w.toLowerCase()===k)) {
      return { category: w, amount }
    }
  }
  return null
}

// ── Bank SMS ajratish ─────────────────────────────────────────────────────
// O'zbek banklari (Kapitalbank, Hamkorbank, Uzum Bank, Agrobank, Xalq Bank…)
// yuboradigan SMS larni avtomatik ajratib xarajatga yozadi.

export interface ParsedBankSMS {
  amount:   number
  type:     'debit' | 'credit'
  merchant: string
  balance?: number
  category: string
  bank?:    string
  card?:    string   // oxirgi 4 raqam
}

export function parseBankSMS(text: string): ParsedBankSMS | null {
  const t     = text.trim()
  const lower = t.toLowerCase()

  // ── Signal skorlash: kamida 2 signal bo'lsin ─────────────────────────
  const hasCard  = /\*{1,4}\d{4}/.test(t)
  const hasCurr  = /\b(?:uzs|so[ʻ`']?m|сум)\b/i.test(t)
  const hasBal   = /(?:qoldiq|balans|остаток|bal\b|qolgan|qoldig)\s*[:\s]/i.test(t)
  const hasOp    = /(?:yechildi|yechildi|списан|debit|charged|to[ʻ']lov|payment|xarajat|расход|kirim|зачислен|пополнен)/i.test(t)
  const hasBank  = /(?:kapitalbank|hamkorbank|uzum\s*bank|agrobank|xalq\s*bank|ipak\s*yo|asaka|aloqa\s*bank|savdogar|orient\s*finance|anor\s*bank|tenge\s*bank|mikro\s*kredit|infin\s*bank)/i.test(t)

  if ([hasCard, hasCurr, hasBal, hasOp, hasBank].filter(Boolean).length < 2) return null

  // ── Summa ─────────────────────────────────────────────────────────────
  let amount = 0
  let type: 'debit' | 'credit' = 'debit'

  const amtM = t.match(/([+-])?\s*([\d][\d\s,]{1,12}[\d]|[\d]+)\s*(?:so[ʻ`']?m|uzs|сум)/i)
  if (amtM) {
    amount = parseInt(amtM[2].replace(/[\s,]/g, ''))
    if (amtM[1] === '+') type = 'credit'
    else if (amtM[1] === '-') type = 'debit'
  }
  if (!amount || amount < 1000) return null

  // Agar belgi yo'q — kontekstdan aniqlash
  if (!amtM?.[1]) {
    const creditKw = ['kirim','зачислен','поступил','credited','tushdi','зачислено','пополнение']
    if (creditKw.some(w => lower.includes(w))) type = 'credit'
    else type = 'debit'
  }

  // ── Karta raqami (oxirgi 4) ───────────────────────────────────────────
  const cardM = t.match(/\*{1,4}(\d{4})/)
  const card  = cardM?.[1]

  // ── Bank nomi ─────────────────────────────────────────────────────────
  let bank: string | undefined
  const bankRules: [RegExp, string][] = [
    [/uzum\s*bank/i,       'Uzum Bank'],
    [/kapitalbank/i,       'Kapitalbank'],
    [/hamkorbank/i,        'Hamkorbank'],
    [/agrobank/i,          'Agrobank'],
    [/ipak\s*yo[lʻ]/i,    "Ipak Yo'li"],
    [/xalq\s*bank/i,       'Xalq Bank'],
    [/asaka\s*bank/i,      'Asakabank'],
    [/aloqa\s*bank/i,      'Aloqabank'],
    [/savdogar\s*bank/i,   'Savdogar Bank'],
    [/orient\s*finance/i,  'Orient Finance'],
    [/anor\s*bank/i,       'Anor Bank'],
    [/tenge\s*bank/i,      'TengeBank'],
    [/infin\s*bank/i,      'Infin Bank'],
  ]
  for (const [re, name] of bankRules) {
    if (re.test(t)) { bank = name; break }
  }

  // ── Merchant nomi ─────────────────────────────────────────────────────
  let merchant = ''
  const mPatterns: RegExp[] = [
    /(?:tovar[\/]?xizmat|tovar|savdogar|do[`'ʻ]kon|merchant|магазин|terminal|терминал)\s*:?\s*([A-ZА-Яa-z\d][^\n:;.,\d]{2,35})/i,
    /MERCHANT\s*:\s*([A-Z][A-Z0-9 ._-]{2,28})/,
    /(?:\s|^)([A-Z][A-Z0-9.& ]{3,25}(?:\s[A-Z0-9]{2,15}){0,2})\s*(?:qoldiq|bal|uzs|soʻm|остаток)/i,
  ]
  for (const p of mPatterns) {
    const m = t.match(p)
    if (m?.[1]) {
      merchant = m[1].trim()
        .replace(/\s*(qoldiq|bal\b|uzs|soʻm|остаток|балан).*/i, '')
        .trim()
      if (merchant.length > 2) break
    }
  }

  // ── Qoldiq ────────────────────────────────────────────────────────────
  let balance: number | undefined
  const balM = t.match(/(?:qoldiq|balans|bal\b|остаток|qolgan)\s*[:\s]\s*([\d][\d\s,]{0,12}[\d])/i)
  if (balM) {
    const v = parseInt(balM[1].replace(/[\s,]/g, ''))
    if (v > 0) balance = v
  }

  // ── Kategoriya ────────────────────────────────────────────────────────
  const category = smsCat(merchant || t)

  return { amount, type, merchant, balance, category, bank, card }
}

function smsCat(text: string): string {
  const lower = text.toLowerCase()
  const rules: [string[], string][] = [
    [['bolt','yandex.taxi','yandex taxi','uber','taksi','taxi','mytaxi','indrive','indriver','maxim cab'], 'Taksi'],
    [['korzinka','makro','havas','nexmart','auchan','novus','magnit','fix price','supermarket'], 'Oziq-ovqat'],
    [['kfc','mcdonalds','burger king','pizza','chayhona','lag\'mon','sushi','restoran','cafe','oshxona','bekat'], 'Ovqat'],
    [['apteka','aptek','dorixona','pharmacy','farmaci','dori'], 'Salomatlik'],
    [['texnomart','mediapark','samsung store','apple store','istore','electronics'], 'Texnika'],
    [['ucell','beeline','uzmobile','mobiuz','humans','aloqa'], 'Telefon/Net'],
    [['uzum market','ozon','wildberries','zara','lcwaikiki','h&m','koton'], 'Kiyim'],
    [['gym','fitness','sport','фитнес'], 'Sport'],
    [['netflix','spotify','youtube premium','play store','steam','kino'], "Ko'ngil ochar"],
    [['kommunal','toshkent city gas','suv hisob','elektr','газ хисоб'], 'Kommunal'],
    [['click','payme','transfer','перевод','o\'tkazma'], 'Bank'],
  ]
  for (const [kws, cat] of rules) {
    if (kws.some(k => lower.includes(k))) return cat
  }
  return 'Boshqa'
}

// ── Bir xabarda bir nechta qarz: "Абакуру дал 100$, Хамиду дал 200$" ──────
export function parseAllDebts(text: string): { person: string; amount: number; dir: 'gave' | 'borrowed' }[] {
  // Vergul, "и", "а также" bo'yicha bo'laklash
  const parts = text
    .split(/[,;]|\s+и\s+также\s+|\s+также\s+|\s+а\s+также\s+|\s+плюс\s+/gi)
    .map(p => p.trim())
    .filter(p => p.length > 4)

  const seen    = new Set<string>()
  const results: { person: string; amount: number; dir: 'gave' | 'borrowed' }[] = []

  if (parts.length > 1) {
    for (const part of parts) {
      const debt = parseUserDebt(part)
      // Faqat aniq ism bo'lgan qarzlarni qabul qilamiz
      if (debt && debt.person !== "Noma'lum") {
        const key = `${debt.person.toLowerCase()}:${debt.amount}`
        if (!seen.has(key)) { seen.add(key); results.push(debt) }
      }
    }
    if (results.length >= 1) return results
  }

  // Bitta qarz yoki bo'laklashdan natija chiqmasa
  const single = parseUserDebt(text)
  return single ? [single] : []
}

export function parseAllExpenses(text: string): { name: string; amount: number; type: 'XARAJAT' | 'DAROMAT' }[] {
  const parts = text
    .split(/,?\s*(?:плюс\s+(?:ещё|еще)|и\s+(?:ещё|еще|на)|плюс|также|а\s+также|\+)|[;,]\s*(?=\d)/gi)
    .map(p => p.replace(/^(?:ещё|еще|и|а|ну)\s+/i, '').trim())
    .filter(p => p.length > 3)

  if (parts.length > 1) {
    const seen = new Set<number>()
    const results = parts.flatMap(part => {
      const exp = parseUserExpense(part)
      if (exp && !seen.has(exp.amount)) { seen.add(exp.amount); return [exp] }
      return []
    })
    if (results.length >= 2) return results
  }
  const single = parseUserExpense(text)
  return single ? [single] : []
}
