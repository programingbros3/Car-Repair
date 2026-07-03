import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import type { InvoiceType, PaymentInput, PendingDebt, DebtFilters } from './types'

// ─── Internal: resolve table and ledger ref from invoice type ─────────────────

function invoiceMeta(type: InvoiceType) {
  return type === 'maintenance'
    ? { table: 'maintenance_invoices', label: 'صيانة', refType: REF.MAINTENANCE_PAYMENT }
    : { table: 'direct_sale_invoices', label: 'بيع مباشر', refType: REF.DIRECT_SALE_PAYMENT }
}

// ─── خصم التسوية (settlement discount) ────────────────────────────────────────
// يُسقِط مبلغاً من amount_remaining دون أن يُحسب كنقدية داخلة في cash_ledger.
// يُدرَج في صف مخصّص بجدول الدفعات (amount = 0، settlement_discount = المبلغ) كي
// يبقى موثّقاً في سجل الدفعات ومنفصلاً عن الدفعات النقدية. لا قيد صندوق إطلاقاً.
// remainingBefore = المتبقّي بعد خصم الدفعات النقدية الفعلية (للتحقّق من عدم التجاوز).
type SettlementPaymentsTable = 'payments' | 'debt_payments'
export function applySettlementDiscount(
  db: ReturnType<typeof getDB>,
  paymentsTable: SettlementPaymentsTable,
  invoiceId: number,
  invoiceType: InvoiceType,
  invoiceTable: string,
  paymentDate: string,
  settlementDiscount: number,
  remainingBefore: number,
): void {
  const disc = settlementDiscount || 0
  if (disc <= 0) return
  if (disc < 0) throw new Error('خصم التسوية لا يمكن أن يكون سالباً')
  if (disc > remainingBefore + 0.001) {
    throw new Error(`خصم التسوية (${disc.toFixed(2)} ₪) يتجاوز المتبقي بعد الدفعة (${Math.max(0, remainingBefore).toFixed(2)} ₪)`)
  }
  db.prepare(`
    INSERT INTO ${paymentsTable} (invoice_id, invoice_type, payment_date, method, amount, settlement_discount, notes)
    VALUES (?, ?, ?, 'cash', 0, ?, 'خصم تسوية')
  `).run(invoiceId, invoiceType, paymentDate, disc)
  // يُخصم من المتبقّي فقط — لا يمسّ amount_paid ولا cash_ledger
  db.prepare(`UPDATE ${invoiceTable} SET amount_remaining = amount_remaining - ? WHERE id = ?`).run(disc, invoiceId)
}

// ─── Day 3: Add payment to an existing invoice (not debt repayment) ───────────
// Used when customer wants to pay more toward an in-progress or delivered invoice.

export function addPayment(
  invoiceId: number,
  invoiceType: InvoiceType,
  payments: PaymentInput[],
  paymentDate: string,
  settlementDiscount = 0,
): void {
  const db = getDB()
  const { table, label, refType } = invoiceMeta(invoiceType)

  const run = db.transaction(() => {
    // التحقق من عدم تجاوز المبلغ المدفوع (+ خصم التسوية) للمتبقي
    const invoice = db.prepare(`SELECT amount_remaining FROM ${table} WHERE id = ?`).get(invoiceId) as { amount_remaining: number } | undefined
    if (!invoice) throw new Error('الفاتورة غير موجودة')
    const totalNew = payments.filter(p => p.amount > 0 && p.method !== 'debt').reduce((s, p) => s + p.amount, 0)
    if (totalNew > invoice.amount_remaining + 0.001) {
      throw new Error(`مجموع الدفعة (${totalNew.toFixed(2)} ₪) يتجاوز المتبقي (${invoice.amount_remaining.toFixed(2)} ₪)`)
    }

    for (const p of payments) {
      if (p.amount <= 0 || p.method === 'debt') continue

      const { lastInsertRowid } = db.prepare(`
        INSERT INTO payments (invoice_id, invoice_type, payment_date, method, amount, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(invoiceId, invoiceType, paymentDate, p.method, p.amount, p.notes ?? null)

      const payId = Number(lastInsertRowid)

      if (p.method === 'cheque') {
        db.prepare(`
          INSERT INTO payment_cheque (payment_id, cheque_number, issue_date, cash_date, bank_name)
          VALUES (?, ?, ?, ?, ?)
        `).run(payId, p.chequeNumber!, p.issueDate!, p.cashDate!, p.bankName!)
      } else if (p.method === 'visa') {
        db.prepare(`
          INSERT INTO payment_visa (payment_id, bank_name, transaction_number)
          VALUES (?, ?, ?)
        `).run(payId, p.bankName!, p.transactionNumber!)
      }

      db.prepare(`
        UPDATE ${table}
        SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ?
        WHERE id = ?
      `).run(p.amount, p.amount, invoiceId)

      recordLedgerEntry({
        transaction_date: paymentDate,
        reference_type: refType,
        reference_id: payId,
        amount_in: p.amount,
        amount_out: 0,
        notes: `دفعة ${label} #${invoiceId}`,
      })
    }

    // خصم التسوية: يُخصم من amount_remaining دون تسجيل نقدية في cash_ledger
    applySettlementDiscount(db, 'payments', invoiceId, invoiceType, table, paymentDate,
      settlementDiscount, invoice.amount_remaining - totalNew)
  })

  run()
}

