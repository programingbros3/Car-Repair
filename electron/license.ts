/* ════════════════════════════════════════════════════════════════════════
   license.ts — نظام الترخيص:
     1) التراخيص الدائمة الحالية (HWID + HMAC + علامة خارجية) — تبقى كما هي تماماً
        دون أي تغيير على صيغتها حتى يواصل العملاء المرخّصون العمل بلا انقطاع.
     2) فترة تجريبية 7 أيام للتركيبات الجديدة غير المرخّصة:
        • تاريخ البداية موقّع بـ (HWID + HMAC) ومخزَّن في app_settings،
          والـ Registry، والملف المخفي — عند الإقلاع يُعتمد أقدم تاريخ صالح
          حتى لا يُصفَّر العدّاد بحذف قاعدة البيانات.
        • تسجيل آخر وقت تشغيل موقّعاً (HWID + HMAC) — إذا رجّع المستخدم ساعة
          الجهاز للخلف يُحسب من آخر وقت مسجّل (لا يتناقص الزمن).
     3) التفعيل الدائم عبر توقيع Ed25519 لكود الجهاز (offline 100%) — المفتاح
        العام داخل التطبيق فقط والخاص عند المطوّر (tools/keygen.mjs).
     4) عند تعذّر قراءة HWID لا يُقفل العميل — تحذير فقط (fail-open).
   ════════════════════════════════════════════════════════════════════════ */
import { createRequire } from 'node:module'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import type Database from 'better-sqlite3'
import type { LicenseStatus, LicenseStatusKind } from '../src/db/types'

const nodeRequire = createRequire(import.meta.url)

type DB = Database.Database

/* H4: سر الترخيص يُحقَن وقت البناء عبر define في vite.config.ts */
declare const __LICENSE_SECRET__: string
const LICENSE_SECRET =
  typeof __LICENSE_SECRET__ !== 'undefined'
    ? __LICENSE_SECRET__
    : (process.env.GARAGE_LICENSE_SECRET ?? 'DEV_ONLY_INSECURE_LICENSE_SECRET_do_not_ship')

/* المفتاح العام Ed25519 للتحقق من أكواد التفعيل (المفتاح الخاص عند المطوّر فقط) */
declare const __LICENSE_PUBLIC_KEY__: string
const DEFAULT_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEApu4+yUdBmiBgh4FqvYlSLYIOflsaXzGHDZS92WY1Nt4=
-----END PUBLIC KEY-----`

const LICENSE_PUBLIC_KEY =
  typeof __LICENSE_PUBLIC_KEY__ !== 'undefined'
    ? __LICENSE_PUBLIC_KEY__
    : DEFAULT_PUBLIC_KEY

const TRIAL_DAYS = 7
const DAY_MS = 24 * 60 * 60 * 1000
const TRIAL_DURATION_MS = TRIAL_DAYS * DAY_MS
const LAST_SEEN_SYNC_INTERVAL_MS = 60_000

const KEYS = {
  // مفاتيح الترخيص الدائم القديم — لا تُغيَّر أبداً
  boundHwid: 'license_bound_hwid',
  signature: 'license_signature',
  // مفاتيح الفترة التجريبية والتفعيل الجديد (Ed25519)
  trialStart: 'trial_start',
  trialLast: 'trial_last',
  activationCode: 'license_activation_code',
} as const

// مسار سجل ويندوز (نفس المسار والقيمة القديمة 'lic' + قيم التجربة والتفعيل)
const REGISTRY_PATH = 'HKCU\\Software\\GarageManagerPro'
const REG_VALUES = {
  legacyMark: 'lic',
  trialStart: 'tr_s',
  trialLast: 'tr_l',
  activationCode: 'act',
} as const

const HIDDEN_FILES = {
  legacyMark: '.gmp-lic',
  trialStart: '.gmp-trs',
  trialLast: '.gmp-trl',
  activationCode: '.gmp-act',
} as const

// القنوات المسموحة فقط عندما يكون البرنامج مقفولاً بعد انتهاء التجربة
const LICENSE_LOCK_ALLOWED_CHANNELS = new Set<string>([
  'license:getStatus',
  'license:activate',
  'garageIdentity:get',
])

type InternalLicenseState = LicenseStatus & {
  trialStartMs: number | null
  maxLastMs: number | null
  lastPersistedAt: number
}

let licenseEnforced = false
let cachedState: InternalLicenseState | null = null

/* ── أدوات قاعدة البيانات ──────────────────────────────────────────────── */
function getSetting(db: DB, key: string): string | null {
  const row = db.prepare(`SELECT value FROM app_settings WHERE key=?`).get(key) as { value: string } | undefined
  return row ? row.value : null
}

function setSetting(db: DB, key: string, value: string): void {
  db.prepare(`
    INSERT INTO app_settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, value)
}

