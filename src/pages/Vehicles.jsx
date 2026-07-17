import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const empty = { name: '', plate_truck: '', plate_trailer: '', current_odometer: '', notes: '' }

export default function Vehicles() {
  const [list, setList] = useState([])
  const [f, setF] = useState(empty)
  const [show, setShow] = useState(false)

  const load = () => supabase.from('vehicles').select('*').order('name').then(({ data }) => setList(data || []))
  useEffect(() => { load() }, [])

  const save = async () => {
    if (!f.name) return
    const rec = { ...f }
    if (rec.current_odometer === '') rec.current_odometer = null
    const { error } = await supabase.from('vehicles').insert(rec)
    if (error) { alert(error.message); return }
    setF(empty); setShow(false); load()
  }

  return (
    <div>
      <div className="spread">
        <h1>Машини</h1>
        <button onClick={() => setShow(!show)}>{show ? 'Сховати' : '+ Додати'}</button>
      </div>
      {show && (
        <div className="panel">
          <div className="grid g3">
            <div><label>Назва</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="DAF XF ..." /></div>
            <div><label>Номер тягача</label><input value={f.plate_truck} onChange={e => setF({ ...f, plate_truck: e.target.value })} /></div>
            <div><label>Номер причепа</label><input value={f.plate_trailer} onChange={e => setF({ ...f, plate_trailer: e.target.value })} /></div>
            <div><label>Поточний спідометр</label><input type="number" value={f.current_odometer} onChange={e => setF({ ...f, current_odometer: e.target.value })} /></div>
            <div><label>Примітки</label><input value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 12 }}><button onClick={save}>Зберегти</button></div>
        </div>
      )}
      <div className="panel">
        <table>
          <thead><tr><th>Назва</th><th>Тягач</th><th>Причіп</th><th>Спідометр</th><th>Примітки</th></tr></thead>
          <tbody>{list.map(v => (
            <tr key={v.id}><td>{v.name}</td><td>{v.plate_truck}</td><td>{v.plate_trailer}</td>
              <td>{v.current_odometer?.toLocaleString('uk-UA') ?? '—'}</td><td>{v.notes}</td></tr>
          ))}</tbody>
        </table>
        {list.length === 0 && <p className="muted">Додайте першу машину.</p>}
      </div>
    </div>
  )
}
