/* ════════════════════════════════════════════════════════════════════════
   services/db.ts — الواجهة الوحيدة بين React والـ IPC
   ───────────────────────────────────────────────────────────────────────
   • كل استدعاء IPC يمرّ من هنا — لا تستدعِ window.ipcRenderer مباشرةً من
     GarageContext ولا من الصفحات.
   • التحويل (mapping) بين أنواع الواجهة (camelCase, src/store/GarageContext)
     وأنواع قاعدة البيانات (snake_case, src/db/types) يتمّ في هذا الملف عبر
     دوال src/utils/dbMapper — لا في الطبقات الأخرى.
   • الاصطلاح على السلك: الوسائط الخارجة وأنواع العودة الخام هي أنواع DB
     (snake_case). يستقبل المعالج (main process) صفوف/مدخلات DB ويعيدها،
     ثمّ نحوّلها هنا إلى أنواع الواجهة.

   ملاحظات تغطية (تحت عقد dbMapper الحالي):
     • الصندوق (ledger) والتقارير (reports) لا نظير UI لها في dbMapper، فتُعاد
       كأنواع DB كما هي (قراءة فقط).
     • ديون الموردين (SupplierPendingDebt) لا mapper لها، فتُعاد كنوع DB.
     • دليل الموردين (Supplier) والكفالات (WarrantyRecord) لا types/mappers
       لهما في عقد db/types بعد، لذا لا يغطّيهما هذا الملف — تُضاف لاحقاً بعد
       إضافة أنواعها ومحوّلاتها.
════════════════════════════════════════════════════════════════════════ */

import type {
  CarRecord,
  SaleRecord, SaleItem, DiscountType as DiscountTypeUi,
  SupplierRecord,
  Expense, Employee, SalaryRecord,
  DebtType,
  PaymentRow,
  Supplier, WarrantyRecord,
} from '../store/GarageContext'

import type {
  MaintenanceInvoiceRow, MaintenanceInvoiceDetail, MaintenanceFilters,
  DirectSaleRow, DirectSaleDetail, DirectSaleFilters,
  SupplierInvoiceRow, SupplierInvoiceDetail, SupplierFilters, SupplierPendingDebt,
  DailyExpenseRow, ExpenseFilters,
  EmployeeRow, SalaryRow,
  PendingDebt, DebtFilters,
  LedgerRow, LedgerSummary,
  DailyReport, MonthlyReport, DebtReport, TopCustomer,
  SupplierDirectoryRow, WarrantyRow,
  SaleInvoiceRow, PurchaseInvoiceRow,
  CashAuditRow, CashAuditInput,
  AutoBackupSettings, AutoBackupStatus, AutoBackupRunResult,
  PasswordVerifyResult, AutoLockSettings, ActivityLogRow, VatSettings,
  UpcomingChequeRow,
  DebtAgingRow,
} from '../db/types'

import {
  carToDbInput, carToUpdateInput, dbRowToCarRecord,
  saleToDbInput, saleItemToDbInput, dbRowToSaleRecord,
  supplierToDbInput, dbRowToSupplierRecord,
  expenseToDbInput, dbRowToExpense,
  employeeToDbInput, dbRowToEmployee,
  salaryToDbInput, dbRowToSalaryRecord,
  pendingDebtToRecord,
  paymentRowToDbInput,
  supplierDirectoryToDbInput, dbRowToSupplierDirectory,
  warrantyToDbInput, dbRowToWarranty,
  dbRowToSaleInvoice, dbRowToPurchaseInvoice,
  dbRowToUpcomingCheque,
} from '../utils/dbMapper'

/* ════════════════════════════════════════
   المُستدعي الموحّد — يفكّ غلاف { success, data, error }
════════════════════════════════════════ */
async function invoke<T>(channel: string, ...args: unknown[]): Promise<T> {
  const result = (await window.ipcRenderer.invoke(channel, ...args)) as {
    success: boolean
    data?: T
    error?: string
  }
  if (!result.success) throw new Error(result.error)
  return result.data as T
}

