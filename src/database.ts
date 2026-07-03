import { createRequire } from 'node:module'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

type BetterSqlite3 = import('better-sqlite3').Database

let db: BetterSqlite3

export function initDB(): void {
  const dbPath = path.join(app.getPath('userData'), 'garage.db')
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // In packaged app: schema is placed next to the executable via extraResources.
  // In development: schema lives in electron/schema.sql.
  const schemaPath = app.isPackaged
    ? path.join(process.resourcesPath, 'schema.sql')
    : path.join(app.getAppPath(), 'electron', 'schema.sql')

  if (fs.existsSync(schemaPath)) {
    const schema = fs.readFileSync(schemaPath, 'utf-8')
    db.exec(schema)
  } else {
    console.warn('⚠️ schema.sql غير موجود في:', schemaPath)
  }

  // Migration: add new columns to existing databases without recreating tables
  const migrations = [
    `ALTER TABLE employees ADD COLUMN daily_wage REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE salary_payments ADD COLUMN daily_wage_snapshot REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE salary_payments ADD COLUMN days_worked REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE salary_payments ADD COLUMN bonus REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE salary_payments ADD COLUMN deduction REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE maintenance_invoices ADD COLUMN invoice_number TEXT`,
    `ALTER TABLE direct_sale_invoices ADD COLUMN invoice_number TEXT`,
    `ALTER TABLE supplier_invoices ADD COLUMN invoice_number TEXT`,
    `ALTER TABLE maintenance_invoices ADD COLUMN discount_type TEXT`,
    `ALTER TABLE maintenance_invoices ADD COLUMN discount_value REAL DEFAULT 0`,
    `ALTER TABLE direct_sale_invoices ADD COLUMN discount_type TEXT`,
    `ALTER TABLE direct_sale_invoices ADD COLUMN discount_value REAL DEFAULT 0`,
    `ALTER TABLE invoice_items ADD COLUMN warranty TEXT`,
    `ALTER TABLE invoice_items ADD COLUMN part_type TEXT NOT NULL DEFAULT 'part'`,
    `ALTER TABLE daily_cash_audits ADD COLUMN actual_cash  REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE daily_cash_audits ADD COLUMN actual_visa  REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE daily_cash_audits ADD COLUMN actual_check REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE warranties ADD COLUMN car_type TEXT`,
    `ALTER TABLE warranties ADD COLUMN car_color TEXT`,
    `ALTER TABLE supplier_items ADD COLUMN discount_type TEXT`,
    `ALTER TABLE supplier_items ADD COLUMN discount_value REAL DEFAULT 0`,
    // خصم تسوية عند الدفع: يُخصم من amount_remaining دون أن يُسجَّل كنقدية في cash_ledger
    `ALTER TABLE payments               ADD COLUMN settlement_discount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE debt_payments          ADD COLUMN settlement_discount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE supplier_payments      ADD COLUMN settlement_discount REAL NOT NULL DEFAULT 0`,
    `ALTER TABLE supplier_debt_payments ADD COLUMN settlement_discount REAL NOT NULL DEFAULT 0`,
  ]
  for (const sql of migrations) {
    try { db.exec(sql) }
    catch (err) {
      if (err instanceof Error && err.message.includes('duplicate column name')) continue
      throw err
    }
  }

  backfillInvoiceNumbers(db)

  console.log('✅ قاعدة البيانات جاهزة:', dbPath)
}

/**
 * يملأ invoice_number للسجلات الموجودة مسبقاً (قبل إضافة العمود) بصيغة
 * {prefix}-{سنة تاريخ الفاتورة}-{تسلسل 4 خانات يُعاد للصفر كل سنة}.
 * لا يفعل شيئاً إن كانت كل السجلات مرقّمة أصلاً (WHERE invoice_number IS NULL
 * فارغة) — آمن لإعادة التشغيل في كل إطلاق، بنفس فلسفة migrations أعلاه.
 *
 * فواتير الصيانة والبيع المباشر تُرقَّم معاً بتسلسل واحد ("INV") لأنهما تُعرضان
 * مجتمعتين كفاتورة بيع واحدة في SalesInvoices.tsx؛ لو رُقِّم كل جدول على حدة
 * بنفس البادئة لأمكن ظهور نفس الرقم على فاتورتين مختلفتين. فواتير الموردين
 * ("PUR") مستقلة تماماً. الترتيب الزمني الأساسي created_at ASC (وقت الإدخال
 * الفعلي)، والسنة المستخدمة في كل رقم هي سنة تاريخ الفاتورة نفسه (date_received
 * / sale_date / purchase_date) لا سنة created_at.
 */
function backfillInvoiceNumbers(db: BetterSqlite3): void {
  backfillGroup(db, 'INV', [
    { table: 'maintenance_invoices', dateCol: 'date_received' },
    { table: 'direct_sale_invoices', dateCol: 'sale_date' },
  ])
  backfillGroup(db, 'PUR', [
    { table: 'supplier_invoices', dateCol: 'purchase_date' },
  ])
}

function backfillGroup(
  db: BetterSqlite3,
  prefix: string,
  sources: { table: string; dateCol: string }[],
): void {
  type PendingRow = { table: string; id: number; created_at: string; year: string }
  const pending: PendingRow[] = []

  for (const src of sources) {
    const rows = db.prepare(
      `SELECT id, created_at, ${src.dateCol} AS invoice_date FROM ${src.table} WHERE invoice_number IS NULL`
    ).all() as { id: number; created_at: string; invoice_date: string | null }[]
    for (const row of rows) {
      const year = (row.invoice_date || row.created_at || '').slice(0, 4) || String(new Date().getFullYear())
      pending.push({ table: src.table, id: row.id, created_at: row.created_at, year })
    }
  }
  if (pending.length === 0) return

  // ترتيب زمني صرف حسب وقت الإدخال الفعلي، عبر كل الجداول المُجمَّعة معاً
  pending.sort((a, b) => a.created_at.localeCompare(b.created_at))

  // seed العدّادات من أي أرقام مُسنَدة مسبقاً (نسخ backfill جزئي سابق) لتفادي التكرار
  const counters = new Map<string, number>()
  const numberPattern = new RegExp(`^${prefix}-(\\d{4})-(\\d{4})$`)
  for (const src of sources) {
    const existing = db.prepare(
      `SELECT invoice_number FROM ${src.table} WHERE invoice_number IS NOT NULL`
    ).all() as { invoice_number: string }[]
    for (const { invoice_number } of existing) {
      const m = invoice_number.match(numberPattern)
      if (!m) continue
      counters.set(m[1], Math.max(counters.get(m[1]) ?? 0, Number(m[2])))
    }
  }

  const updateStmts = new Map(sources.map(s => [s.table, db.prepare(`UPDATE ${s.table} SET invoice_number = ? WHERE id = ?`)]))

  const run = db.transaction(() => {
    for (const row of pending) {
      const next = (counters.get(row.year) ?? 0) + 1
      counters.set(row.year, next)
      updateStmts.get(row.table)!.run(`${prefix}-${row.year}-${String(next).padStart(4, '0')}`, row.id)
    }
  })
  run()
}

export function getDB(): BetterSqlite3 {
  if (!db) throw new Error('قاعدة البيانات لم تُهيَّأ بعد — استدع initDB() أولاً')
  return db
}
