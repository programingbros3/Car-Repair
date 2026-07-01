import { useState } from 'react'
import { APP_PASSWORD } from '../utils/auth'
import PasswordInput from './PasswordInput'

/* ════════════════════════════════════════
   ConfirmDialog — reusable confirm modal
   (optionally password-protected)
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

  const handleConfirm = () => {
    if (!requirePassword) { onConfirm(); return }
    if (!askPassword) { setAskPassword(true); return }
    if (password === APP_PASSWORD) {
      setError('')
      onConfirm()
    } else {
      setError('كلمة السر غير صحيحة')
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
          <p style={{ fontSize: '0.95rem', color: '#444', margin: askPassword ? '0 0 1rem' : 0 }}>{message}</p>
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
            </label>
          )}
        </div>
        <div className="mi-modal-footer">
          <button className="btn btn-danger" onClick={handleConfirm}>تأكيد</button>
          <button className="btn btn-ghost" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}
