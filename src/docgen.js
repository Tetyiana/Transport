import { PDFDocument, rgb } from 'pdf-lib'
import fontkit from '@pdf-lib/fontkit'

// ---------- сума прописом (укр) ----------
const U = ['', 'один', 'два', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"]
const UF = ['', 'одна', 'дві', 'три', 'чотири', "п'ять", 'шість', 'сім', 'вісім', "дев'ять"]
const TEEN = ['десять', 'одинадцять', 'дванадцять', 'тринадцять', 'чотирнадцять', "п'ятнадцять", 'шістнадцять', 'сімнадцять', 'вісімнадцять', "дев'ятнадцять"]
const TENS = ['', '', 'двадцять', 'тридцять', 'сорок', "п'ятдесят", 'шістдесят', 'сімдесят', 'вісімдесят', "дев'яносто"]
const HUND = ['', 'сто', 'двісті', 'триста', 'чотириста', "п'ятсот", 'шістсот', 'сімсот', 'вісімсот', "дев'ятсот"]
const pick = (n, one, few, many) => { const m10 = n % 10, m100 = n % 100; if (m10 === 1 && m100 !== 11) return one; if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few; return many }
const triad = (n, fem) => {
  const w = []
  if (HUND[Math.floor(n / 100)]) w.push(HUND[Math.floor(n / 100)])
  const r = n % 100
  if (r >= 10 && r < 20) w.push(TEEN[r - 10])
  else {
    if (TENS[Math.floor(r / 10)]) w.push(TENS[Math.floor(r / 10)])
    const u = r % 10
    if (u) w.push((fem ? UF : U)[u])
  }
  return w.join(' ')
}
const CUR = {
  UAH: { one: 'гривня', few: 'гривні', many: 'гривень', fem: true, kop: ['копійка', 'копійки', 'копійок'] },
  EUR: { one: 'євро', few: 'євро', many: 'євро', fem: false, kop: ['цент', 'центи', 'центів'] },
  USD: { one: 'долар США', few: 'долари США', many: 'доларів США', fem: false, kop: ['цент', 'центи', 'центів'] },
  PLN: { one: 'злотий', few: 'злоті', many: 'злотих', fem: false, kop: ['грош', 'гроші', 'грошів'] },
}
export function sumInWords(amount, currency = 'UAH') {
  const c = CUR[currency] || CUR.UAH
  const int = Math.floor(amount), kop = Math.round((amount - int) * 100)
  const parts = []
  const mln = Math.floor(int / 1e6), th = Math.floor(int / 1e3) % 1e3, rest = int % 1e3
  if (mln) parts.push(triad(mln, false), pick(mln, 'мільйон', 'мільйони', 'мільйонів'))
  if (th) parts.push(triad(th, true), pick(th, 'тисяча', 'тисячі', 'тисяч'))
  if (rest || !int) parts.push(int ? triad(rest, c.fem) : 'нуль')
  const words = parts.filter(Boolean).join(' ')
  const curWord = pick(int, c.one, c.few, c.many)
  const kopWord = pick(kop, c.kop[0], c.kop[1], c.kop[2])
  const cap = words.charAt(0).toUpperCase() + words.slice(1)
  return `${cap} ${curWord} ${String(kop).padStart(2, '0')} ${kopWord}`
}

const fmtM = (n) => Number(n).toLocaleString('uk-UA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtDate = (iso) => { const [y, m, d] = iso.split('-'); return `${d}.${m}.${y}` }

let fontsCache = null
async function loadFonts() {
  if (fontsCache) return fontsCache
  const [r, b] = await Promise.all([
    fetch('/fonts/DejaVuSans.ttf').then(x => x.arrayBuffer()),
    fetch('/fonts/DejaVuSans-Bold.ttf').then(x => x.arrayBuffer()),
  ])
  fontsCache = { r, b }
  return fontsCache
}

// kind: 'invoice' | 'act'
export async function makeDocPdf(kind, { company, customer, trip, number, date }) {
  const { r, b } = await loadFonts()
  const doc = await PDFDocument.create()
  doc.registerFontkit(fontkit)
  const font = await doc.embedFont(r, { subset: true })
  const bold = await doc.embedFont(b, { subset: true })
  const page = doc.addPage([595.28, 841.89]) // A4
  const { width } = page.getSize()
  const M = 45
  let y = 790
  const text = (t, x, yy, size = 10, f = font, color = rgb(0, 0, 0)) => page.drawText(String(t ?? ''), { x, y: yy, size, font: f, color })
  const line = (yy) => page.drawLine({ start: { x: M, y: yy }, end: { x: width - M, y: yy }, thickness: 0.7, color: rgb(0.2, 0.2, 0.2) })
  const wrap = (t, max, size = 10, f = font) => {
    const words = String(t).split(' '); const out = []; let cur = ''
    for (const w of words) {
      const probe = cur ? cur + ' ' + w : w
      if (f.widthOfTextAtSize(probe, size) > max && cur) { out.push(cur); cur = w } else cur = probe
    }
    if (cur) out.push(cur)
    return out
  }

  const amount = Number(trip.freight_amount || 0)
  const currency = trip.currency || 'UAH'
  const vat = company.vat_mode === 'included' ? amount / 6 : 0
  const service = `Транспортні послуги з перевезення вантажу за маршрутом ${trip.route_from || ''} — ${trip.route_to || ''}` +
    (trip.number ? ` (заявка/рейс № ${trip.number})` : '')

  // Заголовок
  const title = kind === 'invoice'
    ? `Рахунок на оплату № ${number} від ${fmtDate(date)}`
    : `Акт наданих послуг № ${number} від ${fmtDate(date)}`
  text(title, M, y, 14, bold); y -= 10; line(y); y -= 24

  // Сторони
  const party = (label, p) => {
    text(label, M, y, 9, bold)
    const lines = [
      p.name,
      p.edrpou ? `ЄДРПОУ/РНОКПП: ${p.edrpou}` : null,
      p.address || null,
      p.iban ? `IBAN: ${p.iban}${p.bank ? `, ${p.bank}` : ''}` : null,
      p.phone ? `тел.: ${p.phone}` : null,
    ].filter(Boolean)
    let yy = y - 14
    for (const l of lines) for (const w of wrap(l, width - 2 * M - 120)) { text(w, M + 110, yy, 10); yy -= 14 }
    y = yy - 8
  }
  party(kind === 'invoice' ? 'Постачальник:' : 'Виконавець:', company)
  party(kind === 'invoice' ? 'Покупець:' : 'Замовник:', customer)
  y -= 6

  // Таблиця послуг
  line(y); y -= 16
  text('№', M, y, 9, bold); text('Найменування послуги', M + 25, y, 9, bold)
  text('К-сть', width - M - 170, y, 9, bold); text('Ціна', width - M - 120, y, 9, bold); text(`Сума, ${currency}`, width - M - 65, y, 9, bold)
  y -= 8; line(y); y -= 16
  text('1', M, y, 10)
  const svcLines = wrap(service, width - 2 * M - 210)
  for (const l of svcLines) { text(l, M + 25, y, 10); y -= 14 }
  const rowY = y + 14
  text('1', width - M - 170, rowY, 10); text(fmtM(amount), width - M - 120, rowY, 10); text(fmtM(amount), width - M - 65, rowY, 10)
  y -= 4; line(y); y -= 18

  // Підсумки
  const right = (label, val, f = font) => { text(label, width - M - 220, y, 10, f); text(val, width - M - 65, y, 10, f); y -= 16 }
  right('Разом:', fmtM(amount), bold)
  if (vat) { right('у т.ч. ПДВ 20%:', fmtM(vat)) } else { right('Без ПДВ', '') }
  y -= 4
  for (const w of wrap(`Всього до сплати: ${sumInWords(amount, currency)}`, width - 2 * M, 10, bold)) { text(w, M, y, 10, bold); y -= 15 }
  y -= 10

  if (kind === 'act') {
    const actText = 'Зазначені послуги виконані повністю та в строк. Замовник претензій до обсягу, якості та строків надання послуг не має.'
    for (const w of wrap(actText, width - 2 * M)) { text(w, M, y, 10); y -= 14 }
    y -= 24
    // Підписи двох сторін
    text('Виконавець', M, y, 10, bold); text('Замовник', width / 2 + 20, y, 10, bold); y -= 40
    page.drawLine({ start: { x: M, y }, end: { x: M + 180, y }, thickness: 0.7 })
    page.drawLine({ start: { x: width / 2 + 20, y }, end: { x: width / 2 + 200, y }, thickness: 0.7 })
    y -= 12
    text(company.director || company.name || '', M, y, 8)
    text(customer.name || '', width / 2 + 20, y, 8)
  } else {
    y -= 10
    text('Рахунок дійсний до сплати протягом 5 банківських днів.', M, y, 9); y -= 30
    text('Виписав(ла):', M, y, 10, bold)
    page.drawLine({ start: { x: M + 90, y: y - 2 }, end: { x: M + 270, y: y - 2 }, thickness: 0.7 })
    if (company.director) text(company.director, M + 100, y + 8, 8)
  }

  return doc.save()
}
