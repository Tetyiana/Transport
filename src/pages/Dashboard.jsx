import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { statusLabel } from '../dicts'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA'))

export default function Dashboard() {
  const [active, setActive] = useState([])
  const [prro, setPrro] = useState([])
  const [overdue, setOverdue] = useState([])
  const [paySoon, setPaySoon] = useState([])
  const [ttnDue, setTtnDue] = useState([])
  const [docsExp, setDocsExp] = useState([])

  useEffect(() => {
    supabase.from('trips')
      .select('*, customer:customer_id(name), vehicle:vehicle_id(name)')
      .not('status', 'in', '("closed","cancelled","paid")')
      .order('created_at', { ascending: false })
      .then(({ data }) => setActive(data || []))
    supabase.from('incomes')
      .select('*, counterparty:counterparty_id(name)')
      .eq('prro_required', true).eq('prro_done', false)
      .then(({ data }) => setPrro(data || []))
    supabase.from('trips')
      .select('*, customer:customer_id(name)')
      .is('payment_received_date', null)
      .not('payment_due_date', 'is', null)
      .lt('payment_due_date', new Date().toISOString().slice(0, 10))
      .not('status', 'in', '("closed","cancelled")')
      .then(({ data }) => setOverdue(data || []))
    const today = new Date().toISOString().slice(0, 10)
    const plus = (d) => new Date(Date.now() + d * 864e5).toISOString().slice(0, 10)
    supabase.from('trips')
      .select('id, number, route_from, route_to, payment_due_date, customer:customer_id(name)')
      .is('payment_received_date', null)
      .gte('payment_due_date', today).lte('payment_due_date', plus(5))
      .not('status', 'in', '("closed","cancelled","paid")')
      .then(({ data }) => setPaySoon(data || []))
    supabase.from('trips')
      .select('id, number, route_from, route_to, ttn_due_date, customer:customer_id(name)')
      .is('ttn_sent_date', null)
      .not('ttn_due_date', 'is', null).lte('ttn_due_date', plus(3))
      .not('status', 'in', '("closed","cancelled","paid")')
      .then(({ data }) => setTtnDue(data || []))
    supabase.from('documents')
      .select('id, title, doc_type, valid_until')
      .not('valid_until', 'is', null).lte('valid_until', plus(30))
      .order('valid_until')
      .then(({ data }) => setDocsExp(data || []))
  }, [])
  const todayStr = new Date().toISOString().slice(0, 10)
  const badge = (d) => <span className={`badge ${d < todayStr ? 'danger' : 'warn'}`}>{d < todayStr ? 'прострочено ' : 'до '}{d}</span>

  return (
    <div>
      <h1>Головна</h1>
      <div className="cards">
        <div className="stat"><div className="num">{active.length}</div><div className="lbl">Активні рейси</div></div>
        <div className="stat"><div className="num">{overdue.length}</div><div className="lbl">Прострочені оплати</div></div>
        <div className="stat"><div className="num">{prro.length}</div><div className="lbl">Готівка без ПРРО</div></div>
      </div>

      {(paySoon.length > 0 || ttnDue.length > 0 || docsExp.length > 0) && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Нагадування</h2>
          <table><tbody>
            {paySoon.map(t => (
              <tr key={'p' + t.id}>
                <td><span className="badge">Оплата</span></td>
                <td><Link to={`/trips/${t.id}`}>{t.number || t.route_from + ' → ' + t.route_to}</Link> — {t.customer?.name}</td>
                <td>{badge(t.payment_due_date)}</td>
              </tr>
            ))}
            {ttnDue.map(t => (
              <tr key={'t' + t.id}>
                <td><span className="badge">ТТН</span></td>
                <td><Link to={`/trips/${t.id}`}>{t.number || t.route_from + ' → ' + t.route_to}</Link> — {t.customer?.name}</td>
                <td>{badge(t.ttn_due_date)}</td>
              </tr>
            ))}
            {docsExp.map(d => (
              <tr key={'d' + d.id}>
                <td><span className="badge">Документ</span></td>
                <td><Link to="/documents">{d.title || d.doc_type}</Link></td>
                <td>{badge(d.valid_until)}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {overdue.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Прострочені оплати</h2>
          <table><tbody>
            {overdue.map(t => (
              <tr key={t.id}>
                <td><Link to={`/trips/${t.id}`}>{t.number || t.route_from + ' → ' + t.route_to}</Link></td>
                <td>{t.customer?.name}</td>
                <td>{fmt(t.freight_amount)} {t.currency}</td>
                <td><span className="badge danger">до {t.payment_due_date}</span></td>
              </tr>
            ))}
          </tbody></table>
        </div>
      )}

      {prro.length > 0 && (
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>Готівкові надходження — провести через ПРРО</h2>
          <table><tbody>
            {prro.map(i => (
              <tr key={i.id}>
                <td>{i.income_date}</td>
                <td>{i.counterparty?.name || '—'}</td>
                <td>{fmt(i.amount)} {i.currency}</td>
                <td><span className="badge warn">не проведено</span></td>
              </tr>
            ))}
          </tbody></table>
          <p className="muted">Відмітити проведення можна на сторінці «Гроші» або в картці рейсу.</p>
        </div>
      )}

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Активні рейси</h2>
        {active.length === 0 ? <p className="muted">Немає активних рейсів. Створіть перший на сторінці «Рейси».</p> : (
          <table>
            <thead><tr><th>Рейс</th><th>Замовник</th><th>Машина</th><th>Фрахт</th><th>Статус</th></tr></thead>
            <tbody>
              {active.map(t => (
                <tr key={t.id}>
                  <td><Link to={`/trips/${t.id}`}>{t.number || `${t.route_from || '?'} → ${t.route_to || '?'}`}</Link></td>
                  <td>{t.customer?.name || '—'}</td>
                  <td>{t.vehicle?.name || '—'}</td>
                  <td>{fmt(t.mode === 'expedition' ? t.commission_amount : t.freight_amount)} {t.currency}</td>
                  <td><span className="badge">{statusLabel(t.status)}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
