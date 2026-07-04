import { getDB } from '../database'
import { recordLedgerEntry, recomputeLedgerBalances, REF } from './ledger'
import type { UpcomingChequeRow, ChequeRow, ChequeFilters, ChequeStatus, ChequeTableKind } from './types'

/* L1: مصدر واحد مشترك لكل استعلامات الشيكات — UNION من جداول الشيكات الأربعة مع
   كل الأعمدة (الطرف، الفاتورة المصدر، تفاصيل السيارة، الحالة، النوع، معرّف الدفعة).
   getUpcomingCheques و getAllCheques كلاهما يختار منه بما يحتاجه فقط، فلا يتكرر
   الاستعلام الطويل مرتين. قراءة فقط. */
const CHEQUE_SOURCES_UNION = `
  SELECT 'maintenance' AS source, mi.customer_name AS party_name, mi.customer_phone AS party_phone,
         mi.invoice_number, mi.date_received AS invoice_date, mi.total_amount AS invoice_total,
         mi.car_plate, mi.car_type, mi.car_color, mi.date_released,
         pc.cheque_number, pc.bank_name, p.amount, pc.issue_date, pc.cash_date,
         pc.status, 'payment' AS cheque_kind, pc.payment_id
    FROM payment_cheque pc
    JOIN payments p ON p.id = pc.payment_id AND p.invoice_type = 'maintenance'
    JOIN maintenance_invoices mi ON mi.id = p.invoice_id

  UNION ALL

  SELECT 'direct_sale' AS source, ds.customer_name AS party_name, ds.customer_phone AS party_phone,
         ds.invoice_number, ds.sale_date AS invoice_date, ds.total_amount AS invoice_total,
         NULL AS car_plate, NULL AS car_type, NULL AS car_color, NULL AS date_released,
         pc.cheque_number, pc.bank_name, p.amount, pc.issue_date, pc.cash_date,
         pc.status, 'payment' AS cheque_kind, pc.payment_id
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
         dc.cheque_number, dc.bank_name, dp.amount, dc.issue_date, dc.cash_date,
         dc.status, 'debt' AS cheque_kind, dc.payment_id
    FROM debt_payment_cheque dc
    JOIN debt_payments dp ON dp.id = dc.payment_id
    LEFT JOIN maintenance_invoices mi2 ON dp.invoice_type = 'maintenance' AND mi2.id = dp.invoice_id
    LEFT JOIN direct_sale_invoices ds2 ON dp.invoice_type = 'direct_sale' AND ds2.id = dp.invoice_id

  UNION ALL

  SELECT 'supplier' AS source, si.supplier_name AS party_name, si.supplier_phone AS party_phone,
         si.invoice_number, si.purchase_date AS invoice_date, si.total_amount AS invoice_total,
         NULL AS car_plate, NULL AS car_type, NULL AS car_color, NULL AS date_released,
         spc.cheque_number, spc.bank_name, sp.amount, spc.issue_date, spc.cash_date,
         spc.status, 'supplier_payment' AS cheque_kind, spc.payment_id
    FROM supplier_payment_cheque spc
    JOIN supplier_payments sp ON sp.id = spc.payment_id
    JOIN supplier_invoices si ON si.id = sp.invoice_id

  UNION ALL

  SELECT 'supplier_debt' AS source, si2.supplier_name AS party_name, si2.supplier_phone AS party_phone,
         si2.invoice_number, si2.purchase_date AS invoice_date, si2.total_amount AS invoice_total,
         NULL AS car_plate, NULL AS car_type, NULL AS car_color, NULL AS date_released,
         sdc.cheque_number, sdc.bank_name, sdp.amount, sdc.issue_date, sdc.cash_date,
         sdc.status, 'supplier_debt' AS cheque_kind, sdc.payment_id
    FROM supplier_debt_cheque sdc
    JOIN supplier_debt_payments sdp ON sdp.id = sdc.payment_id
    JOIN supplier_invoices si2 ON si2.id = sdp.invoice_id
`

const DAYS_REMAINING_EXPR =
  `CAST(ROUND(julianday(cash_date) - julianday(date('now', 'localtime'))) AS INTEGER) AS days_remaining`

/**
 * الشيكات المعلّقة المستحقة القبض/الصرف خلال الأيام القادمة (status = 'pending').
 * قراءة فقط، لا تعديل على أي جدول.
 */
