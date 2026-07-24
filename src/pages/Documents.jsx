import { useEffect, useState } from 'react'
import { supabase } from '../supabase'
import { STAT_DOC_TYPES, docTypeLabel } from '../dicts'
import { longPress } from '../longpress'
import { DEFAULT_TEMPLATES, PLACEHOLDERS } from '../doctemplates'

export default function Documents() {
  const [docs, setDocs] = useState([])
  const [vehicles, setVehicles] = useState([])
  const [drivers, setDrivers] = useState([])
  const [f, setF] = useState({ doc_type: 'fop_extract', title: '', vehicle_id: '', driver_id: '', valid_until: '', file: null })
  const [assets, setAssets] = useState({ stamp: false, sign: false })
  const [comp, setComp] = useState({ name: '', edrpou: '', address: '', iban: '', bank: '', director: '', phone: '', vat_mode: 'none' })
  useEffect(() => {
    supabase.from('company_profile').select('*').limit(1).maybeSingle().then(({ data }) => {
      if (data) setComp({ ...data })
    })
  }, [])
  const saveComp = async () => {
    const rec = { ...comp }
    delete rec.id
    const { error } = rec.org_id
      ? await supabase.from('company_profile').update(rec).eq('org_id', rec.org_id)
      : await supabase.from('company_profile').insert(rec)
    if (!error && !rec.org_id) supabase.from('company_profile').select('*').limit(1).maybeSingle().then(({ data }) => data && setComp({ ...data }))
    alert(error ? error.message : 'Реквізити збережено')
  }
  const setC = (k) => (e) => setComp({ ...comp, [k]: e.target.value })

  const [tpls, setTpls] = useState({ exp_contract: '', exp_application: '' })
  const [tplOpen, setTplOpen] = useState(false)
  useEffect(() => {
    supabase.from('doc_templates').select('id, content').then(({ data }) => {
      const m = { ...tpls }
      for (const k of Object.keys(DEFAULT_TEMPLATES)) m[k] = data?.find(r => r.id === k)?.content || DEFAULT_TEMPLATES[k].content
      setTpls(m)
    })
  }, [])
  const saveTpl = async (id) => {
    const { error } = await supabase.from('doc_templates').upsert({ id, title: DEFAULT_TEMPLATES[id].title, content: tpls[id], updated_at: new Date().toISOString() })
    alert(error ? error.message : 'Шаблон збережено')
  }
  const resetTpl = (id) => setTpls({ ...tpls, [id]: DEFAULT_TEMPLATES[id].content })
  const [editId, setEditId] = useState(null)

  const edit = (d) => {
    setF({ doc_type: d.doc_type, title: d.title || '', vehicle_id: d.vehicle_id || '', driver_id: d.driver_id || '', valid_until: d.valid_until || '', file: null })
    setEditId(d.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const loadAssets = () => {
    supabase.storage.from('docs').list('company/assets').then(({ data }) => {
      const names = (data || []).map(x => x.name)
      setAssets({ stamp: names.includes('stamp'), sign: names.includes('sign') })
    })
  }

  const load = () => {
    supabase.from('documents')
      .select('*, vehicle:vehicle_id(name), driver:driver_id(full_name)')
      .is('trip_id', null)
      .order('created_at', { ascending: false })
      .then(({ data }) => setDocs(data || []))
  }
  useEffect(() => {
    load()
    loadAssets()
    supabase.from('vehicles').select('id,name').then(({ data }) => setVehicles(data || []))
    supabase.from('drivers').select('id,full_name').then(({ data }) => setDrivers(data || []))
  }, [])

  const uploadAsset = async (kind, file) => {
    if (!file) return
    const { error } = await supabase.storage.from('docs').upload(`company/assets/${kind}`, file, { upsert: true })
    if (error) { alert(error.message); return }
    loadAssets()
  }

  const upload = async () => {
    if (editId) {
      const { error } = await supabase.from('documents').update({
        doc_type: f.doc_type, title: f.title || null, valid_until: f.valid_until || null,
        vehicle_id: f.vehicle_id || null, driver_id: f.driver_id || null,
      }).eq('id', editId)
      if (error) { alert(error.message); return }
      setF({ doc_type: 'fop_extract', title: '', vehicle_id: '', driver_id: '', valid_until: '', file: null }); setEditId(null); load()
      return
    }
    if (!f.file) return
    const ext = f.file.name.includes('.') ? f.file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g, '') : 'bin'
    const path = `company/${Date.now()}.${ext}`
    const { error: upErr } = await supabase.storage.from('docs').upload(path, f.file)
    if (upErr) { alert(upErr.message); return }
    const { error } = await supabase.from('documents').insert({
      doc_type: f.doc_type, title: f.title || f.file.name, file_url: path, valid_until: f.valid_until || null,
      vehicle_id: f.vehicle_id || null, driver_id: f.driver_id || null,
    })
    if (error) { alert(error.message); return }
    setF({ doc_type: 'fop_extract', title: '', vehicle_id: '', driver_id: '', valid_until: '', file: null }); load()
  }
  const open = async (d) => {
    const { data } = await supabase.storage.from('docs').createSignedUrl(d.file_url, 3600)
    if (data?.signedUrl) window.open(data.signedUrl, '_blank')
  }
  const remove = async (d) => {
    if (!confirm('Видалити документ?')) return
    await supabase.storage.from('docs').remove([d.file_url])
    await supabase.from('documents').delete().eq('id', d.id)
    load()
  }

  return (
    <div>
      <h1>Документи компанії</h1>
      <p className="muted">Статутні документи, техпаспорти, документи водіїв — завжди під рукою, щоб відправити замовнику.</p>
      <div className="panel">
        <div className="grid g4">
          <div><label>Тип</label>
            <select value={f.doc_type} onChange={e => setF({ ...f, doc_type: e.target.value })}>
              {STAT_DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select></div>
          <div><label>Назва (необов'язково)</label><input value={f.title} onChange={e => setF({ ...f, title: e.target.value })} /></div>
          <div><label>Дійсний до (для страховок, дозволів)</label><input type="date" value={f.valid_until} onChange={e => setF({ ...f, valid_until: e.target.value })} /></div>
          <div><label>Машина (якщо стосується)</label>
            <select value={f.vehicle_id} onChange={e => setF({ ...f, vehicle_id: e.target.value })}>
              <option value="">—</option>
              {vehicles.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select></div>
          <div><label>Водій (якщо стосується)</label>
            <select value={f.driver_id} onChange={e => setF({ ...f, driver_id: e.target.value })}>
              <option value="">—</option>
              {drivers.map(d => <option key={d.id} value={d.id}>{d.full_name}</option>)}
            </select></div>
        </div>
        <div className="row" style={{ marginTop: 10 }}>
          <input type="file" style={{ width: 'auto' }} onChange={e => setF({ ...f, file: e.target.files[0] })} />
          <button className="small" onClick={upload}>{editId ? 'Зберегти зміни' : 'Завантажити'}</button>
        </div>
      </div>
            <div className="panel">
        <h2 style={{ marginTop: 0 }}>Реквізити компанії</h2>
        <p className="muted">Використовуються в рахунках і актах.</p>
        <div className="grid g4">
          <div><label>Назва (ФОП/ТОВ)</label><input value={comp.name || ''} onChange={setC('name')} /></div>
          <div><label>ЄДРПОУ / РНОКПП</label><input value={comp.edrpou || ''} onChange={setC('edrpou')} /></div>
          <div><label>Адреса</label><input value={comp.address || ''} onChange={setC('address')} /></div>
          <div><label>IBAN</label><input value={comp.iban || ''} onChange={setC('iban')} /></div>
          <div><label>Банк</label><input value={comp.bank || ''} onChange={setC('bank')} /></div>
          <div><label>Керівник / підписант</label><input value={comp.director || ''} onChange={setC('director')} /></div>
          <div><label>Телефон</label><input value={comp.phone || ''} onChange={setC('phone')} /></div>
          <div><label>ПДВ</label><select value={comp.vat_mode || 'none'} onChange={setC('vat_mode')}>
            <option value="none">Без ПДВ</option><option value="included">З ПДВ 20% (у ціні)</option>
          </select></div>
        </div>
        <div style={{ marginTop: 10 }}><button className="small" onClick={saveComp}>Зберегти реквізити</button></div>
      </div>

      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Шаблони договору і заявки (експедиція) <button className="small secondary" onClick={() => setTplOpen(!tplOpen)}>{tplOpen ? 'Сховати' : 'Редагувати'}</button></h2>
        {tplOpen && <>
          <p className="muted">Формуються з картки рейсу в режимі «експедиція». Плейсхолдери підставляються з рейсу і реквізитів: {PLACEHOLDERS.join(' ')}. Шаблони орієнтовні — перед використанням варто погодити з вашим юристом.</p>
          {Object.keys(DEFAULT_TEMPLATES).map(id => (
            <div key={id} style={{ marginBottom: 16 }}>
              <label><b>{DEFAULT_TEMPLATES[id].title}</b></label>
              <textarea value={tpls[id]} onChange={e => setTpls({ ...tpls, [id]: e.target.value })} rows={14} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
              <div className="row" style={{ marginTop: 6 }}>
                <button className="small" onClick={() => saveTpl(id)}>Зберегти шаблон</button>
                <button className="small secondary" onClick={() => resetTpl(id)}>Відновити стандартний</button>
              </div>
            </div>
          ))}
        </>}
      </div>
      <div className="panel">
        <h2 style={{ marginTop: 0 }}>Печатка і підпис</h2>
        <p className="muted">PNG з прозорим фоном. Використовуються для накладання на PDF заявок у картці рейсу.</p>
        <div className="grid g2">
          <div>
            <label>Печатка {assets.stamp && <span className="badge ok">завантажено</span>}</label>
            <input type="file" accept="image/*" onChange={e => uploadAsset('stamp', e.target.files[0])} />
          </div>
          <div>
            <label>Підпис {assets.sign && <span className="badge ok">завантажено</span>}</label>
            <input type="file" accept="image/*" onChange={e => uploadAsset('sign', e.target.files[0])} />
          </div>
        </div>
      </div>
      <div className="panel">
        <table>
          <thead><tr><th>Тип</th><th>Назва</th><th>Машина / Водій</th><th></th><th></th></tr></thead>
          <tbody>{docs.map(d => (
            <tr key={d.id} {...longPress(() => edit(d))}>
              <td><span className="badge">{docTypeLabel(d.doc_type)}</span></td>
              <td><a onClick={() => open(d)} style={{ cursor: 'pointer' }}>{d.title}</a></td>
              <td>{d.vehicle?.name || d.driver?.full_name || '—'}</td>
              <td><button className="small secondary" onClick={() => open(d)}>Відкрити</button> <button className="small secondary" onClick={() => edit(d)}>Редагувати</button></td>
              <td><button className="small danger-btn" onClick={() => remove(d)}>Видалити</button></td>
            </tr>
          ))}</tbody>
        </table>
        {docs.length === 0 && <p className="muted">Завантажте перший документ.</p>}
      </div>
    </div>
  )
}
