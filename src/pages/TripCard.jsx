import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { longPress } from '../longpress'
import { nbuRate } from '../nbu'
import { stampPdf } from '../pdfsign'
import { makeDocPdf } from '../docgen'
import { TRIP_STATUSES, PAY_FORMS, payFormLabel, DOC_TYPES, docTypeLabel, schemeLabel, PAY_SCHEMES, CURRENCIES } from '../dicts'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 2 }))
const today = () => new Date().toISOString().slice(0, 10)

export default function TripCard() {
  const { id } = useParams()
  const [t, setT] = useState(null)
  const [events, setEvents] = useState([])
  const [expenses, setExpenses] = useState([])
  const [exEditId, setExEditId] = useState(null)
  const [incomes, setIncomes] = useState([])
  const [docs, setDocs] = useState([])
  const [payroll, setPayroll] = useState([])
  const [cats, setCats] = useState([])
  const [rate, setRate] = useState(null) // курс НБУ для фрахту (дата вивантаження)
  const [edit, setEdit] = useState(false)
  const [ef, setEf] = useState({})
  const [exf, setExf] = useState({ category_id: '', amount: '', currency: 'UAH', payment_form: 'bank', expense_date: today(), note: '', liters: '' })
  const [inf, setInf] = useState({ amount: '', currency: 'UAH', payment_form: 'bank', income_date: today(), note: '' })
  const [df, setDf] = useState({ doc_type: 'application', title: '', file: null })
  const [pf, setPf] = useState({ scheme: 'percent_freight', base_amount: '', amount: '' })
  const [signPos, setSignPos] = useState('right')
  const [signing, setSigning] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase.from('trips')
      .select('*, customer:customer_id(name, edrpou), carrier:carrier_id(name), vehicle:vehicle_id(name, fuel_norm), driver:driver_id(id, full_name, phone, pay_scheme, pay_percent, rate_km_ua, rate_km_abroad, rate_per_trip, rate_per_trip_currency, taxes_included, telegram_chat_id)')
      .eq('id', id).single()
    setT(data); setEf(data || {})
    supabase.from('trip_events').select('*').eq('trip_id', id).order('sort_order').then(({ data }) => setEvents(data || []))
    supabase.from('expenses').select('*, category:category_id(name)').eq('trip_id', id).order('expense_date').then(({ data }) => setExpenses(data || []))
    supabase.from('incomes').select('*').eq('trip_id', id).order('income_date').then(({ data }) => setIncomes(data || []))
    supabase.from('documents').select('*').eq('trip_id', id).order('created_at').then(({ data }) => setDocs(data || []))
    supabase.from('driver_payroll').select('*').eq('trip_id', id).then(({ data }) => setPayroll(data || []))
  }, [id])

  useEffect(() => {
    load()
    supabase.from('expense_categories').select('*').order('name').then(({ data }) => setCats(data || []))
  }, [load])

  // курс для фрахту: збережений, або НБУ на дату вивантаження
  useEffect(() => {
    if (!t) return
    if (t.currency === 'UAH') { setRate(1); return }
    if (t.nbu_rate) { setRate(t.nbu_rate); return }
    if (t.unloading_date) {
      nbuRate(t.currency, t.unloading_date).then(r => {
        setRate(r)
        if (r) supabase.from('trips').update({ nbu_rate: r }).eq('id', id)
      })
    }
  }, [t, id])

  if (!t) return null

  const setStatus = async (status) => { await supabase.from('trips').update({ status }).eq('id', id); load() }
  const toggleEvent = async (ev) => {
    await supabase.from('trip_events').update({ done: !ev.done, done_at: !ev.done ? new Date().toISOString() : null }).eq('id', ev.id); load()
  }
  // нормалізація координат до 5 знаків після коми (вимога RMPD/SENT)
  const fmtCoords = (v) => {
    if (!v) return v
    const m = String(v).replace(/,(\d)/g, '.$1').match(/(-?\d+\.?\d*)[\s,;]+(-?\d+\.?\d*)/)
    if (!m) return v
    return `${Number(m[1]).toFixed(5)}, ${Number(m[2]).toFixed(5)}`
  }

  const DateInput = ({ field }) => (
    <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
      <input type="date" value={ef[field] || ''} onChange={setE(field)} style={{ flex: 1 }} />
      {ef[field] && <button className="small secondary" style={{ padding: '4px 8px' }} onClick={() => setEf({ ...ef, [field]: '' })}>✕</button>}
    </div>
  )

  const saveEdit = async () => {
    const upd = { ...ef }
    delete upd.customer; delete upd.carrier; delete upd.vehicle; delete upd.driver
    for (const k of ['route_from_coords', 'route_to_coords', 'customs_out_coords', 'border_coords', 'customs_in_coords'])
      upd[k] = fmtCoords(upd[k])
    for (const k in upd) if (upd[k] === '') upd[k] = null
    // якщо змінилась дата вивантаження — оновлюємо курс НБУ
    if (upd.unloading_date && t.currency !== 'UAH' && upd.unloading_date !== t.unloading_date) {
      upd.nbu_rate = await nbuRate(t.currency, upd.unloading_date)
    }
    const { error } = await supabase.from('trips').update(upd).eq('id', id)
    if (error) { alert(error.message); return }
    setEdit(false); load()
  }
  const addExpense = async () => {
    if (!exf.category_id || !exf.amount) return
    const r = exf.currency === 'UAH' ? 1 : await nbuRate(exf.currency, exf.expense_date)
    const rec = { ...exf, trip_id: id, vehicle_id: t.vehicle_id, rate: r, amount_uah: r ? Number(exf.amount) * r : null }
    rec.liters = exf.liters || null
    const { error } = exEditId
      ? await supabase.from('expenses').update(rec).eq('id', exEditId)
      : await supabase.from('expenses').insert(rec)
    if (error) { alert(error.message); return }
    if (r == null) alert('Курс НБУ не підтягнувся — суму в грн можна буде поправити пізніше')
    setExEditId(null)
    setExf({ category_id: '', amount: '', currency: 'UAH', payment_form: 'bank', expense_date: today(), note: '', liters: '' }); load()
  }
  const editExpense = (e) => {
    setExf({ category_id: e.category_id || '', amount: e.amount, currency: e.currency || 'UAH',
      payment_form: e.payment_form || 'bank', expense_date: e.expense_date, note: e.note || '', liters: e.liters || '' })
    setExEditId(e.id)
  }
  const removeExpense = async (e) => {
    if (!confirm(`Видалити витрату ${e.amount} ${e.currency}${e.note ? ` (${e.note})` : ''}?`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (error) { alert(error.message); return }
    load()
  }
  const addIncome = async () => {
    if (!inf.amount) return
    const r = inf.currency === 'UAH' ? 1 : await nbuRate(inf.currency, inf.income_date)
    const rec = { ...inf, trip_id: id, counterparty_id: t.customer_id, rate: r, amount_uah: r ? Number(inf.amount) * r : null }
    const { error } = await supabase.from('incomes').insert(rec)
    if (error) { alert(error.message); return }
    setInf({ amount: '', currency: 'UAH', payment_form: 'bank', income_date: today(), note: '' })
    if (!t.payment_received_date) await supabase.from('trips').update({ payment_received_date: inf.income_date }).eq('id', id)
    load()
  }
  const markPrro = async (i) => { await supabase.from('incomes').update({ prro_done: true, in_tax_base: true }).eq('id', i.id); load() }
  const removeIncome = async (i) => {
    if (!confirm(`Видалити надходження ${i.amount} ${i.currency}?`)) return
    const { error } = await supabase.from('incomes').delete().eq('id', i.id)
    if (error) { alert(error.message); return }
    load()
  }
  const uploadDoc = async () => {
    if (!df.file) return
    const path = `${id}/${Date.now()}_${df.file.name}`
    const { error: upErr } = await supabase.storage.from('docs').upload(path, df.file)
    if (upErr) { alert(upErr.message); return }
    const { error } = await supabase.from('documents').insert({ trip_id: id, doc_type: df.doc_type, title: df.title || df.file.name, file_url: path })
    if (error) { alert(error.message); return }
    setDf({ doc_type: 'application', title: '', file: null }); load()
  }
  const openDoc = async (d) => {
    const { data } = await supabase.storage.from('docs').createSignedUrl(d.file_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  const signDoc = async (d) => {
    setSigning(true)
    try {
      const dl = async (p) => {
        const { data } = await supabase.storage.from('docs').download(p)
        return data ? new Uint8Array(await data.arrayBuffer()) : null
      }
      const pdf = await dl(d.file_url)
      if (!pdf) { alert('Не вдалося завантажити PDF'); return }
      const stamp = await dl('company/assets/stamp')
      const sign = await dl('company/assets/sign')
      if (!stamp && !sign) { alert('Спочатку завантажте печатку і підпис на сторінці «Документи»'); return }
      const out = await stampPdf(pdf, stamp, sign, signPos)
      const path = `${id}/signed_${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('docs').upload(path, new Blob([out], { type: 'application/pdf' }))
      if (upErr) { alert(upErr.message); return }
      const { error } = await supabase.from('documents').insert({
        trip_id: id, doc_type: d.doc_type, title: (d.title || 'Документ') + ' (підписано)', file_url: path, signed: true,
      })
      if (error) { alert(error.message); return }
      load()
    } catch (e) { alert('Помилка обробки PDF: ' + e.message) } finally { setSigning(false) }
  }

  // Гроші в грн
  const spentUah = expenses.reduce((s, e) => s + Number(e.amount_uah ?? (e.currency === 'UAH' || !e.currency ? e.amount : 0)), 0)
  const revenueOrig = t.mode === 'expedition' ? Number(t.commission_amount || 0) : Number(t.freight_amount || 0)
  const revenueUah = t.currency === 'UAH' ? revenueOrig : (rate ? revenueOrig * rate : null)
  const profitUah = revenueUah != null ? revenueUah - spentUah : null
  const km = (t.odometer_start && t.odometer_end) ? t.odometer_end - t.odometer_start : (Number(t.km_ua || 0) + Number(t.km_abroad || 0)) || null
  const costPerKm = km && spentUah ? (spentUah / km).toFixed(2) : null

  // Пальне
  const fuelLiters = expenses.reduce((s, e) => s + Number(e.liters || 0), 0)
  const fuelUah = expenses.filter(e => e.liters).reduce((s, e) => s + Number(e.amount_uah ?? (e.currency === 'UAH' || !e.currency ? e.amount : 0)), 0)
  const fuelFact = km && fuelLiters ? fuelLiters / km * 100 : null
  const fuelNorm = t.vehicle?.fuel_norm ? Number(t.vehicle.fuel_norm) : null
  const fuelDiffL = fuelFact != null && fuelNorm ? (fuelFact - fuelNorm) * km / 100 : null
  const fuelPrice = fuelLiters && fuelUah ? fuelUah / fuelLiters : null


  // Тахо: орієнтовно 65 км/год, до 9 год кермування на добу
  const driveH = km ? km / 65 : null
  const driveDays = driveH ? Math.ceil(driveH / 9) : null

  const genDoc = async (kind) => {
    try {
      const { data: comp } = await supabase.from('company_profile').select('*').eq('id', 1).maybeSingle()
      if (!comp?.name || !comp?.edrpou) { alert('Спочатку заповніть реквізити компанії на сторінці «Документи»'); return }
      if (!t.freight_amount) { alert('Вкажіть суму фрахту в рейсі'); return }
      if (!t.customer) { alert('Вкажіть замовника рейсу'); return }
      const date = today()
      const number = `${t.number || date.replaceAll('-', '')}${kind === 'act' ? '-А' : ''}`
      let bytes = await makeDocPdf(kind, { company: comp, customer: t.customer, trip: t, number, date })
      // печатка і підпис, якщо завантажені
      const dl = async (p) => {
        const { data } = await supabase.storage.from('docs').download(p)
        return data ? new Uint8Array(await data.arrayBuffer()) : null
      }
      const stamp = await dl('company/assets/stamp')
      const sign = await dl('company/assets/sign')
      if (stamp || sign) bytes = await stampPdf(bytes, stamp, sign, kind === 'act' ? 'left' : 'right')
      const path = `${id}/${kind}_${Date.now()}.pdf`
      const { error: upErr } = await supabase.storage.from('docs').upload(path, new Blob([bytes], { type: 'application/pdf' }))
      if (upErr) { alert(upErr.message); return }
      await supabase.from('documents').insert({
        trip_id: id, doc_type: kind === 'act' ? 'act' : 'invoice',
        title: `${kind === 'act' ? 'Акт' : 'Рахунок'} № ${number} від ${date}`,
        file_url: path, signed: !!(stamp || sign),
      })
      const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
      window.open(url, '_blank')
      load()
    } catch (e) { alert('Помилка формування: ' + e.message) }
  }

  const suggestPay = async () => {
    const d = t.driver
    if (!d) return
    let base = '', amount = ''
    if (pf.scheme === 'percent_freight') { base = revenueUah ?? ''; amount = base && d.pay_percent ? (base * d.pay_percent / 100).toFixed(2) : '' }
    if (pf.scheme === 'per_km') { base = km || ''; amount = ((t.km_ua || 0) * (d.rate_km_ua || 0) + (t.km_abroad || 0) * (d.rate_km_abroad || 0)).toFixed(2) }
    if (pf.scheme === 'per_trip') {
      amount = d.rate_per_trip || ''
      if (amount && d.rate_per_trip_currency && d.rate_per_trip_currency !== 'UAH') {
        const rr = await nbuRate(d.rate_per_trip_currency, t.unloading_date || today())
        base = `${amount} ${d.rate_per_trip_currency}`
        amount = rr ? (amount * rr).toFixed(2) : amount
      }
    }
    if (pf.scheme === 'mixed') {
      let fix = Number(d.rate_per_trip || 0)
      if (fix && d.rate_per_trip_currency && d.rate_per_trip_currency !== 'UAH') {
        const rr = await nbuRate(d.rate_per_trip_currency, t.unloading_date || today())
        fix = rr ? fix * rr : fix
      }
      base = revenueUah ?? ''
      amount = (fix + (base && d.pay_percent ? base * d.pay_percent / 100 : 0)).toFixed(2)
    }
    if (pf.scheme === 'percent_profit') {
      base = profitUah != null ? profitUah.toFixed(2) : ''
      amount = base && d.pay_percent ? (base * d.pay_percent / 100).toFixed(2) : ''
    }
    setPf({ ...pf, base_amount: base, amount })
  }
  const addPayroll = async () => {
    if (!pf.amount || !t.driver_id) return
    const { error } = await supabase.from('driver_payroll').insert({
      trip_id: id, driver_id: t.driver_id, scheme: pf.scheme,
      base_amount: pf.base_amount || null, amount: pf.amount,
      taxes_included: t.driver?.taxes_included ?? true,
    })
    if (error) { alert(error.message); return }
    setPf({ scheme: 'percent_freight', base_amount: '', amount: '' }); load()
  }
  const markPaid = async (p) => { await supabase.from('driver_payroll').update({ paid: true, paid_date: today() }).eq('id', p.id); load() }

  const pt = (place, coords) => (coords || place || '').trim()
  const routePoints = t ? [
    ['Завантаження', t.route_from, t.route_from_coords],
    ['Замитнення', t.customs_out_point, t.customs_out_coords],
    ['Пункт пропуску', t.border_point, t.border_coords],
    ['Розмитнення', t.customs_in_point, t.customs_in_coords],
    ['Вивантаження', t.route_to, t.route_to_coords],
  ].filter(([, place, coords]) => place || coords) : []
  const mapsUrl = routePoints.length >= 2
    ? `https://www.google.com/maps/dir/?api=1&origin=${encodeURIComponent(pt(routePoints[0][1], routePoints[0][2]))}&destination=${encodeURIComponent(pt(routePoints.at(-1)[1], routePoints.at(-1)[2]))}${routePoints.length > 2 ? `&waypoints=${encodeURIComponent(routePoints.slice(1, -1).map(([, p, c]) => pt(p, c)).join('|'))}` : ''}`
    : null

  const driverMessage = () => [
    `Рейс ${t.number || ''} ${t.route_from || ''} → ${t.route_to || ''}`.trim(),
    t.loading_date ? `Завантаження: ${t.loading_date}` : null,
    t.customs_info ? `Замитнення/розмитнення: ${t.customs_info}` : null,
    ...routePoints.map(([label, place, coords]) => `${label}: ${[place, coords].filter(Boolean).join(' — ')}`),
    t.rmpd_number ? `Зголошення RMPD/SENT: ${t.rmpd_number}` : null,
    t.expeditor_contact ? `Експедитор: ${t.expeditor_contact}` : null,
    t.route_plan ? `Маршрут: ${t.route_plan}` : null,
    driveDays ? `Орієнтовно ${Math.round(driveH)} год кермування, ~${driveDays} діб по тахо` : null,
    mapsUrl ? `\n🗺 Маршрут на карті:\n${mapsUrl}` : null,
  ].filter(Boolean).join('\n')

  const sendToDriver = async () => {
    const text = driverMessage()
    if (t.driver?.telegram_chat_id) {
      const { data, error } = await supabase.functions.invoke('tg-bot', { body: { action: 'send', trip_id: id, text } })
      if (!error && data?.ok) { alert('Надіслано водію в Telegram'); return }
    }
    try { await navigator.clipboard.writeText(text) } catch {}
    window.open(`https://t.me/share/url?url=%20&text=${encodeURIComponent(text)}`, '_blank')
  }

  const setE = (k) => (e) => setEf({ ...ef, [k]: e.target.value })

  return (
    <div>
      <div className="spread">
        <h1>{t.number || `${t.route_from || '?'} → ${t.route_to || '?'}`} <span className="muted" style={{ fontSize: 14 }}>{t.mode === 'expedition' ? 'експедиція' : 'перевізник'}</span></h1>
        <div className="row">
          <select value={t.status} onChange={e => setStatus(e.target.value)} style={{ width: 'auto' }}>
            {TRIP_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="secondary" onClick={() => setEdit(!edit)}>{edit ? 'Скасувати' : 'Редагувати'}</button>
        </div>
      </div>

      <div className="cards">
        <div className="stat"><div className="num">{fmt(revenueOrig)} {t.currency}</div>
          <div className="lbl">Дохід {t.currency !== 'UAH' && revenueUah != null ? `≈ ${fmt(revenueUah)} грн (курс ${rate})` : ''}</div></div>
        <div className="stat"><div className="num">{fmt(spentUah)}</div><div className="lbl">Витрати, грн</div></div>
        <div className="stat"><div className="num" style={{ color: (profitUah ?? 0) >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(profitUah)}</div>
          <div className="lbl">Чистий прибуток, грн</div></div>
        {costPerKm && <div className="stat"><div className="num">{costPerKm}</div><div className="lbl">Собівартість грн/км</div></div>}
      </div>
      {t.currency !== 'UAH' && !t.unloading_date && <p className="muted">Курс НБУ підтягнеться після вказання дати розвантаження (в «Редагувати»).</p>}

      {edit && (
        <div className="panel">
          <div className="grid g4">
            <div><label>Номер</label><input value={ef.number || ''} onChange={setE('number')} /></div>
            <div><label>Звідки</label><input value={ef.route_from || ''} onChange={setE('route_from')} /></div>
            <div><label>Куди</label><input value={ef.route_to || ''} onChange={setE('route_to')} /></div>
            <div><label>Фрахт</label><input type="number" value={ef.freight_amount || ''} onChange={setE('freight_amount')} /></div>
            {t.mode === 'expedition' && <>
              <div><label>Комісія</label><input type="number" value={ef.commission_amount || ''} onChange={setE('commission_amount')} /></div>
              <div><label>Оплата перевізнику</label><input type="number" value={ef.carrier_payment || ''} onChange={setE('carrier_payment')} /></div>
            </>}
            <div><label>Спідометр виїзд</label><input type="number" value={ef.odometer_start || ''} onChange={setE('odometer_start')} /></div>
            <div><label>Спідометр в'їзд</label><input type="number" value={ef.odometer_end || ''} onChange={setE('odometer_end')} /></div>
            <div><label>Км по Україні</label><input type="number" value={ef.km_ua || ''} onChange={setE('km_ua')} /></div>
            <div><label>Км за кордоном</label><input type="number" value={ef.km_abroad || ''} onChange={setE('km_abroad')} /></div>
            <div><label>Дата завантаження</label><DateInput field="loading_date" /></div>
            <div><label>Дата розвантаження</label><DateInput field="unloading_date" /></div>
            <div><label>ТТН відправлено</label><DateInput field="ttn_sent_date" /></div>
            <div><label>Термін отримання ТТН</label><DateInput field="ttn_due_date" /></div>
            <div><label>Термін оплати</label><DateInput field="payment_due_date" /></div>
            <div><label>Оплата фрахту</label><select value={ef.freight_pay_form || ''} onChange={setE('freight_pay_form')}>
              <option value="">—</option><option value="bank">безготівка</option><option value="cash">готівка</option><option value="card">картка</option>
            </select></div>
            <div><label>Оплату отримано</label><DateInput field="payment_received_date" /></div>
            <div><label>Замитнення/розмитнення</label><input value={ef.customs_info || ''} onChange={setE('customs_info')} placeholder="місце, брокер" /></div>
            <div><label>Координати завантаження</label><input value={ef.route_from_coords || ''} onChange={setE('route_from_coords')} placeholder="50.4501, 30.5234" /></div>
            <div><label>Координати вивантаження</label><input value={ef.route_to_coords || ''} onChange={setE('route_to_coords')} placeholder="52.2297, 21.0122" /></div>
            <div><label>Замитнення (місце)</label><input value={ef.customs_out_point || ''} onChange={setE('customs_out_point')} /></div>
            <div><label>Замитнення (координати)</label><input value={ef.customs_out_coords || ''} onChange={setE('customs_out_coords')} placeholder="50.45, 30.52" /></div>
            <div><label>Пункт пропуску</label><input value={ef.border_point || ''} onChange={setE('border_point')} placeholder="Ягодин — Dorohusk" /></div>
            <div><label>Пункт пропуску (координати)</label><input value={ef.border_coords || ''} onChange={setE('border_coords')} placeholder="51.19, 23.85" /></div>
            <div><label>Розмитнення (місце)</label><input value={ef.customs_in_point || ''} onChange={setE('customs_in_point')} /></div>
            <div><label>Розмитнення (координати)</label><input value={ef.customs_in_coords || ''} onChange={setE('customs_in_coords')} placeholder="52.22, 21.01" /></div>
            <div><label>Номер зголошення RMPD/SENT</label><input value={ef.rmpd_number || ''} onChange={setE('rmpd_number')} /></div>
            <div><label>Контакт експедитора</label><input value={ef.expeditor_contact || ''} onChange={setE('expeditor_contact')} /></div>
            <div style={{ gridColumn: '1 / -1' }}><label>Маршрут для водія</label>
              <textarea rows={2} value={ef.route_plan || ''} onChange={setE('route_plan')} placeholder="Київ — Ягодин — Варшава — ..." /></div>
          </div>
          <div style={{ marginTop: 12 }}><button onClick={saveEdit}>Зберегти</button></div>
        </div>
      )}

      <div className="panel">
        <div className="spread">
          <div className="row muted" style={{ gap: 18 }}>
            <span>Замовник: <b>{t.customer?.name || '—'}</b></span>
            {t.mode === 'expedition' && <span>Перевізник: <b>{t.carrier?.name || '—'}</b></span>}
            {t.mode === 'carrier' && <><span>Машина: <b>{t.vehicle?.name || '—'}</b></span><span>Водій: <b>{t.driver?.full_name || '—'}</b></span></>}
            {km && <span>Пробіг: <b>{km} км</b></span>}
            {driveDays && <span>По тахо: <b>≈ {Math.round(driveH)} год / {driveDays} діб</b></span>}
          </div>
          {t.mode === 'carrier' && <button className="small" onClick={sendToDriver}>Надіслати водію (Telegram)</button>}
          {mapsUrl && <a href={mapsUrl} target="_blank" rel="noreferrer"><button className="small secondary">🗺 Маршрут на карті</button></a>}
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Чек-лист рейсу</h2>
        {events.map(ev => (
          <div className="check" key={ev.id}>
            <input type="checkbox" checked={ev.done} onChange={() => toggleEvent(ev)} />
            <span className={ev.done ? 'done-txt' : ''}>{ev.title}</span>
          </div>
        ))}
      </div>

      {(fuelLiters > 0 || fuelNorm) && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Пальне</h2>
          <div className="stats">
            <div className="stat"><div className="num">{fuelLiters ? fuelLiters.toFixed(0) : '—'}</div><div className="lbl">Заправлено, л</div></div>
            <div className="stat"><div className="num">{km ?? '—'}</div><div className="lbl">Пробіг, км</div></div>
            <div className="stat"><div className="num">{fuelFact != null ? fuelFact.toFixed(1) : '—'}</div><div className="lbl">Факт, л/100 км</div></div>
            <div className="stat"><div className="num">{fuelNorm ?? '—'}</div><div className="lbl">Норма, л/100 км</div></div>
          </div>
          {fuelDiffL != null && <p className={fuelDiffL > 0 ? 'warn-text' : 'muted'} style={{ marginBottom: 0 }}>
            {fuelDiffL > 0 ? 'Перевитрата' : 'Економія'}: {Math.abs(fuelDiffL).toFixed(0)} л{fuelPrice ? ` ≈ ${(Math.abs(fuelDiffL) * fuelPrice).toFixed(0)} грн` : ''}
          </p>}
          {fuelFact != null && !fuelNorm && <p className="muted" style={{ marginBottom: 0 }}>Вкажіть норму машини на сторінці «Машини», щоб бачити відхилення.</p>}
        </div>
      )}
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Витрати рейсу</h2>
        {expenses.length > 0 && (
          <table>
            <thead><tr><th>Дата</th><th>Категорія</th><th>Сума</th><th>Грн (курс)</th><th>Форма</th><th>Примітка</th><th></th></tr></thead>
            <tbody>{expenses.map(e => (
              <tr key={e.id} {...longPress(() => editExpense(e))}>
                <td>{e.expense_date}</td><td>{e.category?.name}</td>
                <td>{fmt(e.amount)} {e.currency}{e.liters ? ` · ${e.liters} л` : ''}</td>
                <td>{e.currency === 'UAH' ? '—' : `${fmt(e.amount_uah)} (${e.rate ?? '?'})`}</td>
                <td>{payFormLabel(e.payment_form)}</td><td>{e.note}</td>
                <td><button className="small secondary" onClick={() => editExpense(e)}>Ред.</button> <button className="small danger-btn" onClick={() => removeExpense(e)}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <div className="grid g4" style={{ marginTop: 10 }}>
          <div><label>Категорія</label>
            <select value={exf.category_id} onChange={e => setExf({ ...exf, category_id: e.target.value })}>
              <option value="">—</option>
              {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></div>
          <div><label>Сума</label><input type="number" value={exf.amount} onChange={e => setExf({ ...exf, amount: e.target.value })} /></div>
          <div><label>Літри (пальне)</label><input type="number" value={exf.liters} onChange={e => setExf({ ...exf, liters: e.target.value })} /></div>
          <div><label>Валюта</label>
            <select value={exf.currency} onChange={e => setExf({ ...exf, currency: e.target.value })}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div><label>Дата</label><input type="date" value={exf.expense_date} onChange={e => setExf({ ...exf, expense_date: e.target.value })} /></div>
          <div><label>Форма оплати</label>
            <select value={exf.payment_form} onChange={e => setExf({ ...exf, payment_form: e.target.value })}>
              {PAY_FORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label>Примітка</label><input value={exf.note} onChange={e => setExf({ ...exf, note: e.target.value })} /></div>
        </div>
        <div style={{ marginTop: 10 }} className="row"><button className="small" onClick={addExpense}>{exEditId ? 'Зберегти зміни' : 'Додати витрату'}</button>{exEditId && <button className="small secondary" onClick={() => { setExEditId(null); setExf({ category_id: '', amount: '', currency: 'UAH', payment_form: 'bank', expense_date: today(), note: '', liters: '' }) }}>Скасувати</button>}</div>
        <p className="muted">Валютні витрати конвертуються в грн за курсом НБУ на дату витрати автоматично. Пальне рефа — окрема категорія «Пальне (реф)».</p>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Надходження</h2>
        {incomes.length > 0 && (
          <table>
            <thead><tr><th>Дата</th><th>Сума</th><th>Грн</th><th>Форма</th><th>ПРРО</th><th></th></tr></thead>
            <tbody>{incomes.map(i => (
              <tr key={i.id}>
                <td>{i.income_date}</td><td>{fmt(i.amount)} {i.currency}</td>
                <td>{i.currency === 'UAH' ? '—' : fmt(i.amount_uah)}</td>
                <td>{payFormLabel(i.payment_form)}</td>
                <td>{i.prro_required ? (i.prro_done ? <span className="badge ok">проведено</span> : <span className="badge warn">провести!</span>) : '—'}</td>
                <td>{i.prro_required && !i.prro_done && <button className="small" onClick={() => markPrro(i)}>Проведено через ПРРО</button>} <button className="small danger-btn" onClick={() => removeIncome(i)}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <div className="grid g4" style={{ marginTop: 10 }}>
          <div><label>Сума</label><input type="number" value={inf.amount} onChange={e => setInf({ ...inf, amount: e.target.value })} /></div>
          <div><label>Валюта</label>
            <select value={inf.currency} onChange={e => setInf({ ...inf, currency: e.target.value })}>
              {CURRENCIES.map(c => <option key={c}>{c}</option>)}
            </select></div>
          <div><label>Дата</label><input type="date" value={inf.income_date} onChange={e => setInf({ ...inf, income_date: e.target.value })} /></div>
          <div><label>Форма оплати</label>
            <select value={inf.payment_form} onChange={e => setInf({ ...inf, payment_form: e.target.value })}>
              {PAY_FORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="small" onClick={addIncome}>Додати надходження</button></div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Документи</h2>
        {t.mode === 'carrier' && <div className="row" style={{ marginBottom: 10 }}>
          <button className="small" onClick={() => genDoc('invoice')}>Сформувати рахунок</button>
          <button className="small" onClick={() => genDoc('act')}>Сформувати акт</button>
        </div>}
        {docs.length > 0 && (<>
          <table><tbody>{docs.map(d => (
            <tr key={d.id}>
              <td>{docTypeLabel(d.doc_type)}</td>
              <td><a onClick={() => openDoc(d)} style={{ cursor: 'pointer' }}>{d.title}</a></td>
              <td>{d.signed ? <span className="badge ok">підписано</span> :
                <button className="small secondary" disabled={signing} onClick={() => signDoc(d)}>{signing ? '...' : 'Печатка+підпис'}</button>}</td>
            </tr>
          ))}</tbody></table>
          <div className="row" style={{ marginTop: 8 }}>
            <span className="muted">Розміщення:</span>
            <select value={signPos} onChange={e => setSignPos(e.target.value)} style={{ width: 'auto' }}>
              <option value="right">Праворуч знизу</option>
              <option value="center">По центру знизу</option>
              <option value="left">Ліворуч знизу</option>
            </select>
          </div>
        </>)}
        <div className="grid g3" style={{ marginTop: 10 }}>
          <div><label>Тип</label>
            <select value={df.doc_type} onChange={e => setDf({ ...df, doc_type: e.target.value })}>
              {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label>Назва</label><input value={df.title} onChange={e => setDf({ ...df, title: e.target.value })} /></div>
          <div><label>Файл (PDF)</label><input type="file" onChange={e => setDf({ ...df, file: e.target.files[0] })} /></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="small" onClick={uploadDoc}>Завантажити</button></div>
        <p className="muted">Статутні документи (виписка, ліцензія, техпаспорти, права) — на сторінці «Документи».</p>
      </div>

      {t.mode === 'carrier' && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>ЗП водія</h2>
          {payroll.length > 0 && (
            <table>
              <thead><tr><th>Схема</th><th>База, грн</th><th>Нараховано</th><th>Податки</th><th>Статус</th><th></th></tr></thead>
              <tbody>{payroll.map(p => (
                <tr key={p.id}>
                  <td>{schemeLabel(p.scheme)}</td><td>{fmt(p.base_amount)}</td><td>{fmt(p.amount)}</td>
                  <td>{p.taxes_included ? 'включено' : 'окремо'}</td>
                  <td>{p.paid ? <span className="badge ok">виплачено {p.paid_date}</span> : <span className="badge warn">не виплачено</span>}</td>
                  <td>{!p.paid && <button className="small" onClick={() => markPaid(p)}>Виплачено</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          )}
          {t.driver ? (<>
            <div className="grid g4" style={{ marginTop: 10 }}>
              <div><label>Схема</label>
                <select value={pf.scheme} onChange={e => setPf({ ...pf, scheme: e.target.value })}>
                  {PAY_SCHEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              <div><label>База, грн</label><input type="number" value={pf.base_amount} onChange={e => setPf({ ...pf, base_amount: e.target.value })} /></div>
              <div><label>Сума</label><input type="number" value={pf.amount} onChange={e => setPf({ ...pf, amount: e.target.value })} /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <button className="small secondary" onClick={suggestPay}>Розрахувати</button>
                <button className="small" onClick={addPayroll}>Нарахувати</button>
              </div>
            </div>
            <p className="muted">% від чистого прибутку = (фрахт у грн за курсом НБУ на дату розвантаження − всі витрати рейсу в грн) × відсоток водія. Витрати, що мають зменшувати базу (податки тощо), додавайте у витрати рейсу.</p>
          </>) : <p className="muted">Призначте водія рейсу, щоб нарахувати ЗП.</p>}
        </div>
      )}

      <p><Link to="/trips">← До списку рейсів</Link></p>
    </div>
  )
}
