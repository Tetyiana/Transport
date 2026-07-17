import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { PAY_SCHEMES, schemeLabel } from '../dicts'

const empty = { full_name: '', phone: '', pay_scheme: 'percent_freight', pay_percent: '', rate_km_ua: '', rate_km_abroad: '', rate_per_trip: '', taxes_included: true }

export default function Drivers() {
  const [list, setList] = useState([])
  const [f, setF] = useState(empty)
  const [show, setShow] = useState(false)

  const load = () => supabase.from('drivers').select('*').order('full_name').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!f.full_name) return
    const rec = { ...f }
    for (const k of ['pay_percent','rate_km_ua','rate_km_abroad','rate_per_trip']) if (rec[k] === '') rec[k] = null
    const { error } = await supabase.from('drivers').insert(rec)
    if (error) { alert(error.message); return }
    setF(empty); setShow(false); load()
  }

  return (
    <div>
      <div className="spread">
        <h1>Водії</h1>
        <button onClick={() => setShow(!show)}>{show ? 'Сховати' : '+ Додати'}</button>
      </div>
      {show && (
        <div className="panel">
          <div className="grid g3">
            <div><label>ПІБ</label><input value={f.full_name} onChange={e => setF({ ...f, full_name: e.target.value })} /></div>
            <div><label>Телефон</label><input value={f.phone} onChange={e => setF({ ...f, phone: e.target.value })} /></div>
            <div><label>Схема ЗП</label>
              <select value={f.pay_scheme} onChange={e => setF({ ...f, pay_scheme: e.target.value })}>
                {PAY_SCHEMES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            {(f.pay_scheme === 'percent_freight' || f.pay_scheme === 'percent_profit') &&
              <div><label>Відсоток, %</label><input type="number" value={f.pay_percent} onChange={e => setF({ ...f, pay_percent: e.target.value })} /></div>}
            {f.pay_scheme === 'per_km' && <>
              <div><label>Ставка/км Україна</label><input type="number" value={f.rate_km_ua} onChange={e => setF({ ...f, rate_km_ua: e.target.value })} /></div>
              <div><label>Ставка/км закордон</label><input type="number" value={f.rate_km_abroad} onChange={e => setF({ ...f, rate_km_abroad: e.target.value })} /></div>
            </>}
            {f.pay_scheme === 'per_trip' &&
              <div><label>Ставка за рейс</label><input type="number" value={f.rate_per_trip} onChange={e => setF({ ...f, rate_per_trip: e.target.value })} /></div>}
            <div><label>Податки</label>
              <select value={f.taxes_included ? '1' : '0'} onChange={e => setF({ ...f, taxes_included: e.target.value === '1' })}>
                <option value="1">Включено в ставку</option>
                <option value="0">Окремо</option>
              </select></div>
          </div>
          <div style={{ marginTop: 12 }}><button onClick={save}>Зберегти</button></div>
        </div>
      )}
      <div className="panel">
        <table>
          <thead><tr><th>ПІБ</th><th>Телефон</th><th>Схема ЗП</th><th>Ставка</th><th>Податки</th></tr></thead>
          <tbody>{list.map(d => (
            <tr key={d.id}>
              <td>{d.full_name}</td><td>{d.phone}</td>
              <td><span className="badge">{schemeLabel(d.pay_scheme)}</span></td>
              <td>{d.pay_percent ? `${d.pay_percent}%` : d.rate_per_trip ? d.rate_per_trip : (d.rate_km_ua || d.rate_km_abroad) ? `${d.rate_km_ua ?? '—'} / ${d.rate_km_abroad ?? '—'} за км` : '—'}</td>
              <td>{d.taxes_included ? 'включено' : 'окремо'}</td>
            </tr>
          ))}</tbody>
        </table>
        {list.length === 0 && <p className="muted">Додайте першого водія.</p>}
      </div>
    </div>
  )
}