/* ── أدوات التوقيع والتحقق ──────────────────────────────────────────────── */
function sign(hwid: string): string {
  return crypto.createHmac('sha256', LICENSE_SECRET).update(hwid).digest('hex')
}

function signTimestamp(kind: 'trial_start' | 'trial_last', hwid: string, ts: number): string {
  const mac = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(`${kind}:${hwid}:${ts}`)
    .digest('hex')
  return `${ts}.${mac}`
}

function verifySignedTimestamp(kind: 'trial_start' | 'trial_last', raw: string | null, hwid: string): number | null {
  if (!raw) return null
  const parts = raw.trim().split('.')
  if (parts.length !== 2) return null
  const [tsStr, mac] = parts
  if (!/^\d+$/.test(tsStr) || !/^[0-9a-f]{64}$/i.test(mac)) return null
  const ts = Number(tsStr)
  if (!Number.isSafeInteger(ts) || ts <= 0) return null

  const expected = crypto
    .createHmac('sha256', LICENSE_SECRET)
    .update(`${kind}:${hwid}:${ts}`)
    .digest('hex')

  const actualBuf = Buffer.from(mac.toLowerCase(), 'hex')
  const expectedBuf = Buffer.from(expected, 'hex')
  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return null
  }
  return ts
}

function normalizeActivationCode(raw: string): string {
  return String(raw ?? '').replace(/\s+/g, '').trim()
}

function verifyActivationCode(hwid: string, rawCode: string | null): boolean {
  if (!rawCode) return false
  try {
    const cleaned = normalizeActivationCode(rawCode)
    if (!cleaned) return false
    const sigBuf = Buffer.from(cleaned, 'base64url')
    if (sigBuf.length !== 64) return false

    // نقبل مطابقة HWID كما هو أو بصيغة lowercase لتحمّل اختلاف حالة الأحرف عند النسخ
    const candidates = Array.from(new Set([hwid, hwid.trim().toLowerCase()]))
    return candidates.some(candidate =>
      crypto.verify(null, Buffer.from(candidate, 'utf8'), LICENSE_PUBLIC_KEY, sigBuf),
    )
  } catch {
    return false
  }
}

export function getCurrentHwid(): string | null {
  try {
    const { machineIdSync } = nodeRequire('node-machine-id') as { machineIdSync: (original?: boolean) => string }
    const id = machineIdSync(true)
    return id ? String(id).trim() : null
  } catch (err) {
    console.error('تعذّرت قراءة معرّف الجهاز (HWID):', err)
    return null
  }
}

/* ── أدوات التخزين المتعدد (الملف المخفي + سجل ويندوز + app_settings) ─── */
function hiddenFilePath(fileName: string): string {
  return path.join(app.getPath('userData'), fileName)
}

function readHiddenFile(fileName: string): string | null {
  try {
    const p = hiddenFilePath(fileName)
    if (fs.existsSync(p)) {
      const v = fs.readFileSync(p, 'utf-8').trim()
      if (v) return v
    }
  } catch { /* تجاهل */ }
  return null
}

function writeHiddenFile(fileName: string, value: string): void {
  try {
    const p = hiddenFilePath(fileName)
    fs.mkdirSync(path.dirname(p), { recursive: true })
    fs.writeFileSync(p, value, { encoding: 'utf-8' })
  } catch { /* تجاهل */ }
}

