import { useEffect, useState } from 'react'
import { dbService } from '../services/db'
import { toSimpleError } from '../utils/notify'
import type { LicenseStatus } from '../db/types'

/* ════════════════════════════════════════
   LicenseGate — شاشة انتهاء التجربة والتفعيل الدائم (Ed25519)
   ────────────────────────────────────────
   بنفس تصميم PasswordGate: تعرض كود الجهاز مع زر نسخ، وحقل لإدخال
   كود التفعيل الذي يولّده المطوّر via tools/keygen.mjs.
   القفل نفسه مفروض في الـ main process (يرفض كل مسارات IPC الحساسة).
════════════════════════════════════════ */
type LicenseGateProps = {
  hwid: string | null
  isExpired: boolean
  onActivated: (nextStatus: LicenseStatus) => void
  onCancel?: () => void
}

export default function LicenseGate({ hwid, isExpired, onActivated, onCancel }: LicenseGateProps) {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [garageName, setGarageName] = useState('GarageManagerPro')
  const [garageLogo, setGarageLogo] = useState('')

  useEffect(() => {
    dbService.garageIdentity.get()
      .then(({ garage_name, garage_logo }) => {
        if (garage_name.trim()) setGarageName(garage_name.trim())
        if (garage_logo.trim()) setGarageLogo(garage_logo.trim())
      })
      .catch(() => {})
  }, [])

  const handleCopyHwid = async () => {
    if (!hwid) return
    try {
      await navigator.clipboard.writeText(hwid)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('تعذّر النسخ التلقائي — يمكنك تحديد الكود ونسخه يدوياً')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (submitting) return
    const trimmed = code.trim()
    if (!trimmed) {
      setError('أدخل كود التفعيل أولاً')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const next = await dbService.license.activate(trimmed)
      onActivated(next)
    } catch (err) {
      setError(toSimpleError(err, 'كود التفعيل غير صحيح أو لا يطابق هذا الجهاز'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div style={overlay}>
      <form style={card} onSubmit={handleSubmit}>
        <div style={logo}>
          {garageLogo && (
            <img
              src={garageLogo}
              alt={garageName}
              style={{ maxHeight: 56, maxWidth: '100%', objectFit: 'contain', display: 'block', margin: '0 auto 0.5rem' }}
            />
          )}
          <span>{garageName}</span>
        </div>

        <div style={badge}>
          {isExpired ? 'انتهت الفترة التجريبية' : 'تفعيل النسخة الدائمة'}
        </div>

        <p style={subtitle}>
          {isExpired
            ? 'انتهت مدة التجربة المجانية (7 أيام). أرسل كود الجهاز أدناه للمطوّر للحصول على كود التفعيل الدائم.'
            : 'أرسل كود الجهاز أدناه للمطوّر للحصول على كود التفعيل الدائم وإزالة شريط النسخة التجريبية.'}
        </p>

        <div style={fieldGroup}>
          <label style={fieldLabel}>كود الجهاز (HWID)</label>
          <div style={hwidRow}>
            <input
              type="text"
              readOnly
              value={hwid ?? 'غير متوفر'}
              onClick={e => e.currentTarget.select()}
              style={hwidInput}
            />
            <button
              type="button"
              onClick={handleCopyHwid}
              disabled={!hwid}
              style={copyBtn}
            >
              {copied ? 'تم النسخ ✓' : 'نسخ'}
            </button>
          </div>
        </div>

        <div style={fieldGroup}>
          <label style={fieldLabel}>كود التفعيل</label>
          <textarea
            rows={3}
            value={code}
            onChange={e => { setCode(e.target.value); setError('') }}
            placeholder="ألصق كود التفعيل هنا..."
            autoFocus
            style={{ ...codeInput, ...(error ? inputErr : undefined) }}
          />
        </div>

        {error && <span style={errorText}>{error}</span>}

        <button type="submit" style={button} disabled={submitting || !code.trim()}>
          {submitting ? 'جارٍ التحقق من التفعيل…' : 'تفعيل البرنامج'}
        </button>

        {onCancel && !isExpired && (
          <button type="button" style={secondaryBtn} onClick={onCancel} disabled={submitting}>
            العودة للنسخة التجريبية
          </button>
        )}
      </form>
    </div>
  )
}

/* ── Inline styles (نفس ألوان وهوية PasswordGate) ── */
const overlay: React.CSSProperties = {
  position: 'fixed', inset: 0, direction: 'rtl',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: '#F5F5F5', zIndex: 2500, padding: '1rem',
}

const card: React.CSSProperties = {
  background: '#1E2A38', borderRadius: 14, padding: '2.25rem 2rem',
  width: '100%', maxWidth: 440, boxShadow: '0 12px 40px rgba(0,0,0,0.25)',
  display: 'flex', flexDirection: 'column', gap: '0.85rem', alignItems: 'stretch',
}

const logo: React.CSSProperties = {
  fontSize: '2rem', fontWeight: 700, color: '#2ECC71',
  textAlign: 'center', letterSpacing: '0.5px',
}

const badge: React.CSSProperties = {
  alignSelf: 'center',
  background: 'rgba(231, 76, 60, 0.16)',
  border: '1px solid rgba(231, 76, 60, 0.45)',
  color: '#ff8a80',
  padding: '0.35rem 0.9rem',
  borderRadius: 999,
  fontSize: '0.95rem',
  fontWeight: 700,
}

const subtitle: React.CSSProperties = {
  fontSize: '0.88rem', color: 'rgba(255,255,255,0.78)',
  textAlign: 'center', margin: 0, lineHeight: 1.55,
}

const fieldGroup: React.CSSProperties = {
  display: 'flex', flexDirection: 'column', gap: '0.35rem',
}

const fieldLabel: React.CSSProperties = {
  fontSize: '0.82rem', color: 'rgba(255,255,255,0.75)', fontWeight: 600,
}

const hwidRow: React.CSSProperties = {
  display: 'flex', gap: '0.5rem', alignItems: 'stretch',
}

const hwidInput: React.CSSProperties = {
  flex: 1, minWidth: 0, fontFamily: 'monospace', fontSize: '0.85rem',
  padding: '0.6rem 0.75rem', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.18)',
  background: 'rgba(255,255,255,0.08)', color: '#e2e8f0',
  direction: 'ltr', textAlign: 'left', outline: 'none',
}

const copyBtn: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '0.85rem', fontWeight: 700,
  padding: '0 0.95rem', borderRadius: 8, border: 'none',
  background: '#334155', color: '#fff', cursor: 'pointer', flexShrink: 0,
}

const codeInput: React.CSSProperties = {
  fontFamily: 'monospace', fontSize: '0.9rem', padding: '0.65rem 0.85rem',
  border: '1px solid rgba(255,255,255,0.18)', borderRadius: 8,
  background: '#fff', color: '#1e293b', outline: 'none',
  direction: 'ltr', textAlign: 'left', resize: 'vertical',
}

const inputErr: React.CSSProperties = {
  border: '1px solid #E74C3C', boxShadow: '0 0 0 2px rgba(231,76,60,0.2)',
}

const errorText: React.CSSProperties = {
  color: '#ff6b5e', fontSize: '0.85rem', fontWeight: 500, textAlign: 'center',
}

const button: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '1rem', fontWeight: 700,
  border: 'none', borderRadius: 8, padding: '0.72rem 1.2rem',
  background: '#2ECC71', color: '#fff', cursor: 'pointer', marginTop: '0.25rem',
}

const secondaryBtn: React.CSSProperties = {
  fontFamily: 'inherit', fontSize: '0.88rem', fontWeight: 600,
  border: '1px solid rgba(255,255,255,0.2)', borderRadius: 8, padding: '0.55rem 1rem',
  background: 'transparent', color: 'rgba(255,255,255,0.8)', cursor: 'pointer',
}
