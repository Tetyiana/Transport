// Telegram-бот для водіїв: прив'язка, картка рейсу, спідометр, витрати.
// Також приймає { action:'send', trip_id, text } із застосунку (з JWT користувача).
// Деплой: без перевірки JWT (Verify JWT = off), Telegram валідуємо секрет-токеном вебхука.
import { createClient } from 'jsr:@supabase/supabase-js@2'

const TOKEN = Deno.env.get('TELEGRAM_BOT_TOKEN') ?? ''
const SECRET = Deno.env.get('TG_WEBHOOK_SECRET') ?? ''
const API = `https://api.telegram.org/bot${TOKEN}`

const db = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...CORS } })

const MAIN_KB = {
  keyboard: [[{ text: '🚛 Мій рейс' }], [{ text: '📏 Спідометр' }, { text: '💸 Витрата' }]],
  resize_keyboard: true,
}

async function tg(method: string, payload: Record<string, unknown>) {
  const r = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  return await r.json().catch(() => ({}))
}
const send = (chat_id: number, text: string, extra: Record<string, unknown> = {}) =>
  tg('sendMessage', { chat_id, text, reply_markup: MAIN_KB, ...extra })

// ---------- сесії ----------
async function getSession(chat_id: number) {
  const { data } = await db.from('bot_sessions').select('*').eq('chat_id', chat_id).maybeSingle()
  return data
}
const setSession = (chat_id: number, state: string | null, data: Record<string, unknown> = {}) =>
  db.from('bot_sessions').upsert({ chat_id, state, data, updated_at: new Date().toISOString() })

// ---------- дані ----------
async function getDriver(chat_id: number) {
  const { data } = await db.from('drivers').select('*').eq('telegram_chat_id', chat_id).maybeSingle()
  return data
}

async function activeTrip(driver_id: string) {
  const { data } = await db.from('trips')
    .select('*, vehicle:vehicle_id(id, name), customer:customer_id(name)')
    .eq('driver_id', driver_id)
    .not('status', 'in', '(paid,closed,cancelled)')
    .order('created_at', { ascending: false })
    .limit(1)
  return data?.[0] ?? null
}

function routePoints(t: Record<string, any>): [string, string, string][] {
  return ([
    ['Завантаження', t.route_from, t.route_from_coords],
    ['Замитнення', t.customs_out_point, t.customs_out_coords],
    ['Пункт пропуску', t.border_point, t.border_coords],
    ['Розмитнення', t.customs_in_point, t.customs_in_coords],
    ['Вивантаження', t.route_to, t.route_to_coords],
  ] as [string, string, string][]).filter(([, place, coords]) => place || coords)
}

function mapsUrl(t: Record<string, any>) {
  const pts = routePoints(t)
  if (pts.length < 2) return null
  const p = (x: [string, string, string]) => (x[2] || x[1] || '').trim()
  const mid = pts.slice(1, -1).map(p).join('|')
  return `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(p(pts[0]))}&destination=${encodeURIComponent(p(pts.at(-1)!))}${mid ? `&waypoints=${encodeURIComponent(mid)}` : ''}`
}

function tripText(t: Record<string, any>) {
  return [
    `Рейс ${t.number || ''} ${t.route_from || ''} → ${t.route_to || ''}`.trim(),
    t.vehicle?.name ? `Машина: ${t.vehicle.name}` : null,
    t.loading_date ? `Завантаження: ${t.loading_date}` : null,
    t.customs_info ? `Замитнення/розмитнення: ${t.customs_info}` : null,
    ...routePoints(t).map(([label, place, coords]) => `${label}: ${[place, coords].filter(Boolean).join(' — ')}`),
    t.rmpd_number ? `Зголошення RMPD/SENT: ${t.rmpd_number}` : null,
    t.expeditor_contact ? `Експедитор: ${t.expeditor_contact}` : null,
    t.route_plan ? `Маршрут: ${t.route_plan}` : null,
    t.odometer_start ? `Спідометр на початок: ${t.odometer_start}` : null,
    t.odometer_end ? `Спідометр на кінець: ${t.odometer_end}` : null,
    mapsUrl(t) ? `\n🗺 Маршрут на карті:\n${mapsUrl(t)}` : null,
  ].filter(Boolean).join('\n')
}

// ---------- валюти / НБУ ----------
function parseAmount(raw: string): { amount: number; currency: string } | null {
  const m = raw.trim().replace(',', '.').match(/^(\d+(?:\.\d+)?)\s*(.*)$/)
  if (!m) return null
  const amount = parseFloat(m[1])
  if (!amount) return null
  const c = m[2].toLowerCase().trim()
  const map: Record<string, string> = {
    '': 'UAH', 'грн': 'UAH', 'uah': 'UAH', '₴': 'UAH',
    'eur': 'EUR', 'євро': 'EUR', '€': 'EUR',
    'usd': 'USD', 'дол': 'USD', '$': 'USD',
    'pln': 'PLN', 'зл': 'PLN', 'злот': 'PLN', 'zl': 'PLN', 'zł': 'PLN',
  }
  const currency = map[c]
  if (!currency) return null
  return { amount, currency }
}

