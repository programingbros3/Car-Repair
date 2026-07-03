/* ════════════════════════════════════════════════════════════════════════
   dbMapper.ts — جسر التحويل بين أنواع قاعدة البيانات وأنواع الواجهة
   ───────────────────────────────────────────────────────────────────────
   أنواع DB   (src/db/types.ts)        : snake_case للصفوف، 'cheque'، phone = null
   أنواع UI   (src/store/GarageContext): camelCase،            'check'،  phone = '0000'

   قواعد التحويل:
     • طريقة الدفع:  check ↔ cheque
     • الهاتف:       '0000' (واجهة) ↔ null/undefined (DB)
     • الحالة:       'in_progress' | 'delivered' تمرّ كما هي
     • التواريخ:     نفس الصيغة YYYY-MM-DD (بلا تحويل)

   ملاحظات دقّة:
     • InvoiceItemInput وInvoiceItemRow كلاهما يحويان warranty / part_type
       (موجودان في المخطّط ومُمثَّلَين بالنوعين)، فتُقرآن وتُكتبان في DB.
     • CarRecord لا يحمل دفعات؛ SaleRecord/SupplierRecord/DebtRecord تحملها،
       لذا تُمرَّر صفوف الدفعات كوسيط منفصل في اتجاه القراءة.
     • suppliers (الدليل) و warranties لا نظير لهما في types.ts بعد، فأُسقِطا.
════════════════════════════════════════════════════════════════════════ */

import type {
  CarRecord, CarItem,
  SaleRecord, SaleItem, SaleStatus,
  SupplierRecord, SupplierItem,
  Expense, Employee, SalaryRecord,
  DebtRecord, DebtType,
  PaymentRow, PayMethod,
  Supplier, WarrantyRecord,
  SaleInvoice, PurchaseInvoice,
  UpcomingCheque, ChequeRecord,
} from '../store/GarageContext'

import type {
  PaymentInput, PaymentMethod,
  DiscountType as DiscountTypeDb,
  InvoiceItemInput, InvoiceItemRow,
  MaintenanceInvoiceInput, MaintenanceInvoiceRow,
  DirectSaleInput, DirectSaleRow,
  SupplierItemInput, SupplierItemRow,
  SupplierInvoiceInput, SupplierInvoiceRow,
  DailyExpenseInput, DailyExpenseRow,
  EmployeeInput, EmployeeRow,
  SalaryInput, SalaryRow,
  PendingDebt, InvoiceType,
  SupplierDirectoryInput, SupplierDirectoryRow,
  WarrantyInput, WarrantyRow,
  SaleInvoiceRow, PurchaseInvoiceRow,
  UpcomingChequeRow, ChequeRow,
} from '../db/types'

/* ════════════════════════════════════════
   شكل صف الدفعة كما يُقرأ من DB (جمع join)
   لا يوجد نوع مقابل في types.ts، فنعرّفه هنا.
════════════════════════════════════════ */
export interface PaymentRowDb {
  id: number
  method: PaymentMethod
  amount: number
  cheque_number: string | null
  issue_date: string | null
  cash_date: string | null
  bank_name: string | null
  transaction_number: string | null
  notes?: string | null
}

/* ════════════════════════════════════════
   أوّليّات: طريقة الدفع، الهاتف، الحالة
════════════════════════════════════════ */
const UI_NO_PHONE = '0000'

/** DB → واجهة */
export function mapPaymentMethod(dbMethod: PaymentMethod): PayMethod {
  return dbMethod === 'cheque' ? 'check' : dbMethod
}

/** واجهة → DB */
export function unmapPaymentMethod(uiMethod: PayMethod): PaymentMethod {
  return uiMethod === 'check' ? 'cheque' : uiMethod
}

/** هاتف DB (null) → هاتف واجهة ('0000') */
export function phoneToUi(dbPhone: string | null): string {
  return dbPhone ?? UI_NO_PHONE
}

/** هاتف واجهة ('0000') → هاتف DB (undefined ⇒ null في طبقة DB) */
export function phoneToDb(uiPhone: string): string | undefined {
  return !uiPhone || uiPhone === UI_NO_PHONE ? undefined : uiPhone
}

/** يشتق حالة فاتورة البيع من الإجمالي/المدفوع (DB لا يخزّنها).
    remaining اختياري: يُمرَّر من amount_remaining المخزَّن كي تُحسب الحالة بدقّة عند
    وجود خصم تسوية (حيث total ≠ paid + remaining، لأن الخصم يُسقِط من المتبقّي فقط). */
