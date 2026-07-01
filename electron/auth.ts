/* ════════════════════════════════════════════════════════════════════════
   auth.ts — كلمة سر التطبيق (hash)، القفل عند تجاوز المحاولات، القفل التلقائي
   عند الخمول، وسجل النشاط الخفيف — كل منطق الأمان في مكان واحد.
   ───────────────────────────────────────────────────────────────────────
   منفصل تماماً عن أي ميزة أخرى — بنفس نمط auto-backup.ts: يأخذ db كمعامل،
   يخزّن إعداداته في جدول app_settings (key TEXT PRIMARY KEY, value TEXT)
   الموجود أصلاً، ويُصدّر دوال تُستدعى من ipc-handlers.ts.

   قبل هذا التحديث كانت كلمة السر ثابتة نصياً (APP_PASSWORD في src/utils/auth.ts)
   وتُقارَن مباشرة في الـ Renderer — أي شخص يفتح DevTools يراها. الآن التحقق
   يتم هنا في الـ main process فقط، وكلمة السر تُخزَّن كـ bcrypt hash.
════════════════════════════════════════════════════════════════════════ */
import bcrypt from 'bcryptjs'
import type Database from 'better-sqlite3'
import type { ActivityLogRow, AutoLockSettings, PasswordVerifyResult } from '../src/db/types'
import { DEFAULT_PASSWORD } from '../src/utils/auth'

type DB = Database.Database

const KEYS = {
  passwordHash: 'app_password_hash',
  failedAttempts: 'auth_failed_attempts',
  lockoutUntil: 'auth_lockout_until',
  lockoutLevel: 'auth_lockout_level',
  autoLockEnabled: 'auto_lock_enabled',
  autoLockMinutes: 'auto_lock_minutes',
} as const

const SALT_ROUNDS = 10
const MAX_ATTEMPTS = 5
const LOCKOUT_DURATIONS_MS = [30_000, 60_000, 300_000] // 30 ثانية → دقيقة → 5 دقائق
const DEFAULT_AUTO_LOCK_ENABLED = true
const DEFAULT_AUTO_LOCK_MINUTES = 10
const MIN_PASSWORD_LENGTH = 6

