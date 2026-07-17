import { useEffect, useState, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { TRIP_STATUSES, statusLabel, PAY_FORMS, payFormLabel, DOC_TYPES, docTypeLabel, schemeLabel, PAY_SCHEMES } from '../dicts'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA'))
const today = () => new Date().toISOString().slice(0, 10)

export default function TripCard() {
  const { id } = useParams()
  const [t, setT] = useState(null)
  const [events, setEvents] = useState([])
  const [expenses, setExpenses] = useState([])
  const [incomes, setIncomes] = useState([])
  const [docs, setDocs] = useState([])
  const [payroll, setPayroll] = useState([])
  const [cats, setCats] = useState([])
  const [edit, setEdit] = useState(false)
  const [ef, setEf] = useState({})
  const [exf, setExf] = useState({ category_id: '', amount: '', payment_form: 'bank', expense_date: today(), note: '' })
  const [inf, setInf] = useState({ amount: '', payment_form: 'bank', income_date: today(), note: '' })
  const [df, setDf] = useState({ doc_type: 'application', title: '', file: null })
  const [pf, setPf] = useState({ scheme: 'percent_freight', base_amount: '', amount: '' })

  const load = useCallback(async () => {
    const { data } = await supabase.from('trips')
      .select('*, customer:customer_id(name), carrier:carrier_id(name), vehicle:vehicle_id(name), driver:driver_id(id, full_name, pay_scheme, pay_percent, rate_km_ua, rate_km_abroad, rate_per_trip, taxes_included)')
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

  if (!t) return null

  const setStatus = async (status) => {
    await supabase.from('trips').update({ status }).eq('id', id); load()
  }
  const toggleEvent = async (ev) => {
    await supabase.from('trip_events').update({ done: !ev.done, done_at: !ev.done ? new Date().toISOString() : null }).eq('id', ev.id); load()
  }
  const saveEdit = async () => {
    const upd = { ...ef }
    delete upd.customer; delete upd.carrier; delete upd.vehicle; delete upd.driver
    for (const k in upd) if (upd[k] === '') upd[k] = null
    const { error } = await supabase.from('trips').update(upd).eq('id', id)
    if (error) { alert(error.message); return }
    setEdit(false); load()
  }
  const addExpense = async () => {
    if (!exf.category_id || !exf.amount) return
    const { error } = await supabase.from('expenses').insert({ ...exf, trip_id: id, vehicle_id: t.vehicle_id, currency: t.currency })
    if (error) { alert(error.message); return }
    setExf({ category_id: '', amount: '', payment_form: 'bank', expense_date: today(), note: '' }); load()
  }
  const addIncome = async () => {
    if (!inf.amount) return
    const { error } = await supabase.from('incomes').insert({ ...inf, trip_id: id, counterparty_id: t.customer_id, currency: t.currency })
    if (error) { alert(error.message); return }
    setInf({ amount: '', payment_form: 'bank', income_date: today(), note: '' })
    if (!t.payment_received_date) await supabase.from('trips').update({ payment_received_date: inf.income_date }).eq('id', id)
    load()
  }
  const markPrro = async (i) => {
    await supabase.from('incomes').update({ prro_done: true, in_tax_base: true }).eq('id', i.id); load()
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
  const suggestPay = () => {
    const d = t.driver
    if (!d) return
    let base = '', amount = ''
    if (pf.scheme === 'percent_freight') { base = t.freight_amount || ''; amount = base && d.pay_percent ? (base * d.pay_percent / 100).toFixed(2) : '' }
    if (pf.scheme === 'per_km') { base = (Number(t.km_ua || 0) + Number(t.km_abroad || 0)) || ''; amount = ((t.km_ua || 0) * (d.rate_km_ua || 0) + (t.km_abroad || 0) * (d.rate_km_abroad || 0)).toFixed(2) }
    if (pf.scheme === 'per_trip') { amount = d.rate_per_trip || '' }
    if (pf.scheme === 'percent_profit') {
      const spent = expenses.reduce((s, e) => s + Number(e.amount), 0)
      base = ((t.freight_amount || 0) - spent).toFixed(2)
      amount = d.pay_percent ? (base * d.pay_percent / 100).toFixed(2) : ''
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
  const markPaid = async (p) => {
    await supabase.from('driver_payroll').update({ paid: true, paid_date: today() }).eq('id', p.id); load()
  }

  const spent = expenses.reduce((s, e) => s + Number(e.amount), 0)
  const received = incomes.reduce((s, i) => s + Number(i.amount), 0)
  const revenue = t.mode === 'expedition' ? Number(t.commission_amount || 0) : Number(t.freight_amount || 0)
  const profit = t.mode === 'expedition'
    ? Number(t.commission_amount || 0) - spent
    : revenue - spent
  const km = (t.odometer_start && t.odometer_end) ? t.odometer_end - t.odometer_start : (Number(t.km_ua || 0) + Number(t.km_abroad || 0)) || null
  const costPerKm = km && spent ? (spent / km).toFixed(2) : null

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
        <div className="stat"><div className="num">{fmt(revenue)}</div><div className="lbl">Дохід ({t.currency})</div></div>
        <div className="stat"><div className="num">{fmt(spent)}</div><div className="lbl">Витрати</div></div>
        <div className="stat"><div className="num" style={{ color: profit >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(profit)}</div><div className="lbl">Прибуток</div></div>
        {costPerKm && <div className="stat"><div className="num">{costPerKm}</div><div className="lbl">Собівартість / км</div></div>}
      </div>

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
            <div><label>Дата завантаження</label><input type="date" value={ef.loading_date || ''} onChange={setE('loading_date')} /></div>
            <div><label>Дата розвантаження</label><input type="date" value={ef.unloading_date || ''} onChange={setE('unloading_date')} /></div>
            <div><label>ТТН відправлено</label><input type="date" value={ef.ttn_sent_date || ''} onChange={setE('ttn_sent_date')} /></div>
            <div><label>Термін отримання ТТН</label><input type="date" value={ef.ttn_due_date || ''} onChange={setE('ttn_due_date')} /></div>
            <div><label>Термін оплати</label><input type="date" value={ef.payment_due_date || ''} onChange={setE('payment_due_date')} /></div>
            <div><label>Оплату отримано</label><input type="date" value={ef.payment_received_date || ''} onChange={setE('payment_received_date')} /></div>
          </div>
          <div style={{ marginTop: 12 }}><button onClick={saveEdit}>Зберегти</button></div>
        </div>
      )}

      <div className="panel">
        <div className="row muted" style={{ gap: 18 }}>
          <span>Замовник: <b>{t.customer?.name || '—'}</b></span>
          {t.mode === 'expedition' && <span>Перевізник: <b>{t.carrier?.name || '—'}</b></span>}
          {t.mode === 'carrier' && <><span>Машина: <b>{t.vehicle?.name || '—'}</b></span><span>Водій: <b>{t.driver?.full_name || '—'}</b></span></>}
          {t.payment_due_date && <span>Оплата до: <b>{t.payment_due_date}</b></span>}
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

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Витрати рейсу</h2>
        {expenses.length > 0 && (
          <table>
            <thead><tr><th>Дата</th><th>Категорія</th><th>Сума</th><th>Форма</th><th>Примітка</th></tr></thead>
            <tbody>{expenses.map(e => (
              <tr key={e.id}><td>{e.expense_date}</td><td>{e.category?.name}</td><td>{fmt(e.amount)}</td><td>{payFormLabel(e.payment_form)}</td><td>{e.note}</td></tr>
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
          <div><label>Дата</label><input type="date" value={exf.expense_date} onChange={e => setExf({ ...exf, expense_date: e.target.value })} /></div>
          <div><label>Форма оплати</label>
            <select value={exf.payment_form} onChange={e => setExf({ ...exf, payment_form: e.target.value })}>
              {PAY_FORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="small" onClick={addExpense}>Додати витрату</button></div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Надходження</h2>
        {incomes.length > 0 && (
          <table>
            <thead><tr><th>Дата</th><th>Сума</th><th>Форма</th><th>ПРРО</th><th></th></tr></thead>
            <tbody>{incomes.map(i => (
              <tr key={i.id}>
                <td>{i.income_date}</td><td>{fmt(i.amount)} {i.currency}</td><td>{payFormLabel(i.payment_form)}</td>
                <td>{i.prro_required ? (i.prro_done ? <span className="badge ok">проведено</span> : <span className="badge warn">провести!</span>) : '—'}</td>
                <td>{i.prro_required && !i.prro_done && <button className="small" onClick={() => markPrro(i)}>Проведено через ПРРО</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <div className="grid g3" style={{ marginTop: 10 }}>
          <div><label>Сума</label><input type="number" value={inf.amount} onChange={e => setInf({ ...inf, amount: e.target.value })} /></div>
          <div><label>Дата</label><input type="date" value={inf.income_date} onChange={e => setInf({ ...inf, income_date: e.target.value })} /></div>
          <div><label>Форма оплати</label>
            <select value={inf.payment_form} onChange={e => setInf({ ...inf, payment_form: e.target.value })}>
              {PAY_FORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="small" onClick={addIncome}>Додати надходження</button></div>
        {received > 0 && <p className="muted">Отримано: {fmt(received)} {t.currency}</p>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Документи</h2>
        {docs.length > 0 && (
          <table><tbody>{docs.map(d => (
            <tr key={d.id}>
              <td>{docTypeLabel(d.doc_type)}</td>
              <td><a onClick={() => openDoc(d)} style={{ cursor: 'pointer' }}>{d.title}</a></td>
              <td>{d.signed ? <span className="badge ok">підписано</span> : ''}</td>
            </tr>
          ))}</tbody></table>
        )}
        <div className="grid g3" style={{ marginTop: 10 }}>
          <div><label>Тип</label>
            <select value={df.doc_type} onChange={e => setDf({ ...df, doc_type: e.target.value })}>
              {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label>Назва</label><input value={df.title} onChange={e => setDf({ ...df, title: e.target.value })} /></div>
          <div><label>Файл (PDF)</label><input type="file" onChange={e => setDf({ ...df, file: e.target.files[0] })} /></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="small" onClick={uploadDoc}>Завантажити</button></div>
      </div>

      {t.mode === 'carrier' && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>ЗП водія</h2>
          {payroll.length > 0 && (
            <table>
              <thead><tr><th>Схема</th><th>База</th><th>Нараховано</th><th>Податки</th><th>Статус</th><th></th></tr></thead>
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
          {t.driver ? (
            <div className="grid g4" style={{ marginTop: 10 }}>
              <div><label>Схема</label>
                <select value={pf.scheme} onChange={e => setPf({ ...pf, scheme: e.target.value })}>
                  {PAY_SCHEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select></div>
              <div><label>База</label><input type="number" value={pf.base_amount} onChange={e => setPf({ ...pf, base_amount: e.target.value })} /></div>
              <div><label>Сума</label><input type="number" value={pf.amount} onChange={e => setPf({ ...pf, amount: e.target.value })} /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <button className="small secondary" onClick={suggestPay}>Розрахувати</button>
                <button className="small" onClick={addPayroll}>Нарахувати</button>
              </div>
            </div>
          ) : <p className="muted">Призначте водія рейсу, щоб нарахувати ЗП.</p>}
        </div>
      )}

      <p><Link to="/trips">← До списку рейсів</Link></p>
    </div>
  )
}
