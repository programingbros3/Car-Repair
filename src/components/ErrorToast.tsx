import { useEffect, useState } from 'react'

/* ════════════════════════════════════════
   ErrorToast — عرض رسائل الخطأ كـ toast
   بديل لـ alert() الذي يجمّد التطبيق
════════════════════════════════════════ */

type Toast = { id: number; message: string }
let nextId = 1

export default function ErrorToast() {
  const [toasts, setToasts] = useState<Toast[]>([])

  useEffect(() => {
    const handler = (e: Event) => {
      const msg = (e as CustomEvent<string>).detail
      const id = nextId++
      setToasts(prev => [...prev, { id, message: msg }])
      setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 8000)
    }
    window.addEventListener('app-error', handler)
    return () => window.removeEventListener('app-error', handler)
  }, [])

  if (!toasts.length) return null

  return (
    <div style={{
      position: 'fixed', bottom: '1.5rem', left: '50%', transform: 'translateX(-50%)',
      zIndex: 9999, display: 'flex', flexDirection: 'column', gap: '0.5rem',
      alignItems: 'center', pointerEvents: 'none',
    }}>
      {toasts.map(t => (
        <div key={t.id} style={{
          background: '#c0392b', color: '#fff', borderRadius: '8px',
          padding: '0.8rem 1.2rem', maxWidth: '480px', fontSize: '0.9rem',
          boxShadow: '0 4px 16px rgba(0,0,0,0.3)', pointerEvents: 'auto',
          direction: 'rtl', textAlign: 'right', whiteSpace: 'pre-line',
          display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
        }}>
          <span style={{ flex: 1 }}>{t.message}</span>
          <button
            onClick={() => setToasts(prev => prev.filter(x => x.id !== t.id))}
            style={{
              background: 'none', border: 'none', color: '#fff', cursor: 'pointer',
              fontSize: '1rem', padding: 0, lineHeight: 1, opacity: 0.8, flexShrink: 0,
            }}>✕</button>
        </div>
      ))}
    </div>
  )
}