/* ── قراءة/كتابة app_settings (نفس نمط auto-backup.ts) ── */
function getSetting(db: DB, key: string): string | null {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key=?`).get(key) as { value: string } | undefined
  return row ? row.value : null
}

function setSetting(db: DB, key: string, value: string | null): void {
  if (value === null) {
    db.prepare(`DELETE FROM app_settings WHERE key=?`).run(key)
    return
  }
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

/** يُستدعى مرة عند كل إطلاق (بعد initDB مباشرة) — no-op بعد أول مرة */
export function ensurePasswordSeeded(db: DB): void {
  if (getSetting(db, KEYS.passwordHash)) return
  setSetting(db, KEYS.passwordHash, bcrypt.hashSync(DEFAULT_PASSWORD, SALT_ROUNDS))
}

/* ── القفل عند تجاوز المحاولات ── */
export function getLockoutStatus(db: DB): { lockedUntil: number | null; attemptsRemaining: number } {
  const lockoutUntil = Number(getSetting(db, KEYS.lockoutUntil) ?? 0)
  if (lockoutUntil > Date.now()) {
    return { lockedUntil: lockoutUntil, attemptsRemaining: 0 }
  }
  const failed = Number(getSetting(db, KEYS.failedAttempts) ?? 0)
  return { lockedUntil: null, attemptsRemaining: Math.max(0, MAX_ATTEMPTS - failed) }
}

function registerFailedAttempt(db: DB): { lockedUntil: number | null; attemptsRemaining: number } {
  const failed = Number(getSetting(db, KEYS.failedAttempts) ?? 0) + 1

  if (failed >= MAX_ATTEMPTS) {
    const level = Number(getSetting(db, KEYS.lockoutLevel) ?? 0)
    const duration = LOCKOUT_DURATIONS_MS[Math.min(level, LOCKOUT_DURATIONS_MS.length - 1)]
    const lockedUntil = Date.now() + duration
    setSetting(db, KEYS.lockoutUntil, String(lockedUntil))
    setSetting(db, KEYS.lockoutLevel, String(level + 1))
    setSetting(db, KEYS.failedAttempts, '0')
    return { lockedUntil, attemptsRemaining: 0 }
  }

  setSetting(db, KEYS.failedAttempts, String(failed))
  return { lockedUntil: null, attemptsRemaining: MAX_ATTEMPTS - failed }
}

function clearLockout(db: DB): void {
  setSetting(db, KEYS.failedAttempts, '0')
  setSetting(db, KEYS.lockoutLevel, '0')
  setSetting(db, KEYS.lockoutUntil, null)
}

/** يتحقق من كلمة السر مقابل الـ hash المخزَّن، مع احترام القفل المؤقت الحالي */
export function verifyPassword(db: DB, password: string): PasswordVerifyResult {
  const status = getLockoutStatus(db)
  if (status.lockedUntil) return { valid: false, ...status }

  const hash = getSetting(db, KEYS.passwordHash) ?? ''
  const valid = hash ? bcrypt.compareSync(password, hash) : false

  if (valid) {
    clearLockout(db)
    return { valid: true, lockedUntil: null, attemptsRemaining: MAX_ATTEMPTS }
  }

  return { valid: false, ...registerFailedAttempt(db) }
}

/** يغيّر كلمة السر بعد التحقق من الحالية (يفيد من نفس منطق القفل في verifyPassword) */
export function changePassword(db: DB, oldPassword: string, newPassword: string): void {
  const result = verifyPassword(db, oldPassword)
  if (!result.valid) {
    throw new Error(
      result.lockedUntil ? 'محاولات كثيرة خاطئة — حاول مرة أخرى لاحقاً' : 'كلمة السر الحالية غير صحيحة',
    )
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`كلمة السر الجديدة يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل`)
  }
  setSetting(db, KEYS.passwordHash, bcrypt.hashSync(newPassword, SALT_ROUNDS))
}

/* ── القفل التلقائي عند الخمول ── */
export function getAutoLockSettings(db: DB): AutoLockSettings {
  const enabledRaw = getSetting(db, KEYS.autoLockEnabled)
  return {
    enabled: enabledRaw === null ? DEFAULT_AUTO_LOCK_ENABLED : enabledRaw === '1',
    minutes: Number(getSetting(db, KEYS.autoLockMinutes) ?? DEFAULT_AUTO_LOCK_MINUTES) || DEFAULT_AUTO_LOCK_MINUTES,
  }
}

export function updateAutoLockSettings(db: DB, updates: Partial<AutoLockSettings>): AutoLockSettings {
  if (updates.enabled !== undefined) setSetting(db, KEYS.autoLockEnabled, updates.enabled ? '1' : '0')
  if (updates.minutes !== undefined) {
    setSetting(db, KEYS.autoLockMinutes, String(Math.max(1, Math.floor(updates.minutes))))
  }
  return getAutoLockSettings(db)
}

/* ── سجل النشاط (توثيق العمليات الحساسة — تعديل/حذف) ── */
export function logActivity(
  db: DB,
  actionType: string,
  entityType: string,
  entityId: number | null,
  details?: string,
): void {
  db.prepare(`
    INSERT INTO activity_log (action_type, entity_type, entity_id, details)
    VALUES (?, ?, ?, ?)
  `).run(actionType, entityType, entityId, details ?? null)
}

export function getActivityLog(db: DB, limit = 200): ActivityLogRow[] {
  return db.prepare(`
    SELECT * FROM activity_log ORDER BY id DESC LIMIT ?
  `).all(limit) as ActivityLogRow[]
}
