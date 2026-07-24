import { useEffect, useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [mode, setMode] = useState('login') // login | signup | reset | newpass
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [company, setCompany] = useState('')
  const [msg, setMsg] = useState(null) // { ok, text }
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setMode('newpass')
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  const run = async (fn) => {
    setBusy(true); setMsg(null)
    try { await fn() } finally { setBusy(false) }
  }

  const login = () => run(async () => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setMsg({ ok: false, text: 'Невірна пошта або пароль' })
  })

  const signup = () => run(async () => {
    if (password.length < 8) { setMsg({ ok: false, text: 'Пароль — мінімум 8 символів' }); return }
    const { data, error } = await supabase.auth.signUp({
      email, password,
      options: { data: { company: company.trim() } },
    })
    if (error) { setMsg({ ok: false, text: error.message }); return }
    if (data.session) setMsg({ ok: true, text: 'Готово! Входимо…' })
    else setMsg({ ok: true, text: 'Перевірте пошту — ми надіслали лист для підтвердження реєстрації.' })
  })

  const reset = () => run(async () => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin })
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: 'Лист для зміни пароля надіслано. Відкрийте посилання з листа.' })
  })

  const setNewPass = () => run(async () => {
    if (password.length < 8) { setMsg({ ok: false, text: 'Пароль — мінімум 8 символів' }); return }
    const { error } = await supabase.auth.updateUser({ password })
    if (error) setMsg({ ok: false, text: error.message })
    else { setMsg({ ok: true, text: 'Пароль змінено' }); setMode('login') }
  })

  const enter = (fn) => (e) => e.key === 'Enter' && fn()

  return (
    <div className="login-wrap">
      <div className="panel login-box">
        <h1>TirKolija</h1>
        {mode !== 'newpass' && (
          <div className="row" style={{ marginBottom: 12 }}>
            <button className={`small ${mode === 'login' ? '' : 'secondary'}`} onClick={() => { setMode('login'); setMsg(null) }}>Вхід</button>
            <button className={`small ${mode === 'signup' ? '' : 'secondary'}`} onClick={() => { setMode('signup'); setMsg(null) }}>Реєстрація</button>
          </div>
        )}
        <div className="grid">
          {mode === 'newpass' ? (<>
            <div><label>Новий пароль</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password" onKeyDown={enter(setNewPass)} /></div>
            <button onClick={setNewPass} disabled={busy}>Зберегти пароль</button>
          </>) : (<>
            <div><label>Пошта</label>
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" autoComplete="email" /></div>
            {mode !== 'reset' && <div><label>Пароль</label>
              <input value={password} onChange={e => setPassword(e.target.value)} type="password"
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                onKeyDown={enter(mode === 'signup' ? signup : login)} /></div>}
            {mode === 'signup' && <div><label>Назва компанії</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="ФОП Іваненко / ТОВ Транс" /></div>}
            {mode === 'login' && <button onClick={login} disabled={busy}>Увійти</button>}
            {mode === 'signup' && <button onClick={signup} disabled={busy}>Створити акаунт</button>}
            {mode === 'reset' && <button onClick={reset} disabled={busy}>Надіслати лист</button>}
            {mode === 'login' && <a style={{ cursor: 'pointer' }} className="muted" onClick={() => { setMode('reset'); setMsg(null) }}>Забули пароль?</a>}
            {mode === 'reset' && <a style={{ cursor: 'pointer' }} className="muted" onClick={() => { setMode('login'); setMsg(null) }}>← До входу</a>}
          </>)}
          {msg && <div className={msg.ok ? 'muted' : 'err'}>{msg.text}</div>}
        </div>
      </div>
    </div>
  )
}
