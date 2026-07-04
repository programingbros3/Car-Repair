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

  const like = `${prefix}%`

  // ── تفصيل حسب reference_type من نفس cash_ledger المجمّع للشهر ──
  const byType = db.prepare(`
    SELECT reference_type,
           COALESCE(SUM(amount_in),  0) AS sin,
           COALESCE(SUM(amount_out), 0) AS sout
    FROM cash_ledger
    WHERE transaction_date LIKE ?
    GROUP BY reference_type
  `).all(like) as { reference_type: string; sin: number; sout: number }[]

  const sin  = (t: string) => byType.find(r => r.reference_type === t)?.sin  ?? 0
  const sout = (t: string) => byType.find(r => r.reference_type === t)?.sout ?? 0

  const maintenance_income = sin(REF.MAINTENANCE_PAYMENT) + sin(REF.MAINTENANCE_RELEASE)
  const direct_sale_income = sin(REF.DIRECT_SALE_PAYMENT)
  const debt_collected     = sin(REF.DEBT_CUSTOMER)
  const supplier_payments  = sout(REF.SUPPLIER_PAYMENT) + sout(REF.SUPPLIER_DEBT)
  const daily_expenses     = sout(REF.DAILY_EXPENSE)
  const salaries           = sout(REF.SALARY)

  // ── عدد الفواتير المُنشأة في الفترة (حسب تاريخ الفاتورة) ──
  const countIn = (table: string, dateCol: string) =>
    (db.prepare(`SELECT COUNT(*) AS c FROM ${table} WHERE ${dateCol} LIKE ?`).get(like) as { c: number }).c

  const maintenance_count = countIn('maintenance_invoices', 'date_received')
  const direct_sale_count = countIn('direct_sale_invoices', 'sale_date')
  const purchase_count    = countIn('supplier_invoices',    'purchase_date')

  // ── ديون جديدة من فواتير أُنشئت في الفترة ──
  // L7: المبلغ الأصلي وقت الإصدار = الإجمالي − ما دُفِع عند الإصدار (الدفعات المؤرّخة
  // بتاريخ الفاتورة نفسه). لا يتغيّر بأثر رجعي عند سداد الدين لاحقاً (على عكس المتبقّي
  // الحالي الذي كان يُستخدم سابقاً فيتقلّص كلما حُصِّل دين قديم).
  const new_debts = (db.prepare(`
    SELECT COALESCE(SUM(new_debt), 0) AS s FROM (
      SELECT mi.total_amount - COALESCE((
               SELECT SUM(amount) FROM payments
                WHERE invoice_id = mi.id AND invoice_type = 'maintenance' AND payment_date = mi.date_received
             ), 0) AS new_debt
        FROM maintenance_invoices mi WHERE mi.date_received LIKE ?
      UNION ALL
      SELECT ds.total_amount - COALESCE((
               SELECT SUM(amount) FROM payments
                WHERE invoice_id = ds.id AND invoice_type = 'direct_sale' AND payment_date = ds.sale_date
             ), 0) AS new_debt
        FROM direct_sale_invoices ds WHERE ds.sale_date LIKE ?
      UNION ALL
      SELECT si.total_amount - COALESCE((
               SELECT SUM(amount) FROM supplier_payments
                WHERE invoice_id = si.id AND payment_date = si.purchase_date
             ), 0) AS new_debt
        FROM supplier_invoices si WHERE si.purchase_date LIKE ?
    )
    WHERE new_debt > 0
  `).get(like, like, like) as { s: number }).s

  // ── خصومات الفواتير الممنوحة (صيانة + بيع مباشر): مجموع البنود قبل الخصم − الإجمالي بعد الخصم ──
  // H5: بنود customer_owned مستثناة من total_amount أصلاً (calcTotal في maintenance.ts)،
  // فيجب استثناؤها من مجموع البنود هنا أيضاً وإلا انتفخ الخصم بقيمة قطع الزبون الخاصة.
  const invoice_discounts = (db.prepare(`
    SELECT COALESCE(SUM(sub - total_amount), 0) AS s FROM (
      SELECT mi.total_amount AS total_amount,
             (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM invoice_items
                WHERE invoice_id = mi.id AND invoice_type = 'maintenance' AND customer_owned = 0) AS sub
        FROM maintenance_invoices mi
       WHERE mi.date_received LIKE ? AND mi.discount_type IS NOT NULL
      UNION ALL
      SELECT ds.total_amount AS total_amount,
             (SELECT COALESCE(SUM(quantity * unit_price), 0) FROM invoice_items
                WHERE invoice_id = ds.id AND invoice_type = 'direct_sale' AND customer_owned = 0) AS sub
        FROM direct_sale_invoices ds
       WHERE ds.sale_date LIKE ? AND ds.discount_type IS NOT NULL
    )
  `).get(like, like) as { s: number }).s

  // ── خصومات التسوية عند الدفع (كل جداول الدفعات الأربعة، حسب تاريخ الدفعة) ──
  const settlement_discounts = (db.prepare(`
    SELECT COALESCE(SUM(sd), 0) AS s FROM (
      SELECT settlement_discount AS sd FROM payments             WHERE payment_date LIKE ?
      UNION ALL SELECT settlement_discount FROM debt_payments          WHERE payment_date LIKE ?
      UNION ALL SELECT settlement_discount FROM supplier_payments      WHERE payment_date LIKE ?
      UNION ALL SELECT settlement_discount FROM supplier_debt_payments WHERE payment_date LIKE ?
    )
  `).get(like, like, like, like) as { s: number }).s

  // ── عدد الكفالات الجديدة المُصدَرة في الفترة (حسب تاريخ بداية الكفالة) ──
  const warranties_count = (db.prepare(
    `SELECT COUNT(*) AS c FROM warranties WHERE start_date LIKE ?`
  ).get(like) as { c: number }).c

  return {
    month,
    year,
    total_in,
    total_out,
    net: total_in - total_out,
    days: rows,
    maintenance_income,
    direct_sale_income,
    daily_expenses,
    salaries,
    supplier_payments,
    debt_collected,
    new_debts,
    maintenance_count,
    direct_sale_count,
    purchase_count,
    invoice_discounts,
    settlement_discounts,
    warranties_count,
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
      amount_remaining,
      car_plate,
      car_type,
      car_color,
      notes
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
      amount_remaining,
      NULL AS car_plate,
      NULL AS car_type,
      NULL AS car_color,
      notes
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

  // Combine maintenance + direct sale customers.
  // L8: التجميع بمفتاح ثابت = رقم الهاتف بعد إزالة الفراغات والرموز (مسافة، شرطة،
  // أقواس، +). الزبون نفسه بهاتف مكتوب بصيغ مختلفة يُدمَج في صف واحد. من بلا هاتف
  // (NULL) يُجمَّع بالاسم. الاسم/الهاتف المعروض يُؤخَذ كأحدث قيمة (MAX) للمجموعة.
  const rows = db.prepare(`
    SELECT MAX(customer_name)  AS customer_name,
           MAX(customer_phone) AS customer_phone,
           COUNT(*)            AS visit_count,
           SUM(total_amount)   AS total_spent
    FROM (
      SELECT customer_name, customer_phone, total_amount,
             CASE WHEN clean_phone <> '' THEN 'p:' || clean_phone ELSE 'n:' || customer_name END AS gkey
      FROM (
        SELECT customer_name, customer_phone, total_amount,
               REPLACE(REPLACE(REPLACE(REPLACE(REPLACE(COALESCE(customer_phone,''),' ',''),'-',''),'(',''),')',''),'+','') AS clean_phone
        FROM (
          SELECT customer_name, customer_phone, total_amount FROM maintenance_invoices
          UNION ALL
          SELECT customer_name, customer_phone, total_amount FROM direct_sale_invoices
        )
      )
    )
    GROUP BY gkey
    ORDER BY total_spent DESC
    LIMIT ?
  `).all(limit) as TopCustomer[]

  return rows
}
