import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import { nextInvoiceNumber, SALES_INVOICE_NUMBER_TABLES } from './invoiceNumber'
import { applyDiscount } from './discount'
import { applySettlementDiscount } from './payments'
import type {
  DiscountType,
  MaintenanceInvoiceInput,
  MaintenanceInvoiceRow,
  MaintenanceInvoiceDetail,
  MaintenanceFilters,
  InvoiceItemInput,
  PaymentInput,
  ReleaseCarInput,
} from './types'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcTotal(items: InvoiceItemInput[]): number {
  return items.reduce((sum, item) => {
    if (item.customer_owned) return sum
    return sum + item.quantity * item.unit_price
  }, 0)
}

// Insert items into invoice_items — call inside a transaction
function insertItems(invoiceId: number, items: InvoiceItemInput[]): void {
  const db = getDB()
  const stmt = db.prepare(`
    INSERT INTO invoice_items
      (invoice_id, invoice_type, item_name, quantity, unit_price, customer_owned, notes, warranty, part_type)
    VALUES (?, 'maintenance', ?, ?, ?, ?, ?, ?, ?)
  `)
  for (const item of items) {
    stmt.run(
      invoiceId,
      item.item_name,
      item.quantity,
      item.unit_price,
      item.customer_owned ? 1 : 0,
      item.notes ?? null,
      item.warranty ?? null,
      item.part_type ?? 'part',
    )
  }
}

// Insert payments + details + ledger — call inside a transaction
function insertPayments(
  invoiceId: number,
  paymentDate: string,
  payments: PaymentInput[],
  ledgerRefType: string,
  invoiceLabel: string,
): void {
  const db = getDB()

  for (const p of payments) {
    if (p.amount <= 0 || p.method === 'debt') continue

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO payments (invoice_id, invoice_type, payment_date, method, amount, notes)
      VALUES (?, 'maintenance', ?, ?, ?, ?)
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

    // Update invoice amounts
    db.prepare(`
      UPDATE maintenance_invoices
      SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ?
      WHERE id = ?
    `).run(p.amount, p.amount, invoiceId)

    recordLedgerEntry({
      transaction_date: paymentDate,
      reference_type: ledgerRefType,
      reference_id: payId,
      amount_in: p.amount,
      amount_out: 0,
      notes: `${invoiceLabel} #${invoiceId} — ${p.method}`,
    })
  }
}

// ─── Day 2: Add maintenance invoice ──────────────────────────────────────────

