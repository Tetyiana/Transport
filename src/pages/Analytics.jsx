import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA', { maximumFractionDigits: 0 }))
const year = new Date().getFullYear()

// сума витрати в грн (fallback для старих записів)
const expUah = (e) => Number(e.amount_uah ?? (e.currency === 'UAH' || !e.currency ? e.amount : 0))
// дохід рейсу в грн
const tripRevUah = (t) => {
  const orig = t.mode === 'expedition' ? Number(t.commission_amount || 0) : Number(t.freight_amount || 0)
  if (t.currency === 'UAH') return orig
  return t.nbu_rate ? orig * Number(t.nbu_rate) : null
}

export default function Analytics() {
  const [from, setFrom] = useState(`${year}-01-01`)
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10))
  const [trips, setTrips] = useState([])
  const [tick, setTick] = useState(0)
  const [expenses, setExpenses] = useState([])
  const [incomes, setIncomes] = useState([])
  const [vehicles, setVehicles] = useState([])

  useEffect(() => {
    supabase.from('trips').select('*, customer:customer_id(id, name, type), vehicle:vehicle_id(id, name), carrier:carrier_id(id, name, rating)')
      .gte('created_at', from).lte('created_at', to + 'T23:59:59')
      .then(({ data }) => setTrips(data || []))
    supabase.from('expenses').select('*')
      .gte('expense_date', from).lte('expense_date', to)
      .then(({ data }) => setExpenses(data || []))
    supabase.from('incomes').select('*')
      .gte('income_date', from).lte('income_date', to)
      .then(({ data }) => setIncomes(data || []))
    supabase.from('vehicles').select('id,name').then(({ data }) => setVehicles(data || []))
  }, [from, to, tick])

  const expByTrip = useMemo(() => {
    const m = {}
    for (const e of expenses) if (e.trip_id) m[e.trip_id] = (m[e.trip_id] || 0) + expUah(e)
    return m
  }, [expenses])

  // Рейси з прибутком
  const tripRows = useMemo(() => trips.filter(t => t.status !== 'cancelled').map(t => {
    const rev = tripRevUah(t)
    const spent = expByTrip[t.id] || 0
    const km = (t.odometer_start && t.odometer_end) ? t.odometer_end - t.odometer_start : (Number(t.km_ua || 0) + Number(t.km_abroad || 0)) || null
    return { ...t, rev, spent, profit: rev != null ? rev - spent : null, km, perKm: km && spent ? spent / km : null }
  }), [trips, expByTrip])

  // Рентабельність по машинах: рейсові + прямі витрати машини
  // Експедиція
  const expTrips = useMemo(() => trips.filter(t => t.mode === 'expedition' && t.status !== 'cancelled'), [trips])
  const exp = useMemo(() => {
    const r = (t) => t.currency === 'UAH' ? 1 : (t.nbu_rate || 1)
    const ids = new Set(expTrips.map(t => t.id))
    const paidToUs = incomes.filter(i => ids.has(i.trip_id)).reduce((s, i) => s + Number(i.amount_uah ?? (i.currency === 'UAH' ? i.amount : 0)), 0)
    const freight = expTrips.reduce((s, t) => s + Number(t.freight_amount || 0) * r(t), 0)
    const paidByUs = expTrips.filter(t => t.carrier_paid_date).reduce((s, t) => s + Number(t.carrier_payment || 0) * r(t), 0)
    const creditor = expTrips.filter(t => !t.carrier_paid_date).reduce((s, t) => s + Number(t.carrier_payment || 0) * r(t), 0)
    const gross = expTrips.reduce((s, t) => s + (t.commission_amount ? Number(t.commission_amount) * r(t) : (Number(t.freight_amount || 0) - Number(t.carrier_payment || 0)) * r(t)), 0)
    const otherExp = expenses.filter(e => ids.has(e.trip_id)).reduce((s, e) => s + expUah(e), 0)
    return { paidToUs, debtor: freight - paidToUs, paidByUs, creditor, gross, flow: paidToUs - paidByUs - otherExp }
  }, [expTrips, incomes, expenses])

  const carrierRows = useMemo(() => {
    const m = {}
    for (const t of trips.filter(t => t.mode === 'expedition' && t.carrier)) {
      const k = t.carrier.id
      m[k] = m[k] || { id: k, name: t.carrier.name, rating: t.carrier.rating, total: 0, cancelled: 0, sum: 0 }
      m[k].total++
      if (t.status === 'cancelled') m[k].cancelled++
      else m[k].sum += Number(t.carrier_payment || 0) * (t.currency === 'UAH' ? 1 : (t.nbu_rate || 1))
    }
    return Object.values(m).sort((a, b) => b.total - a.total)
  }, [trips])
  const setRating = async (cid, v) => {
    await supabase.from('counterparties').update({ rating: v || null }).eq('id', cid)
    setTick(x => x + 1)
  }

  const vehicleRows = useMemo(() => {
    const direct = {}
    for (const e of expenses) if (!e.trip_id && e.vehicle_id) direct[e.vehicle_id] = (direct[e.vehicle_id] || 0) + expUah(e)
    return vehicles.map(v => {
      const vt = tripRows.filter(t => t.vehicle_id === v.id)
      const rev = vt.reduce((s, t) => s + (t.rev || 0), 0)
      const spentTrips = vt.reduce((s, t) => s + t.spent, 0)
      const spentDirect = direct[v.id] || 0
      const km = vt.reduce((s, t) => s + (t.km || 0), 0)
      const profit = rev - spentTrips - spentDirect
      return { ...v, trips: vt.length, rev, spent: spentTrips + spentDirect, km, profit,
        margin: rev ? (profit / rev * 100) : null, perKm: km ? (spentTrips + spentDirect) / km : null }
    }).filter(v => v.trips > 0 || v.spent > 0)
  }, [vehicles, tripRows, expenses])

  // Кеш-флоу по місяцях
  const cashflow = useMemo(() => {
    const m = {}
    for (const i of incomes) {
      const k = i.income_date.slice(0, 7)
      m[k] = m[k] || { inn: 0, out: 0 }
      m[k].inn += Number(i.amount_uah ?? (i.currency === 'UAH' ? i.amount : 0))
    }
    for (const e of expenses) {
      const k = e.expense_date.slice(0, 7)
      m[k] = m[k] || { inn: 0, out: 0 }
      m[k].out += expUah(e)
    }
    return Object.entries(m).sort()
  }, [incomes, expenses])

  // Дисципліна оплат по замовниках
  const discipline = useMemo(() => {
    const m = {}
    for (const t of trips) {
      if (!t.customer || !t.payment_due_date) continue
      const key = t.customer.id
      m[key] = m[key] || { name: t.customer.name, type: t.customer.type, total: 0, paid: 0, onTime: 0, delaySum: 0, unpaidOverdue: 0 }
      const r = m[key]
      r.total++
      if (t.payment_received_date) {
        r.paid++
        const delay = Math.round((new Date(t.payment_received_date) - new Date(t.payment_due_date)) / 86400000)
        if (delay <= 0) r.onTime++
        else r.delaySum += delay
      } else if (t.payment_due_date < new Date().toISOString().slice(0, 10)) {
        r.unpaidOverdue++
      }
    }
    return Object.values(m).map(r => {
      const avgDelay = r.paid - r.onTime > 0 ? r.delaySum / (r.paid - r.onTime) : 0
      const pctOnTime = r.paid ? Math.round(r.onTime / r.paid * 100) : null
      let grade = '—'
      if (r.paid > 0 || r.unpaidOverdue > 0) {
        if (r.unpaidOverdue > 0 || (pctOnTime ?? 0) < 50) grade = 'C'
        else if (pctOnTime >= 90 && avgDelay <= 3) grade = 'A'
        else grade = 'B'
      }
      return { ...r, avgDelay, pctOnTime, grade }
    }).sort((a, b) => b.total - a.total)
  }, [trips])

  const totRev = tripRows.reduce((s, t) => s + (t.rev || 0), 0)
  const totSpent = expenses.reduce((s, e) => s + expUah(e), 0)

  return (
    <div>
      <h1>Аналітика</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <label style={{ margin: 0 }}>Період</label>
        <input type="date" style={{ width: 'auto' }} value={from} onChange={e => setFrom(e.target.value)} />
        <span>—</span>
        <input type="date" style={{ width: 'auto' }} value={to} onChange={e => setTo(e.target.value)} />
      </div>

      <div className="cards">
        <div className="stat"><div className="num">{fmt(totRev)}</div><div className="lbl">Дохід за період, грн</div></div>
        <div className="stat"><div className="num">{fmt(totSpent)}</div><div className="lbl">Витрати, грн</div></div>
        <div className="stat"><div className="num" style={{ color: totRev - totSpent >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(totRev - totSpent)}</div><div className="lbl">Прибуток, грн</div></div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Рентабельність по машинах</h2>
        <table>
          <thead><tr><th>Машина</th><th>Рейсів</th><th>Дохід</th><th>Витрати</th><th>Прибуток</th><th>Маржа</th><th>Км</th><th>Грн/км</th></tr></thead>
          <tbody>{vehicleRows.map(v => (
            <tr key={v.id}>
              <td>{v.name}</td><td>{v.trips}</td><td>{fmt(v.rev)}</td><td>{fmt(v.spent)}</td>
              <td style={{ color: v.profit >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(v.profit)}</td>
              <td>{v.margin != null ? v.margin.toFixed(1) + '%' : '—'}</td>
              <td>{fmt(v.km)}</td><td>{v.perKm ? v.perKm.toFixed(2) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {vehicleRows.length === 0 && <p className="muted">Немає даних за період.</p>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Рентабельність по рейсах</h2>
        <table>
          <thead><tr><th>Рейс</th><th>Дохід, грн</th><th>Витрати</th><th>Прибуток</th><th>Км</th><th>Собівартість грн/км</th></tr></thead>
          <tbody>{tripRows.map(t => (
            <tr key={t.id}>
              <td><Link to={`/trips/${t.id}`}>{t.number || `${t.route_from} → ${t.route_to}`}</Link></td>
              <td>{fmt(t.rev)}</td><td>{fmt(t.spent)}</td>
              <td style={{ color: (t.profit ?? 0) >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(t.profit)}</td>
              <td>{fmt(t.km)}</td><td>{t.perKm ? t.perKm.toFixed(2) : '—'}</td>
            </tr>
          ))}</tbody>
        </table>
        {tripRows.length === 0 && <p className="muted">Немає рейсів за період.</p>}
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Кеш-флоу по місяцях, грн</h2>
        <table>
          <thead><tr><th>Місяць</th><th>Надходження</th><th>Витрати</th><th>Сальдо</th></tr></thead>
          <tbody>{cashflow.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td><td>{fmt(v.inn)}</td><td>{fmt(v.out)}</td>
              <td style={{ color: v.inn - v.out >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(v.inn - v.out)}</td>
            </tr>
          ))}</tbody>
        </table>
        {cashflow.length === 0 && <p className="muted">Немає руху за період.</p>}
      </div>

      {expTrips.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Експедиція</h2>
          <div className="stats">
            <div className="stat"><div className="num">{fmt(exp.paidToUs)}</div><div className="lbl">Оплачено нам, грн</div></div>
            <div className="stat"><div className="num">{fmt(exp.debtor)}</div><div className="lbl">Дебіторка, грн</div></div>
            <div className="stat"><div className="num">{fmt(exp.paidByUs)}</div><div className="lbl">Ми оплатили, грн</div></div>
            <div className="stat"><div className="num">{fmt(exp.creditor)}</div><div className="lbl">Кредиторка, грн</div></div>
            <div className="stat"><div className="num">{fmt(exp.gross)}</div><div className="lbl">Валовий дохід, грн</div></div>
            <div className="stat"><div className="num" style={{ color: exp.flow >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(exp.flow)}</div><div className="lbl">Грошовий потік, грн</div></div>
          </div>
          <h2>Надійність перевізників</h2>
          <table>
            <thead><tr><th>Перевізник</th><th>Рейсів</th><th>Скасовано</th><th>Оплачено їм, грн</th><th>Ваша оцінка</th></tr></thead>
            <tbody>{carrierRows.map(c => (
              <tr key={c.id}>
                <td>{c.name}</td><td>{c.total}</td>
                <td>{c.cancelled ? <span className="badge danger">{c.cancelled}</span> : '—'}</td>
                <td>{fmt(c.sum)}</td>
                <td><select value={c.rating || ''} onChange={e => setRating(c.id, Number(e.target.value))}>
                  <option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
                </select></td>
              </tr>
            ))}</tbody>
          </table>
          <p className="muted">Оцінка — ваша суб'єктивна (1–5), зберігається в картці контрагента. Об'єктивні сигнали поруч: скільки рейсів віддавали і скільки з них зірвалось.</p>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Дисципліна оплат замовників</h2>
        <table>
          <thead><tr><th>Замовник</th><th>Рейсів</th><th>Вчасно</th><th>Сер. прострочка, дн</th><th>Прострочені неоплачені</th><th>Рейтинг</th></tr></thead>
          <tbody>{discipline.map((d, i) => (
            <tr key={i}>
              <td>{d.name}</td><td>{d.total}</td>
              <td>{d.pctOnTime != null ? d.pctOnTime + '%' : '—'}</td>
              <td>{d.avgDelay ? d.avgDelay.toFixed(1) : '0'}</td>
              <td>{d.unpaidOverdue || '—'}</td>
              <td><span className={`badge ${d.grade === 'A' ? 'ok' : d.grade === 'C' ? 'danger' : d.grade === 'B' ? 'warn' : ''}`}>{d.grade}</span></td>
            </tr>
          ))}</tbody>
        </table>
        <p className="muted">A — ≥90% вчасно і затримка ≤3 дні; B — решта; C — &lt;50% вчасно або є прострочені неоплачені. Рахується по рейсах з виставленим терміном оплати.</p>
      </div>
    </div>
  )
}
