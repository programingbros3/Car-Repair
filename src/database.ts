import { createRequire } from 'node:module'
import { app } from 'electron'
import path from 'node:path'
import fs from 'node:fs'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')

type BetterSqlite3 = import('better-sqlite3').Database

let db: BetterSqlite3

export function initDB(): void {
  // مسار قاعدة اختياري عبر متغيّر بيئة GARAGE_DB_PATH — يُستخدم فقط لمعاينة بيانات
  // محاكاة معزولة (garage-simulation-preview.db) بعيداً عن قاعدة الإنتاج. حين لا
  // يكون المتغيّر موجوداً يبقى السلوك الافتراضي كما هو تماماً (قاعدة المستخدم في
  // userData) — لا أثر إطلاقاً على الإنتاج.
  const dbPath = process.env.GARAGE_DB_PATH
    ? path.resolve(process.env.GARAGE_DB_PATH)
    : path.join(app.getPath('userData'), 'garage.db')
  if (process.env.GARAGE_DB_PATH) fs.mkdirSync(path.dirname(dbPath), { recursive: true })
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  applySchemaAndMigrations(db)

  console.log('✅ قاعدة البيانات جاهزة:', dbPath)
}

/**
 * ينشئ/يحدّث بنية القاعدة على اتصال مفتوح: تنفيذ schema.sql (CREATE TABLE IF NOT
 * EXISTS + الفهارس) ثم كل عمليات الترحيل (إضافة الأعمدة الجديدة، فهارس التفرّد،
 * تعبئة أرقام الفواتير…). مُصدَّرة كي يستخدمها مسار الاستيراد (backup:import) أيضاً
 * لترقية نسخة احتياطية قديمة إلى البنية الحالية قبل تفعيلها — لا تكرار للمنطق.
 * آمنة لإعادة التشغيل (كل الخطوات idempotent).
 */
export function applySchemaAndMigrations(db: BetterSqlite3): void {
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
    // M9: طريقة الدفع كعمود فعلي في الصندوق (بدل استخراجها بـ regex من notes)
    `ALTER TABLE cash_ledger            ADD COLUMN method TEXT`,
    // دفعة عامة لمورد: جدولا supplier_bulk_payments/supplier_bulk_payment_allocations
    // جديدان بالكامل (لا أعمدة على جداول موجودة) — ترحيلهما يتمّ عبر db.exec(schema)
    // أعلاه (CREATE TABLE IF NOT EXISTS) الذي يعمل في كل إقلاع وعلى النسخ المستوردة،
    // فلا حاجة لأي ALTER هنا. أي عمود يُضاف لاحقاً عليهما يجب أن يُكتب هنا كالمعتاد.
  ]
  for (const sql of migrations) {
    try { db.exec(sql) }
    catch (err) {
      if (err instanceof Error && err.message.includes('duplicate column name')) continue
      throw err
    }
  }

  migrateChequeStatus(db)
  migrateLedgerMethod(db)
  migrateCashAuditLock(db)
  migrateUniqueInvoiceNumbers(db)
  backfillInvoiceNumbers(db)
}

/**
 * M3: حالة الشيك (pending | cashed | bounced) + تاريخ الصرف الفعلي.
 * الشيكات الموجودة قبل هذا الترحيل سبق أن سجّلت قيد صندوق عند الاستلام، لذا
 * تُعتبر "مصروفة" (cashed) كي لا يتغيّر رصيد الصندوق التاريخي. الشيكات الجديدة
 * تُدرَج بحالة pending افتراضياً (بلا قيد صندوق حتى الصرف الفعلي).
 * التحويل إلى cashed يُجرى مرة واحدة فقط عند إضافة العمود (WHERE على الوجود).
 */
function migrateChequeStatus(db: BetterSqlite3): void {
  const chequeTables = [
    'payment_cheque', 'debt_payment_cheque', 'supplier_payment_cheque', 'supplier_debt_cheque',
  ]
  const isDuplicate = (err: unknown) =>
    err instanceof Error && err.message.includes('duplicate column name')

  for (const t of chequeTables) {
    let justAdded = false
    try {
      db.exec(`ALTER TABLE ${t} ADD COLUMN status TEXT NOT NULL DEFAULT 'pending'`)
      justAdded = true
    } catch (err) {
      if (!isDuplicate(err)) throw err
    }
    // فقط عند أول إضافة للعمود: كل الصفوف الموجودة حينها = شيكات قديمة مصروفة
    if (justAdded) db.exec(`UPDATE ${t} SET status='cashed'`)

    try {
      db.exec(`ALTER TABLE ${t} ADD COLUMN cashed_date TEXT`)
    } catch (err) {
      if (!isDuplicate(err)) throw err
    }

    db.exec(`CREATE INDEX IF NOT EXISTS idx_${t}_status ON ${t}(status)`)
  }
}

