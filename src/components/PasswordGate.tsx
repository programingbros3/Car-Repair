import { useEffect, useState } from 'react'
import { dbService } from '../services/db'
import PasswordInput from './PasswordInput'

/* ════════════════════════════════════════
   PasswordGate — shown before the whole app
   ────────────────────────────────────────
   التحقق يتم عبر IPC (dbService.auth.verifyPassword) — كلمة السر تُقارَن
   كـ hash في الـ main process، وليس محلياً في الـ Renderer.
════════════════════════════════════════ */
type PasswordGateProps = { onUnlock: () => void }

export default function PasswordGate({ onUnlock }: PasswordGateProps) {
  const [password, setPassword]     = useState('')
  const [error, setError]           = useState('')
  const [checking, setChecking]     = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [remainingSec, setRemainingSec] = useState(0)

  /* M2: أول تشغيل بلا كلمة سر ⇒ شاشة تعيين كلمة السر بدل تسجيل الدخول */
  const [mode, setMode] = useState<'loading' | 'setup' | 'login'>('loading')
  const [confirmPassword, setConfirmPassword] = useState('')

  useEffect(() => {
    dbService.auth.needsPasswordSetup()
      .then(needs => setMode(needs ? 'setup' : 'login'))
      .catch(() => setMode('login'))
  }, [])

  useEffect(() => {
    if (!lockedUntil) return
    const tick = () => {
      const secs = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000))
      setRemainingSec(secs)
      if (secs <= 0) setLockedUntil(null)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [lockedUntil])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (checking || lockedUntil) return
    setChecking(true)
    try {
      const result = await dbService.auth.verifyPassword(password)
      if (result.valid) {
        setError('')
        onUnlock()
        return
      }
      if (result.lockedUntil) {
        setLockedUntil(result.lockedUntil)
        setError('')
      } else {
        setError('كلمة السر غير صحيحة')
      }
    } catch {
      setError('تعذّر التحقق من كلمة السر')
    } finally {
      setChecking(false)
    }
  }

  /* M2: تعيين كلمة السر لأول مرة */
  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault()
    if (checking) return
    if (password.length < 6) { setError('كلمة السر يجب أن تكون 6 أحرف على الأقل'); return }
    if (password !== confirmPassword) { setError('كلمة السر غير متطابقة مع التأكيد'); return }
    setChecking(true)
    try {
      await dbService.auth.setInitialPassword(password)
      setError('')
      onUnlock()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذّر تعيين كلمة السر')
    } finally {
      setChecking(false)
    }
  }

  if (mode === 'loading') {
    return (
      <div style={overlay}>
        <div style={{ color: '#1E2A38', fontSize: '1rem' }}>جارٍ التحميل…</div>
      </div>
    )
  }

  if (mode === 'setup') {
    return (
      <div style={overlay}>
        <form style={card} onSubmit={handleSetup}>
          <div style={logo}>كراج الخط الأخضر</div>
          <p style={subtitle}>مرحباً بك — عيّن كلمة سر للدخول (أول تشغيل)</p>
          <PasswordInput
            value={password}
            onChange={v => { setPassword(v); setError('') }}
            placeholder="كلمة السر الجديدة (6 أحرف على الأقل)"
            autoFocus
            inputStyle={{ ...inputBase, ...(error ? inputErr : undefined) }}
          />
          <PasswordInput
            value={confirmPassword}
            onChange={v => { setConfirmPassword(v); setError('') }}
            placeholder="تأكيد كلمة السر"
            inputStyle={{ ...inputBase, ...(error ? inputErr : undefined) }}
          />
          {error && <span style={errorText}>{error}</span>}
          <button type="submit" style={button} disabled={checking || !password || !confirmPassword}>
            {checking ? 'جارٍ الحفظ…' : 'تعيين كلمة السر والدخول'}
          </button>
        </form>
      </div>
    )
  }

  return (
    <div style={overlay}>
      <form style={card} onSubmit={handleSubmit}>
        <div style={logo}>كراج الخط الأخضر</div>
        <p style={subtitle}>الرجاء إدخال كلمة السر للدخول</p>
        <PasswordInput
          value={password}
          onChange={v => { setPassword(v); setError('') }}
          placeholder="كلمة السر"
          autoFocus
          inputStyle={{ ...inputBase, ...(error ? inputErr : undefined) }}
        />
        {error && <span style={errorText}>{error}</span>}
        {lockedUntil && (
          <span style={errorText}>تم تجاوز عدد المحاولات المسموح — حاول مرة أخرى بعد {remainingSec} ثانية</span>
        )}
        <button type="submit" style={button} disabled={checking || !!lockedUntil}>
          {checking ? 'جارٍ التحقق…' : 'دخول'}
        </button>
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

const inputBase: React.CSSProperties = {
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
