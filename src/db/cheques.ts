import { getDB } from '../database'
import type { UpcomingChequeRow, ChequeRow, ChequeFilters } from './types'

/**
 * الشيكات المستحقة القبض/الصرف خلال الأيام القادمة — UNION من جداول الشيكات
 * الأربعة الموجودة (payment_cheque, debt_payment_cheque, supplier_payment_cheque,
 * supplier_debt_cheque) بالاعتماد على cash_date. قراءة فقط، لا تعديل على أي جدول.
 */
export function getUpcomingCheques(daysAhead = 14): UpcomingChequeRow[] {
  const db = getDB()

  const from = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10)

  const rows = db.prepare(`
    SELECT source, party_name, cheque_number, bank_name, amount, cash_date,
           CAST(ROUND(julianday(cash_date) - julianday(date('now', 'localtime'))) AS INTEGER) AS days_remaining
    FROM (
      SELECT 'maintenance' AS source, mi.customer_name AS party_name,
             pc.cheque_number, pc.bank_name, p.amount, pc.cash_date
        FROM payment_cheque pc
        JOIN payments p ON p.id = pc.payment_id AND p.invoice_type = 'maintenance'
        JOIN maintenance_invoices mi ON mi.id = p.invoice_id

      UNION ALL

      SELECT 'direct_sale' AS source, ds.customer_name AS party_name,
             pc.cheque_number, pc.bank_name, p.amount, pc.cash_date
        FROM payment_cheque pc
        JOIN payments p ON p.id = pc.payment_id AND p.invoice_type = 'direct_sale'
        JOIN direct_sale_invoices ds ON ds.id = p.invoice_id

      UNION ALL

      SELECT CASE dp.invoice_type WHEN 'maintenance' THEN 'maintenance' ELSE 'direct_sale' END AS source,
             COALESCE(mi2.customer_name, ds2.customer_name) AS party_name,
             dc.cheque_number, dc.bank_name, dp.amount, dc.cash_date
        FROM debt_payment_cheque dc
        JOIN debt_payments dp ON dp.id = dc.payment_id
        LEFT JOIN maintenance_invoices mi2 ON dp.invoice_type = 'maintenance' AND mi2.id = dp.invoice_id
        LEFT JOIN direct_sale_invoices ds2 ON dp.invoice_type = 'direct_sale' AND ds2.id = dp.invoice_id

      UNION ALL

      SELECT 'supplier' AS source, si.supplier_name AS party_name,
             spc.cheque_number, spc.bank_name, sp.amount, spc.cash_date
        FROM supplier_payment_cheque spc
        JOIN supplier_payments sp ON sp.id = spc.payment_id
        JOIN supplier_invoices si ON si.id = sp.invoice_id

      UNION ALL

      SELECT 'supplier_debt' AS source, si2.supplier_name AS party_name,
             sdc.cheque_number, sdc.bank_name, sdp.amount, sdc.cash_date
        FROM supplier_debt_cheque sdc
        JOIN supplier_debt_payments sdp ON sdp.id = sdc.payment_id
        JOIN supplier_invoices si2 ON si2.id = sdp.invoice_id
    )
    WHERE cash_date BETWEEN ? AND ?
    ORDER BY cash_date ASC
  `).all(from, to) as UpcomingChequeRow[]

  return rows
}

/**
 * كل الشيكات التي دخلت البرنامج على الإطلاق (الماضية والمستقبلية، بلا قيد "قادم")
 * — UNION ALL لنفس جداول الشيكات الأربعة بنفس منطق getUpcomingCheques، مع إضافة
 * تاريخ الإصدار (issue_date)، مرتّبة تنازلياً حسب cash_date (الأحدث أولاً).
 * فلاتر اختيارية: رقم الشيك (جزئي)، اسم البنك (جزئي)، مدى cash_date، مدى المبلغ.
 * قراءة فقط، لا تعديل على أي جدول.
 */
