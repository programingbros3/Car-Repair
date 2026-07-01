import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import { nextInvoiceNumber, PURCHASE_INVOICE_NUMBER_TABLES } from './invoiceNumber'
import type {
  SupplierInvoiceInput,
  SupplierInvoiceRow,
  SupplierInvoiceDetail,
  SupplierFilters,
  SupplierPendingDebt,
  PaymentInput,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotal(items: SupplierInvoiceInput['items']): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
}

function calcPaid(payments: PaymentInput[]): number {
  return payments
    .filter(p => p.method !== 'debt' && p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0)
}

// Insert supplier payments — call inside a transaction
function insertSupplierPayments(
  invoiceId: number,
  paymentDate: string,
  payments: PaymentInput[],
  isDebtRepayment = false,
): void {
  const db = getDB()

  const paymentsTable = isDebtRepayment ? 'supplier_debt_payments' : 'supplier_payments'
  const chequeTable   = isDebtRepayment ? 'supplier_debt_cheque'   : 'supplier_payment_cheque'
  const visaTable     = isDebtRepayment ? 'supplier_debt_visa'     : 'supplier_payment_visa'
  const refType       = isDebtRepayment ? REF.SUPPLIER_DEBT        : REF.SUPPLIER_PAYMENT
  const label         = isDebtRepayment ? 'سداد دين مورد'          : 'دفع لمورد'

  for (const p of payments) {
    if (p.amount <= 0 || p.method === 'debt') continue

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO ${paymentsTable} (invoice_id, payment_date, method, amount, notes)
      VALUES (?, ?, ?, ?, ?)
    `).run(invoiceId, paymentDate, p.method, p.amount, p.notes ?? null)

    const payId = Number(lastInsertRowid)

    if (p.method === 'cheque') {
      db.prepare(`
        INSERT INTO ${chequeTable} (payment_id, cheque_number, issue_date, cash_date, bank_name)
        VALUES (?, ?, ?, ?, ?)
      `).run(payId, p.chequeNumber!, p.issueDate!, p.cashDate!, p.bankName!)
    } else if (p.method === 'visa') {
      db.prepare(`
        INSERT INTO ${visaTable} (payment_id, bank_name, transaction_number)
        VALUES (?, ?, ?)
      `).run(payId, p.bankName!, p.transactionNumber!)
    }

    db.prepare(`
      UPDATE supplier_invoices
      SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ?
      WHERE id = ?
    `).run(p.amount, p.amount, invoiceId)

    // Supplier payments are money going OUT of the ledger
    recordLedgerEntry({
      transaction_date: paymentDate,
      reference_type: refType,
      reference_id: payId,
      amount_in: 0,
      amount_out: p.amount,
      notes: `${label} #${invoiceId} — ${p.method}`,
    })
  }
}

// ─── Day 3: Add supplier invoice ─────────────────────────────────────────────

export function addSupplierInvoice(input: SupplierInvoiceInput): number {
  const db = getDB()

  const total_amount = calcTotal(input.items)
  const amount_paid = calcPaid(input.payments)
  const amount_remaining = total_amount - amount_paid

  const run = db.transaction(() => {
    const invoice_number = nextInvoiceNumber('PUR', PURCHASE_INVOICE_NUMBER_TABLES)
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO supplier_invoices
        (invoice_number, supplier_name, supplier_phone, purchase_date, notes,
         total_amount, amount_paid, amount_remaining)
      VALUES
        (@invoice_number, @supplier_name, @supplier_phone, @purchase_date, @notes,
         @total_amount, @amount_paid, @amount_remaining)
    `).run({
      invoice_number,
      supplier_name: input.supplier_name,
      supplier_phone: input.supplier_phone ?? null,
      purchase_date: input.purchase_date,
      notes: input.notes ?? null,
      total_amount,
      amount_paid,
      amount_remaining,
    })

    const invoiceId = Number(lastInsertRowid)

    // Insert items
    const stmt = db.prepare(`
      INSERT INTO supplier_items (invoice_id, item_name, quantity, unit_price, notes)
      VALUES (?, ?, ?, ?, ?)
    `)
    for (const item of input.items) {
      stmt.run(invoiceId, item.item_name, item.quantity, item.unit_price, item.notes ?? null)
    }

    insertSupplierPayments(invoiceId, input.purchase_date, input.payments, false)

    return invoiceId
  })

  return run()
}

// ─── Day 3: Add payment to existing supplier invoice ─────────────────────────

export function addSupplierPayment(
  invoiceId: number,
  payments: PaymentInput[],
  paymentDate: string,
): void {
  const db = getDB()
  const run = db.transaction(() => insertSupplierPayments(invoiceId, paymentDate, payments, false))
  run()
}

// ─── Day 3: Debt repayment to supplier ───────────────────────────────────────

export function addSupplierDebtPayment(
  invoiceId: number,
  payments: PaymentInput[],
  paymentDate: string,
): void {
  const db = getDB()
  const run = db.transaction(() => insertSupplierPayments(invoiceId, paymentDate, payments, true))
  run()
}

// ─── Day 3: Get supplier invoices with filters ────────────────────────────────

export function getSupplierInvoices(filters: SupplierFilters = {}): SupplierInvoiceRow[] {
  const db = getDB()

  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.supplier_name) {
    conditions.push('supplier_name LIKE ?')
    params.push(`%${filters.supplier_name}%`)
  }
  if (filters.date_from) {
    conditions.push('purchase_date >= ?')
    params.push(filters.date_from)
  }
  if (filters.date_to) {
    conditions.push('purchase_date <= ?')
    params.push(filters.date_to)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  return db.prepare(`
    SELECT * FROM supplier_invoices ${where} ORDER BY purchase_date DESC, id DESC
  `).all(...params) as SupplierInvoiceRow[]
}

// ─── Day 3: Get single supplier invoice with items ───────────────────────────

export function getSupplierInvoice(invoiceId: number): SupplierInvoiceDetail | null {
  const db = getDB()

  const invoice = db.prepare(
    'SELECT * FROM supplier_invoices WHERE id = ?'
  ).get(invoiceId) as SupplierInvoiceRow | undefined

  if (!invoice) return null

  const items = db.prepare(
    'SELECT * FROM supplier_items WHERE invoice_id = ? ORDER BY id ASC'
  ).all(invoiceId)

  return { ...invoice, items } as SupplierInvoiceDetail
}

// ─── Day 3: Get supplier pending debts ───────────────────────────────────────

export function getSupplierDebts(): SupplierPendingDebt[] {
  const db = getDB()

  return db.prepare(`
    SELECT
      id            AS invoice_id,
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
}

// ─── Utility: search suppliers by name (for autocomplete) ────────────────────

export function searchSupplierNames(query: string): string[] {
  const db = getDB()

  return (db.prepare(`
    SELECT DISTINCT supplier_name FROM supplier_invoices
    WHERE supplier_name LIKE ?
    ORDER BY supplier_name ASC
    LIMIT 10
  `).all(`%${query}%`) as { supplier_name: string }[]).map(r => r.supplier_name)
}
