import { useState } from 'react'
import { APP_PASSWORD } from '../utils/auth'

/* ════════════════════════════════════════
   PasswordGate — shown before the whole app
════════════════════════════════════════ */
type PasswordGateProps = { onUnlock: () => void }

export default function PasswordGate({ onUnlock }: PasswordGateProps) {
  const [password, setPassword] = useState('')
  const [error, setError]       = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (password === APP_PASSWORD) {
      setError('')
      onUnlock()
    } else {
      setError('كلمة السر غير صحيحة')
    }
  }

  return (
    <div style={overlay}>
      <form style={card} onSubmit={handleSubmit}>
        <div style={logo}>كراج</div>
        <p style={subtitle}>الرجاء إدخال كلمة السر للدخول</p>
        <input
          type="password"
          autoFocus
          value={password}
          onChange={e => { setPassword(e.target.value); setError('') }}
          placeholder="كلمة السر"
          style={{ ...input, ...(error ? inputErr : null) }}
        />
        {error && <span style={errorText}>{error}</span>}
        <button type="submit" style={button}>دخول</button>
      </form>
    </div>
  )
}

/* ── Inline styles (project colors, RTL, Tajawal via global font) ── */
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, direction: 'rtl',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#F5F5F5', zIndex: 2000, padding: '1rem',
}

const card: React.CSSProperties = {
  background: '#1E2A38', borderRadius: 14, padding: '2.5rem 2.25rem',
  width: '100%', maxWidth: 360, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  display: 'flex', flexDirection: 'column', gap: '0.85rem', alignItems: 'stretch',
}

const logo: React.CSSProperties = {
  fontSize: '2.4rem', fontWeight: 700, color: '#2ECC71',
  textAlign: 'center', letterSpacing: '1px',
}

const subtitle: React.CSSProperties = {
  fontSize: '0.92rem', color: 'rgba(255,255,255,0.7)',
  textAlign: 'center', margin: '0 0 0.5rem',
}

const input: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '1rem', padding: '0.7rem 0.9rem',
  border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8,
  background: '#fff', color: '#222', outline: 'none', direction: 'rtl',
}

const inputErr: React.CSSProperties = {
  border: '1px solid #E74C3C', boxShadow: '0 0 0 2px rgba(231,76,60,0.18)',
}

const errorText: React.CSSProperties = {
  color: '#ff6b5e', fontSize: '0.85rem', fontWeight: 500, textAlign: 'center',
}

const button: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '1rem', fontWeight: 700,
  border: 'none', borderRadius: 8, padding: '0.7rem 1.2rem',
  background: '#2ECC71', color: '#fff', cursor: 'pointer', marginTop: '0.35rem',
}
