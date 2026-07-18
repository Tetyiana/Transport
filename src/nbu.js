// Курс НБУ на дату. date: 'YYYY-MM-DD'. Повертає число або null.
export async function nbuRate(code, date) {
  if (!code || code === 'UAH') return 1
  try {
    const d = (date || new Date().toISOString().slice(0, 10)).replaceAll('-', '')
    const r = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${code}&date=${d}&json`)
    const j = await r.json()
    return j?.[0]?.rate ?? null
  } catch { return null }
}
export const toUah = (amount, rate) => (amount == null || rate == null) ? null : Number(amount) * Number(rate)
