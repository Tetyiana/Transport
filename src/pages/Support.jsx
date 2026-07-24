import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

const STATUSES = [
  ['new', 'Новий'], ['in_progress', 'В роботі'], ['answered', 'Є відповідь'], ['fixed', 'Виправлено'], ['closed', 'Закрито'],
]
const stLabel = (s) => Object.fromEntries(STATUSES)[s] || s
const stClass = (s) => s === 'fixed' || s === 'closed' ? 'ok' : s === 'new' ? 'danger' : 'warn'
const PAGES = ['Головна', 'Рейси', 'Картка рейсу', 'Гроші', 'Документи', 'Аналітика', 'Контрагенти', 'Машини', 'Водії', 'Telegram-бот', 'Інше']

export default function Support() {
  const [tickets, setTickets] = useState([])
  const [msgs, setMsgs] = useState({})
  const [open, setOpen] = useState(null)
  const [f, setF] = useState({ title: '', description: '', page: '' })
  const [reply, setReply] = useState('')
  const [aiBusy, setAiBusy] = useState(false)

  const load = async () => {
    const { data: t } = await supabase.from('support_tickets').select('*, org:org_id(name)').order('created_at', { ascending: false })
    setTickets(t || [])
    const { data: m } = await supabase.from('support_messages').select('*').order('created_at')
    const byT = {}
    for (const x of m || []) (byT[x.ticket_id] = byT[x.ticket_id] || []).push(x)
    setMsgs(byT)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    if (!f.title.trim()) { alert('Опишіть проблему хоча б у темі'); return }
    const { error } = await supabase.from('support_tickets').insert({ title: f.title.trim(), description: f.description || null, page: f.page || null })
    if (error) { alert(error.message); return }
    setF({ title: '', description: '', page: '' }); load()
  }

  const send = async (tid) => {
    if (!reply.trim()) return
    const { error } = await supabase.from('support_messages').insert({ ticket_id: tid, author: 'user', body: reply.trim() })
    if (error) { alert(error.message); return }
    setReply(''); load()
  }

  const setStatus = async (tid, status) => {
    await supabase.from('support_tickets').update({ status }).eq('id', tid); load()
  }

  const askAi = async (tid) => {
    setAiBusy(true)
    try {
      const { data, error } = await supabase.functions.invoke('support-ai', { body: { ticket_id: tid } })
      if (error || !data?.ok) alert(data?.error || error?.message || 'AI-асистент недоступний. Перевірте, що функція support-ai задеплоєна і секрет ANTHROPIC_API_KEY заданий.')
      load()
    } finally { setAiBusy(false) }
  }

  const copyRegistry = async () => {
    const openTickets = tickets.filter(t => t.status !== 'closed' && t.status !== 'fixed')
    const text = openTickets.map((t, i) =>
      `${i + 1}. [${stLabel(t.status)}] ${t.page ? `(${t.page}) ` : ''}${t.title}` +
      (t.description ? `\n   ${t.description}` : '') +
      (msgs[t.id]?.length ? '\n' + msgs[t.id].map(m => `   ${m.author === 'user' ? '→' : '←'} ${m.body}`).join('\n') : '')
    ).join('\n')
    await navigator.clipboard.writeText(text || 'Відкритих звернень немає')
    alert('Реєстр відкритих звернень скопійовано — надішліть його розробнику')
  }

  return (
    <div>
      <h1>Технічна підтримка</h1>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Повідомити про проблему</h2>
        <div className="grid g4">
          <div><label>Тема (коротко, що не так)</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
          <div><label>Розділ</label>
            <select value={f.page} onChange={e => setF({ ...f, page: e.target.value })}>
              <option value="">—</option>{PAGES.map(p => <option key={p}>{p}</option>)}
            </select></div>
          <div style={{ gridColumn: 'span 2' }}><label>Деталі (що робили, що очікували, що сталося)</label>
            <textarea rows={3} style={{ width: '100%' }} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <button className="small" onClick={create}>Надіслати</button>
          <button className="small secondary" onClick={copyRegistry}>Скопіювати реєстр (надіслати розробнику)</button>
        </div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Реєстр звернень</h2>
        {tickets.length === 0 && <p className="muted">Поки порожньо.</p>}
        <table><tbody>
          {tickets.map(t => (
            <tr key={t.id}>
              <td style={{ whiteSpace: 'nowrap' }}>{t.created_at.slice(0, 10)}</td>
              <td>{t.org?.name && <span className="badge">{t.org.name}</span>} {t.page && <span className="badge">{t.page}</span>}</td>
              <td><a style={{ cursor: 'pointer' }} onClick={() => setOpen(open === t.id ? null : t.id)}>{t.title}</a>
                {open === t.id && (
                  <div style={{ marginTop: 8 }}>
                    {t.description && <p style={{ whiteSpace: 'pre-wrap' }}>{t.description}</p>}
                    {(msgs[t.id] || []).map(m => (
                      <p key={m.id} style={{ whiteSpace: 'pre-wrap', borderLeft: '3px solid var(--accent, #888)', paddingLeft: 8 }}>
                        <b>{m.author === 'user' ? 'Ви' : m.author === 'assistant' ? 'AI-асистент' : 'Підтримка'}:</b> {m.body}
                      </p>
                    ))}
                    <div className="row" style={{ marginTop: 6 }}>
                      <input style={{ flex: 1, minWidth: 180 }} placeholder="Відповідь / уточнення" value={reply} onChange={e => setReply(e.target.value)} />
                      <button className="small" onClick={() => send(t.id)}>Надіслати</button>
                      <button className="small secondary" disabled={aiBusy} onClick={() => askAi(t.id)}>{aiBusy ? 'AI думає…' : 'Запитати AI'}</button>
                    </div>
                  </div>
                )}
              </td>
              <td>
                <select value={t.status} onChange={e => setStatus(t.id, e.target.value)} className={`badge ${stClass(t.status)}`}>
                  {STATUSES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  )
}
