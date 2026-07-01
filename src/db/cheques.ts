import { getDB } from '../database'
import type { UpcomingChequeRow } from './types'

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
