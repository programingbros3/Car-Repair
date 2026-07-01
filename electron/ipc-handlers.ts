/* eslint-disable @typescript-eslint/no-explicit-any */
/* ════════════════════════════════════════════════════════════════════════
   ipc-handlers.ts — كل معالجات IPC لتطبيق الكراج
   تُستدعى registerIpcHandlers(db) مرّة واحدة بعد تهيئة قاعدة البيانات.

   العقد (يطابق src/services/db.ts):
   • كل معالج يُعيد صفوف/مدخلات قاعدة البيانات الخام (snake_case)؛ التحويل إلى
     أنواع الواجهة (camelCase) يتمّ في طبقة الواجهة عبر src/utils/dbMapper.
   • كل معالج ملفوف بـ on() ويُعيد { success, data } أو { success:false, error }.
   • منطق الأعمال الأساسي يعيش في src/db/* (Layer A)؛ هذا الملف يربطه بالقنوات
     فقط، مع SQL مضمّن للفجوات (الحذف/التعديل/الدليل/الكفالات/العروض المجمّعة).
════════════════════════════════════════════════════════════════════════ */
import { ipcMain, dialog, app } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'

import {
  addMaintenanceInvoice, addMaintenanceItem, updateMaintenanceInvoice,
  releaseMaintenanceCar, getMaintenanceInvoices, getMaintenanceInvoice, getCarHistory,
} from '../src/db/maintenance'
import {
  addDirectSaleInvoice, updateDirectSaleItems, getDirectSaleInvoices, getDirectSaleInvoice,
} from '../src/db/direct-sale'
import {
  addSupplierInvoice, addSupplierPayment, addSupplierDebtPayment,
  getSupplierInvoices, getSupplierInvoice, getSupplierDebts, searchSupplierNames,
} from '../src/db/suppliers'
import {
  addDailyExpense, getDailyExpenses,
  addEmployee, updateEmployee, getEmployees,
  addSalaryPayment, updateSalaryPayment, getSalaryHistory, getAllSalaries,
} from '../src/db/expenses'
import { addPayment, addDebtPayment, getPendingDebts } from '../src/db/payments'
import { getLedgerSummary, getLedgerByDateRange, recordLedgerEntry, REF } from '../src/db/ledger'
import { getDailyReport, getMonthlyReport, getDebtReport, getTopCustomers } from '../src/db/reports'

import type {
  MaintenanceFilters, DirectSaleFilters, SupplierFilters, ExpenseFilters, DebtFilters,
  PaymentInput, InvoiceType, InvoiceItemInput, DirectSaleItemInput,
  MaintenanceInvoiceInput, DirectSaleInput, SupplierInvoiceInput,
  DailyExpenseInput, EmployeeInput, SalaryInput,
  SupplierDirectoryInput, WarrantyInput,
} from '../src/db/types'

type DB = Database.Database

const today = () => new Date().toISOString().slice(0, 10)

/* ── مزامنة الكفالات مع جدول warranties عند حفظ الفواتير ── */
function syncWarrantiesForMaintenance(db: DB, invoiceId: number): void {
  const inv = db.prepare(
    `SELECT customer_name, customer_phone, car_plate, date_received FROM maintenance_invoices WHERE id=?`,
  ).get(invoiceId) as any
  if (!inv) return
  db.transaction(() => {
    db.prepare(`DELETE FROM warranties WHERE source='maintenance' AND source_id=?`).run(invoiceId)
    const items = db.prepare(
      `SELECT item_name, warranty FROM invoice_items WHERE invoice_id=? AND invoice_type='maintenance'`,
    ).all(invoiceId) as any[]
    for (const item of items) {
      if (!item.warranty) continue
      try {
        const w = JSON.parse(item.warranty)
        if (!w.value || !w.unit) continue
        db.prepare(`
          INSERT INTO warranties (source, source_id, customer_name, customer_phone, car_plate, item_name, start_date, period_value, period_unit, notes)
          VALUES (?,?,?,?,?,?,?,?,?,?)
        `).run('maintenance', invoiceId, inv.customer_name, inv.customer_phone, inv.car_plate,
               item.item_name, inv.date_received, Number(w.value), String(w.unit), null)
      } catch { /* JSON غير صالح، تخطّ */ }
    }
  })()
}

