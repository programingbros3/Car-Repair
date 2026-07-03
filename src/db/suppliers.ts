import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import { nextInvoiceNumber, PURCHASE_INVOICE_NUMBER_TABLES } from './invoiceNumber'
import { applyDiscount } from './discount'
import type {
  SupplierInvoiceInput,
  SupplierInvoiceRow,
  SupplierInvoiceDetail,
  SupplierFilters,
  SupplierPendingDebt,
  PaymentInput,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

// المجموع الكلي = مجموع (إجمالي كل بند بعد خصمه الخاص على مستوى البند)
function calcTotal(items: SupplierInvoiceInput['items']): number {
  return items.reduce(
    (sum, item) =>
      sum + applyDiscount(item.quantity * item.unit_price, item.discount_type, item.discount_value),
    0,
  )
}

function calcPaid(payments: PaymentInput[]): number {
  return payments
    .filter(p => p.method !== 'debt' && p.amount > 0)
    .reduce((sum, p) => sum + p.amount, 0)
}

// التحقق من عدم تجاوز مجموع الدفعة النقدية للمتبقّي — يُستدعى داخل transaction قبل
// إدراج دفعات على فاتورة مورد موجودة (لا يُستخدم عند إنشاء الفاتورة لأن amount_remaining
// حينها محسوب مسبقاً بعد طرح الدفعات). خصم التسوية يُتحقَّق منه داخل insertSupplierPayments.
function assertSupplierPaymentWithinRemaining(invoiceId: number, payments: PaymentInput[]): void {
  const db = getDB()
  const inv = db.prepare('SELECT amount_remaining FROM supplier_invoices WHERE id = ?').get(invoiceId) as { amount_remaining: number } | undefined
  if (!inv) throw new Error('الفاتورة غير موجودة')
  const totalNew = calcPaid(payments)
  if (totalNew > inv.amount_remaining + 0.001) {
    throw new Error(`مجموع الدفعة (${totalNew.toFixed(2)} ₪) يتجاوز المتبقي (${inv.amount_remaining.toFixed(2)} ₪)`)
  }
}

// Insert supplier payments — call inside a transaction
function insertSupplierPayments(
  invoiceId: number,
  paymentDate: string,
  payments: PaymentInput[],
  isDebtRepayment = false,
  settlementDiscount = 0,
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

  // خصم التسوية: يُخصم من amount_remaining دون تسجيل نقدية (لا صادر ولا وارد) في cash_ledger
  const disc = settlementDiscount || 0
  if (disc > 0) {
    if (disc < 0) throw new Error('خصم التسوية لا يمكن أن يكون سالباً')
    // amount_remaining هنا هو المتبقّي بعد خصم الدفعات النقدية الفعلية أعلاه
    const inv = db.prepare('SELECT amount_remaining FROM supplier_invoices WHERE id = ?').get(invoiceId) as { amount_remaining: number } | undefined
    if (!inv) throw new Error('الفاتورة غير موجودة')
    if (disc > inv.amount_remaining + 0.001) {
      throw new Error(`خصم التسوية (${disc.toFixed(2)} ₪) يتجاوز المتبقي بعد الدفعة (${Math.max(0, inv.amount_remaining).toFixed(2)} ₪)`)
    }
    db.prepare(`
      INSERT INTO ${paymentsTable} (invoice_id, payment_date, method, amount, settlement_discount, notes)
      VALUES (?, ?, 'cash', 0, ?, 'خصم تسوية')
    `).run(invoiceId, paymentDate, disc)
    db.prepare('UPDATE supplier_invoices SET amount_remaining = amount_remaining - ? WHERE id = ?').run(disc, invoiceId)
  }
}

// ─── Day 3: Add supplier invoice ─────────────────────────────────────────────

export function addSupplierInvoice(input: SupplierInvoiceInput): number {
  const db = getDB()

  const total_amount = calcTotal(input.items)
  // حماية دفاعية: مجموع الدفعة الأولية النقدية لا يتجاوز إجمالي الفاتورة (وإلا صار المتبقّي سالباً)
  const initialPaid = calcPaid(input.payments)
  if (initialPaid > total_amount + 0.001) {
    throw new Error(`مجموع الدفعة (${initialPaid.toFixed(2)} ₪) يتجاوز إجمالي الفاتورة (${total_amount.toFixed(2)} ₪)`)
  }
  // الترويسة تُدرَج بلا مدفوع؛ insertSupplierPayments أدناه يراكم الدفعة الأولية مرة واحدة.
  const amount_paid = 0
  const amount_remaining = total_amount

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
      INSERT INTO supplier_items (invoice_id, item_name, quantity, unit_price, notes, discount_type, discount_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of input.items) {
      stmt.run(
        invoiceId, item.item_name, item.quantity, item.unit_price, item.notes ?? null,
        item.discount_type ?? null, item.discount_value ?? 0,
      )
    }

    insertSupplierPayments(invoiceId, input.purchase_date, input.payments, false)

    return invoiceId
  })

  return run()
}

