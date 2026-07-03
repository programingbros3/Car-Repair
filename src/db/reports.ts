import { getDB } from '../database'
import { REF } from './ledger'
import type {
  DailyReport,
  MonthlyReport,
  MonthlyReportDay,
  DebtReport,
  TopCustomer,
  LedgerRow,
  PendingDebt,
  SupplierPendingDebt,
  DebtAgingRow,
  DebtAgingBucket,
} from './types'

// ─── Day 5: Daily report ──────────────────────────────────────────────────────

export function getDailyReport(date: string): DailyReport {
  const db = getDB()

  // All ledger entries for this date
  const entries = db.prepare(
    'SELECT * FROM cash_ledger WHERE transaction_date = ? ORDER BY id ASC'
  ).all(date) as LedgerRow[]

  function sumIn(refType: string): number {
    return entries
      .filter(e => e.reference_type === refType)
      .reduce((s, e) => s + e.amount_in, 0)
  }

  function sumOut(refType: string): number {
    return entries
      .filter(e => e.reference_type === refType)
      .reduce((s, e) => s + e.amount_out, 0)
  }

  const maintenance_income  = sumIn(REF.MAINTENANCE_PAYMENT) + sumIn(REF.MAINTENANCE_RELEASE)
  const direct_sale_income  = sumIn(REF.DIRECT_SALE_PAYMENT)
  const debt_collected      = sumIn(REF.DEBT_CUSTOMER)
  const supplier_expenses   = sumOut(REF.SUPPLIER_PAYMENT) + sumOut(REF.SUPPLIER_DEBT)
  const daily_expenses      = sumOut(REF.DAILY_EXPENSE)
  const salaries            = sumOut(REF.SALARY)

  const total_in  = maintenance_income + direct_sale_income + debt_collected
  const total_out = supplier_expenses + daily_expenses + salaries

  return {
    date,
    maintenance_income,
    direct_sale_income,
    debt_collected,
    supplier_expenses,
    daily_expenses,
    salaries,
    total_in,
    total_out,
    net: total_in - total_out,
    entries,
    // حقول مجمّعة إضافية لبطاقات الصندوق الأربع الجديدة (تُشتق من نفس entries المجمّعة لليوم المحدد)
    today_sales_income:      maintenance_income + direct_sale_income,
    today_expenses:          daily_expenses,
    today_supplier_payments: supplier_expenses,
    today_salaries:          salaries,
  }
}

// ─── Day 5: Monthly report ────────────────────────────────────────────────────

export function getMonthlyReport(month: number, year: number): MonthlyReport {
  const db = getDB()

  const monthStr = String(month).padStart(2, '0')
  const prefix   = `${year}-${monthStr}`

  const rows = db.prepare(`
    SELECT
      transaction_date                              AS date,
      COALESCE(SUM(amount_in),  0)                 AS total_in,
      COALESCE(SUM(amount_out), 0)                 AS total_out,
      COALESCE(SUM(amount_in) - SUM(amount_out), 0) AS net
    FROM cash_ledger
    WHERE transaction_date LIKE ?
    GROUP BY transaction_date
    ORDER BY transaction_date ASC
  `).all(`${prefix}%`) as MonthlyReportDay[]

  const total_in  = rows.reduce((s, r) => s + r.total_in,  0)
  const total_out = rows.reduce((s, r) => s + r.total_out, 0)

  return {
    month,
    year,
    total_in,
    total_out,
    net: total_in - total_out,
    days: rows,
  }
}

// ─── Day 5: Debt report (customers + suppliers) ───────────────────────────────

