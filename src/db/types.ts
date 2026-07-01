// ─── Shared types between main process DB functions and renderer IPC calls ────

export type InvoiceType = 'maintenance' | 'direct_sale'
export type PaymentMethod = 'cash' | 'cheque' | 'visa' | 'debt'

// ── Payment ───────────────────────────────────────────────────────────────────

export interface PaymentInput {
  method: PaymentMethod
  amount: number
  chequeNumber?: string
  issueDate?: string
  cashDate?: string
  bankName?: string
  transactionNumber?: string
  notes?: string
}

// ── Invoice Items ─────────────────────────────────────────────────────────────

export interface DirectSaleItemInput {
  item_name: string
  quantity: number
  unit_price: number
  notes?: string
}

export interface InvoiceItemInput {
  item_name: string
  quantity: number
  unit_price: number
  customer_owned?: boolean
  notes?: string
  warranty?: string   // JSON: {"value":N,"unit":"week"|"month"|"year"} or null
  part_type?: string  // "part" | "service"
}

export interface InvoiceItemRow {
  id: number
  invoice_id: number
  invoice_type: InvoiceType
  item_name: string
  quantity: number
  unit_price: number
  customer_owned: number
  notes: string | null
  warranty?: string | null
  part_type?: string | null
}

// ── Maintenance ───────────────────────────────────────────────────────────────

export interface MaintenanceInvoiceInput {
  customer_name: string
  customer_phone?: string
  car_plate: string
  car_type?: string
  car_color?: string
  date_received: string
  warranty?: string
  notes?: string
  items: InvoiceItemInput[]
  payments: PaymentInput[]
}

export interface MaintenanceInvoiceRow {
  id: number
  invoice_number: string
  customer_name: string
  customer_phone: string | null
  car_plate: string
  car_type: string | null
  car_color: string | null
  date_received: string
  date_released: string | null
  status: 'in_progress' | 'delivered'
  warranty: string | null
  notes: string | null
  total_amount: number
  amount_paid: number
  amount_remaining: number
  created_at: string
}

export interface MaintenanceInvoiceDetail extends MaintenanceInvoiceRow {
  items: InvoiceItemRow[]
}

export interface MaintenanceFilters {
  status?: 'in_progress' | 'delivered'
  car_plate?: string
  customer_name?: string
  date_from?: string
  date_to?: string
}

export interface ReleaseCarInput {
  invoiceId: number
  date_released: string
  payments: PaymentInput[]
}

// ── Direct Sale ───────────────────────────────────────────────────────────────

export interface DirectSaleInput {
  customer_name: string
  customer_phone?: string
  sale_date: string
  warranty?: string
  notes?: string
  items: InvoiceItemInput[]
  payments: PaymentInput[]
}

export interface DirectSaleRow {
  id: number
  invoice_number: string
  customer_name: string
  customer_phone: string | null
  sale_date: string
  warranty: string | null
  notes: string | null
  total_amount: number
  amount_paid: number
  amount_remaining: number
  created_at: string
}

export interface DirectSaleDetail extends DirectSaleRow {
  items: InvoiceItemRow[]
}

export interface DirectSaleFilters {
  customer_name?: string
  date_from?: string
  date_to?: string
}

// ── Pending Debts ─────────────────────────────────────────────────────────────

export interface PendingDebt {
  invoice_id: number
  invoice_type: InvoiceType
  customer_name: string
  customer_phone: string | null
  invoice_date: string
  total_amount: number
  amount_paid: number
  amount_remaining: number
}

export interface DebtFilters {
  invoice_type?: InvoiceType
  customer_name?: string
}

// ── Suppliers ─────────────────────────────────────────────────────────────────

export interface SupplierItemInput {
  item_name: string
  quantity: number
  unit_price: number
  notes?: string
}

export interface SupplierItemRow {
  id: number
  invoice_id: number
  item_name: string
  quantity: number
  unit_price: number
  notes: string | null
}

export interface SupplierInvoiceInput {
  supplier_name: string
  supplier_phone?: string
  purchase_date: string
  notes?: string
  items: SupplierItemInput[]
  payments: PaymentInput[]
}

export interface SupplierInvoiceRow {
  id: number
  invoice_number: string
  supplier_name: string
  supplier_phone: string | null
  purchase_date: string
  notes: string | null
  total_amount: number
  amount_paid: number
  amount_remaining: number
  created_at: string
}

export interface SupplierInvoiceDetail extends SupplierInvoiceRow {
  items: SupplierItemRow[]
}

export interface SupplierFilters {
  supplier_name?: string
  date_from?: string
  date_to?: string
}

export interface SupplierPendingDebt {
  invoice_id: number
  supplier_name: string
  supplier_phone: string | null
  purchase_date: string
  total_amount: number
  amount_paid: number
  amount_remaining: number
}

// ── Cash Ledger ───────────────────────────────────────────────────────────────

export interface LedgerEntryInput {
  transaction_date: string
  reference_type: string
  reference_id: number
  amount_in: number
  amount_out: number
  notes?: string
}

export interface LedgerRow {
  id: number
  transaction_date: string
  reference_type: string
  reference_id: number
  amount_in: number
  amount_out: number
  balance_after: number
  notes: string | null
  created_at: string
}

export interface LedgerSummary {
  total_in: number
  total_out: number
  balance: number
}

// ── Expenses & Employees ──────────────────────────────────────────────────────

export interface DailyExpenseInput {
  description: string
  amount: number
  expense_date: string
  notes?: string
}

export interface DailyExpenseRow {
  id: number
  description: string
  amount: number
  expense_date: string
  notes: string | null
  created_at: string
}

export interface ExpenseFilters {
  date_from?: string
  date_to?: string
  search?: string
}

