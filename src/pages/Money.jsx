import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../supabase'
import { payFormLabel, PAY_FORMS } from '../dicts'
import { longPress } from '../longpress'

const csvExport = (rows, name) => {
  if (!rows.length) return
  const head = Object.keys(rows[0])
  const esc = (v) => `"${String(v ?? '').replaceAll('"', '""')}"`
  const body = [head.join(';'), ...rows.map(r => head.map(k => esc(r[k])).join(';'))].join('\r\n')
  const blob = new Blob(['\ufeff' + body], { type: 'text/csv;charset=utf-8' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
}

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA'))
const today = () => new Date().toISOString().slice(0, 10)

export default function Money() {
  const [incomes, setIncomes] = useState([])
  const [expenses, setExpenses] = useState([])
  const [cats, setCats] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [tab, setTab] = useState('incomes')
  const [exf, setExf] = useState({ vehicle_id: '', category_id: '', amount: '', payment_form: 'bank', expense_date: today(), note: '', liters: '' })
  const [newCat, setNewCat] = useState('')
  const [exEditId, setExEditId] = useState(null)
  const nav = useNavigate()

  const editExpense = (e) => {
    setExf({ vehicle_id: e.vehicle_id || '', category_id: e.category_id || '', amount: e.amount,
      payment_form: e.payment_form || 'bank', expense_date: e.expense_date, note: e.note || '', liters: e.liters || '' })
    setExEditId(e.id); setTab('expenses')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const removeExpense = async (e) => {
    if (!confirm(`Видалити витрату ${e.amount} ${e.currency || 'UAH'}${e.note ? ` (${e.note})` : ''}?`)) return
    const { error } = await supabase.from('expenses').delete().eq('id', e.id)
    if (error) { alert(error.message); return }
    load()
  }

  const load = () => {
    supabase.from('incomes').select('*, trip:trip_id(number, route_from, route_to), counterparty:counterparty_id(name)')
      .order('income_date', { ascending: false }).limit(200).then(({ data }) => setIncomes(data || []))
    supabase.from('expenses').select('*, trip:trip_id(number, route_from, route_to), vehicle:vehicle_id(name), category:category_id(name)')
      .order('expense_date', { ascending: false }).limit(200).then(({ data }) => setExpenses(data || []))
  }
  useEffect(() => {
    load()
    supabase.from('expense_categories').select('*').order('name').then(({ data }) => setCats(data || []))
    supabase.from('vehicles').select('id,name').eq('active', true).then(({ data }) => setVehicles(data || []))
  }, [])

  const markPrro = async (i) => {
    await supabase.from('incomes').update({ prro_done: true, in_tax_base: true }).eq('id', i.id); load()
  }
  const addExpense = async () => {
    if (!exf.category_id || !exf.amount || (!exf.vehicle_id && !exEditId)) { alert('Вкажіть машину, категорію і суму'); return }
    const rec = { ...exf, vehicle_id: exf.vehicle_id || null, note: exf.note || null, liters: exf.liters || null }
    const { error } = exEditId
      ? await supabase.from('expenses').update(rec).eq('id', exEditId)
      : await supabase.from('expenses').insert(rec)
    if (error) { alert(error.message); return }
    setExf({ vehicle_id: '', category_id: '', amount: '', payment_form: 'bank', expense_date: today(), note: '', liters: '' })
    setExEditId(null); load()
  }
  const addCategory = async () => {
    if (!newCat.trim()) return
    const { error } = await supabase.from('expense_categories').insert({ name: newCat.trim(), is_custom: true })
    if (error) { alert(error.message); return }
    setNewCat('')
    supabase.from('expense_categories').select('*').order('name').then(({ data }) => setCats(data || []))
  }

  const totalIn = incomes.reduce((s, i) => s + Number(i.amount), 0)
  const totalOut = expenses.reduce((s, e) => s + Number(e.amount), 0)

  return (
    <div>
      <h1>Гроші</h1>
      <div className="cards">
        <div className="stat"><div className="num">{fmt(totalIn)}</div><div className="lbl">Надходження (останні 200)</div></div>
        <div className="stat"><div className="num">{fmt(totalOut)}</div><div className="lbl">Витрати (останні 200)</div></div>
        <div className="stat"><div className="num" style={{ color: totalIn - totalOut >= 0 ? 'var(--ok)' : 'var(--danger)' }}>{fmt(totalIn - totalOut)}</div><div className="lbl">Різниця</div></div>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === 'incomes' ? '' : 'secondary'} onClick={() => setTab('incomes')}>Надходження</button>
        <button className={tab === 'expenses' ? '' : 'secondary'} onClick={() => setTab('expenses')}>Витрати</button>
        <button className="secondary" onClick={() => tab === 'incomes'
          ? csvExport(incomes.map(i => ({ дата: i.income_date, сума: i.amount, валюта: i.currency, сума_грн: i.amount_uah ?? (i.currency === 'UAH' ? i.amount : ''), форма: payFormLabel(i.payment_form), контрагент: i.counterparty?.name || '', рейс: i.trip?.number || '', ПРРО: i.prro_required ? (i.prro_done ? 'проведено' : 'не проведено') : '', в_базі_оподаткування: i.in_tax_base ? 'так' : 'ні', примітка: i.note || '' })), 'доходи.csv')
          : csvExport(expenses.map(e => ({ дата: e.expense_date, категорія: e.category?.name || '', сума: e.amount, валюта: e.currency, сума_грн: e.amount_uah ?? (e.currency === 'UAH' ? e.amount : ''), форма: payFormLabel(e.payment_form), рейс: e.trip?.number || '', машина: e.vehicle?.name || '', примітка: e.note || '' })), 'витрати.csv')
        }>Експорт CSV (бухгалтерія)</button>
      </div>

      {tab === 'incomes' && (
        <div className="panel">
          <table>
            <thead><tr><th>Дата</th><th>Рейс</th><th>Від кого</th><th>Сума</th><th>Форма</th><th>ПРРО</th><th></th></tr></thead>
            <tbody>{incomes.map(i => (
              <tr key={i.id} {...longPress(() => i.trip_id && nav(`/trips/${i.trip_id}`))}>
                <td>{i.income_date}</td>
                <td>{i.trip ? <Link to={`/trips/${i.trip_id}`}>{i.trip.number || `${i.trip.route_from} → ${i.trip.route_to}`}</Link> : '—'}</td>
                <td>{i.counterparty?.name || '—'}</td>
                <td>{fmt(i.amount)} {i.currency}</td>
                <td>{payFormLabel(i.payment_form)}</td>
                <td>{i.prro_required ? (i.prro_done ? <span className="badge ok">проведено</span> : <span className="badge warn">провести!</span>) : '—'}</td>
                <td>{i.prro_required && !i.prro_done && <button className="small" onClick={() => markPrro(i)}>Проведено</button>}</td>
              </tr>
            ))}</tbody>
          </table>
          {incomes.length === 0 && <p className="muted">Надходження додаються в картці рейсу.</p>}
        </div>
      )}

      {tab === 'expenses' && (<>
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>{exEditId ? 'Редагування витрати' : 'Витрата на машину (поза рейсом)'}</h2>
          <div className="grid g4">
            <div><label>Машина</label>
              <select value={exf.vehicle_id} onChange={e => setExf({ ...exf, vehicle_id: e.target.value })}>
                <option value="">—</option>
                {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
              </select></div>
            <div><label>Категорія</label>
              <select value={exf.category_id} onChange={e => setExf({ ...exf, category_id: e.target.value })}>
                <option value="">—</option>
                {cats.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select></div>
            <div><label>Сума</label><input type="number" value={exf.amount} onChange={e => setExf({ ...exf, amount: e.target.value })} /></div>
          <div><label>Літри (пальне)</label><input type="number" value={exf.liters} onChange={e => setExf({ ...exf, liters: e.target.value })} /></div>
            <div><label>Дата</label><input type="date" value={exf.expense_date} onChange={e => setExf({ ...exf, expense_date: e.target.value })} /></div>
            <div><label>Форма оплати</label>
              <select value={exf.payment_form} onChange={e => setExf({ ...exf, payment_form: e.target.value })}>
                {PAY_FORMS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select></div>
            <div><label>Примітка</label><input value={exf.note} onChange={e => setExf({ ...exf, note: e.target.value })} /></div>
          </div>
          <div style={{ marginTop: 10 }} className="row"><button className="small" onClick={addExpense}>{exEditId ? 'Зберегти зміни' : 'Додати витрату'}</button>{exEditId && <button className="small secondary" onClick={() => { setExEditId(null); setExf({ vehicle_id: '', category_id: '', amount: '', payment_form: 'bank', expense_date: today(), note: '', liters: '' }) }}>Скасувати</button>}</div>
          <div className="row" style={{ marginTop: 14 }}>
            <input style={{ width: 220 }} placeholder="Нова категорія витрат" value={newCat} onChange={e => setNewCat(e.target.value)} />
            <button className="small secondary" onClick={addCategory}>Додати категорію</button>
          </div>
        </div>
        <div className="panel">
          <table>
            <thead><tr><th>Дата</th><th>Категорія</th><th>Рейс / Машина</th><th>Сума</th><th>Форма</th><th>Примітка</th><th></th></tr></thead>
            <tbody>{expenses.map(e => (
              <tr key={e.id} {...longPress(() => editExpense(e))}>
                <td>{e.expense_date}</td>
                <td>{e.category?.name}</td>
                <td>{e.trip ? <Link to={`/trips/${e.trip_id}`}>{e.trip.number || `${e.trip.route_from} → ${e.trip.route_to}`}</Link> : (e.vehicle?.name || '—')}</td>
                <td>{fmt(e.amount)} {e.currency}</td>
                <td>{payFormLabel(e.payment_form)}</td>
                <td>{e.note}</td>
                <td><button className="small secondary" onClick={() => editExpense(e)}>Редагувати</button> <button className="small danger-btn" onClick={() => removeExpense(e)}>✕</button></td>
              </tr>
            ))}</tbody>
          </table>
          {expenses.length === 0 && <p className="muted">Порожньо.</p>}
        </div>
      </>)}
    </div>
  )
}
