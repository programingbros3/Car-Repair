import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import type { InvoiceType, PaymentInput, PendingDebt, DebtFilters } from './types'

// ─── Internal: resolve table and ledger ref from invoice type ─────────────────

function invoiceMeta(type: InvoiceType) {
  return type === 'maintenance'
    ? { table: 'maintenance_invoices', label: 'صيانة', refType: REF.MAINTENANCE_PAYMENT }
    : { table: 'direct_sale_invoices', label: 'بيع مباشر', refType: REF.DIRECT_SALE_PAYMENT }
}

// ─── Day 3: Add payment to an existing invoice (not debt repayment) ───────────
// Used when customer wants to pay more toward an in-progress or delivered invoice.

export function addPayment(
  invoiceId: number,
  invoiceType: InvoiceType,
  payments: PaymentInput[],
  paymentDate: string,
): void {
  const db = getDB()
  const { table, label, refType } = invoiceMeta(invoiceType)

  const run = db.transaction(() => {
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
  })

  run()
}

// ─── Day 3: Debt repayment (from pending debts screen) ───────────────────────

export function addDebtPayment(
  invoiceId: number,
  invoiceType: InvoiceType,
  payments: PaymentInput[],
  paymentDate: string,
): void {
  const db = getDB()
  const { table, label } = invoiceMeta(invoiceType)

  const run = db.transaction(() => {
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
          amount_remaining
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
          amount_remaining
        FROM direct_sale_invoices
        ${where}
      `).all(...params) as PendingDebt[]

  return [...maintenanceRows, ...saleRows].sort(
    (a, b) => b.invoice_date.localeCompare(a.invoice_date)
  )
}
