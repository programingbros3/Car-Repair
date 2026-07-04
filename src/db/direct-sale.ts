import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import { nextInvoiceNumber, SALES_INVOICE_NUMBER_TABLES } from './invoiceNumber'
import { applyDiscount } from './discount'
import { insertChequeOrVisaDetails } from './validate'
import type {
  DiscountType,
  DirectSaleInput,
  DirectSaleRow,
  DirectSaleDetail,
  DirectSaleFilters,
  DirectSaleItemInput,
  PaymentInput,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotal(items: DirectSaleInput['items']): number {
  return items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0)
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

    insertChequeOrVisaDetails(db, payId, p, { cheque: 'payment_cheque', visa: 'payment_visa' })

    db.prepare(`
      UPDATE direct_sale_invoices
      SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ?
      WHERE id = ?
    `).run(p.amount, p.amount, invoiceId)

    // M3: الشيك لا يُسجَّل نقداً في الصندوق إلا عند صرفه فعلياً (cheque:updateStatus)
    if (p.method !== 'cheque') {
      recordLedgerEntry({
        transaction_date: paymentDate,
        reference_type: REF.DIRECT_SALE_PAYMENT,
        reference_id: payId,
        amount_in: p.amount,
        amount_out: 0,
        method: p.method as 'cash' | 'visa',
        notes: `بيع مباشر #${invoiceId} — ${p.method}`,
      })
    }
  }
}

// ─── Day 2: Add direct sale invoice ──────────────────────────────────────────

export function addDirectSaleInvoice(input: DirectSaleInput): number {
  const db = getDB()

  const discount_type = input.discount_type ?? null
  const discount_value = discount_type ? (input.discount_value ?? 0) : 0
  const total_amount = applyDiscount(calcTotal(input.items), discount_type, discount_value)
  // حماية دفاعية: مجموع الدفعة الأولية النقدية لا يتجاوز إجمالي الفاتورة (وإلا صار المتبقّي سالباً)
  const initialPaid = input.payments.filter(p => p.method !== 'debt' && p.amount > 0).reduce((s, p) => s + p.amount, 0)
  if (initialPaid > total_amount + 0.001) {
    throw new Error(`مجموع الدفعة (${initialPaid.toFixed(2)} ₪) يتجاوز إجمالي الفاتورة (${total_amount.toFixed(2)} ₪)`)
  }
  // الترويسة تُدرَج بلا مدفوع؛ insertPayments أدناه يراكم الدفعة الأولية مرة واحدة.
  const amount_paid = 0
  const amount_remaining = total_amount

  const run = db.transaction(() => {
    const invoice_number = nextInvoiceNumber('INV', SALES_INVOICE_NUMBER_TABLES)
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO direct_sale_invoices
        (invoice_number, customer_name, customer_phone, sale_date, warranty, notes,
         discount_type, discount_value, total_amount, amount_paid, amount_remaining)
      VALUES
        (@invoice_number, @customer_name, @customer_phone, @sale_date, @warranty, @notes,
         @discount_type, @discount_value, @total_amount, @amount_paid, @amount_remaining)
    `).run({
      invoice_number,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      sale_date: input.sale_date,
      warranty: input.warranty ?? null,
      notes: input.notes ?? null,
      discount_type,
      discount_value,
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

// ─── Recalculate total (after discount) + remaining from current items ───────
// تُستدعى بعد أي تغيير على البنود أو على خصم الفاتورة (updateItems هنا،
// وقناة directSale:update في ipc-handlers.ts عند تعديل الخصم).

export function recalcDirectSaleTotals(invoiceId: number): void {
  const db = getDB()
  const itemRows = db.prepare(
    `SELECT quantity, unit_price FROM invoice_items WHERE invoice_id = ? AND invoice_type = 'direct_sale'`,
  ).all(invoiceId) as { quantity: number; unit_price: number }[]
  const subtotal = itemRows.reduce((sum, r) => sum + r.quantity * r.unit_price, 0)

  const row = db.prepare(
    `SELECT amount_paid, discount_type, discount_value FROM direct_sale_invoices WHERE id = ?`,
  ).get(invoiceId) as { amount_paid: number; discount_type: DiscountType | null; discount_value: number } | undefined

  const total = applyDiscount(subtotal, row?.discount_type, row?.discount_value)
  const paid = row?.amount_paid ?? 0
  // خصومات التسوية المطبّقة سابقاً تُطرح كي يبقى الثابت: total = paid + remaining + settlement
  const settle = (db.prepare(`
    SELECT COALESCE(SUM(settlement_discount),0) v FROM (
      SELECT settlement_discount FROM payments      WHERE invoice_id=? AND invoice_type='direct_sale'
      UNION ALL
      SELECT settlement_discount FROM debt_payments WHERE invoice_id=? AND invoice_type='direct_sale'
    )`).get(invoiceId, invoiceId) as { v: number }).v
  // حماية: لا يجوز أن يهبط الإجمالي تحت (المدفوع + خصم التسوية) وإلا صار المتبقّي سالباً
  if (total < paid + settle - 0.001) {
    throw new Error(`لا يمكن تعديل الفاتورة: الإجمالي بعد التعديل (${total.toFixed(2)} ₪) أقل من المدفوع مسبقاً + خصم التسوية (${(paid + settle).toFixed(2)} ₪)`)
  }
  db.prepare(
    `UPDATE direct_sale_invoices SET total_amount = ?, amount_remaining = ? WHERE id = ?`,
  ).run(total, total - paid - settle, invoiceId)
}

// ─── Update items for an existing direct sale invoice ────────────────────────
// discount (اختياري): يُكتب داخل نفس الـ transaction قبل إعادة الحساب — نموذج
// التعديل في DirectSales.tsx يمرّر البنود الجديدة والخصم الجديد معاً كي لا
// يُقيَّم الخصم الجديد مقابل البنود القديمة (أو العكس) بينهما.

export function updateDirectSaleItems(
  invoiceId: number,
  items: DirectSaleItemInput[],
  discount?: { type: DiscountType | null; value: number },
): void {
  const db = getDB()
  db.transaction(() => {
    db.prepare(
      `DELETE FROM invoice_items WHERE invoice_id = ? AND invoice_type = 'direct_sale'`,
    ).run(invoiceId)

    const stmt = db.prepare(`
      INSERT INTO invoice_items
        (invoice_id, invoice_type, item_name, quantity, unit_price, customer_owned, notes)
      VALUES (?, 'direct_sale', ?, ?, ?, 0, ?)
    `)
    for (const item of items) {
      stmt.run(invoiceId, item.item_name, item.quantity, item.unit_price, item.notes ?? null)
    }

    if (discount !== undefined) {
      db.prepare(
        `UPDATE direct_sale_invoices SET discount_type = ?, discount_value = ? WHERE id = ?`,
      ).run(discount.type, discount.type ? discount.value : 0, invoiceId)
    }

    recalcDirectSaleTotals(invoiceId)
  })()
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