async function nbuRate(currency: string, date: string): Promise<number | null> {
  if (currency === 'UAH') return null
  try {
    const d = date.replaceAll('-', '')
    const r = await fetch(`https://bank.gov.ua/NBUStatService/v1/statdirectory/exchange?valcode=${currency}&date=${d}&json`)
    const j = await r.json()
    return j?.[0]?.rate ?? null
  } catch { return null }
}

// ---------- обробка повідомлень ----------
async function handleMessage(msg: Record<string, any>) {
  const chat_id: number = msg.chat.id
  const text: string = (msg.text || '').trim()

  // /start [код]
  if (text.startsWith('/start')) {
    // кириличні двійники латинських літер → латиниця (водії часто набирають код в укр розкладці)
    const homo: Record<string, string> = { 'А':'A','В':'B','С':'C','Е':'E','Н':'H','І':'I','К':'K','М':'M','О':'O','Р':'P','Т':'T','Х':'X','У':'Y','З':'3' }
    const code = text.split(/\s+/)[1]?.toUpperCase()?.replace(/./g, (ch: string) => homo[ch] ?? ch)
    if (!code) {
      await send(chat_id, 'Вітаю! Це бот для водіїв.\nНадішліть код підключення так:\n/start КОД\n(код видає диспетчер у застосунку, розділ «Водії»)')
      return
    }
    const { data: d } = await db.from('drivers').select('id, full_name').eq('tg_link_code', code).maybeSingle()
    if (!d) { await send(chat_id, 'Код не знайдено. Перевірте і спробуйте ще раз: /start КОД'); return }
    await db.from('drivers').update({ telegram_chat_id: chat_id }).eq('id', d.id)
    await setSession(chat_id, null)
    await send(chat_id, `Готово, ${d.full_name}! Ви підключені.\nКнопки внизу: рейс, спідометр, витрати.`)
    return
  }

  const driver = await getDriver(chat_id)
  if (!driver) { await send(chat_id, 'Ви ще не підключені. Надішліть: /start КОД'); return }

  if (text === '/cancel' || text === 'Скасувати') {
    await setSession(chat_id, null)
    await send(chat_id, 'Скасовано.')
    return
  }

  const session = await getSession(chat_id)

  // --- очікуємо число спідометра ---
  if (session?.state === 'await_odo') {
    const val = parseInt(text.replace(/\D/g, ''), 10)
    if (!val) { await send(chat_id, 'Надішліть число, напр. 458200. Або «Скасувати».'); return }
    const { field, trip_id, vehicle_id } = session.data
    await db.from('trips').update({ [field]: val }).eq('id', trip_id)
    if (field === 'odometer_end' && vehicle_id) {
      await db.from('vehicles').update({ current_odometer: val }).eq('id', vehicle_id)
    }
    const { data: t } = await db.from('trips').select('odometer_start, odometer_end').eq('id', trip_id).single()
    const run = t?.odometer_start && t?.odometer_end ? `\nПробіг рейсу: ${t.odometer_end - t.odometer_start} км` : ''
    await setSession(chat_id, null)
    await send(chat_id, `Записано: ${field === 'odometer_start' ? 'початок' : 'кінець'} ${val}.${run}`)
    return
  }

  // --- очікуємо суму витрати ---
  if (session?.state === 'await_amount') {
    const p = parseAmount(text)
    if (!p) { await send(chat_id, 'Не зрозумів суму. Приклади: 1500 / 550 eur / 200 pln / 40 usd. Або «Скасувати».'); return }
    await setSession(chat_id, 'await_note', { ...session.data, ...p })
    await send(chat_id, 'Примітка (наприклад «заправка Orlen»). Якщо без примітки — надішліть «-».')
    return
  }

  // --- очікуємо примітку, зберігаємо витрату ---
  if (session?.state === 'await_note') {
    const note = text === '-' ? null : text
    const { category_id, trip_id, vehicle_id, amount, currency } = session.data
    const expense_date = new Date().toISOString().slice(0, 10)
    const rate = await nbuRate(currency, expense_date)
    const rec: Record<string, unknown> = {
      trip_id, vehicle_id: vehicle_id || null, category_id,
      amount, currency, expense_date, payment_form: 'cash', note,
    }
    if (rate) { rec.rate = rate; rec.amount_uah = Math.round(amount * rate * 100) / 100 }
    const { error } = await db.from('expenses').insert(rec)
    await setSession(chat_id, null)
    if (error) { await send(chat_id, 'Помилка збереження: ' + error.message); return }
    const uah = rate ? ` (≈ ${(amount * rate).toFixed(0)} грн за курсом НБУ)` : ''
    await send(chat_id, `Витрату записано: ${amount} ${currency}${uah}.`)
    return
  }

  // --- головні кнопки ---
  if (text === '🚛 Мій рейс' || text === '/trip') {
    const t = await activeTrip(driver.id)
    await send(chat_id, t ? tripText(t) : 'Активного рейсу немає.')
    return
  }

  if (text === '📏 Спідометр' || text === '/odo') {
    const t = await activeTrip(driver.id)
    if (!t) { await send(chat_id, 'Активного рейсу немає.'); return }
    await tg('sendMessage', {
      chat_id, text: `Рейс ${t.number || `${t.route_from} → ${t.route_to}`}. Що фіксуємо?`,
      reply_markup: { inline_keyboard: [[
        { text: 'Початок', callback_data: `odo:odometer_start` },
        { text: 'Кінець', callback_data: `odo:odometer_end` },
      ]] },
    })
    return
  }

  if (text === '💸 Витрата' || text === '/exp') {
    const t = await activeTrip(driver.id)
    if (!t) { await send(chat_id, 'Активного рейсу немає — витрату внесе диспетчер у застосунку.'); return }
    const { data: cats } = await db.from('expense_categories')
      .select('id, name').in('scope', ['carrier', 'both']).order('name')
    const rows: { text: string; callback_data: string }[][] = []
    for (let i = 0; i < (cats?.length ?? 0); i += 2) {
      rows.push(cats!.slice(i, i + 2).map(c => ({ text: c.name, callback_data: `cat:${c.id}` })))
    }
    await setSession(chat_id, 'pick_cat', { trip_id: t.id, vehicle_id: t.vehicle?.id ?? null })
    await tg('sendMessage', { chat_id, text: 'Категорія витрати:', reply_markup: { inline_keyboard: rows } })
    return
  }

  await send(chat_id, 'Користуйтесь кнопками внизу: 🚛 Мій рейс, 📏 Спідометр, 💸 Витрата.')
}

