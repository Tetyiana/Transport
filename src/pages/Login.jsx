import { useState } from 'react'
import { supabase } from '../supabase'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)

  const submit = async () => {
    setBusy(true); setErr('')
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) setErr('Невірна пошта або пароль')
    setBusy(false)
  }

  return (
    <div className="login-wrap">
      <div className="panel login-box">
        <h1>Transport</h1>
        <div className="grid">
          <div>
            <label>Пошта</label>
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" />
          </div>
          <div>
            <label>Пароль</label>
            <input value={password} onChange={e => setPassword(e.target.value)} type="password"
              onKeyDown={e => e.key === 'Enter' && submit()} />
          </div>
          <button onClick={submit} disabled={busy}>Увійти</button>
          {err && <div className="err">{err}</div>}
        </div>
      </div>
    </div>
  )
}