export function getUpcomingCheques(daysAhead = 14): UpcomingChequeRow[] {
  const db = getDB()

  const from = new Date().toISOString().slice(0, 10)
  const to = new Date(Date.now() + daysAhead * 86_400_000).toISOString().slice(0, 10)

  return db.prepare(`
    SELECT source, party_name, cheque_number, bank_name, amount, cash_date,
           status, cheque_kind, payment_id, ${DAYS_REMAINING_EXPR}
    FROM (${CHEQUE_SOURCES_UNION})
    WHERE cash_date BETWEEN ? AND ? AND status = 'pending'
    ORDER BY cash_date ASC
  `).all(from, to) as UpcomingChequeRow[]
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
           status, cheque_kind, payment_id, ${DAYS_REMAINING_EXPR}
    FROM (${CHEQUE_SOURCES_UNION})
    ${where}
    ORDER BY cash_date DESC
  `).all(...params) as ChequeRow[]

  return rows
}

/* ════════════════════════════════════════════════════════════════════════
   M3: تغيير حالة الشيك (معلّق ⇄ مصروف ⇄ مرتدّ) وأثرها على الصندوق والفاتورة
   ───────────────────────────────────────────────────────────────────────
   دلالات الحالات:
   • pending  (معلّق): محتسَب مدفوعاً على الفاتورة، بلا قيد صندوق (النقد لم يدخل).
   • cashed   (مصروف): محتسَب مدفوعاً على الفاتورة، وله قيد صندوق (النقد دخل/خرج).
   • bounced  (مرتدّ): غير محتسَب على الفاتورة (يعود الدين)، وبلا قيد صندوق.
   التحويل بين أي حالتين يُطبَّق كفرق (delta) على البُعدين: قيد الصندوق ومدفوع
   الفاتورة — فيصحّ أي انتقال (معلّق→مصروف، مصروف→مرتدّ، مرتدّ→معلّق…).
════════════════════════════════════════════════════════════════════════ */

interface ChequeKindConfig {
  chequeTable: string
  paymentsTable: string
  invoiceTable: string | null   // null ⇒ يُشتق من invoice_type (debt)
  direction: 'in' | 'out'
  refType: string | 'byInvoiceType'
}

const CHEQUE_KIND_CONFIG: Record<ChequeTableKind, ChequeKindConfig> = {
  payment: {
    chequeTable: 'payment_cheque', paymentsTable: 'payments', invoiceTable: null,
    direction: 'in', refType: 'byInvoiceType',
  },
  debt: {
    chequeTable: 'debt_payment_cheque', paymentsTable: 'debt_payments', invoiceTable: null,
    direction: 'in', refType: REF.DEBT_CUSTOMER,
  },
  supplier_payment: {
    chequeTable: 'supplier_payment_cheque', paymentsTable: 'supplier_payments', invoiceTable: 'supplier_invoices',
    direction: 'out', refType: REF.SUPPLIER_PAYMENT,
  },
  supplier_debt: {
    chequeTable: 'supplier_debt_cheque', paymentsTable: 'supplier_debt_payments', invoiceTable: 'supplier_invoices',
    direction: 'out', refType: REF.SUPPLIER_DEBT,
  },
}

const ledgerActive = (s: ChequeStatus) => s === 'cashed'
const paidActive   = (s: ChequeStatus) => s !== 'bounced'

export function updateChequeStatus(
  kind: ChequeTableKind,
  paymentId: number,
  newStatus: ChequeStatus,
): void {
  const db = getDB()
  const cfg = CHEQUE_KIND_CONFIG[kind]
  if (!cfg) throw new Error('نوع شيك غير معروف')

  const run = db.transaction(() => {
    const cur = db.prepare(
      `SELECT status FROM ${cfg.chequeTable} WHERE payment_id = ?`,
    ).get(paymentId) as { status: ChequeStatus } | undefined
    if (!cur) throw new Error('الشيك غير موجود')
    const oldStatus = cur.status
    if (oldStatus === newStatus) return

    // بيانات الدفعة (المبلغ + الفاتورة المصدر)
    const pay = db.prepare(
      `SELECT amount, invoice_id${cfg.invoiceTable ? '' : ', invoice_type'} FROM ${cfg.paymentsTable} WHERE id = ?`,
    ).get(paymentId) as { amount: number; invoice_id: number; invoice_type?: string } | undefined
    if (!pay) throw new Error('دفعة الشيك غير موجودة')

    const invoiceTable = cfg.invoiceTable
      ?? (pay.invoice_type === 'maintenance' ? 'maintenance_invoices' : 'direct_sale_invoices')
    const refType = cfg.refType === 'byInvoiceType'
      ? (pay.invoice_type === 'maintenance' ? REF.MAINTENANCE_PAYMENT : REF.DIRECT_SALE_PAYMENT)
      : cfg.refType

    // (1) أثر مدفوع الفاتورة
    if (paidActive(newStatus) && !paidActive(oldStatus)) {
      db.prepare(`UPDATE ${invoiceTable} SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ? WHERE id = ?`)
        .run(pay.amount, pay.amount, pay.invoice_id)
    } else if (!paidActive(newStatus) && paidActive(oldStatus)) {
      db.prepare(`UPDATE ${invoiceTable} SET amount_paid = amount_paid - ?, amount_remaining = amount_remaining + ? WHERE id = ?`)
        .run(pay.amount, pay.amount, pay.invoice_id)
    }

    // (2) أثر قيد الصندوق
    if (ledgerActive(newStatus) && !ledgerActive(oldStatus)) {
      const today = new Date().toISOString().slice(0, 10)
      recordLedgerEntry({
        transaction_date: today,
        reference_type: refType,
        reference_id: paymentId,
        amount_in:  cfg.direction === 'in'  ? pay.amount : 0,
        amount_out: cfg.direction === 'out' ? pay.amount : 0,
        method: 'cheque',
        notes: `صرف شيك — دفعة #${paymentId}`,
      })
      db.prepare(`UPDATE ${cfg.chequeTable} SET cashed_date = ? WHERE payment_id = ?`).run(today, paymentId)
      recomputeLedgerBalances()
    } else if (!ledgerActive(newStatus) && ledgerActive(oldStatus)) {
      db.prepare(`DELETE FROM cash_ledger WHERE reference_type = ? AND reference_id = ?`).run(refType, paymentId)
      db.prepare(`UPDATE ${cfg.chequeTable} SET cashed_date = NULL WHERE payment_id = ?`).run(paymentId)
      recomputeLedgerBalances()
    }

    // (3) تحديث الحالة
    db.prepare(`UPDATE ${cfg.chequeTable} SET status = ? WHERE payment_id = ?`).run(newStatus, paymentId)
  })

  run()
}