// ─── Update supplier invoice (header + items + recompute total) ──────────────
// يعيد إدراج البنود ويعيد حساب total_amount من خصم كل بند، ثم amount_remaining
// من amount_paid الحالي (الدفعات لا تُعدَّل هنا). ذرّي داخل transaction واحدة.
export function updateSupplierInvoice(id: number, input: SupplierInvoiceInput): void {
  const db = getDB()

  const total_amount = calcTotal(input.items)

  const run = db.transaction(() => {
    // حماية: لا يجوز أن يهبط الإجمالي تحت (المدفوع + خصم التسوية) وإلا صار المتبقّي سالباً
    const cur = db.prepare('SELECT amount_paid FROM supplier_invoices WHERE id = ?').get(id) as { amount_paid: number } | undefined
    const paid = cur?.amount_paid ?? 0
    // خصومات التسوية المطبّقة سابقاً تُطرح كي يبقى الثابت: total = paid + remaining + settlement
    const settle = (db.prepare(`
      SELECT COALESCE(SUM(settlement_discount),0) v FROM (
        SELECT settlement_discount FROM supplier_payments      WHERE invoice_id=?
        UNION ALL
        SELECT settlement_discount FROM supplier_debt_payments WHERE invoice_id=?
      )`).get(id, id) as { v: number }).v
    if (total_amount < paid + settle - 0.001) {
      throw new Error(`لا يمكن تعديل الفاتورة: الإجمالي بعد التعديل (${total_amount.toFixed(2)} ₪) أقل من المدفوع مسبقاً + خصم التسوية (${(paid + settle).toFixed(2)} ₪)`)
    }

    db.prepare(`
      UPDATE supplier_invoices
      SET supplier_name = ?, supplier_phone = ?, purchase_date = ?, notes = ?, total_amount = ?
      WHERE id = ?
    `).run(
      input.supplier_name, input.supplier_phone ?? null, input.purchase_date,
      input.notes ?? null, total_amount, id,
    )

    // amount_remaining = total − paid − settlement
    db.prepare(`
      UPDATE supplier_invoices SET amount_remaining = ? - amount_paid - ? WHERE id = ?
    `).run(total_amount, settle, id)

    db.prepare('DELETE FROM supplier_items WHERE invoice_id = ?').run(id)

    const stmt = db.prepare(`
      INSERT INTO supplier_items (invoice_id, item_name, quantity, unit_price, notes, discount_type, discount_value)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `)
    for (const item of input.items) {
      stmt.run(
        id, item.item_name, item.quantity, item.unit_price, item.notes ?? null,
        item.discount_type ?? null, item.discount_value ?? 0,
      )
    }
  })

  run()
}

// ─── Day 3: Add payment to existing supplier invoice ─────────────────────────

export function addSupplierPayment(
  invoiceId: number,
  payments: PaymentInput[],
  paymentDate: string,
  settlementDiscount = 0,
): void {
  const db = getDB()
  const run = db.transaction(() => {
    assertSupplierPaymentWithinRemaining(invoiceId, payments)
    insertSupplierPayments(invoiceId, paymentDate, payments, false, settlementDiscount)
  })
  run()
}

// ─── Day 3: Debt repayment to supplier ───────────────────────────────────────

export function addSupplierDebtPayment(
  invoiceId: number,
  payments: PaymentInput[],
  paymentDate: string,
  settlementDiscount = 0,
): void {
  const db = getDB()
  const run = db.transaction(() => {
    assertSupplierPaymentWithinRemaining(invoiceId, payments)
    insertSupplierPayments(invoiceId, paymentDate, payments, true, settlementDiscount)
  })
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