export function addMaintenanceInvoice(input: MaintenanceInvoiceInput): number {
  const db = getDB()

  const discount_type = input.discount_type ?? null
  const discount_value = discount_type ? (input.discount_value ?? 0) : 0
  const total_amount = applyDiscount(calcTotal(input.items), discount_type, discount_value)
  // حماية دفاعية: مجموع الدفعة الأولية النقدية لا يتجاوز إجمالي الفاتورة (وإلا صار المتبقّي سالباً)
  const initialPaid = input.payments.filter(p => p.method !== 'debt' && p.amount > 0).reduce((s, p) => s + p.amount, 0)
  if (initialPaid > total_amount + 0.001) {
    throw new Error(`مجموع الدفعة (${initialPaid.toFixed(2)} ₪) يتجاوز إجمالي الفاتورة (${total_amount.toFixed(2)} ₪)`)
  }
  // الترويسة تُدرَج بلا مدفوع؛ insertPayments أدناه يراكم الدفعة الأولية مرة واحدة
  // (المصدر الوحيد لتحديث amount_paid/amount_remaining، المشترك مع التسليم).
  const amount_paid = 0
  const amount_remaining = total_amount

  const run = db.transaction(() => {
    const invoice_number = nextInvoiceNumber('INV', SALES_INVOICE_NUMBER_TABLES)
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO maintenance_invoices
        (invoice_number, customer_name, customer_phone, car_plate, car_type, car_color,
         date_received, warranty, notes, discount_type, discount_value,
         total_amount, amount_paid, amount_remaining)
      VALUES
        (@invoice_number, @customer_name, @customer_phone, @car_plate, @car_type, @car_color,
         @date_received, @warranty, @notes, @discount_type, @discount_value,
         @total_amount, @amount_paid, @amount_remaining)
    `).run({
      invoice_number,
      customer_name: input.customer_name,
      customer_phone: input.customer_phone ?? null,
      car_plate: input.car_plate.toUpperCase(),
      car_type: input.car_type ?? null,
      car_color: input.car_color ?? null,
      date_received: input.date_received,
      warranty: input.warranty ?? null,
      notes: input.notes ?? null,
      discount_type,
      discount_value,
      total_amount,
      amount_paid,
      amount_remaining,
    })

    const invoiceId = Number(lastInsertRowid)

    insertItems(invoiceId, input.items)
    insertPayments(invoiceId, input.date_received, input.payments, REF.MAINTENANCE_PAYMENT, 'صيانة')

    return invoiceId
  })

  return run()
}

// ─── Day 2: Update invoice metadata ──────────────────────────────────────────

export function updateMaintenanceInvoice(
  invoiceId: number,
  updates: {
    customer_name?: string
    customer_phone?: string
    car_plate?: string
    car_type?: string
    car_color?: string
    date_received?: string
    warranty?: string
    notes?: string
    discount_type?: DiscountType | null   // undefined = لا تغيير على الخصم المخزَّن
    discount_value?: number
    items?: InvoiceItemInput[]   // إذا موجودة، تُستبدل كل البنود ويُعاد حساب الإجمالي/المتبقّي
  },
): void {
  const db = getDB()

  const run = db.transaction(() => {
    // ── 1) تحديث الحقول النصية ──
    const fields: string[] = []
    const values: unknown[] = []

    if (updates.customer_name  !== undefined) { fields.push('customer_name = ?');  values.push(updates.customer_name) }
    if (updates.customer_phone !== undefined) { fields.push('customer_phone = ?'); values.push(updates.customer_phone ?? null) }
    if (updates.car_plate      !== undefined) { fields.push('car_plate = ?');      values.push(updates.car_plate.toUpperCase()) }
    if (updates.car_type       !== undefined) { fields.push('car_type = ?');       values.push(updates.car_type ?? null) }
    if (updates.car_color      !== undefined) { fields.push('car_color = ?');      values.push(updates.car_color ?? null) }
    if (updates.date_received  !== undefined) { fields.push('date_received = ?');  values.push(updates.date_received) }
    if (updates.warranty       !== undefined) { fields.push('warranty = ?');       values.push(updates.warranty ?? null) }
    if (updates.notes          !== undefined) { fields.push('notes = ?');          values.push(updates.notes ?? null) }
    if (updates.discount_type  !== undefined) { fields.push('discount_type = ?');  values.push(updates.discount_type) }
    if (updates.discount_value !== undefined) { fields.push('discount_value = ?'); values.push(updates.discount_value ?? 0) }

    if (fields.length > 0) {
      values.push(invoiceId)
      db.prepare(`UPDATE maintenance_invoices SET ${fields.join(', ')} WHERE id = ?`).run(...values)
    }

    // ── 2) استبدال البنود (فقط إذا مُرِّرت) ──
    if (updates.items !== undefined) {
      db.prepare(
        `DELETE FROM invoice_items WHERE invoice_id = ? AND invoice_type = 'maintenance'`
      ).run(invoiceId)

      insertItems(invoiceId, updates.items)
    }

    // ── 3) إعادة حساب الإجمالي (بعد الخصم) والمتبقّي إذا تغيّرت البنود أو الخصم ──
    const discountTouched = updates.discount_type !== undefined || updates.discount_value !== undefined
    if (updates.items !== undefined || discountTouched) {
      const itemRows = db.prepare(
        `SELECT quantity, unit_price, customer_owned FROM invoice_items WHERE invoice_id = ? AND invoice_type = 'maintenance'`
      ).all(invoiceId) as { quantity: number; unit_price: number; customer_owned: number }[]
      const subtotal = itemRows.reduce(
        (sum, r) => r.customer_owned ? sum : sum + r.quantity * r.unit_price, 0)

      const current = db.prepare(
        `SELECT amount_paid, discount_type, discount_value FROM maintenance_invoices WHERE id = ?`
      ).get(invoiceId) as { amount_paid: number; discount_type: DiscountType | null; discount_value: number } | undefined

      const total_amount = applyDiscount(subtotal, current?.discount_type, current?.discount_value)
      const paid = current?.amount_paid ?? 0
      // خصومات التسوية المطبّقة سابقاً أُسقِطت من المتبقّي ولم تُحسب نقدية — يجب طرحها
      // عند إعادة الحساب كي يبقى الثابت: total = paid + remaining + settlement.
      const settle = (db.prepare(`
        SELECT COALESCE(SUM(settlement_discount),0) v FROM (
          SELECT settlement_discount FROM payments      WHERE invoice_id=? AND invoice_type='maintenance'
          UNION ALL
          SELECT settlement_discount FROM debt_payments WHERE invoice_id=? AND invoice_type='maintenance'
        )`).get(invoiceId, invoiceId) as { v: number }).v
      // حماية: لا يجوز أن يهبط الإجمالي تحت (المدفوع + خصم التسوية) وإلا صار المتبقّي سالباً
      if (total_amount < paid + settle - 0.001) {
        throw new Error(`لا يمكن تعديل الفاتورة: الإجمالي بعد التعديل (${total_amount.toFixed(2)} ₪) أقل من المدفوع مسبقاً + خصم التسوية (${(paid + settle).toFixed(2)} ₪)`)
      }
      const amount_remaining = total_amount - paid - settle

      db.prepare(`
        UPDATE maintenance_invoices
        SET total_amount = ?, amount_remaining = ?
        WHERE id = ?
      `).run(total_amount, amount_remaining, invoiceId)
    }
  })

  run()
}

// ─── Day 2: Release car ───────────────────────────────────────────────────────

export function releaseMaintenanceCar(input: ReleaseCarInput): void {
  const db = getDB()

  const run = db.transaction(() => {
    const invoice = db.prepare(
      `SELECT id, amount_remaining FROM maintenance_invoices WHERE id = ? AND status = 'in_progress'`
    ).get(input.invoiceId) as { id: number; amount_remaining: number } | undefined

    if (!invoice) throw new Error('الفاتورة غير موجودة أو تم تسليم السيارة مسبقاً')

    // التحقق من عدم تجاوز المبلغ المدفوع (+ خصم التسوية) للمتبقي
    const totalNew = input.payments.filter(p => p.amount > 0 && p.method !== 'debt').reduce((s, p) => s + p.amount, 0)
    if (totalNew > invoice.amount_remaining + 0.001) {
      throw new Error(`مجموع الدفعة (${totalNew.toFixed(2)} ₪) يتجاوز المتبقي (${invoice.amount_remaining.toFixed(2)} ₪)`)
    }

    db.prepare(`
      UPDATE maintenance_invoices
      SET date_released = ?, status = 'delivered'
      WHERE id = ?
    `).run(input.date_released, input.invoiceId)

    insertPayments(
      input.invoiceId,
      input.date_released,
      input.payments,
      REF.MAINTENANCE_RELEASE,
      'تسليم صيانة',
    )

    // خصم التسوية عند التسليم: يُخصم من amount_remaining دون تسجيل نقدية في cash_ledger
    applySettlementDiscount(db, 'payments', input.invoiceId, 'maintenance', 'maintenance_invoices',
      input.date_released, input.settlementDiscount ?? 0, invoice.amount_remaining - totalNew)
  })

  run()
}

// ─── Day 2: Get invoices with filters ────────────────────────────────────────

export function getMaintenanceInvoices(filters: MaintenanceFilters = {}): MaintenanceInvoiceRow[] {
  const db = getDB()

  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.status) {
    conditions.push('status = ?')
    params.push(filters.status)
  }
  if (filters.car_plate) {
    conditions.push('car_plate LIKE ?')
    params.push(`%${filters.car_plate.toUpperCase()}%`)
  }
  if (filters.customer_name) {
    conditions.push('customer_name LIKE ?')
    params.push(`%${filters.customer_name}%`)
  }
  if (filters.date_from) {
    conditions.push('date_received >= ?')
    params.push(filters.date_from)
  }
  if (filters.date_to) {
    conditions.push('date_received <= ?')
    params.push(filters.date_to)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  return db.prepare(`
    SELECT * FROM maintenance_invoices ${where} ORDER BY date_received DESC, id DESC
  `).all(...params) as MaintenanceInvoiceRow[]
}

// ─── Day 2: Get single invoice with items ────────────────────────────────────

export function getMaintenanceInvoice(invoiceId: number): MaintenanceInvoiceDetail | null {
  const db = getDB()

  const invoice = db.prepare(
    'SELECT * FROM maintenance_invoices WHERE id = ?'
  ).get(invoiceId) as MaintenanceInvoiceRow | undefined

  if (!invoice) return null

  const items = db.prepare(
    `SELECT * FROM invoice_items WHERE invoice_id = ? AND invoice_type = 'maintenance' ORDER BY id ASC`
  ).all(invoiceId)

  return { ...invoice, items } as MaintenanceInvoiceDetail
}

// ─── Day 2: Car history by plate ─────────────────────────────────────────────

export function getCarHistory(car_plate: string): MaintenanceInvoiceRow[] {
  const db = getDB()

  return db.prepare(`
    SELECT * FROM maintenance_invoices
    WHERE car_plate = ?
    ORDER BY date_received DESC
  `).all(car_plate.toUpperCase()) as MaintenanceInvoiceRow[]
}
