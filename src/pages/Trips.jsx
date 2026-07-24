import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { TRIP_STATUSES, statusLabel, CARRIER_CHECKLIST, EXPEDITION_CHECKLIST } from '../dicts'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA'))
const emptyCp = { name: '', type: 'expedition', edrpou: '' }
const empty = { mode: 'carrier', number: '', customer_id: '', carrier_id: '', vehicle_id: '', driver_id: '', route_from: '', route_to: '', cargo: '', cargo_weight: '', vehicle_type: '', freight_amount: '', commission_amount: '', carrier_payment: '', currency: 'UAH' }

export default function Trips() {
  const nav = useNavigate()
  const [trips, setTrips] = useState([])
  const [cps, setCps] = useState([])
  const [newCp, setNewCp] = useState(null) // null = сховано, обʼєкт = форма відкрита
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [filter, setFilter] = useState('active')
  const [showForm, setShowForm] = useState(false)
  const [f, setF] = useState(empty)

  const load = () => {
    supabase.from('trips')
      .select('*, customer:customer_id(name), vehicle:vehicle_id(name), driver:driver_id(full_name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => setTrips(data || []))
  }
  const loadCps = () => supabase.from('counterparties').select('id,name,type').eq('active', true).then(({ data }) => setCps(data || []))

  const createCp = async () => {
    if (!newCp?.name) { alert('Вкажіть назву'); return }
    const { data, error } = await supabase.from('counterparties')
      .insert({ name: newCp.name, type: newCp.type, edrpou: newCp.edrpou || null })
      .select('id,name,type').single()
    if (error) { alert(error.message); return }
    await loadCps()
    setF(prev => ({ ...prev, customer_id: data.id }))
    setNewCp(null)
  }

  useEffect(() => {
    load()
    loadCps()
    supabase.from('vehicles').select('id,name').eq('active', true).then(({ data }) => setVehicles(data || []))
    supabase.from('drivers').select('id,full_name').eq('active', true).then(({ data }) => setDrivers(data || []))
  }, [])

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async () => {
    const rec = { ...f }
    for (const k of ['customer_id','carrier_id','vehicle_id','driver_id']) if (!rec[k]) rec[k] = null
    for (const k of ['freight_amount','commission_amount','carrier_payment']) if (rec[k] === '') rec[k] = null
    const { data, error } = await supabase.from('trips').insert(rec).select().single()
    if (error) { alert(error.message); return }
    const steps = (f.mode === 'carrier' ? CARRIER_CHECKLIST : EXPEDITION_CHECKLIST)
      .map((title, i) => ({ trip_id: data.id, step: `s${i}`, title, sort_order: i }))
    await supabase.from('trip_events').insert(steps)
    setShowForm(false); setF(empty)
    nav(`/trips/${data.id}`)
  }

  const shown = trips.filter(t =>
    filter === 'all' ? true :
    filter === 'active' ? !['closed','cancelled','paid'].includes(t.status) :
    t.status === filter)

  return (
    <div>
      <div className="spread">
        <h1>Рейси</h1>
        <button onClick={() => setShowForm(!showForm)}>{showForm ? 'Сховати' : '+ Новий рейс'}</button>
      </div>

      {showForm && (
        <div className="panel">
          <div className="grid g3">
            <div><label>Режим</label>
              <select value={f.mode} onChange={set('mode')}>
                <option value="carrier">Перевізник</option>
                <option value="expedition">Експедиція</option>
              </select></div>
            <div><label>Номер рейсу</label><input value={f.number} onChange={set('number')} placeholder="напр. 2026-041" /></div>
            <div><label>Замовник</label>
              <select value={f.customer_id} onChange={e => e.target.value === '__new__' ? setNewCp({ ...emptyCp }) : set('customer_id')(e)}>
                <option value="">—</option>
                {cps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value="__new__">+ Новий контрагент…</option>
              </select></div>
            {newCp && <>
              <div><label>Назва нового контрагента</label><input value={newCp.name} onChange={e => setNewCp({ ...newCp, name: e.target.value })} /></div>
              <div><label>Тип</label>
                <select value={newCp.type} onChange={e => setNewCp({ ...newCp, type: e.target.value })}>
                  <option value="expedition">Експедиція</option><option value="shipper">Вантажовідправник</option><option value="other">Інше</option>
                </select></div>
              <div><label>ЄДРПОУ (необов'язково)</label><input value={newCp.edrpou} onChange={e => setNewCp({ ...newCp, edrpou: e.target.value })} /></div>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8 }}>
                <button className="small" onClick={createCp}>Створити</button>
                <button className="small secondary" onClick={() => setNewCp(null)}>Скасувати</button>
              </div>
            </>}
            <div><label>Звідки</label><input value={f.route_from} onChange={set('route_from')} /></div>
            <div><label>Куди</label><input value={f.route_to} onChange={set('route_to')} /></div>
            <div><label>Вантаж</label><input value={f.cargo} onChange={set('cargo')} /></div>
            <div><label>Вага</label><input value={f.cargo_weight} onChange={set('cargo_weight')} placeholder="22 т" /></div>
            <div><label>Вид авто</label><input value={f.vehicle_type} onChange={set('vehicle_type')} placeholder="тент / реф / зерновоз" /></div>
            <div><label>Валюта</label>
              <select value={f.currency} onChange={set('currency')}>
                <option>UAH</option><option>EUR</option><option>USD</option><option>PLN</option>
              </select></div>
            {f.mode === 'carrier' ? (<>
              <div><label>Фрахт</label><input type="number" value={f.freight_amount} onChange={set('freight_amount')} /></div>
              <div><label>Машина</label>
                <select value={f.vehicle_id} onChange={set('vehicle_id')}>
                  <option value="">—</option>
                  {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select></div>
              <div><label>Водій</label>
                <select value={f.driver_id} onChange={set('driver_id')}>
                  <option value="">—</option>
                  {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
                </select></div>
            </>) : (<>
              <div><label>Фрахт (загальний)</label><input type="number" value={f.freight_amount} onChange={set('freight_amount')} /></div>
              <div><label>Комісія (наш дохід)</label><input type="number" value={f.commission_amount} onChange={set('commission_amount')} /></div>
              <div><label>Оплата перевізнику</label><input type="number" value={f.carrier_payment} onChange={set('carrier_payment')} /></div>
              <div><label>Перевізник</label>
                <select value={f.carrier_id} onChange={set('carrier_id')}>
                  <option value="">—</option>
                  {cps.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select></div>
            </>)}
          </div>
          <div style={{ marginTop: 12 }}><button onClick={save}>Створити рейс</button></div>
        </div>
      )}

      <div className="row" style={{ marginBottom: 12 }}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="active">Активні</option>
          <option value="all">Всі</option>
          {TRIP_STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>

      <div className="panel">
        <table>
          <thead><tr><th>Рейс</th><th>Маршрут</th><th>Замовник</th><th>Машина / Водій</th><th>Сума</th><th>Статус</th></tr></thead>
          <tbody>
            {shown.map(t => (
              <tr key={t.id} className="clickable" onClick={() => nav(`/trips/${t.id}`)}>
                <td>{t.number || '—'}</td>
                <td>{t.route_from} → {t.route_to}</td>
                <td>{t.customer?.name || '—'}</td>
                <td>{t.vehicle?.name || '—'} {t.driver ? ` / ${t.driver.full_name}` : ''}</td>
                <td>{fmt(t.mode === 'expedition' ? t.commission_amount : t.freight_amount)} {t.currency}</td>
                <td><span className="badge">{statusLabel(t.status)}</span></td>
              </tr>
            ))}
          </tbody>
        </table>
        {shown.length === 0 && <p className="muted">Порожньо.</p>}
      </div>
    </div>
  )
}
