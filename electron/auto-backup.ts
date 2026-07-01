/* ════════════════════════════════════════════════════════════════════════
   auto-backup.ts — النسخ الاحتياطي التلقائي الدوري لـ garage.db
   ───────────────────────────────────────────────────────────────────────
   منفصل تماماً عن ميزة النسخ الاحتياطي اليدوي (backup:export / backup:import
   في ipc-handlers.ts) — لا يشترك معها بأي كود أو قناة.

   الفكرة: نسخ دوري لملف garage.db إلى مجلد يحدده المستخدم (عادة مجلد مزامنة
   سحابي محلي مثل Google Drive Desktop). التطبيق لا يتعامل مع أي API سحابي؛
   هو فقط ينسخ الملف محلياً، وبرنامج المزامنة (إن وُجد) يتكفّل بالرفع.

   الإعدادات تُخزَّن في جدول app_settings (key TEXT PRIMARY KEY, value TEXT)
   داخل garage.db نفسه — لا ملف JSON منفصل، لأن قاعدة البيانات جاهزة أصلاً
   ومهيّأة بنفس النمط (key/value) مسبقاً في هذا المشروع، وهذا يضمن أن الإعدادات
   تُنسخ هي نفسها ضمن أي نسخة احتياطية (يدوية أو تلقائية).
════════════════════════════════════════════════════════════════════════ */
import { dialog } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import type { AutoBackupSettings, AutoBackupStatus, AutoBackupRunResult } from '../src/db/types'

type DB = Database.Database

const KEYS = {
  enabled: 'auto_backup_enabled',
  folder: 'auto_backup_folder',
  keepCount: 'auto_backup_keep_count',
  lastRunAt: 'auto_backup_last_run_at',
  lastStatus: 'auto_backup_last_status',
  lastError: 'auto_backup_last_error',
  lastSuccessAt: 'auto_backup_last_success_at',
} as const

const DEFAULT_KEEP_COUNT = 14
const ONE_DAY_MS = 24 * 60 * 60 * 1000
const BACKUP_FILE_REGEX = /^garage-backup-\d{4}-\d{2}-\d{2}-\d{6}\.db$/

/* ── قراءة/كتابة app_settings ── */
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

export function getAutoBackupSettings(db: DB): AutoBackupSettings {
  return {
    enabled: getSetting(db, KEYS.enabled) === '1',
    folder: getSetting(db, KEYS.folder),
    keepCount: Number(getSetting(db, KEYS.keepCount) ?? DEFAULT_KEEP_COUNT) || DEFAULT_KEEP_COUNT,
  }
}

export function updateAutoBackupSettings(
  db: DB,
  updates: Partial<{ enabled: boolean; folder: string | null; keepCount: number }>,
): AutoBackupSettings {
  if (updates.enabled !== undefined) setSetting(db, KEYS.enabled, updates.enabled ? '1' : '0')
  if (updates.folder !== undefined) setSetting(db, KEYS.folder, updates.folder)
  if (updates.keepCount !== undefined) {
    setSetting(db, KEYS.keepCount, String(Math.max(1, Math.floor(updates.keepCount))))
  }
  return getAutoBackupSettings(db)
}

export function getAutoBackupStatus(db: DB): AutoBackupStatus {
  const lastStatus = getSetting(db, KEYS.lastStatus)
  return {
    lastRunAt: getSetting(db, KEYS.lastRunAt),
    lastStatus: lastStatus === 'success' || lastStatus === 'failed' ? lastStatus : null,
    lastError: getSetting(db, KEYS.lastError),
    lastSuccessAt: getSetting(db, KEYS.lastSuccessAt),
  }
}

/* ── اسم ملف النسخة: garage-backup-YYYY-MM-DD-HHmmss.db ── */
function formatTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
}

/** يحذف أقدم نسخ التلقائي إذا تجاوز عددها الحد المسموح (rotation) */
function applyRotation(folder: string, keepCount: number): void {
  const files = fs.readdirSync(folder)
    .filter(f => BACKUP_FILE_REGEX.test(f))
    .sort() // الطابع الزمني بالاسم يجعل الترتيب الأبجدي = الترتيب الزمني
  const excess = files.length - keepCount
  if (excess <= 0) return
  for (const f of files.slice(0, excess)) {
    try { fs.unlinkSync(path.join(folder, f)) } catch { /* تجاهل فشل حذف نسخة قديمة واحدة */ }
  }
}

/**
 * ينفّذ نسخة احتياطية فورية إلى المسار المحدد بالإعدادات الحالية، ويسجّل
 * النتيجة (نجاح/فشل) بجدول app_settings. لا يرمي استثناءً أبداً.
 */
export function runAutoBackup(db: DB): AutoBackupRunResult {
  const settings = getAutoBackupSettings(db)
  const nowIso = new Date().toISOString()
  setSetting(db, KEYS.lastRunAt, nowIso)

  if (!settings.folder) {
    const error = 'لم يتم تحديد مجلد النسخ الاحتياطي التلقائي'
    setSetting(db, KEYS.lastStatus, 'failed')
    setSetting(db, KEYS.lastError, error)
    return { success: false, error }
  }

  try {
    fs.accessSync(settings.folder, fs.constants.W_OK)

    const dbPath = db.name
    const fileName = `garage-backup-${formatTimestamp(new Date())}.db`
    const destPath = path.join(settings.folder, fileName)

    db.pragma('wal_checkpoint(FULL)')
    fs.copyFileSync(dbPath, destPath)
    applyRotation(settings.folder, settings.keepCount)

    setSetting(db, KEYS.lastStatus, 'success')
    setSetting(db, KEYS.lastError, null)
    setSetting(db, KEYS.lastSuccessAt, nowIso)
    return { success: true, filePath: destPath }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    setSetting(db, KEYS.lastStatus, 'failed')
    setSetting(db, KEYS.lastError, error)
    return { success: false, error }
  }
}

/**
 * يُستدعى عند إطلاق التطبيق: إذا الميزة مفعّلة ومرّ يوم كامل (أو أكثر) منذ
 * آخر نسخة تلقائية ناجحة (أو لم تُنفَّذ نسخة ناجحة من قبل)، ينفّذ نسخة جديدة
 * بالخلفية دون تدخل المستخدم.
 */
export function maybeRunAutoBackupOnStartup(db: DB): void {
  const settings = getAutoBackupSettings(db)
  if (!settings.enabled) return
  const status = getAutoBackupStatus(db)
  const lastSuccess = status.lastSuccessAt ? new Date(status.lastSuccessAt).getTime() : 0
  if (Date.now() - lastSuccess < ONE_DAY_MS) return
  setImmediate(() => { try { runAutoBackup(db) } catch { /* لا نوقف التطبيق أبداً */ } })
}

/** يُستدعى عند إغلاق التطبيق (before-quit) إذا الميزة مفعّلة */
export function runAutoBackupOnQuit(db: DB): void {
  const settings = getAutoBackupSettings(db)
  if (!settings.enabled) return
  try { runAutoBackup(db) } catch { /* لا نمنع الإغلاق أبداً */ }
}

/** يفتح نافذة اختيار مجلد (Google Drive أو أي مجلد آخر) ويعيد المسار المختار */
export async function pickAutoBackupFolder(): Promise<string | null> {
  const { filePaths, canceled } = await dialog.showOpenDialog({
    title: 'اختيار مجلد النسخ الاحتياطي التلقائي',
    properties: ['openDirectory'],
  })
  if (canceled || filePaths.length === 0) return null
  return filePaths[0]
}