export function getDebtReport(): DebtReport {
  const db = getDB()

  const maintenanceDebts = db.prepare(`
    SELECT
      id            AS invoice_id,
      'maintenance' AS invoice_type,
      customer_name,
      customer_phone,
      date_received AS invoice_date,
      total_amount,
      amount_paid,
      amount_remaining
    FROM maintenance_invoices
    WHERE amount_remaining > 0
    ORDER BY date_received DESC
  `).all() as PendingDebt[]

  const saleDebts = db.prepare(`
    SELECT
      id            AS invoice_id,
      'direct_sale' AS invoice_type,
      customer_name,
      customer_phone,
      sale_date     AS invoice_date,
      total_amount,
      amount_paid,
      amount_remaining
    FROM direct_sale_invoices
    WHERE amount_remaining > 0
    ORDER BY sale_date DESC
  `).all() as PendingDebt[]

  const supplierDebts = db.prepare(`
    SELECT
      id             AS invoice_id,
      supplier_name,
      supplier_phone,
      purchase_date,
      total_amount,
      amount_paid,
      amount_remaining
    FROM supplier_invoices
    WHERE amount_remaining > 0
    ORDER BY purchase_date DESC
  `).all() as SupplierPendingDebt[]

  const customer_debts  = [...maintenanceDebts, ...saleDebts]
  const total_customer_debt  = customer_debts.reduce((s, r)  => s + r.amount_remaining, 0)
  const total_supplier_debt  = supplierDebts.reduce((s, r)   => s + r.amount_remaining, 0)

  return {
    customer_debts,
    supplier_debts: supplierDebts,
    total_customer_debt,
    total_supplier_debt,
  }
}

// ─── Day 5: Top customers by total spending ───────────────────────────────────

// ── أعمار الديون: تصنيف كل الديون المعلقة (زبائن + موردين) حسب عمرها ───────────

function agingBucket(daysOld: number): DebtAgingBucket {
  if (daysOld <= 30) return '0-30'
  if (daysOld <= 60) return '31-60'
  if (daysOld <= 90) return '61-90'
  return '90+'
}

export function getDebtsAging(): DebtAgingRow[] {
  const db = getDB()

  const rows = db.prepare(`
    SELECT 'maintenance' AS kind, id AS invoice_id,
           customer_name AS party_name, customer_phone AS party_phone,
           date_received AS invoice_date, total_amount, amount_paid, amount_remaining,
           CAST(julianday(date('now','localtime')) - julianday(date_received) AS INTEGER) AS days_old
      FROM maintenance_invoices
     WHERE amount_remaining > 0

    UNION ALL

    SELECT 'direct_sale' AS kind, id AS invoice_id,
           customer_name AS party_name, customer_phone AS party_phone,
           sale_date AS invoice_date, total_amount, amount_paid, amount_remaining,
           CAST(julianday(date('now','localtime')) - julianday(sale_date) AS INTEGER) AS days_old
      FROM direct_sale_invoices
     WHERE amount_remaining > 0

    UNION ALL

    SELECT 'supplier' AS kind, id AS invoice_id,
           supplier_name AS party_name, supplier_phone AS party_phone,
           purchase_date AS invoice_date, total_amount, amount_paid, amount_remaining,
           CAST(julianday(date('now','localtime')) - julianday(purchase_date) AS INTEGER) AS days_old
      FROM supplier_invoices
     WHERE amount_remaining > 0

    ORDER BY days_old DESC
  `).all() as Omit<DebtAgingRow, 'bucket'>[]

  return rows.map(r => ({ ...r, bucket: agingBucket(r.days_old) }))
}

export function getTopCustomers(limit = 10): TopCustomer[] {
  const db = getDB()

  // Combine maintenance + direct sale customers
  const rows = db.prepare(`
    SELECT customer_name, customer_phone,
           COUNT(*)          AS visit_count,
           SUM(total_amount) AS total_spent
    FROM (
      SELECT customer_name, customer_phone, total_amount FROM maintenance_invoices
      UNION ALL
      SELECT customer_name, customer_phone, total_amount FROM direct_sale_invoices
    )
    GROUP BY customer_name, customer_phone
    ORDER BY total_spent DESC
    LIMIT ?
  `).all(limit) as TopCustomer[]

  return rows
}
