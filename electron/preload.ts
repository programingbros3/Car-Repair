import { ipcRenderer, contextBridge } from 'electron'

/* ════════════════════════════════════════════════════════════════════════
   preload.ts — الجسر بين الـ Renderer والـ main process
   ───────────────────────────────────────────────────────────────────────
   M1: لا نعرّض ipcRenderer كاملاً. الواجهة تستخدم invoke فقط (عبر
   src/services/db.ts)، وكل قناة مسموحة مُدرَجة صراحةً في ALLOWED_CHANNELS.
   أي استدعاء لقناة خارج القائمة يُرفَض هنا قبل أن يصل إلى الـ main process —
   يمنع أي كود محقون (مثلاً في نافذة طباعة) من مناداة قنوات عشوائية.

   عند إضافة قناة IPC جديدة في electron/ipc-handlers.ts يجب إضافتها هنا أيضاً.
════════════════════════════════════════════════════════════════════════ */
const ALLOWED_CHANNELS = new Set<string>([
  // الصيانة
  'maintenance:getAll', 'maintenance:getOne', 'maintenance:history',
  'maintenance:add', 'maintenance:update', 'maintenance:deliver', 'maintenance:delete',
  // البيع المباشر
  'directSale:getAll', 'directSale:getOne', 'directSale:add', 'directSale:update',
  'directSale:updateHeader', 'directSale:updateItems', 'directSale:addPayment', 'directSale:delete',
  // فواتير الموردين
  'supplierInvoice:getAll', 'supplierInvoice:getOne', 'supplierInvoice:add',
  'supplierInvoice:update', 'supplierInvoice:updateHeader',
  'supplierInvoice:addPayment', 'supplierInvoice:addDebtPayment',
  'supplierInvoice:getDebts', 'supplierInvoice:searchNames', 'supplierInvoice:delete',
  // المصاريف
  'expense:getAll', 'expense:add', 'expense:update', 'expense:delete',
  // الموظفون والرواتب
  'employee:getAll', 'employee:add', 'employee:update', 'employee:delete',
  'salary:getAll', 'salary:getByEmployee', 'salary:add', 'salary:update', 'salary:delete',
  // الديون
  'debt:getAll', 'debt:addPayment',
  // الصندوق
  'ledger:getSummary', 'ledger:getByDateRange',
  // التقارير
  'report:daily', 'report:monthly', 'report:debts', 'report:topCustomers', 'report:debtsAging',
  // الشيكات
  'cheques:getUpcoming', 'cheques:getAll', 'cheque:updateStatus',
  // العروض المجمّعة
  'salesInvoice:getAll', 'purchaseInvoice:getAll',
  // دليل الموردين
  'suppliers:getAll', 'suppliers:add', 'suppliers:update', 'suppliers:delete',
  // إحصاء الصندوق
  'cashAudit:getAll', 'cashAudit:save', 'cashAudit:delete', 'cashAudit:getSystemBreakdown',
  // الكفالات
  'warranty:getAll', 'warranty:update', 'warranty:delete',
  // دفعات الفواتير
  'payments:getByInvoice', 'supplierPayments:getByInvoice',
  // النسخ الاحتياطي
  'backup:export', 'backup:import',
  'autoBackup:getSettings', 'autoBackup:updateSettings', 'autoBackup:runNow',
  'autoBackup:getStatus', 'autoBackup:pickFolder',
  // الأمان
  'auth:verifyPassword', 'auth:changePassword', 'auth:getLockoutStatus',
  'auth:getAutoLockSettings', 'auth:updateAutoLockSettings', 'auth:needsPasswordSetup', 'auth:setInitialPassword',
  'activityLog:getAll',
  // الضريبة
  'vat:getSettings', 'vat:updateSettings',
])

contextBridge.exposeInMainWorld('ipcRenderer', {
  invoke(channel: string, ...args: unknown[]) {
    if (!ALLOWED_CHANNELS.has(channel)) {
      return Promise.reject(new Error(`قناة IPC غير مسموح بها: ${channel}`))
    }
    return ipcRenderer.invoke(channel, ...args)
  },
})