function syncWarrantiesForDirectSale(db: DB, invoiceId: number): void {
  const inv = db.prepare(
    `SELECT customer_name, customer_phone, sale_date, warranty FROM direct_sale_invoices WHERE id=?`,
  ).get(invoiceId) as any
  if (!inv) return
  db.transaction(() => {
    db.prepare(`DELETE FROM warranties WHERE source='direct_sale' AND source_id=?`).run(invoiceId)
    if (!inv.warranty) return
    try {
      const w = JSON.parse(inv.warranty)
      if (!w.value || !w.unit) return
      db.prepare(`
        INSERT INTO warranties (source, source_id, customer_name, customer_phone, car_plate, item_name, start_date, period_value, period_unit, notes)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run('direct_sale', invoiceId, inv.customer_name, inv.customer_phone, null,
             'كفالة شاملة', inv.sale_date, Number(w.value), String(w.unit), null)
    } catch { /* JSON غير صالح، تخطّ */ }
  })()
}

/** يسجّل معالجاً ملفوفاً بـ try/catch موحّد */
function on(channel: string, fn: (...args: any[]) => any): void {
  ipcMain.handle(channel, async (_event, ...args: any[]) => {
    try {
      return { success: true, data: fn(...args) }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}

/* ════════════════════════════════════════
   أدوات حذف داخلية (تنظيف الصندوق + الجداول المرتبطة)
════════════════════════════════════════ */
/** يحذف قيود الصندوق التي تشير إلى دفعات محدّدة (reference_id = payment id) */
function clearLedgerForPayments(db: DB, refTypes: string[], payIds: number[]): void {
  if (payIds.length === 0) return
  const placeholders = payIds.map(() => '?').join(',')
  for (const rt of refTypes) {
    db.prepare(`DELETE FROM cash_ledger WHERE reference_type=? AND reference_id IN (${placeholders})`).run(rt, ...payIds)
  }
}

function paymentIds(db: DB, table: string, where: string, ...params: any[]): number[] {
  return (db.prepare(`SELECT id FROM ${table} WHERE ${where}`).all(...params) as { id: number }[]).map(r => r.id)
}

/* ════════════════════════════════════════
   التسجيل الرئيسي للمعالجات
════════════════════════════════════════ */
export function registerIpcHandlers(db: DB): void {
  /* ─────────────── الصيانة ─────────────── */
  on('maintenance:getAll', (filters?: MaintenanceFilters) => getMaintenanceInvoices(filters ?? {}))
  on('maintenance:getOne', (id: number) => getMaintenanceInvoice(id))
  on('maintenance:history', (carPlate: string) => getCarHistory(carPlate))
  on('maintenance:add', (input: MaintenanceInvoiceInput) => {
    const id = addMaintenanceInvoice(input)
    syncWarrantiesForMaintenance(db, id)
    return id
  })
  on('maintenance:update', (id: number, updates: {
    customer_name?: string; customer_phone?: string; car_plate?: string
    car_type?: string; car_color?: string; date_received?: string
    warranty?: string; notes?: string; items?: InvoiceItemInput[]
  }) => {
    updateMaintenanceInvoice(id, updates)
    syncWarrantiesForMaintenance(db, id)
  })
  on('maintenance:addItem', (invoiceId: number, item: InvoiceItemInput) =>
    addMaintenanceItem(invoiceId, item))
  on('maintenance:deliver', (input: { invoiceId: number; date_released: string; payments: PaymentInput[] }) =>
    releaseMaintenanceCar(input))
  on('maintenance:delete', (id: number) => {
    db.transaction(() => {
      const payIds = paymentIds(db, 'payments', `invoice_id=? AND invoice_type='maintenance'`, id)
      const debtIds = paymentIds(db, 'debt_payments', `invoice_id=? AND invoice_type='maintenance'`, id)
      clearLedgerForPayments(db, [REF.MAINTENANCE_PAYMENT, REF.MAINTENANCE_RELEASE], payIds)
      clearLedgerForPayments(db, [REF.DEBT_CUSTOMER], debtIds)
      db.prepare(`DELETE FROM payments WHERE invoice_id=? AND invoice_type='maintenance'`).run(id)
      db.prepare(`DELETE FROM debt_payments WHERE invoice_id=? AND invoice_type='maintenance'`).run(id)
      db.prepare(`DELETE FROM invoice_items WHERE invoice_id=? AND invoice_type='maintenance'`).run(id)
      db.prepare(`DELETE FROM warranties WHERE source='maintenance' AND source_id=?`).run(id)
      db.prepare(`DELETE FROM maintenance_invoices WHERE id=?`).run(id)
    })()
    return { id }
  })

  /* ─────────────── البيع المباشر ─────────────── */
  on('directSale:getAll', (filters?: DirectSaleFilters) => getDirectSaleInvoices(filters ?? {}))
  on('directSale:getOne', (id: number) => getDirectSaleInvoice(id))
  on('directSale:add', (input: DirectSaleInput) => {
    const id = addDirectSaleInvoice(input)
    syncWarrantiesForDirectSale(db, id)
    return id
  })
  on('directSale:update', (id: number, input: DirectSaleInput) => {
    db.prepare(
      `UPDATE direct_sale_invoices SET customer_name=?, customer_phone=?, sale_date=?, warranty=?, notes=? WHERE id=?`,
    ).run(
      input.customer_name, input.customer_phone ?? null, input.sale_date,
      input.warranty ?? null, input.notes ?? null, id,
    )
    syncWarrantiesForDirectSale(db, id)
  })
  on('directSale:updateItems', (invoiceId: number, items: DirectSaleItemInput[]) =>
    updateDirectSaleItems(invoiceId, items))
  on('directSale:addPayment', (invoiceId: number, payments: PaymentInput[], date: string) =>
    addPayment(invoiceId, 'direct_sale', payments, date))
  on('directSale:delete', (id: number) => {
    db.transaction(() => {
      const payIds = paymentIds(db, 'payments', `invoice_id=? AND invoice_type='direct_sale'`, id)
      const debtIds = paymentIds(db, 'debt_payments', `invoice_id=? AND invoice_type='direct_sale'`, id)
      clearLedgerForPayments(db, [REF.DIRECT_SALE_PAYMENT], payIds)
      clearLedgerForPayments(db, [REF.DEBT_CUSTOMER], debtIds)
      db.prepare(`DELETE FROM payments WHERE invoice_id=? AND invoice_type='direct_sale'`).run(id)
      db.prepare(`DELETE FROM debt_payments WHERE invoice_id=? AND invoice_type='direct_sale'`).run(id)
      db.prepare(`DELETE FROM invoice_items WHERE invoice_id=? AND invoice_type='direct_sale'`).run(id)
      db.prepare(`DELETE FROM warranties WHERE source='direct_sale' AND source_id=?`).run(id)
      db.prepare(`DELETE FROM direct_sale_invoices WHERE id=?`).run(id)
    })()
    return { id }
  })

  /* ─────────────── فواتير الموردين ─────────────── */
  on('supplierInvoice:getAll', (filters?: SupplierFilters) => getSupplierInvoices(filters ?? {}))
  on('supplierInvoice:getOne', (id: number) => getSupplierInvoice(id))
  on('supplierInvoice:add', (input: SupplierInvoiceInput) => addSupplierInvoice(input))
  on('supplierInvoice:update', (id: number, input: SupplierInvoiceInput) => {
    db.prepare(
      `UPDATE supplier_invoices SET supplier_name=?, supplier_phone=?, purchase_date=?, notes=? WHERE id=?`,
    ).run(input.supplier_name, input.supplier_phone ?? null, input.purchase_date, input.notes ?? null, id)
  })
  on('supplierInvoice:addPayment', (invoiceId: number, payments: PaymentInput[], date: string) =>
    addSupplierPayment(invoiceId, payments, date))
  on('supplierInvoice:addDebtPayment', (invoiceId: number, payments: PaymentInput[], date: string) =>
    addSupplierDebtPayment(invoiceId, payments, date))
  on('supplierInvoice:getDebts', () => getSupplierDebts())
  on('supplierInvoice:searchNames', (query: string) => searchSupplierNames(query))
  on('supplierInvoice:delete', (id: number) => {
    db.transaction(() => {
      const payIds = paymentIds(db, 'supplier_payments', `invoice_id=?`, id)
      const debtIds = paymentIds(db, 'supplier_debt_payments', `invoice_id=?`, id)
      clearLedgerForPayments(db, [REF.SUPPLIER_PAYMENT], payIds)
      clearLedgerForPayments(db, [REF.SUPPLIER_DEBT], debtIds)
      db.prepare(`DELETE FROM supplier_invoices WHERE id=?`).run(id) // FK cascade للعناصر والدفعات
    })()
    return { id }
  })

  /* ─────────────── المصاريف اليومية ─────────────── */
  on('expense:getAll', (filters?: ExpenseFilters) => getDailyExpenses(filters ?? {}))
  on('expense:add', (input: DailyExpenseInput) => addDailyExpense(input))
  on('expense:update', (id: number, input: DailyExpenseInput) => {
    db.transaction(() => {
      db.prepare(`UPDATE daily_expenses SET description=?, amount=?, expense_date=?, notes=? WHERE id=?`).run(
        input.description, input.amount, input.expense_date, input.notes ?? null, id,
      )
      db.prepare(`DELETE FROM cash_ledger WHERE reference_type=? AND reference_id=?`).run(REF.DAILY_EXPENSE, id)
      recordLedgerEntry({
        transaction_date: input.expense_date, reference_type: REF.DAILY_EXPENSE,
        reference_id: id, amount_in: 0, amount_out: input.amount, notes: input.description,
      })
    })()
  })
  on('expense:delete', (id: number) => {
    db.transaction(() => {
      db.prepare(`DELETE FROM cash_ledger WHERE reference_type=? AND reference_id=?`).run(REF.DAILY_EXPENSE, id)
      db.prepare(`DELETE FROM daily_expenses WHERE id=?`).run(id)
    })()
    return { id }
  })

  /* ─────────────── الموظفون ─────────────── */
  on('employee:getAll', () => getEmployees())
  on('employee:add', (input: EmployeeInput) => addEmployee(input))
  on('employee:update', (id: number, input: EmployeeInput) => updateEmployee(id, input))
  on('employee:delete', (id: number) => {
    db.prepare(`DELETE FROM employees WHERE id=?`).run(id)
    return { id }
  })

  /* ─────────────── الرواتب ─────────────── */
  on('salary:getAll', () => getAllSalaries())
  on('salary:getByEmployee', (employeeId: number) => getSalaryHistory(employeeId))
  on('salary:add', (employeeId: number, input: SalaryInput) => addSalaryPayment(employeeId, input))
  on('salary:update', (id: number, input: SalaryInput) => updateSalaryPayment(id, input))
  on('salary:delete', (id: number) => {
    db.transaction(() => {
      db.prepare(`DELETE FROM cash_ledger WHERE reference_type=? AND reference_id=?`).run(REF.SALARY, id)
      db.prepare(`DELETE FROM salary_payments WHERE id=?`).run(id)
    })()
    return { id }
  })

  /* ─────────────── الديون المعلّقة (العملاء) ─────────────── */
  on('debt:getAll', (filters?: DebtFilters) => getPendingDebts(filters ?? {}))
  on('debt:addPayment', (invoiceId: number, type: InvoiceType, payments: PaymentInput[], date: string) =>
    addDebtPayment(invoiceId, type, payments, date))

  /* ─────────────── الصندوق ─────────────── */
  on('ledger:getSummary', () => getLedgerSummary())
  on('ledger:getByDateRange', (from: string, to: string) => getLedgerByDateRange(from, to))

  /* ─────────────── التقارير ─────────────── */
  on('report:daily', (date: string) => getDailyReport(date))
  on('report:monthly', (month: number, year: number) => getMonthlyReport(month, year))
  on('report:debts', () => getDebtReport())
  on('report:topCustomers', (limit?: number) => getTopCustomers(limit ?? 10))

  /* ─────────────── فواتير البيع (عرض مجمّع: صيانة + بيع مباشر) ─────────────── */
  on('salesInvoice:getAll', () =>
    db.prepare(`
      SELECT id, date_received AS date, 'maintenance' AS type, customer_name, customer_phone,
             total_amount, amount_paid, amount_remaining,
             car_plate, COALESCE(car_type,'') AS car_type, COALESCE(notes,'') AS details
        FROM maintenance_invoices
      UNION ALL
      SELECT id, sale_date AS date, 'direct_sale' AS type, customer_name, customer_phone,
             total_amount, amount_paid, amount_remaining,
             '' AS car_plate, '' AS car_type, COALESCE(notes,'') AS details
        FROM direct_sale_invoices
      ORDER BY date DESC, id DESC
    `).all())

  /* ─────────────── فواتير الشراء (عرض مجمّع: موردون + مصاريف + رواتب) ─────────────── */
  on('purchaseInvoice:getAll', () =>
    db.prepare(`
      SELECT id, purchase_date AS date, 'supplier' AS type, supplier_name AS description,
             supplier_phone AS phone, total_amount, amount_paid, amount_remaining,
             COALESCE(notes,'') AS details
        FROM supplier_invoices
      UNION ALL
      SELECT id, expense_date AS date, 'expense' AS type, description,
             NULL AS phone, amount AS total_amount, amount AS amount_paid, 0 AS amount_remaining,
             COALESCE(notes,'') AS details
        FROM daily_expenses
      UNION ALL
      SELECT sp.id, sp.payment_date AS date, 'salary' AS type, ('راتب ' || e.name) AS description,
             NULL AS phone, sp.amount AS total_amount, sp.amount AS amount_paid, 0 AS amount_remaining,
             COALESCE(sp.notes,'') AS details
        FROM salary_payments sp LEFT JOIN employees e ON e.id = sp.employee_id
      ORDER BY date DESC, id DESC
    `).all())

  /* ─────────────── دليل الموردين ─────────────── */
  on('suppliers:getAll', () => db.prepare(`SELECT * FROM suppliers ORDER BY name ASC`).all())
  on('suppliers:add', (input: SupplierDirectoryInput) => {
    const info = db.prepare(`INSERT INTO suppliers (name, phone, notes) VALUES (?,?,?)`).run(
      input.name, input.phone ?? null, input.notes ?? null,
    )
    return Number(info.lastInsertRowid)
  })
  on('suppliers:update', (id: number, input: SupplierDirectoryInput) => {
    db.prepare(`UPDATE suppliers SET name=?, phone=?, notes=? WHERE id=?`).run(
      input.name, input.phone ?? null, input.notes ?? null, id,
    )
  })
  on('suppliers:delete', (id: number) => {
    db.prepare(`DELETE FROM suppliers WHERE id=?`).run(id)
    return { id }
  })

  /* ─────────────── إحصاء نهاية اليوم ─────────────── */
  on('cashAudit:getAll', () =>
    db.prepare(`SELECT * FROM daily_cash_audits ORDER BY audit_date DESC`).all()
  )
  on('cashAudit:save', (input: { audit_date: string; system_total: number; actual_amount: number; difference: number }) => {
    const info = db.prepare(`
      INSERT INTO daily_cash_audits (audit_date, system_total, actual_amount, difference)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(audit_date) DO UPDATE SET
        system_total  = excluded.system_total,
        actual_amount = excluded.actual_amount,
        difference    = excluded.difference,
        created_at    = datetime('now','localtime')
    `).run(input.audit_date, input.system_total, input.actual_amount, input.difference)
    return Number(info.lastInsertRowid)
  })

  /* ─────────────── الكفالات ─────────────── */
  on('warranty:getAll', () => db.prepare(`SELECT * FROM warranties ORDER BY start_date DESC, id DESC`).all())
  on('warranty:add', (input: WarrantyInput) => {
    const info = db.prepare(`
      INSERT INTO warranties
        (source, source_id, customer_name, customer_phone, car_plate, item_name, start_date, period_value, period_unit, notes)
      VALUES (?,?,?,?,?,?,?,?,?,?)
    `).run(
      input.source, input.source_id, input.customer_name, input.customer_phone ?? null,
      input.car_plate ?? null, input.item_name, input.start_date ?? today(),
      input.period_value, input.period_unit, input.notes ?? null,
    )
    return Number(info.lastInsertRowid)
  })
  on('warranty:update', (id: number, input: WarrantyInput) => {
    db.prepare(`
      UPDATE warranties SET
        source=?, source_id=?, customer_name=?, customer_phone=?, car_plate=?,
        item_name=?, start_date=?, period_value=?, period_unit=?, notes=?
      WHERE id=?
    `).run(
      input.source, input.source_id, input.customer_name, input.customer_phone ?? null,
      input.car_plate ?? null, input.item_name, input.start_date,
      input.period_value, input.period_unit, input.notes ?? null, id,
    )
  })
  on('warranty:delete', (id: number) => {
    db.prepare(`DELETE FROM warranties WHERE id=?`).run(id)
    return { id }
  })

  /* ── دفعات الفاتورة (صيانة / بيع مباشر) ── */
  on('payments:getByInvoice', (invoiceId: number, invoiceType: string) =>
    db.prepare(`
      SELECT method, amount, payment_date
      FROM payments
      WHERE invoice_id = ? AND invoice_type = ?
      ORDER BY id ASC
    `).all(invoiceId, invoiceType)
  )

  /* ── دفعات فواتير الموردين ── */
  on('supplierPayments:getByInvoice', (invoiceId: number) =>
    db.prepare(`
      SELECT method, amount, payment_date
      FROM supplier_payments
      WHERE invoice_id = ?
      ORDER BY id ASC
    `).all(invoiceId)
  )

  /* ─────────────── النسخ الاحتياطي ─────────────── */
  ipcMain.handle('backup:export', async () => {
    try {
      const dbPath = db.name
      const dateStr = new Date().toISOString().slice(0, 10)
      const { filePath, canceled } = await dialog.showSaveDialog({
        title: 'حفظ نسخة احتياطية',
        defaultPath: path.join(app.getPath('downloads'), `garage-backup-${dateStr}.db`),
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
      })
      if (canceled || !filePath) return { success: true, data: null }
      db.pragma('wal_checkpoint(FULL)')
      fs.copyFileSync(dbPath, filePath)
      return { success: true, data: filePath }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('backup:import', async () => {
    try {
      const dbPath = db.name
      const { filePaths, canceled } = await dialog.showOpenDialog({
        title: 'استيراد نسخة احتياطية',
        filters: [{ name: 'SQLite Database', extensions: ['db'] }],
        properties: ['openFile'],
      })
      if (canceled || filePaths.length === 0) return { success: true, data: null }
      const importPath = filePaths[0]

      // التحقق من أن الملف نسخة احتياطية صالحة للتطبيق
      db.prepare('ATTACH DATABASE ? AS _imported_validate').run(importPath)
      const validTable = db.prepare(
        `SELECT name FROM _imported_validate.sqlite_master WHERE type='table' AND name='maintenance_invoices'`,
      ).get()
      db.prepare('DETACH DATABASE _imported_validate').run()
      if (!validTable) {
        return { success: false, error: 'الملف المختار ليس نسخة احتياطية صالحة لتطبيق الكراج' }
      }

      // نسخة احتياطية تلقائية من قاعدة البيانات الحالية
      const timestamp = Date.now()
      const autoBackupPath = `${dbPath}.backup-${timestamp}`
      db.pragma('wal_checkpoint(FULL)')
      fs.copyFileSync(dbPath, autoBackupPath)

      // إغلاق الاتصال، تبديل الملف، إعادة التشغيل
      db.close()
      fs.copyFileSync(importPath, dbPath)
      app.relaunch()
      app.exit(0)
      return { success: true, data: null }
    } catch (err) {
      try { db.prepare('DETACH DATABASE _imported_validate').run() } catch { /* تجاهل */ }
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })
}