function readRegistryValue(valueName: string): string | null {
  if (process.platform !== 'win32') return null
  try {
    const out = execFileSync('reg', ['query', REGISTRY_PATH, '/v', valueName], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    const re = new RegExp(`^\\s*${valueName}\\s+REG_SZ\\s+([^\\r\\n]+)`, 'im')
    const m = out.match(re)
    return m ? m[1].trim() : null
  } catch {
    return null
  }
}

function writeRegistryValue(valueName: string, value: string): void {
  if (process.platform !== 'win32') return
  try {
    execFileSync('reg', ['add', REGISTRY_PATH, '/v', valueName, '/t', 'REG_SZ', '/d', value, '/f'], {
      stdio: 'ignore',
    })
  } catch { /* تجاهل */ }
}

function readTripleStore(db: DB, dbKey: string, regName: string, fileName: string): [string | null, string | null, string | null] {
  return [
    getSetting(db, dbKey),
    readRegistryValue(regName),
    readHiddenFile(fileName),
  ]
}

function syncTripleStore(
  db: DB,
  dbKey: string,
  regName: string,
  fileName: string,
  value: string,
  current?: [string | null, string | null, string | null],
): void {
  const [inDb, inReg, inFile] = current ?? [null, null, null]
  if (inDb !== value) setSetting(db, dbKey, value)
  if (inReg !== value) writeRegistryValue(regName, value)
  if (inFile !== value) writeHiddenFile(fileName, value)
}

/* ── العلامة الخارجية للترخيص الدائم القديم (بدون أي تغيير على الصيغة) ── */
function readLegacyExternalMark(): string | null {
  const fromFile = readHiddenFile(HIDDEN_FILES.legacyMark)
  if (fromFile) return fromFile

  if (process.platform === 'win32') {
    const reg = readRegistryValue(REG_VALUES.legacyMark)
    if (reg) {
      const m = reg.match(/^[0-9a-f]+/i)
      if (m) return m[0]
    }
  }
  return null
}

function writeLegacyExternalMark(signature: string): void {
  writeHiddenFile(HIDDEN_FILES.legacyMark, signature)
  writeRegistryValue(REG_VALUES.legacyMark, signature)
}

/* ── التقييم الشامل للترخيص والتجربة ─────────────────────────────────────── */
function toPublicStatus(state: InternalLicenseState): LicenseStatus {
  return {
    status: state.status,
    hwid: state.hwid,
    daysRemaining: state.daysRemaining,
    trialEndAt: state.trialEndAt,
  }
}

function makeState(
  status: LicenseStatusKind,
  hwid: string | null,
  daysRemaining: number,
  trialStartMs: number | null,
  maxLastMs: number | null,
): InternalLicenseState {
  const trialEndAt = trialStartMs !== null ? trialStartMs + TRIAL_DURATION_MS : null
  return {
    status,
    hwid,
    daysRemaining,
    trialEndAt,
    trialStartMs,
    maxLastMs,
    lastPersistedAt: Date.now(),
  }
}

function evaluateLicense(db: DB): InternalLicenseState {
  const currentHwid = getCurrentHwid()
  if (currentHwid === null) {
    // 7: تعذّر قراءة HWID — لا تقفل العميل، تحذير فقط
    return makeState('hwid_error', null, 0, null, null)
  }

  // 1) فحص الترخيص الدائم القديم (صيغة لم تتغير — العملاء المرخّصون حالياً يعملون كما هم)
  const boundHwid = getSetting(db, KEYS.boundHwid)
  const storedSignature = getSetting(db, KEYS.signature)
  const expectedForCurrent = sign(currentHwid)

  if (boundHwid && storedSignature) {
    if (storedSignature !== sign(boundHwid)) {
      return makeState('blocked', currentHwid, 0, null, null)
    }
    if (boundHwid !== currentHwid) {
      return makeState('blocked', currentHwid, 0, null, null)
    }
    if (readLegacyExternalMark() !== expectedForCurrent) {
      writeLegacyExternalMark(expectedForCurrent)
    }
    return makeState('licensed', currentHwid, 0, null, null)
  }

  // لو حُذفت صفوف القاعدة وكانت العلامة الخارجية القديمة موجودة: تعافٍ للعميل المرخّص أو حظر للناسخ
  const legacyExternalMark = readLegacyExternalMark()
  if (legacyExternalMark) {
    if (legacyExternalMark === expectedForCurrent) {
      setSetting(db, KEYS.boundHwid, currentHwid)
      setSetting(db, KEYS.signature, expectedForCurrent)
      return makeState('licensed', currentHwid, 0, null, null)
    }
    return makeState('blocked', currentHwid, 0, null, null)
  }

  // 2) فحص كود التفعيل الدائم (Ed25519) في الأماكن الثلاثة
  const actValues = readTripleStore(db, KEYS.activationCode, REG_VALUES.activationCode, HIDDEN_FILES.activationCode)
  const validActCode = actValues.find(v => verifyActivationCode(currentHwid, v))
  if (validActCode) {
    const normalized = normalizeActivationCode(validActCode)
    syncTripleStore(db, KEYS.activationCode, REG_VALUES.activationCode, HIDDEN_FILES.activationCode, normalized, actValues)
    return makeState('licensed', currentHwid, 0, null, null)
  }

  // 3) نظام الفترة التجريبية (7 أيام)
  const rawStarts = readTripleStore(db, KEYS.trialStart, REG_VALUES.trialStart, HIDDEN_FILES.trialStart)
  const rawLasts = readTripleStore(db, KEYS.trialLast, REG_VALUES.trialLast, HIDDEN_FILES.trialLast)

  const validStarts = rawStarts
    .map(v => verifySignedTimestamp('trial_start', v, currentHwid))
    .filter((n): n is number => n !== null)

  const validLasts = rawLasts
    .map(v => verifySignedTimestamp('trial_last', v, currentHwid))
    .filter((n): n is number => n !== null)

  const hasAnyRawTrialData = rawStarts.some(Boolean) || rawLasts.some(Boolean)
  const now = Date.now()

  // أول تشغيل بدون ترخيص وبلا أي أثر تجربة سابق
  if (validStarts.length === 0) {
    if (!hasAnyRawTrialData) {
      const startToken = signTimestamp('trial_start', currentHwid, now)
      const lastToken = signTimestamp('trial_last', currentHwid, now)
      syncTripleStore(db, KEYS.trialStart, REG_VALUES.trialStart, HIDDEN_FILES.trialStart, startToken, rawStarts)
      syncTripleStore(db, KEYS.trialLast, REG_VALUES.trialLast, HIDDEN_FILES.trialLast, lastToken, rawLasts)
      return makeState('trial', currentHwid, TRIAL_DAYS, now, now)
    }

    // وُجدت بيانات تجربة لكنها كلها معبوث بها أو منسوخة من جهاز آخر ⇒ قفل التجربة
    return makeState('trial_expired', currentHwid, 0, null, null)
  }

  // اعتمد أقدم تاريخ بداية صالح عبر المصادر الثلاثة
  const oldestStart = Math.min(...validStarts)
  const startToken = signTimestamp('trial_start', currentHwid, oldestStart)
  syncTripleStore(db, KEYS.trialStart, REG_VALUES.trialStart, HIDDEN_FILES.trialStart, startToken, rawStarts)

  // إذا رجّع المستخدم ساعة الجهاز للخلف احسب من آخر وقت مسجّل
  const maxValidLast = validLasts.length > 0 ? Math.max(...validLasts, oldestStart) : oldestStart
  const effectiveNow = Math.max(now, maxValidLast)
  const lastToken = signTimestamp('trial_last', currentHwid, effectiveNow)
  syncTripleStore(db, KEYS.trialLast, REG_VALUES.trialLast, HIDDEN_FILES.trialLast, lastToken, rawLasts)

  const elapsedMs = Math.max(0, effectiveNow - oldestStart)
  const remainingMs = Math.max(0, TRIAL_DURATION_MS - elapsedMs)

  if (remainingMs <= 0) {
    return makeState('trial_expired', currentHwid, 0, oldestStart, effectiveNow)
  }

  const daysRemaining = Math.ceil(remainingMs / DAY_MS)
  return makeState('trial', currentHwid, daysRemaining, oldestStart, effectiveNow)
}

/* ── الواجهة العامة لبقية الـ main process ───────────────────────────────── */

/** يُستدعى مرّة واحدة عند إقلاع النسخة النهائية لتفعيل حماية الترخيص والتجربة */
export function initLicense(db: DB): LicenseStatus {
  licenseEnforced = true
  cachedState = evaluateLicense(db)
  return toPublicStatus(cachedState)
}

/** التوافق مع الاسم القديم إذا استُدعي خارجياً */
export type LicenseCheckResult = 'ok' | 'blocked' | 'hwid_error'
export function verifyOrBindDevice(db: DB): LicenseCheckResult {
  const res = initLicense(db)
  if (res.status === 'blocked') return 'blocked'
  if (res.status === 'hwid_error') return 'hwid_error'
  return 'ok'
}

/** تحديث آخر وقت تشغيل (لحماية تغيير الساعة للخلف حتى لو بقي البرنامج مفتوحاً) */
export function touchTrialLastSeen(db: DB, force = false): void {
  if (!licenseEnforced || !cachedState) return
  if (cachedState.status !== 'trial' || !cachedState.hwid || cachedState.trialStartMs === null) return

  const now = Date.now()
  if (!force && now - cachedState.lastPersistedAt < LAST_SEEN_SYNC_INTERVAL_MS) return

  const currentMax = cachedState.maxLastMs ?? cachedState.trialStartMs
  const effectiveNow = Math.max(now, currentMax)
  cachedState.maxLastMs = effectiveNow
  cachedState.lastPersistedAt = now

  if (effectiveNow > currentMax) {
    const token = signTimestamp('trial_last', cachedState.hwid, effectiveNow)
    syncTripleStore(db, KEYS.trialLast, REG_VALUES.trialLast, HIDDEN_FILES.trialLast, token)
  }

  const remainingMs = Math.max(0, TRIAL_DURATION_MS - Math.max(0, effectiveNow - cachedState.trialStartMs))
  if (remainingMs <= 0) {
    cachedState.status = 'trial_expired'
    cachedState.daysRemaining = 0
  } else {
    cachedState.daysRemaining = Math.ceil(remainingMs / DAY_MS)
  }
}

/** يعيد الحالة الحالية للواجهة (في وضع التطوير غير المفعَّل يعود كمرخّص) */
export function getLicenseStatus(db: DB): LicenseStatus {
  if (!licenseEnforced) {
    return {
      status: 'licensed',
      hwid: getCurrentHwid(),
      daysRemaining: 0,
      trialEndAt: null,
    }
  }
  if (!cachedState) {
    cachedState = evaluateLicense(db)
  } else if (cachedState.status === 'trial') {
    touchTrialLastSeen(db, false)
  }
  return toPublicStatus(cachedState)
}

/** تفعيل البرنامج بكود Ed25519 للزبون وحفظه في القاعدة والـ Registry والملف المخفي */
export function activateWithCode(db: DB, rawCode: string): LicenseStatus {
  const hwid = getCurrentHwid()
  if (!hwid) {
    throw new Error('تعذّرت قراءة معرّف الجهاز حالياً، أعد تشغيل البرنامج ثم حاول مرة ثانية')
  }
  const normalized = normalizeActivationCode(rawCode)
  if (!normalized || !verifyActivationCode(hwid, normalized)) {
    throw new Error('كود التفعيل غير صحيح أو لا يطابق هذا الجهاز')
  }

  syncTripleStore(db, KEYS.activationCode, REG_VALUES.activationCode, HIDDEN_FILES.activationCode, normalized)
  cachedState = makeState('licensed', hwid, 0, null, null)
  return toPublicStatus(cachedState)
}

/** فرض القفل على مسارات IPC الحساسة من داخل الـ main process */
export function assertLicenseUnlocked(db: DB, channel: string): void {
  if (LICENSE_LOCK_ALLOWED_CHANNELS.has(channel)) return
  if (!licenseEnforced) return

  if (!cachedState) {
    cachedState = evaluateLicense(db)
  }

  if (cachedState.status === 'trial' && cachedState.trialStartMs !== null) {
    const effectiveNow = Math.max(Date.now(), cachedState.maxLastMs ?? cachedState.trialStartMs)
    if (effectiveNow - cachedState.trialStartMs >= TRIAL_DURATION_MS) {
      touchTrialLastSeen(db, true)
      cachedState.status = 'trial_expired'
      cachedState.daysRemaining = 0
    }
  }

  if (cachedState.status === 'trial_expired') {
    throw new Error('انتهت الفترة التجريبية — أدخل كود التفعيل للمتابعة')
  }
  if (cachedState.status === 'blocked') {
    throw new Error('هذا البرنامج غير مصرح له بالعمل على هذا الجهاز')
  }
}

/** للاختبارات الآلية فقط: تفعيل/تعطيل فرض الحماية وإعادة ضبط الذاكرة المؤقتة */
export function setLicenseEnforcementForTest(enforced: boolean): void {
  licenseEnforced = enforced
  cachedState = null
}
