import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../supabase'
import { statusLabel } from '../dicts'

const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('uk-UA'))

export default function Dashboard() {
  const [active, setActive] = useState([])
  const [prro, setPrro] = useState([])
  const [overdue, setOverdue] = useState([])

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
  }, [])

  return (
    <div>
      <h1>Дашборд</h1>
      <div className="cards">
        <div className="stat"><div className="num">{active.length}</div><div className="lbl">Активні рейси</div></div>
        <div className="stat"><div className="num">{overdue.length}</div><div className="lbl">Прострочені оплати</div></div>
        <div className="stat"><div className="num">{prro.length}</div><div className="lbl">Готівка без ПРРО</div></div>
      </div>

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
