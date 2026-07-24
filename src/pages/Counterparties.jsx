import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { CP_TYPES, cpTypeLabel, CONTRACT_FORMS } from '../dicts'
import { longPress } from '../longpress'

const empty = { type: 'expedition', name: '', edrpou: '', contract_form: '', payment_terms_days: '', rating: '', notes: '' }

export default function Counterparties() {
  const [list, setList] = useState([])
  const [filter, setFilter] = useState('all')
  const [f, setF] = useState(empty)
  const [show, setShow] = useState(false)
  const [editId, setEditId] = useState(null)

  const edit = (c) => {
    const rec = { ...empty }
    for (const k of Object.keys(empty)) rec[k] = c[k] ?? ''
    setF(rec); setEditId(c.id); setShow(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const load = () => supabase.from('counterparties').select('*').order('name').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!f.name) return
    const rec = { ...f }
    if (!rec.contract_form) rec.contract_form = null
    if (rec.payment_terms_days === '') rec.payment_terms_days = null
    rec.rating = rec.rating === '' ? null : Number(rec.rating)
    const { error } = editId
      ? await supabase.from('counterparties').update(rec).eq('id', editId)
      : await supabase.from('counterparties').insert(rec)
    if (error) { alert(error.message); return }
    setF(empty); setEditId(null); setShow(false); load()
  }

  const shown = list.filter(c => filter === 'all' || c.type === filter)

  return (
    <div>
      <div className="spread">
        <h1>Контрагенти</h1>
        <button onClick={() => { if (show) { setShow(false); setEditId(null); setF(empty) } else setShow(true) }}>{show ? 'Сховати' : '+ Додати'}</button>
      </div>
      {show && (
        <div className="panel">
          <div className="grid g3">
            <div><label>Тип</label>
              <select value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
                {CP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label>Назва</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
            <div><label>ЄДРПОУ / ІПН</label><input value={f.edrpou} onChange={e => setF({ ...f, edrpou: e.target.value })} /></div>
            <div><label>Оцінка надійності (1–5)</label>
              <select value={f.rating || ''} onChange={e => setF({ ...f, rating: e.target.value })}>
                <option value="">—</option>{[1, 2, 3, 4, 5].map(n => <option key={n} value={n}>{'★'.repeat(n)}</option>)}
              </select></div>
            <div><label>Форма договору</label>
              <select value={f.contract_form} onChange={e => setF({ ...f, contract_form: e.target.value })}>
                <option value="">—</option>
                {CONTRACT_FORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label>Термін оплати, днів</label><input type="number" value={f.payment_terms_days} onChange={e => setF({ ...f, payment_terms_days: e.target.value })} /></div>
            <div><label>Примітки</label><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12 }}><button onClick={save}>{editId ? 'Зберегти зміни' : 'Зберегти'}</button></div>
        </div>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        <select value={filter} onChange={e => setFilter(e.target.value)} style={{ width: 'auto' }}>
          <option value="all">Всі типи</option>
          {CP_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Назва</th><th>Тип</th><th>ЄДРПОУ</th><th>Оплата, днів</th><th>Примітки</th><th></th></tr></thead>
          <tbody>{shown.map(c => (
            <tr key={c.id} {...longPress(() => edit(c))}>
              <td>{c.name}</td><td><span className="badge">{cpTypeLabel(c.type)}</span></td>
              <td>{c.edrpou || '—'}</td><td>{c.payment_terms_days ?? '—'}</td><td>{c.notes}</td>
              <td><button className="small secondary" onClick={() => edit(c)}>Редагувати</button></td>
            </tr>
          ))}</tbody>
        </table>
        {shown.length === 0 && <p className="muted">Порожньо.</p>}
      </div>
    </div>
  )
}
