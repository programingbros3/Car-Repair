/* ════════════════════════════════════════════════════════════════════════
   vat.ts — إعدادات الضريبة (VAT) الاختيارية
   ───────────────────────────────────────────────────────────────────────
   ميزة اختيارية بطبيعتها: بعض عملاء الكراج لا يحتاجون فوترة ضريبية رسمية.
   • معطّلة افتراضياً (vat_enabled = '0') — لا يظهر أي شيء متعلق بالضريبة في
     أي فاتورة أو تقرير ما لم تُفعَّل صراحةً من الإعدادات.
   • الضريبة حقل محسوب وقت العرض فقط (derived) — لا تُخزَّن ضمن total_amount في
     قاعدة البيانات، حفاظاً على منطق amount_remaining/amount_paid الحالي كما هو.

   الإعدادات تُخزَّن في جدول app_settings (key/value) داخل garage.db نفسه بنفس
   نمط auto-backup.ts و auth.ts بالضبط (يأخذ db كمعامل، حالته في app_settings).
════════════════════════════════════════════════════════════════════════ */
import type Database from 'better-sqlite3'
import type { VatSettings } from '../src/db/types'

type DB = Database.Database

const KEYS = {
  enabled: 'vat_enabled',
  rate: 'vat_rate',
} as const

// القيمة المبدئية للنسبة قبل أن يُعدّلها المستخدم (الضريبة الرسمية في فلسطين 16%).
const DEFAULT_RATE = 16

/* ── قراءة/كتابة app_settings (نفس نمط auto-backup.ts / auth.ts) ── */
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

export function getVatSettings(db: DB): VatSettings {
  const rateRaw = getSetting(db, KEYS.rate)
  const rate = rateRaw == null ? DEFAULT_RATE : Number(rateRaw)
  return {
    enabled: getSetting(db, KEYS.enabled) === '1',
    rate: Number.isFinite(rate) && rate >= 0 ? rate : DEFAULT_RATE,
  }
}

export function updateVatSettings(
  db: DB,
  updates: Partial<{ enabled: boolean; rate: number }>,
): VatSettings {
  if (updates.enabled !== undefined) setSetting(db, KEYS.enabled, updates.enabled ? '1' : '0')
  if (updates.rate !== undefined) {
    const rate = Number.isFinite(updates.rate) ? Math.max(0, updates.rate) : DEFAULT_RATE
    setSetting(db, KEYS.rate, String(rate))
  }
  return getVatSettings(db)
}