/* ════════════════════════════════════════
   الخدمة
════════════════════════════════════════ */
export const dbService = {
  /* ─────────────── الصيانة ─────────────── */
  maintenance: {
    getAll: (filters?: MaintenanceFilters) =>
      invoke<MaintenanceInvoiceRow[]>('maintenance:getAll', filters).then(rows =>
        rows.map(r => dbRowToCarRecord(r)),
      ),

    getOne: (id: number) =>
      invoke<MaintenanceInvoiceDetail | null>('maintenance:getOne', id).then(detail =>
        detail ? dbRowToCarRecord(detail, detail.items) : null,
      ),

    history: (carPlate: string) =>
      invoke<MaintenanceInvoiceRow[]>('maintenance:history', carPlate).then(rows =>
        rows.map(r => dbRowToCarRecord(r)),
      ),

    add: (car: CarRecord, payments: PaymentRow[] = []) =>
      invoke<number>('maintenance:add', carToDbInput(car, payments)),

    update: (car: CarRecord) =>
      invoke<void>('maintenance:update', car.id, carToUpdateInput(car)),

    deliver: (invoiceId: number, date: string, payments: PaymentRow[] = []) =>
      invoke<void>('maintenance:deliver', {
        invoiceId,
        date_released: date,
        payments: payments.map(paymentRowToDbInput),
      }),

    delete: (id: number) => invoke<void>('maintenance:delete', id),
  },

  /* ─────────────── البيع المباشر ─────────────── */
  directSale: {
    getAll: (filters?: DirectSaleFilters) =>
      invoke<DirectSaleRow[]>('directSale:getAll', filters).then(rows =>
        rows.map(r => dbRowToSaleRecord(r)),
      ),

    getOne: (id: number) =>
      invoke<DirectSaleDetail | null>('directSale:getOne', id).then(detail =>
        detail ? dbRowToSaleRecord(detail, detail.items) : null,
      ),

    add: (sale: SaleRecord, payments: PaymentRow[] = sale.payments) =>
      invoke<number>('directSale:add', saleToDbInput(sale, payments)),

    update: (sale: SaleRecord) =>
      invoke<void>('directSale:update', sale.id, saleToDbInput(sale)),

    // discount (اختياري): يُطبَّق ذرّياً مع البنود الجديدة في نفس transaction
    // (لا يُقيَّم الخصم الجديد مقابل البنود القديمة)
    updateItems: (id: number, items: SaleItem[], discount?: { type: DiscountTypeUi | null; value: number }) =>
      invoke<void>('directSale:updateItems', id, items.map(saleItemToDbInput), discount),

    addPayment: (invoiceId: number, payments: PaymentRow[], date: string) =>
      invoke<void>('directSale:addPayment', invoiceId, payments.map(paymentRowToDbInput), date),

    delete: (id: number) => invoke<void>('directSale:delete', id),
  },

  /* ─────────────── فواتير الموردين ─────────────── */
  supplierInvoice: {
    getAll: (filters?: SupplierFilters) =>
      invoke<SupplierInvoiceRow[]>('supplierInvoice:getAll', filters).then(rows =>
        rows.map(r => dbRowToSupplierRecord(r)),
      ),

    getOne: (id: number) =>
      invoke<SupplierInvoiceDetail | null>('supplierInvoice:getOne', id).then(detail =>
        detail ? dbRowToSupplierRecord(detail, detail.items) : null,
      ),

    add: (sup: SupplierRecord, payments: PaymentRow[] = sup.payments) =>
      invoke<number>('supplierInvoice:add', supplierToDbInput(sup, payments)),

    update: (sup: SupplierRecord) =>
      invoke<void>('supplierInvoice:update', sup.id, supplierToDbInput(sup)),

    addPayment: (invoiceId: number, payments: PaymentRow[], date: string) =>
      invoke<void>('supplierInvoice:addPayment', invoiceId, payments.map(paymentRowToDbInput), date),

    addDebtPayment: (invoiceId: number, payments: PaymentRow[], date: string) =>
      invoke<void>('supplierInvoice:addDebtPayment', invoiceId, payments.map(paymentRowToDbInput), date),

    // لا نظير UI لـ SupplierPendingDebt في dbMapper بعد — تُعاد كنوع DB
    getDebts: () => invoke<SupplierPendingDebt[]>('supplierInvoice:getDebts'),

    searchNames: (query: string) => invoke<string[]>('supplierInvoice:searchNames', query),

    delete: (id: number) => invoke<void>('supplierInvoice:delete', id),
  },

  /* ─────────────── المصاريف اليومية ─────────────── */
  expense: {
    getAll: (filters?: ExpenseFilters) =>
      invoke<DailyExpenseRow[]>('expense:getAll', filters).then(rows => rows.map(dbRowToExpense)),

    add: (exp: Expense) => invoke<number>('expense:add', expenseToDbInput(exp)),

    update: (exp: Expense) => invoke<void>('expense:update', exp.id, expenseToDbInput(exp)),

    delete: (id: number) => invoke<void>('expense:delete', id),
  },

  /* ─────────────── الموظفون ─────────────── */
  employee: {
    getAll: () => invoke<EmployeeRow[]>('employee:getAll').then(rows => rows.map(dbRowToEmployee)),

    add: (emp: Employee) => invoke<number>('employee:add', employeeToDbInput(emp)),

    update: (emp: Employee) => invoke<void>('employee:update', emp.id, employeeToDbInput(emp)),

    delete: (id: number) => invoke<void>('employee:delete', id),
  },

  /* ─────────────── الرواتب ─────────────── */
  salary: {
    getAll: () => invoke<SalaryRow[]>('salary:getAll').then(rows => rows.map(dbRowToSalaryRecord)),

    getByEmployee: (employeeId: number) =>
      invoke<SalaryRow[]>('salary:getByEmployee', employeeId).then(rows =>
        rows.map(dbRowToSalaryRecord),
      ),

    add: (sal: SalaryRecord) =>
      invoke<number>('salary:add', sal.employeeId, salaryToDbInput(sal)),

    update: (id: number, sal: SalaryRecord) =>
      invoke<void>('salary:update', id, salaryToDbInput(sal)),

    delete: (id: number) => invoke<void>('salary:delete', id),
  },

  /* ─────────────── فواتير البيع (عرض مجمّع: صيانة + بيع مباشر) ─────────────── */
  salesInvoice: {
    getAll: () =>
      invoke<SaleInvoiceRow[]>('salesInvoice:getAll').then(rows => rows.map(dbRowToSaleInvoice)),
  },

  /* ─────────────── فواتير الشراء (عرض مجمّع: موردون + مصاريف + رواتب) ─────────────── */
  purchaseInvoice: {
    getAll: () =>
      invoke<PurchaseInvoiceRow[]>('purchaseInvoice:getAll').then(rows =>
        rows.map(dbRowToPurchaseInvoice),
      ),
  },

  /* ─────────────── دليل الموردين ─────────────── */
  suppliers: {
    getAll: () =>
      invoke<SupplierDirectoryRow[]>('suppliers:getAll').then(rows =>
        rows.map(dbRowToSupplierDirectory),
      ),

    add: (sup: Supplier) => invoke<number>('suppliers:add', supplierDirectoryToDbInput(sup)),

    update: (sup: Supplier) =>
      invoke<void>('suppliers:update', sup.id, supplierDirectoryToDbInput(sup)),

    delete: (id: number) => invoke<void>('suppliers:delete', id),
  },

  /* ─────────────── الكفالات ─────────────── */
  warranty: {
    getAll: () => invoke<WarrantyRow[]>('warranty:getAll').then(rows => rows.map(dbRowToWarranty)),

    update: (w: WarrantyRecord) => invoke<void>('warranty:update', w.id, warrantyToDbInput(w)),

    delete: (id: number) => invoke<void>('warranty:delete', id),
  },

  /* ─────────────── الديون المعلّقة (العملاء) ─────────────── */
  debt: {
    getAll: (filters?: DebtFilters) =>
      invoke<PendingDebt[]>('debt:getAll', filters).then(rows => rows.map(d => pendingDebtToRecord(d))),

    addPayment: (invoiceId: number, type: DebtType, payments: PaymentRow[], date: string) =>
      invoke<void>('debt:addPayment', invoiceId, type, payments.map(paymentRowToDbInput), date),
  },

  /* ─────────────── الصندوق (قراءة فقط، أنواع DB) ─────────────── */
  ledger: {
    getSummary: () => invoke<LedgerSummary>('ledger:getSummary'),
    getByDateRange: (from: string, to: string) =>
      invoke<LedgerRow[]>('ledger:getByDateRange', from, to),
  },

  /* ─────────────── إحصاء نهاية اليوم ─────────────── */
  cashAudit: {
    getAll: () => invoke<CashAuditRow[]>('cashAudit:getAll'),
    save: (input: CashAuditInput) => invoke<number>('cashAudit:save', input),
    delete: (id: number) => invoke<void>('cashAudit:delete', id),
  },

  /* ─────────────── دفعات الفواتير (للطباعة) ─────────────── */
  invoicePayments: {
    get: (invoiceId: number, invoiceType: 'maintenance' | 'direct_sale') =>
      invoke<Array<{ method: string; amount: number; payment_date: string }>>(
        'payments:getByInvoice', invoiceId, invoiceType,
      ),
    getSupplier: (invoiceId: number) =>
      invoke<Array<{ method: string; amount: number; payment_date: string }>>(
        'supplierPayments:getByInvoice', invoiceId,
      ),
  },

  /* ─────────────── الشيكات المستحقة قريباً (قراءة فقط) ─────────────── */
  cheques: {
    getUpcoming: (daysAhead = 14) =>
      invoke<UpcomingChequeRow[]>('cheques:getUpcoming', daysAhead).then(rows =>
        rows.map(dbRowToUpcomingCheque),
      ),
  },

  /* ─────────────── التقارير (قراءة فقط، أنواع DB) ─────────────── */
  report: {
    daily: (date: string) => invoke<DailyReport>('report:daily', date),
    monthly: (month: number, year: number) => invoke<MonthlyReport>('report:monthly', month, year),
    debts: () => invoke<DebtReport>('report:debts'),
    topCustomers: (limit = 10) => invoke<TopCustomer[]>('report:topCustomers', limit),
    debtsAging: () => invoke<DebtAgingRow[]>('report:debtsAging'),
  },

  /* ─────────────── النسخ الاحتياطي ─────────────── */
  backup: {
    export: () => invoke<string | null>('backup:export'),
    import: () => invoke<null>('backup:import'),
  },

  /* ─────────────── النسخ الاحتياطي التلقائي (منفصل تماماً عن backup أعلاه) ─────────────── */
  autoBackup: {
    getSettings: () => invoke<AutoBackupSettings>('autoBackup:getSettings'),
    updateSettings: (updates: Partial<AutoBackupSettings>) =>
      invoke<AutoBackupSettings>('autoBackup:updateSettings', updates),
    runNow: () => invoke<AutoBackupRunResult>('autoBackup:runNow'),
    getStatus: () => invoke<AutoBackupStatus>('autoBackup:getStatus'),
    pickFolder: () => invoke<string | null>('autoBackup:pickFolder'),
  },

  /* ─────────────── الأمان: كلمة السر / القفل عند تجاوز المحاولات / القفل التلقائي ─────────────── */
  auth: {
    verifyPassword: (password: string) => invoke<PasswordVerifyResult>('auth:verifyPassword', password),
    changePassword: (oldPassword: string, newPassword: string) =>
      invoke<void>('auth:changePassword', oldPassword, newPassword),
    getLockoutStatus: () =>
      invoke<{ lockedUntil: number | null; attemptsRemaining: number }>('auth:getLockoutStatus'),
    getAutoLockSettings: () => invoke<AutoLockSettings>('auth:getAutoLockSettings'),
    updateAutoLockSettings: (updates: Partial<AutoLockSettings>) =>
      invoke<AutoLockSettings>('auth:updateAutoLockSettings', updates),
  },

  /* ─────────────── سجل النشاط (قراءة فقط) ─────────────── */
  activityLog: {
    getAll: (limit?: number) => invoke<ActivityLogRow[]>('activityLog:getAll', limit),
  },

  /* ─────────────── الضريبة (VAT) — اختيارية، معطّلة افتراضياً ─────────────── */
  vat: {
    getSettings: () => invoke<VatSettings>('vat:getSettings'),
    updateSettings: (updates: Partial<VatSettings>) =>
      invoke<VatSettings>('vat:updateSettings', updates),
  },
}

export type DbService = typeof dbService
