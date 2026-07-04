import { getDB } from '../database'
import type { LedgerEntryInput, LedgerRow, LedgerSummary } from './types'

// ─── Reference types used across all payment functions ────────────────────────
export const REF = {
  MAINTENANCE_PAYMENT: 'maintenance_payment',
  MAINTENANCE_RELEASE: 'maintenance_release',
  DIRECT_SALE_PAYMENT: 'direct_sale_payment',
  DEBT_CUSTOMER: 'debt_customer',
  SUPPLIER_PAYMENT: 'supplier_payment',
  SUPPLIER_DEBT: 'supplier_debt',
  DAILY_EXPENSE: 'daily_expense',
  SALARY: 'salary',
} as const

// ─── Internal helper — always call inside a transaction ───────────────────────
export function recordLedgerEntry(entry: LedgerEntryInput): void {
  const db = getDB()

  // M4: الرصيد التراكمي يتبع الترتيب الزمني (transaction_date) لا ترتيب الإدخال.
  // للقيد الأحدث (التاريخ ≥ كل التواريخ الموجودة) نكتفي بإضافته على آخر رصيد
  // زمني. للقيد بتاريخ سابق (backdated) نعيد حساب كل الأرصدة كي يبقى العمود
  // متسلسلاً مع التواريخ المعروضة.
  const maxRow = db.prepare(
    `SELECT balance_after, transaction_date FROM cash_ledger
     ORDER BY transaction_date DESC, id DESC LIMIT 1`
  ).get() as { balance_after: number; transaction_date: string } | undefined

  const prevBalance = maxRow?.balance_after ?? 0
  const balance_after = prevBalance + entry.amount_in - entry.amount_out

  db.prepare(`
    INSERT INTO cash_ledger
      (transaction_date, reference_type, reference_id, amount_in, amount_out, balance_after, method, notes)
    VALUES
      (@transaction_date, @reference_type, @reference_id, @amount_in, @amount_out, @balance_after, @method, @notes)
  `).run({
    transaction_date: entry.transaction_date,
    reference_type: entry.reference_type,
    reference_id: entry.reference_id,
    amount_in: entry.amount_in,
    amount_out: entry.amount_out,
    balance_after,
    method: entry.method ?? 'cash',   // M9: المصاريف/الرواتب نقدية افتراضاً
    notes: entry.notes ?? null,
  })

  // قيد بتاريخ سابق للأحدث ⇒ اختلّ الترتيب الزمني → إعادة حساب شاملة
  if (maxRow && entry.transaction_date < maxRow.transaction_date) {
    recomputeLedgerBalances()
  }
}

// ─── إعادة حساب الرصيد التراكمي (balance_after) لكل الصفوف بالترتيب الزمني ─────────
// M4: الترتيب حسب (transaction_date, id) وليس id فقط — كي يعكس عمود "الرصيد بعد
// العملية" التسلسل الزمني الفعلي حتى مع القيود المُدخَلة بتاريخ سابق. تُستدعى بعد
// أي حذف/تعديل/قيد بتاريخ سابق. يجب استدعاؤها داخل نفس الـ transaction. آمنة على
// قاعدة فارغة (لا صفوف = no-op).
export function recomputeLedgerBalances(): void {
  const db = getDB()
  const rows = db.prepare(
    'SELECT id, amount_in, amount_out FROM cash_ledger ORDER BY transaction_date ASC, id ASC'
  ).all() as { id: number; amount_in: number; amount_out: number }[]

  const upd = db.prepare('UPDATE cash_ledger SET balance_after = ? WHERE id = ?')
  let balance = 0
  for (const r of rows) {
    balance += r.amount_in - r.amount_out
    upd.run(balance, r.id)
  }
}

// ─── Public queries ───────────────────────────────────────────────────────────

export function getLedgerSummary(): LedgerSummary {
  const db = getDB()

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(amount_in),  0) AS total_in,
      COALESCE(SUM(amount_out), 0) AS total_out
    FROM cash_ledger
  `).get() as { total_in: number; total_out: number }

  return {
    total_in: row.total_in,
    total_out: row.total_out,
    balance: row.total_in - row.total_out,
  }
}

export function getLedgerByDateRange(from: string, to: string): LedgerRow[] {
  const db = getDB()

  // M4: العرض بالترتيب الزمني (ثم id للتثبيت) ليطابق تسلسل عمود الرصيد
  return db.prepare(`
    SELECT * FROM cash_ledger
    WHERE transaction_date BETWEEN ? AND ?
    ORDER BY transaction_date ASC, id ASC
  `).all(from, to) as LedgerRow[]
}
