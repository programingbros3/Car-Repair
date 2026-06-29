import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import type {
  DirectSaleInput,
  DirectSaleRow,
  DirectSaleDetail,
  DirectSaleFilters,
  PaymentInput,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotal(items: DirectSaleInput['items']): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
}

function calcPaid(payments: PaymentInput[]): number {
  return payments
    .filter(p => p.method !== 'debt' && p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0)
}

function insertPayments(
  invoiceId: number,
  paymentDate: string,
  payments: PaymentInput[],
): void {
  const db = getDB()

  for (const p of payments) {
    if (p.amount <= 0 || p.method === 'debt') continue

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO payments (invoice_id, invoice_type, payment_date, method, amount, notes)
      VALUES (?, 'direct_sale', ?, ?, ?, ?)
    `).run(invoiceId, paymentDate, p.method, p.amount, p.notes ?? null)

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
      UPDATE direct_sale_invoices
      SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ?
      WHERE id = ?
    `).run(p.amount, p.amount, invoiceId)

    recordLedgerEntry({
      transaction_date: paymentDate,
      reference_type: REF.DIRECT_SALE_PAYMENT,
      reference_id: payId,
      amount_in: p.amount,
      amount_out: 0,
      notes: `بيع مباشر #${invoiceId} — ${p.method}`,
    })
  }
}

// ─── Day 2: Add direct sale invoice ──────────────────────────────────────────

export function addDirectSaleInvoice(input: DirectSaleInput): number {
  const db = getDB()

  const total_amount = calcTotal(input.items)
  const amount_paid = calcPaid(input.payments)
  const amount_remaining = total_amount - amount_paid

  const run = db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO direct_sale_invoices
        (customer_name, customer_phone, sale_date, warranty, notes,
         total_amount, amount_paid, amount_remaining)
      VALUES
        (@customer_name, @customer_phone, @sale_date, @warranty, @notes,
         @total_amount, @amount_paid, @amount_remaining)
    `).run({
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      sale_date: input.sale_date,
      warranty: input.warranty ?? null,
      notes: input.notes ?? null,
      total_amount,
      amount_paid,
      amount_remaining,
    })

    const invoiceId = Number(lastInsertRowid)

    // Insert items
    const stmt = db.prepare(`
      INSERT INTO invoice_items
        (invoice_id, invoice_type, item_name, quantity, unit_price, customer_owned, notes)
      VALUES (?, 'direct_sale', ?, ?, ?, 0, ?)
    `)
    for (const item of input.items) {
      stmt.run(invoiceId, item.item_name, item.quantity, item.unit_price, item.notes ?? null)
    }

    insertPayments(invoiceId, input.sale_date, input.payments)

    return invoiceId
  })

  return run()
}

// ─── Day 2: Get invoices with filters ────────────────────────────────────────

export function getDirectSaleInvoices(filters: DirectSaleFilters = {}): DirectSaleRow[] {
  const db = getDB()

  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.customer_name) {
    conditions.push('customer_name LIKE ?')
    params.push(`%${filters.customer_name}%`)
  }
  if (filters.date_from) {
    conditions.push('sale_date >= ?')
    params.push(filters.date_from)
  }
  if (filters.date_to) {
    conditions.push('sale_date <= ?')
    params.push(filters.date_to)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  return db.prepare(`
    SELECT * FROM direct_sale_invoices ${where} ORDER BY sale_date DESC, id DESC
  `).all(...params) as DirectSaleRow[]
}

// ─── Day 2: Get single invoice with items ────────────────────────────────────

export function getDirectSaleInvoice(invoiceId: number): DirectSaleDetail | null {
  const db = getDB()

  const invoice = db.prepare(
    'SELECT * FROM direct_sale_invoices WHERE id = ?'
  ).get(invoiceId) as DirectSaleRow | undefined

  if (!invoice) return null

  const items = db.prepare(
    `SELECT * FROM invoice_items WHERE invoice_id = ? AND invoice_type = 'direct_sale' ORDER BY id ASC`
  ).all(invoiceId)

  return { ...invoice, items } as DirectSaleDetail
}
