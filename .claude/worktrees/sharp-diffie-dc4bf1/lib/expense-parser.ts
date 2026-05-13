// Shared expense parser — server va client da ishlatiladi

export const CATS = [
  { kw: ['kafe','qahva','coffee','restoran','tushlik','ovqat','еда','кафе','завтрак','обед','ужин','перекус','ресторан','столовая','фастфуд','пицца','шаурма'], icon:'🍽️', c:'orange' },
  { kw: ['taxi','taksi','yandex go','transport','avtobus','metro','такси','транспорт','метро','автобус','маршрутка','бензин','парковка'], icon:'🚕', c:'yellow' },
  { kw: ['bozor','supermarket','oziq','mahsulot','groceries','продукты','магазин','супермаркет','рынок','продукт'], icon:'🛒', c:'green' },
  { kw: ['kiyim','oyoq','brend','shopping','одежда','обувь'], icon:'👕', c:'purple' },
  { kw: ['dori','dorixona','apteka','shifokor','лекарство','аптека','врач','больница','клиника'], icon:'💊', c:'red' },
  { kw: ['internet','telefon','aloqa','интернет','телефон','связь','мобильный'], icon:'📱', c:'blue' },
  { kw: ['uy','kvartira','kommunal','ijara','аренда','квартира','коммунал','жильё','дом'], icon:'🏠', c:'teal' },
  { kw: ['sport','gym','fitness','спорт','фитнес','тренажёр','бассейн'], icon:'💪', c:'green' },
  { kw: ["ta'lim",'kurs','kitob','обучение','курс','учёба','книга'], icon:'📚', c:'blue' },
  { kw: ['maosh','ish haqi','зарплата','зарплат','доход','получил','заработал','выплата','оклад'], icon:'💰', c:'green' },
  { kw: ['кофе','чай','напиток'], icon:'☕', c:'orange' },
  { kw: ['развлечения','кино','театр','концерт','клуб'], icon:'🎬', c:'purple' },
  { kw: ['субтитры','монтаж','дизайн','фриланс','проект'], icon:'💻', c:'blue' },
]

export function parseAmount(text: string): number {
  const t = text.replace(/,/g, '')
  const mingM = t.match(/(\d+)\s*ming(?:\s+(\d{1,3}))?/i)
  if (mingM) { const b = parseInt(mingM[1]) * 1000; const r = mingM[2] ? parseInt(mingM[2]) : 0; if (b >= 1000) return b + r }
  const kM = t.match(/(\d+)\s*k\b/i)
  if (kM) { const v = parseInt(kM[1]) * 1000; if (v >= 1000) return v }
  const tysM = t.match(/(\d+)\s*тысяч/i)
  if (tysM) { const v = parseInt(tysM[1]) * 1000; if (v >= 1000) return v }
  const spM = t.match(/\b(\d{2,3})\s+(\d{3})\b/)
  if (spM) { const v = parseInt(spM[1]) * 1000 + parseInt(spM[2]); if (v >= 1000) return v }
  const plainM = t.match(/\b(\d{4,9})\b/)
  if (plainM) return parseInt(plainM[1])
  return 0
}

export function parseUserExpense(text: string): { name: string; amount: number; type: 'XARAJAT' | 'DAROMAT' } | null {
  const lower = text.toLowerCase()
  const amount = parseAmount(text)
  if (!amount || amount < 500) return null

  const incomeKw = ['maosh','oylik','daromat','kirim','tushdi','получил','зарплат','доход','topdim','зарабо','выплат','оклад']
  const expKw    = ['xarajat','sarf',"to'l",'toladim','sotib','харч','потрат','купил','заплатил','rashod','xarj','uchun to','потратил','расход']
  const catMatch = CATS.some(c => c.kw.some(k => lower.includes(k)))

  const isIncome  = incomeKw.some(k => lower.includes(k))
  const isBerdim  = lower.includes('berdim') || lower.includes('oldim')
  const isExpense = expKw.some(k => lower.includes(k)) || (catMatch && !isBerdim)

  if (!isIncome && !isExpense) return null
  if (!isIncome && isBerdim && /[A-ZА-ЯЎҚҒҲ][a-zа-яўқғҳ]{2,}ga\b/.test(text) && !catMatch) return null

  const type: 'XARAJAT' | 'DAROMAT' = isIncome && !isExpense ? 'DAROMAT' : 'XARAJAT'

  let name = type === 'XARAJAT' ? 'Xarajat' : 'Daromat'
  for (const cat of CATS) {
    const kw = cat.kw.find(k => lower.includes(k))
    if (kw) { name = kw.charAt(0).toUpperCase() + kw.slice(1); break }
  }
  return { name, amount, type }
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