export function saleStatus(total: number, paid: number, remaining?: number): SaleStatus {
  const rem = remaining ?? total - paid
  if (rem <= 0.001) return 'paid'
  if (paid <= 0.001) return 'full_debt'
  return 'partial_debt'
}

const DEBT_TYPE_LABEL: Record<DebtType, string> = {
  maintenance: 'صيانة',
  direct_sale: 'بيع مباشر',
}

/* ════════════════════════════════════════
   الدفعات
════════════════════════════════════════ */
/** PaymentRow (واجهة) → PaymentInput (DB) */
export function paymentRowToDbInput(p: PaymentRow): PaymentInput {
  return {
    method: unmapPaymentMethod(p.method),
    amount: p.amount,
    chequeNumber: p.checkNumber || undefined,
    issueDate: p.issueDate || undefined,
    cashDate: p.clearDate || undefined,
    bankName: p.bankName || undefined,
    transactionNumber: p.transactionNum || undefined,
  }
}

/** صف دفعة DB → PaymentRow (واجهة) */
export function dbPaymentToRow(r: PaymentRowDb): PaymentRow {
  return {
    id: r.id,
    method: mapPaymentMethod(r.method),
    amount: r.amount,
    checkNumber: r.cheque_number ?? '',
    issueDate: r.issue_date ?? '',
    clearDate: r.cash_date ?? '',
    bankName: r.bank_name ?? '',
    transactionNum: r.transaction_number ?? '',
  }
}

/* ════════════════════════════════════════
   عناصر الفاتورة (صيانة / بيع مباشر)
════════════════════════════════════════ */
/** CarItem (واجهة) → InvoiceItemInput (DB) */
export function carItemToDbInput(item: CarItem): InvoiceItemInput {
  return {
    item_name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    notes: item.notes || undefined,
    warranty: item.warranty || undefined,
    part_type: item.partType,
  }
}

/** InvoiceItemRow (DB) → CarItem (واجهة) */
export function dbRowToCarItem(r: InvoiceItemRow): CarItem {
  return {
    name: r.item_name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    warranty: r.warranty ?? '',
    partType: r.part_type === 'service' ? 'service' : 'part',
    notes: r.notes ?? '',
  }
}

/** SaleItem (واجهة) → InvoiceItemInput (DB) */
export function saleItemToDbInput(item: SaleItem): InvoiceItemInput {
  return {
    item_name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    notes: item.notes || undefined,
  }
}

/** InvoiceItemRow (DB) → SaleItem (واجهة) */
export function dbRowToSaleItem(r: InvoiceItemRow): SaleItem {
  return {
    id: r.id,
    name: r.item_name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    notes: r.notes ?? '',
  }
}

/* ════════════════════════════════════════
   الصيانة  (CarRecord ↔ Maintenance*)
════════════════════════════════════════ */
/** CarRecord (واجهة) → MaintenanceInvoiceInput (DB) */
export function carToDbInput(car: CarRecord, payments: PaymentRow[] = []): MaintenanceInvoiceInput {
  return {
    customer_name: car.customerName,
    customer_phone: phoneToDb(car.phone),
    car_plate: car.carPlate,
    car_type: car.carType || undefined,
    car_color: car.carColor || undefined,
    date_received: car.dateReceived,
    notes: car.notes || undefined,
    discount_type: car.discountType ?? null,
    discount_value: car.discountType ? (car.discountValue ?? 0) : 0,
    items: car.items.map(carItemToDbInput),
    payments: payments.map(paymentRowToDbInput),
  }
}

/** شكل مدخلات maintenance:update (تحديث كامل مع البنود) */
export interface MaintenanceUpdateInput {
  customer_name: string
  customer_phone?: string
  car_plate: string
  car_type?: string
  car_color?: string
  date_received: string
  notes?: string
  // undefined = المستدعي لا يحمل الخصم (SalesInvoices/PendingDebts) → يبقى المخزَّن كما هو
  discount_type?: DiscountTypeDb | null
  discount_value?: number
  items: InvoiceItemInput[]
}

/** CarRecord (واجهة) → مدخلات maintenance:update (DB) — يحوّل البنود بنفس منطق الإضافة */
export function carToUpdateInput(car: CarRecord): MaintenanceUpdateInput {
  return {
    customer_name: car.customerName,
    customer_phone: phoneToDb(car.phone),
    car_plate: car.carPlate,
    car_type: car.carType || undefined,
    car_color: car.carColor || undefined,
    date_received: car.dateReceived,
    notes: car.notes || undefined,
    discount_type: car.discountType === undefined ? undefined : car.discountType,
    discount_value: car.discountType === undefined ? undefined : (car.discountValue ?? 0),
    items: car.items.map(carItemToDbInput),
  }
}