// ─── Day 3: Debt repayment (from pending debts screen) ───────────────────────

export function addDebtPayment(
  invoiceId: number,
  invoiceType: InvoiceType,
  payments: PaymentInput[],
  paymentDate: string,
  settlementDiscount = 0,
): void {
  const db = getDB()
  const { table, label } = invoiceMeta(invoiceType)

  const run = db.transaction(() => {
    const totalNew = payments.filter(p => p.amount > 0 && p.method !== 'debt').reduce((s, p) => s + p.amount, 0)
    const invoice = db.prepare(`SELECT amount_remaining FROM ${table} WHERE id = ?`).get(invoiceId) as { amount_remaining: number } | undefined
    if (!invoice) throw new Error('الفاتورة غير موجودة')
    // التحقق من عدم تجاوز مجموع الدفعة للمتبقي (خصم التسوية يُتحقَّق منه لاحقاً مقابل ما يتبقّى بعد الدفعة)
    if (totalNew > invoice.amount_remaining + 0.001) {
      throw new Error(`مجموع الدفعة (${totalNew.toFixed(2)} ₪) يتجاوز المتبقي (${invoice.amount_remaining.toFixed(2)} ₪)`)
    }

    for (const p of payments) {
      if (p.amount <= 0 || p.method === 'debt') continue

      const { lastInsertRowid } = db.prepare(`
        INSERT INTO debt_payments (invoice_id, invoice_type, payment_date, method, amount, notes)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(invoiceId, invoiceType, paymentDate, p.method, p.amount, p.notes ?? null)

      const payId = Number(lastInsertRowid)

      if (p.method === 'cheque') {
        db.prepare(`
          INSERT INTO debt_payment_cheque (payment_id, cheque_number, issue_date, cash_date, bank_name)
          VALUES (?, ?, ?, ?, ?)
        `).run(payId, p.chequeNumber!, p.issueDate!, p.cashDate!, p.bankName!)
      } else if (p.method === 'visa') {
        db.prepare(`
          INSERT INTO debt_payment_visa (payment_id, bank_name, transaction_number)
          VALUES (?, ?, ?)
        `).run(payId, p.bankName!, p.transactionNumber!)
      }

      db.prepare(`
        UPDATE ${table}
        SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ?
        WHERE id = ?
      `).run(p.amount, p.amount, invoiceId)

      recordLedgerEntry({
        transaction_date: paymentDate,
        reference_type: REF.DEBT_CUSTOMER,
        reference_id: payId,
        amount_in: p.amount,
        amount_out: 0,
        notes: `سداد دين ${label} #${invoiceId}`,
      })
    }

    // خصم التسوية: يُخصم من amount_remaining دون تسجيل نقدية في cash_ledger
    applySettlementDiscount(db, 'debt_payments', invoiceId, invoiceType, table, paymentDate,
      settlementDiscount, invoice.amount_remaining - totalNew)
  })

  run()
}

// ─── Day 3: Get all pending debts (maintenance + direct sale) ─────────────────

export function getPendingDebts(filters: DebtFilters = {}): PendingDebt[] {
  const db = getDB()

  const conditions: string[] = ['amount_remaining > 0']
  const params: unknown[] = []

  if (filters.customer_name) {
    conditions.push('customer_name LIKE ?')
    params.push(`%${filters.customer_name}%`)
  }

  const where = `WHERE ${conditions.join(' AND ')}`

  const maintenanceRows = filters.invoice_type && filters.invoice_type !== 'maintenance'
    ? []
    : db.prepare(`
        SELECT
          id          AS invoice_id,
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
        ${where}
      `).all(...params) as PendingDebt[]

  const saleRows = filters.invoice_type && filters.invoice_type !== 'direct_sale'
    ? []
    : db.prepare(`
        SELECT
          id            AS invoice_id,
          'direct_sale' AS invoice_type,
          customer_name,
          customer_phone,
          sale_date     AS invoice_date,
          total_amount,
          amount_paid,
          amount_remaining,
          NULL          AS car_plate,
          NULL          AS car_type,
          NULL          AS car_color,
          notes
        FROM direct_sale_invoices
        ${where}
      `).all(...params) as PendingDebt[]

  return [...maintenanceRows, ...saleRows].sort(
    (a, b) => b.invoice_date.localeCompare(a.invoice_date)
  )
}