export function getAllCheques(filters: ChequeFilters = {}): ChequeRow[] {
  const db = getDB()

  const conds: string[] = []
  const params: (string | number)[] = []

  if (filters.chequeNumber?.trim()) {
    conds.push('cheque_number LIKE ?')
    params.push(`%${filters.chequeNumber.trim()}%`)
  }
  if (filters.bankName?.trim()) {
    conds.push('bank_name LIKE ?')
    params.push(`%${filters.bankName.trim()}%`)
  }
  if (filters.dateFrom) {
    conds.push('cash_date >= ?')
    params.push(filters.dateFrom)
  }
  if (filters.dateTo) {
    conds.push('cash_date <= ?')
    params.push(filters.dateTo)
  }
  if (filters.amountMin != null) {
    conds.push('amount >= ?')
    params.push(filters.amountMin)
  }
  if (filters.amountMax != null) {
    conds.push('amount <= ?')
    params.push(filters.amountMax)
  }

  const where = conds.length ? `WHERE ${conds.join(' AND ')}` : ''

  const rows = db.prepare(`
    SELECT source, party_name, party_phone, invoice_number,
           invoice_date, invoice_total, car_plate, car_type, car_color, date_released,
           cheque_number, bank_name, amount, issue_date, cash_date,
           CAST(ROUND(julianday(cash_date) - julianday(date('now', 'localtime'))) AS INTEGER) AS days_remaining
    FROM (
      SELECT 'maintenance' AS source, mi.customer_name AS party_name, mi.customer_phone AS party_phone,
             mi.invoice_number, mi.date_received AS invoice_date, mi.total_amount AS invoice_total,
             mi.car_plate, mi.car_type, mi.car_color, mi.date_released,
             pc.cheque_number, pc.bank_name, p.amount, pc.issue_date, pc.cash_date
        FROM payment_cheque pc
        JOIN payments p ON p.id = pc.payment_id AND p.invoice_type = 'maintenance'
        JOIN maintenance_invoices mi ON mi.id = p.invoice_id

      UNION ALL

      SELECT 'direct_sale' AS source, ds.customer_name AS party_name, ds.customer_phone AS party_phone,
             ds.invoice_number, ds.sale_date AS invoice_date, ds.total_amount AS invoice_total,
             NULL AS car_plate, NULL AS car_type, NULL AS car_color, NULL AS date_released,
             pc.cheque_number, pc.bank_name, p.amount, pc.issue_date, pc.cash_date
        FROM payment_cheque pc
        JOIN payments p ON p.id = pc.payment_id AND p.invoice_type = 'direct_sale'
        JOIN direct_sale_invoices ds ON ds.id = p.invoice_id

      UNION ALL

      SELECT CASE dp.invoice_type WHEN 'maintenance' THEN 'maintenance' ELSE 'direct_sale' END AS source,
             COALESCE(mi2.customer_name, ds2.customer_name) AS party_name,
             COALESCE(mi2.customer_phone, ds2.customer_phone) AS party_phone,
             COALESCE(mi2.invoice_number, ds2.invoice_number) AS invoice_number,
             COALESCE(mi2.date_received, ds2.sale_date) AS invoice_date,
             COALESCE(mi2.total_amount, ds2.total_amount) AS invoice_total,
             mi2.car_plate, mi2.car_type, mi2.car_color, mi2.date_released,
             dc.cheque_number, dc.bank_name, dp.amount, dc.issue_date, dc.cash_date
        FROM debt_payment_cheque dc
        JOIN debt_payments dp ON dp.id = dc.payment_id
        LEFT JOIN maintenance_invoices mi2 ON dp.invoice_type = 'maintenance' AND mi2.id = dp.invoice_id
        LEFT JOIN direct_sale_invoices ds2 ON dp.invoice_type = 'direct_sale' AND ds2.id = dp.invoice_id

      UNION ALL

      SELECT 'supplier' AS source, si.supplier_name AS party_name, si.supplier_phone AS party_phone,
             si.invoice_number, si.purchase_date AS invoice_date, si.total_amount AS invoice_total,
             NULL AS car_plate, NULL AS car_type, NULL AS car_color, NULL AS date_released,
             spc.cheque_number, spc.bank_name, sp.amount, spc.issue_date, spc.cash_date
        FROM supplier_payment_cheque spc
        JOIN supplier_payments sp ON sp.id = spc.payment_id
        JOIN supplier_invoices si ON si.id = sp.invoice_id

      UNION ALL

      SELECT 'supplier_debt' AS source, si2.supplier_name AS party_name, si2.supplier_phone AS party_phone,
             si2.invoice_number, si2.purchase_date AS invoice_date, si2.total_amount AS invoice_total,
             NULL AS car_plate, NULL AS car_type, NULL AS car_color, NULL AS date_released,
             sdc.cheque_number, sdc.bank_name, sdp.amount, sdc.issue_date, sdc.cash_date
        FROM supplier_debt_cheque sdc
        JOIN supplier_debt_payments sdp ON sdp.id = sdc.payment_id
        JOIN supplier_invoices si2 ON si2.id = sdp.invoice_id
    )
    ${where}
    ORDER BY cash_date DESC
  `).all(...params) as ChequeRow[]

  return rows
}