/** MaintenanceInvoiceRow (DB) → CarRecord (واجهة) */
export function dbRowToCarRecord(row: MaintenanceInvoiceRow, items: InvoiceItemRow[] = []): CarRecord {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    phone: phoneToUi(row.customer_phone),
    carPlate: row.car_plate,
    carType: row.car_type ?? '',
    carColor: row.car_color ?? '',
    dateReceived: row.date_received,
    status: row.status,
    deliveredDate: row.date_released ?? undefined,
    notes: row.notes ?? '',
    discountType: row.discount_type ?? null,
    discountValue: row.discount_value ?? 0,
    total: row.total_amount,
    amountPaid: row.amount_paid,
    amountRemaining: row.amount_remaining,
    items: items.map(dbRowToCarItem),
  }
}

/* ════════════════════════════════════════
   البيع المباشر  (SaleRecord ↔ DirectSale*)
════════════════════════════════════════ */
/** SaleRecord (واجهة) → DirectSaleInput (DB) */
export function saleToDbInput(sale: SaleRecord, payments: PaymentRow[] = sale.payments): DirectSaleInput {
  return {
    customer_name: sale.customerName,
    customer_phone: phoneToDb(sale.phone),
    sale_date: sale.saleDate,
    warranty: sale.warranty || undefined,
    notes: sale.notes || undefined,
    // undefined = المستدعي لا يحمل الخصم (SalesInvoices/PendingDebts) → يبقى المخزَّن كما هو
    discount_type: sale.discountType === undefined ? undefined : sale.discountType,
    discount_value: sale.discountType === undefined ? undefined : (sale.discountValue ?? 0),
    items: sale.items.map(saleItemToDbInput),
    payments: payments.map(paymentRowToDbInput),
  }
}

/** DirectSaleRow (DB) → SaleRecord (واجهة) */
export function dbRowToSaleRecord(
  row: DirectSaleRow,
  items: InvoiceItemRow[] = [],
  payments: PaymentRowDb[] = [],
): SaleRecord {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    customerName: row.customer_name,
    phone: phoneToUi(row.customer_phone),
    saleDate: row.sale_date,
    warranty: row.warranty ?? '',
    notes: row.notes ?? '',
    discountType: row.discount_type ?? null,
    discountValue: row.discount_value ?? 0,
    total: row.total_amount,
    amountPaid: row.amount_paid,
    amountRemaining: row.amount_remaining,
    status: saleStatus(row.total_amount, row.amount_paid, row.amount_remaining),
    items: items.map(dbRowToSaleItem),
    payments: payments.map(dbPaymentToRow),
  }
}

/* ════════════════════════════════════════
   الموردون — فواتير  (SupplierRecord ↔ SupplierInvoice*)
════════════════════════════════════════ */
/** SupplierItem (واجهة) → SupplierItemInput (DB) */
export function supplierItemToDbInput(item: SupplierItem): SupplierItemInput {
  return {
    item_name: item.name,
    quantity: item.quantity,
    unit_price: item.unitPrice,
    notes: item.notes || undefined,
    discount_type: item.discountType ?? null,
    discount_value: item.discountType ? (item.discountValue ?? 0) : 0,
  }
}

/** SupplierItemRow (DB) → SupplierItem (واجهة) */
export function dbRowToSupplierItem(r: SupplierItemRow): SupplierItem {
  return {
    name: r.item_name,
    quantity: r.quantity,
    unitPrice: r.unit_price,
    notes: r.notes ?? '',
    discountType: r.discount_type ?? null,
    discountValue: r.discount_value ?? 0,
  }
}

/** SupplierRecord (واجهة) → SupplierInvoiceInput (DB) */
export function supplierToDbInput(
  sup: SupplierRecord,
  payments: PaymentRow[] = sup.payments,
): SupplierInvoiceInput {
  return {
    supplier_name: sup.supplierName,
    supplier_phone: phoneToDb(sup.phone),
    purchase_date: sup.purchaseDate,
    notes: sup.notes || undefined,
    items: sup.items.map(supplierItemToDbInput),
    payments: payments.map(paymentRowToDbInput),
  }
}