/**
 * M9: يملأ عمود method للصفوف القديمة في cash_ledger من نمط الملاحظة ("… — cash").
 * يعمل مرة واحدة فعلياً (WHERE method IS NULL) وآمن لإعادة التشغيل. الصفوف بلا
 * لاحقة طريقة (مصاريف/رواتب) تُعتبر نقدية.
 */
function migrateLedgerMethod(db: BetterSqlite3): void {
  const rows = db.prepare(
    `SELECT id, notes FROM cash_ledger WHERE method IS NULL`,
  ).all() as { id: number; notes: string | null }[]
  if (rows.length === 0) return
  const upd = db.prepare(`UPDATE cash_ledger SET method = ? WHERE id = ?`)
  const run = db.transaction(() => {
    for (const r of rows) {
      const m = (r.notes ?? '').match(/[—–-]\s*(cash|visa|cheque)\s*$/i)
      upd.run(m ? m[1].toLowerCase() : 'cash', r.id)
    }
  })
  run()
}

/**
 * إحصاء نهاية اليوم — تفصيل النظام حسب طريقة الدفع + قفل السجل المُدقَّق.
 * يضيف الأعمدة الجديدة (system_cash/visa/check + is_locked) للقواعد القديمة.
 *
 * عند أول إضافة لعمود is_locked فقط (justAdded): كل السجلات الموجودة حينها كانت
 * "مُثبَّتة" حسب المنطق القديم (لم يكن هناك مفهوم مسودة)، فنقفلها جميعاً (is_locked=1).
 * السجلات القديمة التي لا تملك تفصيلاً حسب طريقة الدفع (الأعمدة المفصّلة كلها أصفار):
 *   - actual_cash = actual_amount  (أفضل افتراض: التفصيل لم يكن موجوداً وقت تسجيلها).
 *   - system_cash = system_total   (نفس المنطق للنظام).
 * قرار موثّق: نفترض أن كامل المبلغ القديم غير المفصّل كان نقداً (كاش) لغياب أي
 * معلومة أدقّ، تماشياً مع فلسفة "لا نحذف بيانات قديمة" في بقية عمليات الترحيل.
 */
function migrateCashAuditLock(db: BetterSqlite3): void {
  const isDuplicate = (err: unknown) =>
    err instanceof Error && err.message.includes('duplicate column name')
  const addCol = (sql: string): boolean => {
    try { db.exec(sql); return true }
    catch (err) { if (isDuplicate(err)) return false; throw err }
  }

  addCol(`ALTER TABLE daily_cash_audits ADD COLUMN system_cash  REAL NOT NULL DEFAULT 0`)
  addCol(`ALTER TABLE daily_cash_audits ADD COLUMN system_visa  REAL NOT NULL DEFAULT 0`)
  addCol(`ALTER TABLE daily_cash_audits ADD COLUMN system_check REAL NOT NULL DEFAULT 0`)
  const lockJustAdded = addCol(`ALTER TABLE daily_cash_audits ADD COLUMN is_locked INTEGER NOT NULL DEFAULT 0`)

  if (lockJustAdded) {
    db.exec(`UPDATE daily_cash_audits SET is_locked = 1`)
    db.exec(`
      UPDATE daily_cash_audits
         SET actual_cash = actual_amount
       WHERE actual_cash = 0 AND actual_visa = 0 AND actual_check = 0 AND actual_amount <> 0
    `)
    db.exec(`
      UPDATE daily_cash_audits
         SET system_cash = system_total
       WHERE system_cash = 0 AND system_visa = 0 AND system_check = 0 AND system_total <> 0
    `)
  }
}

/**
 * M7: قيد فريد على invoice_number لكل جدول فواتير (شرطي على IS NOT NULL كي لا
 * يمنع الصفوف القديمة غير المرقّمة قبل الـ backfill). لو وُجد تكرار فعلي في بيانات
 * قديمة، نطبع تحذيراً بدل إيقاف الإقلاع (يحتاج تصحيحاً يدوياً، لكن الـ backfill
 * يضمن التفرّد أصلاً).
 */
function migrateUniqueInvoiceNumbers(db: BetterSqlite3): void {
  const indexes: [string, string][] = [
    ['idx_uniq_maint_invno', 'maintenance_invoices'],
    ['idx_uniq_ds_invno',    'direct_sale_invoices'],
    ['idx_uniq_sup_invno',   'supplier_invoices'],
  ]
  for (const [idx, table] of indexes) {
    try {
      db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS ${idx} ON ${table}(invoice_number) WHERE invoice_number IS NOT NULL`)
    } catch (err) {
      console.warn(`⚠️ تعذّر إنشاء قيد التفرّد ${idx} (قد يوجد رقم فاتورة مكرّر في ${table}):`,
        err instanceof Error ? err.message : err)
    }
  }
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
