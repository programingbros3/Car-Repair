import { useEffect } from 'react'
import { dbService } from '../services/db'

const CHECK_INTERVAL_MS = 5_000
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'mousedown', 'scroll', 'touchstart'] as const

/**
 * يقفل التطبيق تلقائياً (يستدعي onLock) بعد فترة خمول قابلة للتهيئة من
 * الإعدادات (dbService.auth.getAutoLockSettings) — لا يعمل إلا عندما
 * isUnlocked=true، ونفس آلية القفل الأولي (PasswordGate) بالضبط.
 */
export function useAutoLock(isUnlocked: boolean, onLock: () => void): void {
  useEffect(() => {
    if (!isUnlocked) return

    let cancelled = false
    let settings = { enabled: true, minutes: 10 }
    let lastActivity = Date.now()

    dbService.auth.getAutoLockSettings().then(s => { if (!cancelled) settings = s })

    const bump = () => { lastActivity = Date.now() }
    ACTIVITY_EVENTS.forEach(evt => window.addEventListener(evt, bump))

    const interval = setInterval(() => {
      if (!settings.enabled) return
      if (Date.now() - lastActivity >= settings.minutes * 60_000) onLock()
    }, CHECK_INTERVAL_MS)

    return () => {
      cancelled = true
      ACTIVITY_EVENTS.forEach(evt => window.removeEventListener(evt, bump))
      clearInterval(interval)
    }
  }, [isUnlocked, onLock])
}