/** SupplierInvoiceRow (DB) → SupplierRecord (واجهة) */
export function dbRowToSupplierRecord(
  row: SupplierInvoiceRow,
  items: SupplierItemRow[] = [],
  payments: PaymentRowDb[] = [],
): SupplierRecord {
  return {
    id: row.id,
    invoiceNumber: row.invoice_number,
    supplierName: row.supplier_name,
    phone: phoneToUi(row.supplier_phone),
    purchaseDate: row.purchase_date,
    notes: row.notes ?? '',
    total: row.total_amount,
    amountPaid: row.amount_paid,
    amountRemaining: row.amount_remaining,
    items: items.map(dbRowToSupplierItem),
    payments: payments.map(dbPaymentToRow),
  }
}

/* ════════════════════════════════════════
   المصاريف اليومية  (Expense ↔ DailyExpense*)
════════════════════════════════════════ */
/** Expense (واجهة) → DailyExpenseInput (DB) */
export function expenseToDbInput(exp: Expense): DailyExpenseInput {
  return {
    description: exp.description,
    amount: exp.amount,
    expense_date: exp.date,
    notes: exp.notes || undefined,
  }
}

/** DailyExpenseRow (DB) → Expense (واجهة) */
export function dbRowToExpense(row: DailyExpenseRow): Expense {
  return {
    id: row.id,
    description: row.description,
    amount: row.amount,
    date: row.expense_date,
    notes: row.notes ?? '',
  }
}

/* ════════════════════════════════════════
   الموظفون  (Employee ↔ Employee*)
════════════════════════════════════════ */
/** Employee (واجهة) → EmployeeInput (DB) */
export function employeeToDbInput(emp: Employee): EmployeeInput {
  return {
    name: emp.name,
    phone: phoneToDb(emp.phone),
    daily_wage: emp.dailyWage,
  }
}

/** EmployeeRow (DB) → Employee (واجهة) */
export function dbRowToEmployee(row: EmployeeRow): Employee {
  return {
    id: row.id,
    name: row.name,
    phone: phoneToUi(row.phone),
    dailyWage: row.daily_wage,
  }
}

/* ════════════════════════════════════════
   الرواتب  (SalaryRecord ↔ Salary*)
   SalaryInput لا يحوي employee_id (يُمرَّر منفصلاً لطبقة DB).
════════════════════════════════════════ */
/** SalaryRecord (واجهة) → SalaryInput (DB) */
export function salaryToDbInput(sal: SalaryRecord): SalaryInput {
  return {
    days_worked: sal.daysWorked,
    bonus: sal.bonus,
    deduction: sal.deduction,
    payment_date: sal.date,
    notes: sal.notes || undefined,
  }
}

/** SalaryRow (DB) → SalaryRecord (واجهة) */
export function dbRowToSalaryRecord(row: SalaryRow): SalaryRecord {
  return {
    id: row.id,
    employeeId: row.employee_id,
    amount: row.amount,
    dailyWageSnapshot: row.daily_wage_snapshot,
    daysWorked: row.days_worked,
    bonus: row.bonus,
    deduction: row.deduction,
    date: row.payment_date,
    notes: row.notes ?? '',
  }
}

/* ════════════════════════════════════════
   الديون المعلّقة  (DebtRecord ↔ PendingDebt)
   car_plate/car_type/car_color: صيانة فقط (NULL لبيع مباشر) ⇒ '' / undefined افتراضياً.
════════════════════════════════════════ */
/** PendingDebt (DB) → DebtRecord (واجهة) */
export function pendingDebtToRecord(d: PendingDebt, payments: PaymentRowDb[] = []): DebtRecord {
  const type = d.invoice_type as DebtType
  return {
    id: d.invoice_id,
    type,
    typeLabel: DEBT_TYPE_LABEL[type],
    customerName: d.customer_name,
    phone: phoneToUi(d.customer_phone),
    date: d.invoice_date,
    carPlate: d.car_plate ?? '',
    total: d.total_amount,
    amountPaid: d.amount_paid,
    amountRemaining: d.amount_remaining,
    carType: d.car_type ?? undefined,
    carColor: d.car_color ?? undefined,
    notes: d.notes ?? undefined,
    payments: payments.map(dbPaymentToRow),
  }
}

/* ════════════════════════════════════════
   دليل الموردين  (Supplier ↔ SupplierDirectory*)
════════════════════════════════════════ */
/** Supplier (واجهة) → SupplierDirectoryInput (DB) */
export function supplierDirectoryToDbInput(s: Supplier): SupplierDirectoryInput {
  return {
    name: s.name,
    phone: phoneToDb(s.phone),
    notes: s.notes || undefined,
  }
}