export interface EmployeeInput {
  name: string
  phone?: string
  daily_wage: number
}

export interface EmployeeRow {
  id: number
  name: string
  phone: string | null
  daily_wage: number
  created_at: string
}

export interface SalaryInput {
  days_worked: number
  bonus: number
  deduction: number
  payment_date: string
  notes?: string
}

export interface SalaryRow {
  id: number
  employee_id: number
  employee_name: string
  amount: number
  daily_wage_snapshot: number
  days_worked: number
  bonus: number
  deduction: number
  payment_date: string
  notes: string | null
  created_at: string
}

// ── Reports ───────────────────────────────────────────────────────────────────

export interface DailyReport {
  date: string
  maintenance_income: number
  direct_sale_income: number
  debt_collected: number
  supplier_expenses: number
  daily_expenses: number
  salaries: number
  total_in: number
  total_out: number
  net: number
  entries: LedgerRow[]
}

export interface MonthlyReportDay {
  date: string
  total_in: number
  total_out: number
  net: number
}

export interface MonthlyReport {
  month: number
  year: number
  total_in: number
  total_out: number
  net: number
  days: MonthlyReportDay[]
}

export interface DebtReport {
  customer_debts: PendingDebt[]
  supplier_debts: SupplierPendingDebt[]
  total_customer_debt: number
  total_supplier_debt: number
}

export interface TopCustomer {
  customer_name: string
  customer_phone: string | null
  visit_count: number
  total_spent: number
}

// ── أعمار الديون (debts aging) — قراءة فقط، تصنيف حسب تاريخ الفاتورة الأصلي ────

export type DebtAgingKind = 'maintenance' | 'direct_sale' | 'supplier'
export type DebtAgingBucket = '0-30' | '31-60' | '61-90' | '90+'

export interface DebtAgingRow {
  kind: DebtAgingKind
  invoice_id: number
  party_name: string
  party_phone: string | null
  invoice_date: string
  total_amount: number
  amount_paid: number
  amount_remaining: number
  days_old: number
  bucket: DebtAgingBucket
}

// ── Supplier directory (دليل الموردين المتكرّرين) ──────────────────────────────

export interface SupplierDirectoryRow {
  id: number
  name: string
  phone: string | null
  notes: string | null
  created_at: string
}

export interface SupplierDirectoryInput {
  name: string
  phone?: string
  notes?: string
}

// ── Warranties (الكفالات) ──────────────────────────────────────────────────────

export type WarrantySource = 'maintenance' | 'direct_sale'
export type WarrantyPeriodUnit = 'week' | 'month' | 'year'

export interface WarrantyRow {
  id: number
  source: WarrantySource
  source_id: number
  customer_name: string
  customer_phone: string | null
  car_plate: string | null
  item_name: string
  start_date: string
  period_value: number
  period_unit: WarrantyPeriodUnit
  notes: string | null
  created_at: string
}

export interface WarrantyInput {
  source: WarrantySource
  source_id: number
  customer_name: string
  customer_phone?: string
  car_plate?: string
  item_name: string
  start_date: string
  period_value: number
  period_unit: WarrantyPeriodUnit
  notes?: string
}

// ── Aggregate sale-invoices view (صيانة + بيع مباشر) ────────────────────────────

export type SaleInvoiceKind = 'maintenance' | 'direct_sale'

export interface SaleInvoiceRow {
  id: number
  invoice_number: string
  date: string
  type: SaleInvoiceKind
  customer_name: string
  customer_phone: string | null
  total_amount: number
  amount_paid: number
  amount_remaining: number
  car_plate: string
  car_type: string
  details: string
}

// ── Daily cash audits (إحصاء نهاية اليوم) ────────────────────────────────────────

export interface CashAuditRow {
  id: number
  audit_date: string
  system_total: number
  actual_amount: number
  difference: number
  created_at: string
}

export interface CashAuditInput {
  audit_date: string
  system_total: number
  actual_amount: number
  difference: number
}

// ── Aggregate purchase-invoices view (موردون + مصاريف + رواتب) ──────────────────

export type PurchaseInvoiceKind = 'supplier' | 'expense' | 'salary'

export interface PurchaseInvoiceRow {
  id: number
  invoice_number: string | null
  date: string
  type: PurchaseInvoiceKind
  description: string
  phone: string | null
  total_amount: number
  amount_paid: number
  amount_remaining: number
  details: string
}

// ── النسخ الاحتياطي التلقائي (autoBackup) — منفصل تماماً عن backup:export/backup:import ──

export interface AutoBackupSettings {
  enabled: boolean
  folder: string | null
  keepCount: number
}

export interface AutoBackupStatus {
  lastRunAt: string | null
  lastStatus: 'success' | 'failed' | null
  lastError: string | null
  lastSuccessAt: string | null
}

export interface AutoBackupRunResult {
  success: boolean
  filePath?: string
  error?: string
}

// ── الشيكات المستحقة قريباً (cheques) — قراءة فقط، من جداول الشيكات الأربعة الموجودة ──

export type UpcomingChequeKind = 'maintenance' | 'direct_sale' | 'supplier' | 'supplier_debt'

export interface UpcomingChequeRow {
  source: UpcomingChequeKind
  party_name: string
  cheque_number: string
  bank_name: string
  amount: number
  cash_date: string
  days_remaining: number
}

// ── الأمان (auth) — كلمة السر، القفل عند تجاوز المحاولات، القفل التلقائي، سجل النشاط ──

export interface PasswordVerifyResult {
  valid: boolean
  lockedUntil: number | null
  attemptsRemaining: number
}

export interface AutoLockSettings {
  enabled: boolean
  minutes: number
}

export interface ActivityLogRow {
  id: number
  action_type: string
  entity_type: string
  entity_id: number | null
  details: string | null
  created_at: string
}