// ---------- обробка callback-кнопок ----------
async function handleCallback(cb: Record<string, any>) {
  const chat_id: number = cb.message.chat.id
  const data: string = cb.data || ''
  await tg('answerCallbackQuery', { callback_query_id: cb.id })

  const driver = await getDriver(chat_id)
  if (!driver) return

  if (data.startsWith('odo:')) {
    const field = data.slice(4)
    const t = await activeTrip(driver.id)
    if (!t) { await send(chat_id, 'Активного рейсу немає.'); return }
    await setSession(chat_id, 'await_odo', { field, trip_id: t.id, vehicle_id: t.vehicle?.id ?? null })
    await send(chat_id, `Надішліть покази спідометра (${field === 'odometer_start' ? 'початок' : 'кінець'} рейсу), лише число.`)
    return
  }

  if (data.startsWith('cat:')) {
    const category_id = data.slice(4)
    const session = await getSession(chat_id)
    if (session?.state !== 'pick_cat') return
    await setSession(chat_id, 'await_amount', { ...session.data, category_id })
    await send(chat_id, 'Сума. Приклади: 1500 (грн) / 550 eur / 200 pln / 40 usd.')
    return
  }
}

// ---------- виклик із застосунку ----------
async function handleAppRequest(req: Request) {
  const auth = req.headers.get('Authorization')?.replace('Bearer ', '') ?? ''
  const anon = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!)
  const { data: { user } } = await anon.auth.getUser(auth)
  if (!user) return json({ error: 'unauthorized' }, 401)

  const body = await req.json().catch(() => ({}))
  if (body.action === 'send' && body.trip_id && body.text) {
    const { data: t } = await db.from('trips')
      .select('id, driver:driver_id(telegram_chat_id, full_name)').eq('id', body.trip_id).single()
    const chat = (t?.driver as any)?.telegram_chat_id
    if (!chat) return json({ ok: false, linked: false })
    await send(chat, String(body.text))
    return json({ ok: true })
  }
  return json({ error: 'bad request' }, 400)
}

// ---------- вхідна точка ----------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })

  // вебхук Telegram — перевіряємо секрет-токен
  if (req.headers.get('x-telegram-bot-api-secret-token') === SECRET && SECRET) {
    const update = await req.json().catch(() => null)
    try {
      if (update?.message) await handleMessage(update.message)
      else if (update?.callback_query) await handleCallback(update.callback_query)
    } catch (e) { console.error(e) }
    return json({ ok: true })
  }

  // запит із застосунку
  return await handleAppRequest(req)
})