/** SupplierDirectoryRow (DB) → Supplier (واجهة) */
export function dbRowToSupplierDirectory(r: SupplierDirectoryRow): Supplier {
  return {
    id: r.id,
    name: r.name,
    phone: phoneToUi(r.phone),
    notes: r.notes ?? '',
  }
}

/* ════════════════════════════════════════
   الكفالات  (WarrantyRecord ↔ Warranty*)
════════════════════════════════════════ */
/** WarrantyRecord (واجهة) → WarrantyInput (DB) */
export function warrantyToDbInput(w: WarrantyRecord): WarrantyInput {
  return {
    source: w.source,
    source_id: w.sourceId,
    customer_name: w.customerName,
    customer_phone: phoneToDb(w.phone),
    car_plate: w.carPlate || undefined,
    item_name: w.itemName,
    start_date: w.startDate,
    period_value: w.periodValue,
    period_unit: w.periodUnit,
    notes: w.notes || undefined,
  }
}

/** WarrantyRow (DB) → WarrantyRecord (واجهة) */
export function dbRowToWarranty(r: WarrantyRow): WarrantyRecord {
  return {
    id: r.id,
    source: r.source,
    sourceId: r.source_id,
    customerName: r.customer_name,
    phone: phoneToUi(r.customer_phone),
    carPlate: r.car_plate ?? '',
    carType: r.car_type ?? undefined,
    carColor: r.car_color ?? undefined,
    itemName: r.item_name,
    startDate: r.start_date,
    periodValue: r.period_value,
    periodUnit: r.period_unit,
    notes: r.notes ?? '',
  }
}

/* ════════════════════════════════════════
   فواتير البيع (عرض مجمّع)  SaleInvoiceRow → SaleInvoice
   عرض قراءة فقط؛ لا اتجاه كتابة (تتمّ الكتابة عبر صيانة/بيع مباشر).
════════════════════════════════════════ */
export function dbRowToSaleInvoice(r: SaleInvoiceRow): SaleInvoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    date: r.date,
    type: r.type,
    customerName: r.customer_name,
    phone: phoneToUi(r.customer_phone),
    total: r.total_amount,
    paid: r.amount_paid,
    remaining: r.amount_remaining,
    status: saleStatus(r.total_amount, r.amount_paid, r.amount_remaining),
    carPlate: r.car_plate,
    carType: r.car_type,
    carColor: r.car_color || undefined,
    dateReleased: r.date_released ?? undefined,
    carStatus: r.car_status ?? undefined,
    details: r.details,
    payments: [],
  }
}

/* ════════════════════════════════════════
   فواتير الشراء (عرض مجمّع)  PurchaseInvoiceRow → PurchaseInvoice
   عرض قراءة فقط؛ تتمّ الكتابة عبر موردين/مصاريف/رواتب.
════════════════════════════════════════ */
export function dbRowToPurchaseInvoice(r: PurchaseInvoiceRow): PurchaseInvoice {
  return {
    id: r.id,
    invoiceNumber: r.invoice_number,
    date: r.date,
    type: r.type,
    description: r.description,
    phone: phoneToUi(r.phone),
    total: r.total_amount,
    paid: r.amount_paid,
    remaining: r.amount_remaining,
    status: saleStatus(r.total_amount, r.amount_paid, r.amount_remaining),
    details: r.details,
    payments: [],
  }
}

/* ════════════════════════════════════════
   الشيكات المستحقة قريباً  UpcomingChequeRow → UpcomingCheque
   عرض قراءة فقط بالكامل؛ لا اتجاه كتابة.
════════════════════════════════════════ */
export function dbRowToUpcomingCheque(r: UpcomingChequeRow): UpcomingCheque {
  return {
    source: r.source,
    partyName: r.party_name,
    chequeNumber: r.cheque_number,
    bankName: r.bank_name,
    amount: r.amount,
    cashDate: r.cash_date,
    daysRemaining: r.days_remaining,
  }
}

/* ════════════════════════════════════════
   كل الشيكات  ChequeRow → ChequeRecord
   عرض قراءة فقط بالكامل؛ لا اتجاه كتابة. (نفس UpcomingCheque + تاريخ الإصدار)
════════════════════════════════════════ */
export function dbRowToCheque(r: ChequeRow): ChequeRecord {
  return {
    ...dbRowToUpcomingCheque(r),
    issueDate: r.issue_date,
  }
}

/* تأكيد ثابت: InvoiceType في DB يطابق DebtType في الواجهة */
const _invoiceTypeMatchesDebtType: InvoiceType extends DebtType ? true : false = true
void _invoiceTypeMatchesDebtType
