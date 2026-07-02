import { useEffect, useState } from 'react'
import { dbService } from '../services/db'
import PasswordInput from './PasswordInput'

/* ════════════════════════════════════════
   ConfirmDialog — reusable confirm modal
   (optionally password-protected)
   ────────────────────────────────────────
   التحقق يتم عبر IPC (dbService.auth.verifyPassword) — كلمة السر تُقارَن
   كـ hash في الـ main process، وليس محلياً في الـ Renderer.
════════════════════════════════════════ */
type ConfirmDialogProps = {
  title: string
  message: string
  onConfirm: () => void
  onCancel: () => void
  requirePassword?: boolean
}

export default function ConfirmDialog({
  title, message, onConfirm, onCancel, requirePassword = true,
}: ConfirmDialogProps) {
  const [askPassword, setAskPassword] = useState(false)
  const [password, setPassword]       = useState('')
  const [error, setError]             = useState('')
  const [checking, setChecking]       = useState(false)
  const [lockedUntil, setLockedUntil] = useState<number | null>(null)
  const [remainingSec, setRemainingSec] = useState(0)

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

  const handleConfirm = async () => {
    if (!requirePassword) { onConfirm(); return }
    if (!askPassword) { setAskPassword(true); return }
    if (checking || lockedUntil) return
    setChecking(true)
    try {
      const result = await dbService.auth.verifyPassword(password)
      if (result.valid) {
        setError('')
        onConfirm()
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

  return (
    <div className="mi-modal-overlay" onClick={onCancel}>
      <div className="mi-modal mi-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="mi-modal-header">
          <h3>{title}</h3>
          <button className="mi-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="mi-modal-body">
          <p style={{ fontSize: '0.95rem', color: '#444', margin: askPassword ? '0 0 1rem' : 0, whiteSpace: 'pre-line' }}>{message}</p>
          {askPassword && (
            <label className="mi-field">
              <span>أدخل كلمة السر للتأكيد</span>
              <PasswordInput
                value={password}
                onChange={v => { setPassword(v); setError('') }}
                onKeyDown={e => { if (e.key === 'Enter') handleConfirm() }}
                placeholder="كلمة السر"
                autoFocus
                inputClassName={error ? 'mi-input-err' : ''}
              />
              {error && <span className="mi-err">{error}</span>}
              {lockedUntil && (
                <span className="mi-err">تم تجاوز عدد المحاولات المسموح — حاول مرة أخرى بعد {remainingSec} ثانية</span>
              )}
            </label>
          )}
        </div>
        <div className="mi-modal-footer">
          <button className="btn btn-danger" onClick={handleConfirm} disabled={checking || !!lockedUntil}>
            {checking ? 'جارٍ التحقق…' : 'تأكيد'}
          </button>
          <button className="btn btn-ghost" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}
