# ملخص مشروع كراج التل الأخضر

---

## 1. اسم المشروع والتقنيات المستخدمة

**اسم المشروع:** كراج التل الأخضر — نظام إدارة ورشة سيارات

**نبذة:** تطبيق سطح مكتب (Desktop) لإدارة كراج سيارات يشمل: فواتير الصيانة، البيع المباشر، الموردين، المصاريف، الموظفين والرواتب، الديون، الصندوق، والكفالات.

| التقنية | الإصدار / التفاصيل |
|---|---|
| Electron | Main process (Node.js) |
| React | واجهة المستخدم (Renderer process) |
| TypeScript | لغة البرمجة الأساسية |
| Vite | أداة البناء والتطوير |
| better-sqlite3 | قاعدة بيانات SQLite المتزامنة في Main process |
| React Router (HashRouter) | التنقل بين الشاشات |
| Fuse.js | بحث ضبابي (Fuzzy search) بدعم عربي |
| Tajawal Font | خط عربي من Google Fonts |

**نمط التطبيق:**
- Main process (Electron) → يشغّل قاعدة البيانات وتسجيل IPC handlers
- Renderer process (React) → الواجهة البصرية
- Preload script → جسر آمن بين Main وRenderer عبر contextBridge
- IPC (inter-process communication) → آلية التواصل بين الطرفين

---

## 2. هيكل الملفات الكامل

```
/
├── electron/
│   ├── main.ts              — نقطة دخول Electron: يهيّئ DB ويسجّل IPC ثم يفتح النافذة
│   ├── preload.ts           — يكشف window.ipcRenderer للـ renderer عبر contextBridge
│   ├── ipc-handlers.ts      — جميع معالجات IPC (ipcMain.handle) — القلب الخلفي للتطبيق
│   └── schema.sql           — تعريف كل جداول قاعدة البيانات (CREATE TABLE IF NOT EXISTS)
│
├── src/
│   ├── main.tsx             — نقطة دخول React: يُركّب <App /> على DOM
│   ├── App.tsx              — المكوّن الجذري: PasswordGate → GarageProvider → HashRouter → Routes
│   ├── App.css              — أنماط عامة للـ layout (يشمل أصناف pwd-* لمكوّن كلمة السر)
│   ├── index.css            — CSS variables، ريست، أنماط مشتركة، خط Tajawal
│   ├── database.ts          — يفتح قاعدة البيانات SQLite، يُحضّر singleton، يُشغّل migrations
│   │
│   ├── db/
│   │   ├── types.ts         — أنواع TypeScript لصفوف DB (snake_case) وأنواع المدخلات
│   │   ├── maintenance.ts   — دوال CRUD لفواتير الصيانة وبنودها
│   │   ├── direct-sale.ts   — دوال CRUD لفواتير البيع المباشر (يشمل updateDirectSaleItems)
│   │   ├── expenses.ts      — دوال المصاريف، الموظفين (مع daily_wage)، الرواتب (مع اليومية)
│   │   ├── ledger.ts        — دوال الصندوق والسجل المالي
│   │   ├── payments.ts      — دوال الدفعات وتحصيل الديون
│   │   ├── reports.ts       — دوال التقارير (يومي/شهري/ديون/أفضل زبائن)
│   │   ├── suppliers.ts     — دوال CRUD للموردين وفواتيرهم
│   │   └── warranties.ts    — دوال CRUD للكفالات (إضافة/تعديل/حذف يدوي)
│   │
│   ├── services/
│   │   └── db.ts            — طبقة الخدمة: تُغلّف window.ipcRenderer.invoke لكل قناة
│   │
│   ├── store/
│   │   └── GarageContext.tsx — React Context: يحمل كل البيانات + reload() + getLinkedOps()
│   │
│   ├── utils/
│   │   ├── auth.ts          — كلمة سر التطبيق (APP_PASSWORD = 'garage2026')
│   │   ├── notify.ts        — showError(): يعرض alert() عند وقوع أخطاء
│   │   ├── printPdf.ts      — printPdf(title, bodyHtml): يفتح نافذة طباعة HTML
│   │   ├── dbMapper.ts      — دوال التحويل بين أنواع DB (snake_case) وأنواع UI (camelCase)
│   │   ├── warranty.ts      — calcEndDate() و daysRemaining(): دوال مشتركة لحساب الكفالة
│   │   └── exportCsv.ts     — exportToCsv(): تصدير البيانات إلى ملف CSV
│   │
│   ├── components/
│   │   ├── Sidebar.tsx      — شريط التنقل الجانبي (13 رابط) + التاريخ العربي بأرقام لاتينية
│   │   ├── ConfirmDialog.tsx — مودال تأكيد مع اختياري كلمة سر (يستخدم PasswordInput)
│   │   ├── PasswordGate.tsx — شاشة إدخال كلمة السر قبل فتح التطبيق (يستخدم PasswordInput)
│   │   └── PasswordInput.tsx — حقل إدخال كلمة السر مع زر إظهار/إخفاء ومؤشر Caps Lock
│   │
│   └── pages/
│       ├── Home.tsx             — لوحة التحكم: إحصائيات + بطاقة كفالات تنتهي قريباً + آخر العمليات
│       ├── CashLedger.tsx       — الصندوق الرئيسي: سجل الحركات + إحصاء نهاية اليوم
│       ├── MaintenanceInvoices.tsx — فواتير الصيانة: CRUD كامل + بنود + دفعات + طباعة
│       ├── DirectSales.tsx      — البيع المباشر: CRUD + تعديل البنود + دفعات + كفالة الفاتورة
│       ├── SalesInvoices.tsx    — فواتير البيع (عرض مجمّع صيانة+بيع مباشر)
│       ├── PurchaseInvoices.tsx — فواتير الشراء (مجمّع مورد+مصروف+راتب)
│       ├── PendingDebts.tsx     — الديون المعلقة: عرض + سداد + تعديل
│       ├── DailyExpenses.tsx    — المصاريف اليومية: CRUD + بحث + فلترة
│       ├── Suppliers.tsx        — الموردون: فواتير الشراء CRUD + دفعات + موردون دليل
│       ├── Employees.tsx        — الموظفون والرواتب: CRUD + اليومية + حساب الراتب تلقائياً
│       ├── Warranties.tsx       — الكفالات: عرض نشطة/منتهية + CRUD يدوي + نوع العملية
│       ├── Reports.tsx          — التقارير: يومي/شهري/سنوي/ديون/أفضل زبائن + تصدير CSV
│       └── Settings.tsx         — الإعدادات: تصدير/استيراد نسخة احتياطية من قاعدة البيانات
│
├── package.json             — تعريف المشروع، الاعتماديات، سكريبتات البناء
├── vite.config.ts           — إعدادات Vite
├── tsconfig.json            — إعدادات TypeScript
└── PROJECT_SUMMARY.md       — هذا الملف
```

---

## 3. قاعدة البيانات

### الجداول والأعمدة

#### `maintenance_invoices` — فواتير الصيانة
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| customer_name | TEXT NOT NULL | اسم الزبون |
| customer_phone | TEXT | رقم الهاتف (NULL = غير معروف) |
| car_plate | TEXT NOT NULL | نمرة السيارة |
| car_type | TEXT | نوع السيارة |
| car_color | TEXT | لون السيارة |
| date_received | TEXT NOT NULL | تاريخ الاستلام (YYYY-MM-DD) |
| date_released | TEXT | تاريخ التسليم |
| status | TEXT | 'in_progress' أو 'delivered' |
| warranty | TEXT | غير مستخدم على مستوى الفاتورة (الكفالة في البنود) |
| notes | TEXT | ملاحظات |
| total_amount | REAL DEFAULT 0 | الإجمالي (يُحسب من البنود) |
| amount_paid | REAL DEFAULT 0 | المدفوع |
| amount_remaining | REAL DEFAULT 0 | المتبقي |
| created_at | TEXT | توقيت الإنشاء |

#### `direct_sale_invoices` — فواتير البيع المباشر
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| customer_name | TEXT NOT NULL | |
| customer_phone | TEXT | |
| sale_date | TEXT NOT NULL | تاريخ البيع |
| warranty | TEXT | JSON كفالة الفاتورة: `{"value":N,"unit":"week"|"month"|"year"}` أو NULL |
| notes | TEXT | |
| total_amount | REAL DEFAULT 0 | |
| amount_paid | REAL DEFAULT 0 | |
| amount_remaining | REAL DEFAULT 0 | |
| created_at | TEXT | |

#### `invoice_items` — بنود فواتير الصيانة والبيع المباشر
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| invoice_id | INTEGER NOT NULL | FK → maintenance أو direct_sale |
| invoice_type | TEXT NOT NULL | 'maintenance' أو 'direct_sale' |
| item_name | TEXT NOT NULL | اسم القطعة/الخدمة |
| quantity | REAL NOT NULL | الكمية |
| unit_price | REAL NOT NULL | سعر الوحدة |
| customer_owned | INTEGER DEFAULT 0 | 1 = القطعة ملك الزبون |
| part_type | TEXT DEFAULT 'part' | 'part' (قطعة) أو 'service' (خدمة) |
| warranty | TEXT | JSON كفالة البند (للصيانة فقط): `{"value":N,"unit":"..."}` |
| notes | TEXT | ملاحظات البند |
| created_at | TEXT | |

#### `payments` — دفعات فواتير الصيانة/البيع المباشر (مع التسليم)
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| invoice_id | INTEGER | |
| invoice_type | TEXT | 'maintenance' أو 'direct_sale' |
| payment_date | TEXT | |
| method | TEXT | 'cash' أو 'cheque' أو 'visa' |
| amount | REAL | |
| notes | TEXT | |
| created_at | TEXT | |

#### `payment_cheque` — تفاصيل دفعة الشيك
| العمود | النوع |
|---|---|
| payment_id | INTEGER PK FK → payments |
| cheque_number | TEXT |
| issue_date | TEXT |
| cash_date | TEXT |
| bank_name | TEXT |

#### `payment_visa` — تفاصيل دفعة الفيزا
| العمود | النوع |
|---|---|
| payment_id | INTEGER PK FK → payments |
| bank_name | TEXT |
| transaction_number | TEXT |

#### `debt_payments` — دفعات تحصيل ديون الزبائن
نفس بنية `payments` لكن في جدول منفصل لتمييز دفعات التحصيل.

#### `debt_payment_cheque` / `debt_payment_visa` — نفس تفاصيل `payment_cheque` / `payment_visa`

#### `supplier_invoices` — فواتير الموردين
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| supplier_name | TEXT NOT NULL | |
| supplier_phone | TEXT | |
| purchase_date | TEXT NOT NULL | |
| notes | TEXT | |
| total_amount | REAL DEFAULT 0 | |
| amount_paid | REAL DEFAULT 0 | |
| amount_remaining | REAL DEFAULT 0 | |
| created_at | TEXT | |

#### `supplier_items` — بنود فواتير الموردين
يحتوي: id, invoice_id (FK→supplier_invoices CASCADE), item_name, quantity, unit_price, notes, created_at

#### `supplier_payments` — دفعات للموردين (عند الشراء)
يحتوي: id, invoice_id, payment_date, method, amount, notes, created_at

#### `supplier_payment_cheque` / `supplier_payment_visa` — تفاصيل دفعات الموردين

#### `supplier_debt_payments` — سداد ديون الموردين لاحقاً
#### `supplier_debt_cheque` / `supplier_debt_visa` — تفاصيلها

#### `daily_expenses` — المصاريف اليومية
| العمود | النوع |
|---|---|
| id | INTEGER PK AUTOINCREMENT |
| description | TEXT NOT NULL |
| amount | REAL NOT NULL |
| expense_date | TEXT NOT NULL |
| notes | TEXT |
| created_at | TEXT |

#### `employees` — الموظفون
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| name | TEXT NOT NULL | |
| phone | TEXT | |
| daily_wage | REAL NOT NULL DEFAULT 0 | اليومية بالشيكل — أُضيف عبر migration |
| created_at | TEXT | |

#### `salary_payments` — دفعات الرواتب
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| employee_id | INTEGER FK → employees RESTRICT | |
| amount | REAL NOT NULL | الصافي المحسوب = (daily_wage_snapshot × days_worked) + bonus − deduction |
| daily_wage_snapshot | REAL NOT NULL DEFAULT 0 | اليومية وقت إصدار الدفعة — أُضيف عبر migration |
| days_worked | REAL NOT NULL DEFAULT 0 | عدد أيام الدوام — أُضيف عبر migration |
| bonus | REAL NOT NULL DEFAULT 0 | بونص إضافي — أُضيف عبر migration |
| deduction | REAL NOT NULL DEFAULT 0 | خصم — أُضيف عبر migration |
| payment_date | TEXT NOT NULL | |
| notes | TEXT | |
| created_at | TEXT | |

**ملاحظة migration:** الأعمدة الجديدة في `employees` و`salary_payments` لم تُضَف في `schema.sql` مباشرةً لتجنّب فقدان البيانات في قواعد البيانات الموجودة. تُشغَّل migrations في `src/database.ts → initDB()` بصيغة `ALTER TABLE ... ADD COLUMN` داخل حلقة `for` مع `try/catch` يتجاهل خطأ `duplicate column name` — وبهذا تُشغَّل مرة واحدة فقط ثم تصبح no-op في كل إطلاق لاحق.

#### `cash_ledger` — سجل الصندوق الرئيسي
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| transaction_date | TEXT NOT NULL | YYYY-MM-DD |
| reference_type | TEXT | نوع العملية (انظر REF constants أدناه) |
| reference_id | INTEGER | id الفاتورة/المصروف المرجعي |
| amount_in | REAL DEFAULT 0 | وارد |
| amount_out | REAL DEFAULT 0 | صادر |
| balance_after | REAL NOT NULL | الرصيد التراكمي بعد العملية |
| notes | TEXT | |
| created_at | TEXT | |

**قيم reference_type:**
- `maintenance_payment` — دفعة صيانة أثناء الاستلام
- `maintenance_release` — دفعة صيانة عند التسليم
- `direct_sale_payment` — دفعة بيع مباشر
- `debt_customer` — تحصيل دين زبون
- `supplier_payment` — دفع للمورد
- `supplier_debt` — سداد دين مورد
- `daily_expense` — مصروف يومي
- `salary` — راتب موظف

#### `daily_cash_audits` — إحصاءات نهاية اليوم
| العمود | النوع |
|---|---|
| id | INTEGER PK AUTOINCREMENT |
| audit_date | TEXT UNIQUE (YYYY-MM-DD) |
| system_total | REAL |
| actual_amount | REAL |
| difference | REAL |
| created_at | TEXT |

#### `suppliers` — دليل الموردين
| العمود | النوع |
|---|---|
| id | INTEGER PK AUTOINCREMENT |
| name | TEXT NOT NULL UNIQUE |
| phone | TEXT |
| notes | TEXT |
| created_at | TEXT |

#### `warranties` — الكفالات
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| source | TEXT NOT NULL | 'maintenance' أو 'direct_sale' |
| source_id | INTEGER NOT NULL | id الفاتورة المصدر (0 = مُدخل يدوياً) |
| customer_name | TEXT NOT NULL | |
| customer_phone | TEXT | |
| car_plate | TEXT | |
| item_name | TEXT NOT NULL | اسم القطعة أو 'كفالة شاملة' للبيع المباشر |
| start_date | TEXT NOT NULL | تاريخ بداية الكفالة |
| period_value | INTEGER NOT NULL | عدد الوحدات |
| period_unit | TEXT NOT NULL | 'week' أو 'month' أو 'year' |
| notes | TEXT | |
| created_at | TEXT | |

### العلاقات بين الجداول

```
maintenance_invoices ──< invoice_items (invoice_type='maintenance')
maintenance_invoices ──< payments (invoice_type='maintenance')
maintenance_invoices ──< debt_payments (invoice_type='maintenance')
direct_sale_invoices ──< invoice_items (invoice_type='direct_sale')
direct_sale_invoices ──< payments (invoice_type='direct_sale')
direct_sale_invoices ──< debt_payments (invoice_type='direct_sale')
payments ──── payment_cheque (payment_id)
payments ──── payment_visa (payment_id)
debt_payments ──── debt_payment_cheque
debt_payments ──── debt_payment_visa
supplier_invoices ──< supplier_items (CASCADE DELETE)
supplier_invoices ──< supplier_payments (CASCADE DELETE)
supplier_invoices ──< supplier_debt_payments
supplier_payments ──── supplier_payment_cheque
supplier_payments ──── supplier_payment_visa
supplier_debt_payments ──── supplier_debt_cheque
supplier_debt_payments ──── supplier_debt_visa
employees ──< salary_payments (RESTRICT DELETE)
maintenance_invoices ──< warranties (source='maintenance', source_id=id)
direct_sale_invoices ──< warranties (source='direct_sale', source_id=id)
```

**ملاحظة مهمة:** لا توجد FOREIGN KEY constraints صريحة بين الجداول المجمّعة (invoice_items/payments مرتبطة بـ invoice_id+invoice_type بدون FK). الحذف في cascade يتم يدوياً في كود ipc-handlers.

---

## 4. الـ Backend

### مسار التواصل

```
React Page
  → dbService.namespace.method(args)          [src/services/db.ts]
    → window.ipcRenderer.invoke('channel', args)  [Renderer → Main]
      → ipcMain.handle('channel', handler)     [electron/ipc-handlers.ts]
        → db functions in src/db/*.ts          [Main process]
          → better-sqlite3 → garage.db
```

### قنوات IPC المسجّلة

#### فواتير الصيانة
| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `maintenance:getAll` | filters? | CarRow[] | جلب كل الفواتير (بدون بنود) |
| `maintenance:getOne` | id | CarRow + items[] | جلب فاتورة واحدة بكامل بنودها |
| `maintenance:history` | phone | CarRow[] | تاريخ الزبون برقم الهاتف |
| `maintenance:add` | CarInput | { id } | إضافة فاتورة + بنود + دفعات + مزامنة كفالات |
| `maintenance:update` | CarRecord | void | تحديث الفاتورة + بنودها + مزامنة كفالات |
| `maintenance:addItem` | { invoiceId, item } | void | إضافة بند لفاتورة موجودة |
| `maintenance:deliver` | { id, payments, date } | void | تسليم السيارة + دفعة التسليم + Ledger |
| `maintenance:delete` | id | void | حذف الفاتورة + بنودها + دفعاتها + كفالاتها |

#### البيع المباشر
| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `directSale:getAll` | filters? | SaleRow[] | جلب كل فواتير البيع |
| `directSale:getOne` | id | SaleRow + items[] + payments[] | تفاصيل كاملة |
| `directSale:add` | SaleInput | { id } | إضافة فاتورة + بنود + دفعات + مزامنة كفالات |
| `directSale:update` | SaleRecord | void | تحديث بيانات الفاتورة + مزامنة كفالات |
| `directSale:updateItems` | { invoiceId, items[] } | void | حذف البنود القديمة وإعادة إدراجها + تحديث total |
| `directSale:addPayment` | { id, payments, date } | void | إضافة دفعة + Ledger |
| `directSale:delete` | id | void | حذف + بنود + دفعات + كفالات |

#### فواتير الموردين
| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `supplierInvoice:getAll` | filters? | SupplierRow[] | |
| `supplierInvoice:getOne` | id | SupplierRow + items[] + payments[] | |
| `supplierInvoice:add` | SupplierInput | { id } | |
| `supplierInvoice:update` | SupplierRecord | void | |
| `supplierInvoice:addPayment` | { id, payments, date } | void | دفعة عادية |
| `supplierInvoice:addDebtPayment` | { id, payments, date } | void | سداد دين |
| `supplierInvoice:getDebts` | — | SupplierDebtRow[] | |
| `supplierInvoice:searchNames` | query | string[] | للـ autocomplete |
| `supplierInvoice:delete` | id | void | |

#### المصاريف
| القناة | الوصف |
|---|---|
| `expense:getAll` | filters: search, dateFrom, dateTo |
| `expense:add` | + Ledger (amount_out) |
| `expense:update` | |
| `expense:delete` | |

#### الموظفون والرواتب
| القناة | الوصف |
|---|---|
| `employee:getAll` | ORDER BY name ASC |
| `employee:add` | يشمل daily_wage |
| `employee:update` | يُحدّث name, phone, daily_wage |
| `employee:delete` | |
| `salary:getAll` | كل الرواتب مع اسم الموظف والحقول الجديدة |
| `salary:getByEmployee` | تاريخ راتب موظف واحد |
| `salary:add` | يحسب amount = daily_wage_snapshot × days_worked + bonus − deduction + Ledger |
| `salary:update` | يُحدّث days_worked/bonus/deduction/amount + يُعيد كتابة Ledger entry |
| `salary:delete` | |

#### الديون
| القناة | الوصف |
|---|---|
| `debt:getAll` | UNION maintenance+direct_sale WHERE amount_remaining > 0 |
| `debt:addPayment` | تحصيل دين + Ledger |

#### الصندوق
| القناة | الوصف |
|---|---|
| `ledger:getSummary` | إجمالي الوارد والصادر والرصيد الحالي |
| `ledger:getByDateRange` | الحركات بين تاريخين |

#### التقارير
| القناة | الوصف |
|---|---|
| `report:daily` | تقرير يوم محدد: مجاميع حسب reference_type |
| `report:monthly` | تقرير شهر: GROUP BY يوم |
| `report:debts` | كل ديون الزبائن والموردين |
| `report:topCustomers` | أفضل الزبائن حسب الإنفاق (UNION maintenance+direct_sale, GROUP BY customer) |

#### فواتير البيع والشراء (عرض مجمّع)
| القناة | الوصف |
|---|---|
| `salesInvoice:getAll` | UNION: maintenance_invoices + direct_sale_invoices |
| `purchaseInvoice:getAll` | UNION: supplier_invoices + daily_expenses + salary_payments |

#### الموردون (دليل)
| القناة | الوصف |
|---|---|
| `suppliers:getAll` | |
| `suppliers:add` | |
| `suppliers:update` | |
| `suppliers:delete` | |

#### إحصاء الصندوق
| القناة | الوصف |
|---|---|
| `cashAudit:getAll` | ORDER BY audit_date DESC |
| `cashAudit:save` | INSERT OR REPLACE (ON CONFLICT audit_date DO UPDATE) |

#### الكفالات
| القناة | الوصف |
|---|---|
| `warranty:getAll` | كل الكفالات (يدوية + تلقائية) |
| `warranty:add` | إضافة كفالة يدوية (source_id=0) |
| `warranty:update` | تحديث كفالة |
| `warranty:delete` | حذف كفالة |

#### الدفعات (للطباعة)
| القناة | الوصف |
|---|---|
| `payments:getByInvoice` | { invoiceId, invoiceType } → دفعات فاتورة |
| `supplierPayments:getByInvoice` | دفعات فاتورة مورد |

#### النسخ الاحتياطي
| القناة | الوصف |
|---|---|
| `backup:export` | يفتح نافذة حفظ ملف → ينسخ garage.db إلى المسار المختار (بعد WAL checkpoint) |
| `backup:import` | يفتح نافذة اختيار ملف → يتحقق من صحته → ينسخ القاعدة الحالية تلقائياً → يُبدّل الملف → يُعيد تشغيل التطبيق |

**ملاحظة backup:import:** قبل الاستبدال يُنشئ نسخة تلقائية بمسار `{dbPath}.backup-{timestamp}`. يتحقق من صحة الملف المستورد بـ `ATTACH DATABASE ... AS _imported_validate` والتحقق من وجود جدول `maintenance_invoices`. يستخدم `ipcMain.handle` مباشرةً (لا wrapper) لأنه يحتاج `dialog` و`app` من Electron.

### مزامنة الكفالات التلقائية

عند كل إضافة أو تعديل لفاتورة صيانة أو بيع مباشر، يُستدعى:

**`syncWarrantiesForMaintenance(db, invoiceId)`:**
1. يجلب بيانات الفاتورة (customer_name, customer_phone, car_plate, date_received)
2. يحذف كل السجلات في `warranties` حيث `source='maintenance' AND source_id=invoiceId`
3. يُعيد إدراج سجل لكل بند في `invoice_items` يملك حقل `warranty` صالح (JSON)

**`syncWarrantiesForDirectSale(db, invoiceId)`:**
1. يجلب بيانات الفاتورة
2. يحذف `warranties WHERE source='direct_sale' AND source_id=invoiceId`
3. إذا كان `invoice.warranty` JSON صالح → يُدرج سجلاً واحداً بـ `item_name='كفالة شاملة'`

**تمييز يدوي vs تلقائي:** الكفالات اليدوية (مُدخلة من شاشة الكفالات) لها `source_id=0`، والتلقائية لها `source_id=invoiceId > 0`. الحذف عند المزامنة لا يمس `source_id=0`.

**عند حذف الفاتورة:** `maintenance:delete` و`directSale:delete` يحذفان أيضاً سجلات `warranties` المرتبطة (source_id=invoiceId).

### دوال الـ Backend الرئيسية (src/db/)

#### `src/db/maintenance.ts`
- `addMaintenanceInvoice(db, input)` — INSERT + insertItems (يكتب warranty وpart_type في DB) + insertPayments
- `updateMaintenanceInvoice(db, car)` — UPDATE فاتورة + يحذف البنود القديمة ويُعيد إدراجها
- `addMaintenanceItem(db, invoiceId, item)` — INSERT بند واحد + تحديث total_amount
- `deliverMaintenance(db, id, payments, date)` — UPDATE status='delivered' + date_released + دفعات + Ledger
- `deleteMaintenanceInvoice(db, id)` — DELETE + بنودها + دفعاتها
- `getMaintenanceInvoices(db, filters)` — SELECT مع فلاتر (بحث، تاريخ، حالة)
- `getMaintenanceInvoice(db, id)` — SELECT + بنود كاملة (يُعيد warranty وpart_type لكل بند)

#### `src/db/direct-sale.ts`
- `addDirectSaleInvoice(db, input)` — INSERT + invoice_items + payments + Ledger
- `updateDirectSaleItems(db, invoiceId, items)` — يحذف بنود 'direct_sale' للفاتورة ويُعيد إدراجها + يُحدّث total_amount وamount_remaining
- `getDirectSaleInvoices(db, filters)` — SELECT مع فلاتر
- `getDirectSaleInvoice(db, id)` — SELECT + items + payments

#### `src/db/ledger.ts`
- `recordLedgerEntry(db, entry)` — يقرأ آخر `balance_after` ثم يُدرج سجلاً جديداً
- `getLedgerSummary(db)` — SUM(amount_in), SUM(amount_out), balance
- `getLedgerByDateRange(db, from, to)` — WHERE transaction_date BETWEEN

#### `src/db/payments.ts`
- `addPayment(db, invoiceId, invoiceType, payments, date)` — INSERT + تحديث amount_paid/remaining + Ledger
- `addDebtPayment(db, invoiceId, invoiceType, payments, date)` — INSERT debt_payments + تحديث + Ledger
- `getPendingDebts(db, filters)` — UNION maintenance+direct_sale WHERE amount_remaining > 0

#### `src/db/reports.ts`
- `getDailyReport(db, date)` — يجمّع Ledger entries لليوم المحدد حسب reference_type
- `getMonthlyReport(db, month, year)` — GROUP BY transaction_date للشهر
- `getDebtReport(db)` — كل ديون الزبائن + كل ديون الموردين
- `getTopCustomers(db, limit)` — UNION maintenance+direct_sale, GROUP BY customer, ORDER BY total_spent DESC

#### `src/db/suppliers.ts`
- `addSupplierInvoice`, `updateSupplierInvoice`, `deleteSupplierInvoice`
- `addSupplierPayment`, `addSupplierDebtPayment`
- `getSupplierInvoices(filters)`, `getSupplierInvoice(id)`
- `getSupplierDebts()` — WHERE amount_remaining > 0
- `searchSupplierNames(query)` — DISTINCT names LIKE '%query%' LIMIT 10

#### `src/db/expenses.ts`
- `addDailyExpense`, `updateDailyExpense`, `deleteDailyExpense`
- `getDailyExpenses(filters)` — search + dateFrom/To
- `addEmployee(input)` — INSERT يشمل daily_wage
- `updateEmployee(id, input)` — UPDATE name, phone, daily_wage
- `deleteEmployee(id)`, `getEmployees()`
- `addSalaryPayment(employeeId, input)` — يجلب daily_wage من employees → يحسب `amount = daily_wage × days_worked + bonus − deduction` → INSERT مع daily_wage_snapshot + Ledger
- `updateSalaryPayment(id, input)` — يجلب daily_wage_snapshot من السجل الحالي → يُعيد حساب amount → UPDATE + يحذف ويُعيد كتابة Ledger entry
- `getSalaryHistory(employeeId)`, `getAllSalaries()` — يُعيدان الأعمدة الجديدة (daily_wage_snapshot, days_worked, bonus, deduction)

---

## 5. الشاشات

### لوحة التحكم — `src/pages/Home.tsx`
**المسار:** `/`

**البيانات المُجلبة:**
- من GarageContext: `maintenanceCars`, `directSales`, `expenses`, `salaries`, `employees`, `debts`, `salesInvoices`, `purchaseInvoices`, `warranties`
- من DB مباشرة: `dbService.report.monthly()` + `dbService.ledger.getSummary()`

**الإحصائيات المعروضة (بطاقات):**
- إجمالي الوارد هذا الشهر
- إجمالي الصادر هذا الشهر
- الرصيد الحالي (من cash_ledger)
- عدد السيارات قيد الصيانة
- عدد وإجمالي الديون المعلقة
- فواتير البيع اليوم / الشراء اليوم
- مصاريف اليوم
- **كفالات تنتهي قريباً** (خلال 7 أيام) — بطاقة جديدة بحد برتقالي عند وجودها؛ النقر عليها يفتح مودال يعرض جدول الكفالات مرتباً بالأقل أياماً متبقية أولاً

**حساب بطاقة الكفالات:**
```ts
// في useMemo على مصفوفة warranties من GarageContext
const expiringWarranties = warranties
  .map(w => ({ ...w, endDate: calcEndDate(w.startDate, w.periodValue, w.periodUnit),
                      remaining: daysRemaining(endDate) }))
  .filter(w => w.remaining > 0 && w.remaining <= 7)
  .sort((a, b) => a.remaining - b.remaining)
```

تُستورد `calcEndDate` و`daysRemaining` من `src/utils/warranty.ts`.

**جدول آخر العمليات:**
- يجمع: صيانة + بيع مباشر + مصاريف + رواتب
- فلترة بثلاثة تبويبات: اليوم / الأسبوع (6 أيام) / الشهر (29 يوماً)
- الأعمدة: التاريخ، نوع العملية (badge)، الاسم، المبلغ (+ للوارد / − للصادر)

---

### الصندوق الرئيسي — `src/pages/CashLedger.tsx`
**المسار:** `/cash-ledger`

**الأقسام:**
1. **3 بطاقات إحصاء:** كاش اليوم (مجموع الوارد) / عدد العمليات / الفرق من آخر إحصاء

2. **إحصاء نهاية اليوم:**
   - حقل اختيار تاريخ (افتراضي: اليوم)
   - يعرض إجمالي عمليات اليوم من Ledger
   - حقل "المبلغ الفعلي في الصندوق" → زر "احسب الفرق"
   - إذا مطابق: رسالة ✓ + زر "تثبيت في السجل"
   - إذا يوجد فرق: مودال يعرض الفرق مع زر "تثبيت الرقم"

3. **سجل العمليات:** جدول الحركات لليوم المختار (يُحمَّل من `ledger:getByDateRange`)
   - الضغط على صف → مودال التفاصيل مع زر طباعة إيصال

4. **سجل الإحصاءات اليومية:** جدول `daily_cash_audits` مع badge الحالة (مطابق/زيادة/نقص) وزر طباعة

---

### فواتير الصيانة — `src/pages/MaintenanceInvoices.tsx`
**المسار:** `/maintenance`

**حالة النموذج (FormState):**
```
customerName, phone, carPlate, carType, carColor, dateReceived, notes
parts: FormPart[] = [{ id, partType:'part'|'service', name, qty, unitPrice, warrantyValue, warrantyUnit, notes }]
```

حقل الكفالة في كل بند: `warrantyUnit` (select: لا كفالة/أسبوع/شهر/سنة) + `warrantyValue` (رقم، يظهر فقط عند اختيار وحدة). تُخزَّن كـ JSON عند الحفظ.

**Draft localStorage:** مفتاح `'garage-mi-draft-v2'` — يُحمَّل تلقائياً عند فتح الصفحة

**الفلاتر:**
- بحث نصي (Fuse.js على اسم الزبون + نمرة السيارة)
- بحث برقم الهاتف
- بحث بنمرة السيارة
- فلتر الحالة: الكل / قيد الصيانة / تم التسليم
- فلتر تاريخ (من-إلى)
- فلتر مبلغ (min-max)

**جدول العرض الأعمدة:**
رقم الزبون | اسم الزبون | نمرة السيارة | نوع السيارة | تاريخ الاستلام | تاريخ التسليم | الحالة | الإجمالي | المتبقي | الإجراءات

**الإجراءات في كل صف:**
- **تعديل:** `async` — يستدعي `dbService.maintenance.getOne(car.id)` أولاً لجلب البنود الكاملة (مع warranty وpart_type)، ثم يملأ النموذج بها. يتجنّب الاعتماد على بيانات GarageContext التي لا تحمل البنود.
- **تسليم:** يفتح مودال التسليم (دفعات + تأكيد) → `maintenance:deliver`
- **طباعة:** async يجلب `getOne` + `payments:getByInvoice` ثم يطبع HTML كامل
- **حذف:** ConfirmDialog مع كلمة سر

**مودال التفاصيل:** (عند الضغط على الصف)
- بيانات الفاتورة + بطاقة بنود (جدول: اسم القطعة، النوع، الكمية، السعر، الكفالة بصيغة نصية عربية، ملاحظات)
- قسم "عمليات سابقة لهذا الزبون" (LinkedOps)
- بنود قابلة للحذف

**نموذج الدفع (عند الإضافة أو التسليم):**
- صفوف دفع: الطريقة (كاش/شيك/فيزا/دين) + المبلغ
- عند شيك: رقم الشيك، اسم البنك، تاريخ الإصدار، تاريخ الصرف
- عند فيزا: اسم البنك، رقم الحركة
- عند دين: يُسجّل amount_remaining بدون دفع

---

### البيع المباشر — `src/pages/DirectSales.tsx`
**المسار:** `/direct-sales`

**حالة النموذج:**
```
customerName, phone, saleDate, warrantyValue:'1', warrantyUnit:''|WarrantyPeriodUnit, generalNotes
```

**Draft localStorage:** مفتاح `'garage-ds-draft-v2'`

**الفلاتر:**
- بحث Fuse.js على اسم الزبون
- بحث برقم الهاتف
- فلتر تاريخ (من-إلى)
- فلتر مبلغ (min-max)
- فلتر الحالة: الكل / مدفوع / دين جزئي / دين كامل

**الجدول:** اسم الزبون | رقم الهاتف | تاريخ البيع | الكفالة | الإجمالي | المدفوع | المتبقي | الحالة | الإجراءات

**نموذج الكفالة (مستوى الفاتورة):**
- `<select>`: لا كفالة / أسبوع / شهر / سنة + `<input>` للعدد
- تُخزَّن كـ JSON: `JSON.stringify({ value, unit })` أو سلسلة فارغة إذا لا كفالة

**دفع عند الإضافة:** نفس نظام دفعات الصيانة (كاش/شيك/فيزا/دين) — **إلزامي** لإضافة فاتورة جديدة (خطأ validation إذا لا مبلغ ولا دين)

**البنود في البيع المباشر:**
- جدول قابل للتعديل المباشر: اسم البند، الكمية، السعر، ملاحظات (بدون كفالة فردية)
- عند **إضافة** فاتورة جديدة: البنود تُحفظ مع الفاتورة
- عند **تعديل** فاتورة موجودة: يستدعي `dbService.directSale.getOne(id)` لجلب البنود الحالية، ثم عند الحفظ يستدعي `dbService.directSale.updateItems(id, newItems)` لتحديث البنود

**دالة `warrantyLabelDS(raw)`:**
تُحوّل JSON الكفالة لنص عربي مثل "3 أشهر" أو "أسبوع واحد". تُستخدم في مودال التفاصيل والطباعة.

---

### فواتير البيع — `src/pages/SalesInvoices.tsx`
**المسار:** `/sales-invoices`

**المصدر:** `salesInvoice:getAll` — UNION من maintenance_invoices + direct_sale_invoices

**الفلاتر:**
- بحث Fuse.js باسم الزبون
- بحث برقم الهاتف
- بحث بنمرة السيارة (`plateSearch`)
- تبويبات النوع: الكل / صيانة / بيع مباشر
- تبويبات الحالة: الكل / مدفوع / دين جزئي / دين كامل
- فلتر تاريخ + فلتر مبلغ

**الجدول:** التاريخ | نوع الفاتورة | اسم الزبون | رقم الهاتف | الإجمالي | المدفوع | المتبقي | الحالة | الإجراءات

**التعديل:**
- ConfirmDialog أولاً (مع كلمة سر)
- مودال تعديل يوجّه الحفظ حسب النوع:
  - maintenance → `dbService.maintenance.update(car)`
  - direct_sale → `dbService.directSale.update(sale)`

**إضافة دفعة:** (للفواتير ذات المتبقي > 0)
- يستخدم `dbService.debt.addPayment` — نفس قناة الديون

**LinkedOps في مودال التفاصيل:** يعرض عمليات سابقة لنفس الزبون (phone) من maintenance + direct_sale

---

### فواتير الشراء — `src/pages/PurchaseInvoices.tsx`
**المسار:** `/purchase-invoices`

**المصدر:** `purchaseInvoice:getAll` — UNION من supplier_invoices + daily_expenses + salary_payments

**أنواع الفاتورة:** `supplier` (مورد) | `expense` (مصروف يومي) | `salary` (راتب)

**حالات الفاتورة:** `paid` | `partial_debt` | `full_debt`

**الفلاتر:**
- بحث Fuse.js بالوصف/المورد
- بحث برقم الهاتف
- تبويبات النوع: الكل / مورد / مصروف يومي / راتب
- تبويبات الحالة: الكل / مدفوع / دين جزئي / دين كامل
- فلتر تاريخ + فلتر مبلغ

**التعديل:** يوجّه حسب النوع:
- `expense` → `dbService.expense.update()`
- `supplier` → `dbService.supplierInvoice.update()`
- `salary` → يعرض رسالة "يتم من صفحة الموظفين"

**إضافة دفعة:** للموردين فقط عبر `supplierInvoice:addDebtPayment`

**الحذف:** يوجّه حسب النوع لـ expense/supplierInvoice/salary delete

---

### الديون المعلقة — `src/pages/PendingDebts.tsx`
**المسار:** `/pending-debts`

**البيانات:** من `debt:getAll` — UNION maintenance+direct_sale WHERE amount_remaining > 0

**الفلاتر:**
- بحث Fuse.js باسم الزبون
- بحث برقم الهاتف
- تبويبات: الكل / صيانة / بيع مباشر
- فلتر مبلغ المتبقي (min-max)

**الجدول:** اسم الزبون | رقم الهاتف | النوع | التاريخ | نمرة السيارة | الإجمالي | المدفوع | المتبقي | الإجراءات

**الإجراءات:**
1. **تعديل:** مودال يُعدّل بيانات الفاتورة الأصلية (يوجّه حسب `debt.type`)
2. **إضافة دفعة:** مودال الدفع (كاش/شيك/فيزا) → `debt:addPayment` + Ledger
3. **حذف:** يحذف الفاتورة المصدر بالكامل

**LinkedOps:** تظهر في مودال التفاصيل

---

### المصاريف اليومية — `src/pages/DailyExpenses.tsx`
**المسار:** `/expenses`

**نموذج الإضافة (inline):**
- الوصف (مطلوب)، المبلغ (مطلوب > 0)، التاريخ، ملاحظات
- Draft يُحفظ في localStorage (مفتاح `'garage-exp-draft'`)

**التعديل:** مودال منفصل

**الفلاتر:**
- بحث Fuse.js بالوصف
- فلتر تاريخ (من-إلى)
- فلتر مبلغ (min-max)

**البطاقة:** إجمالي المصاريف المُصفّاة

**الجدول:** الوصف | المبلغ | التاريخ | ملاحظات | الإجراءات (تعديل/حذف)

**الحذف:** ConfirmDialog مع كلمة سر

---

### الموردون — `src/pages/Suppliers.tsx`
**المسار:** `/suppliers`

يحتوي على قسمين:
1. **فواتير الموردين:** CRUD كامل للفواتير + بنود + دفعات أولية + سداد ديون لاحقاً
2. **دليل الموردين:** جدول الموردين المسجّلين (الاسم، الهاتف، ملاحظات) مع CRUD

**نموذج فاتورة المورد:**
- اسم المورد (مع autocomplete من `supplierInvoice:searchNames`)
- رقم الهاتف، تاريخ الشراء، ملاحظات
- جدول البنود: اسم البند، الكمية، السعر، ملاحظات
- قسم الدفع: كاش/شيك/فيزا (يمكن دين جزئي)

**الفلاتر على الفواتير:** بحث باسم المورد + فلتر تاريخ

---

### الموظفون والرواتب — `src/pages/Employees.tsx`
**المسار:** `/employees`

**قسم الموظفين:**
- نموذج إضافة inline: اسم الموظف (حروف فقط) + رقم الهاتف + **اليومية (₪/يوم)** — الحقول الثلاثة مطلوبة
- التعديل في مودال (يشمل تعديل اليومية)
- الجدول: اسم الموظف | رقم الهاتف | **اليومية ₪/يوم** | الإجراءات (4 أعمدة)
- مودال التفاصيل يعرض: اسم الموظف، رقم الهاتف، **اليومية الحالية**، إجمالي الرواتب المدفوعة (الصافي)

**قسم الرواتب — نظام اليومية:**

نموذج إضافة/تعديل الراتب (inline للإضافة، مودال للتعديل):
- **الموظف** (dropdown) — disabled عند التعديل، لا يمكن تغيير الموظف
- **عدد أيام الدوام** (رقم > 0) — مطلوب
- **البونص** (رقم ≥ 0) — افتراضي 0
- **الخصم** (رقم ≥ 0) — افتراضي 0
- **التاريخ**
- **الملاحظات**
- **عرض حي للصافي:** `liveWage × daysWorked + bonus − deduction` (يتحدث فورياً)

**معادلة حساب الراتب (تُحسب في Backend):**
```
daily_wage_snapshot = employees.daily_wage  // وقت الإضافة
amount = daily_wage_snapshot × days_worked + bonus − deduction
```
عند التعديل: `daily_wage_snapshot` يبقى كما هو (لا يُحدَّث من اليومية الحالية)، ويُعاد حساب `amount` بناءً على القيم الجديدة.

**جدول الرواتب (8 أعمدة):**
الموظف | اليومية (وقت الدفعة) | الأيام | بونص ₪ | خصم ₪ | الصافي ₪ | تاريخ الدفعة | الإجراءات

**إجراءات الراتب:** طباعة | تعديل | حذف

**طباعة إيصال الراتب:** يعرض: اسم الموظف، التاريخ، اليومية (وقت الدفعة)، عدد أيام الدوام، حاصل الضرب، البونص، الخصم، الصافي النهائي بارز بالأخضر.

**التعديل:** يستدعي `dbService.salary.update(id, salData)` مباشرةً — تُعاد كتابة Ledger entry ليطابق المبلغ الجديد.

**الفلاتر:** اختيار الموظف + تاريخ من-إلى

**بطاقة الإجمالي:** إجمالي الرواتب المدفوعة (الصافي) للفترة المُصفّاة

---

### الكفالات — `src/pages/Warranties.tsx`
**المسار:** `/warranties`

**دوال حساب انتهاء الكفالة (من `src/utils/warranty.ts`):**
```ts
export function calcEndDate(startDate: string, value: number, unit: WarrantyPeriodUnit): string {
  // week → date + value*7 أيام
  // month → date + value أشهر
  // year → date + value سنوات
}
export function daysRemaining(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000)
}
```

كانت هذه الدوال محلية في Warranties.tsx، نُقلت إلى `warranty.ts` لمشاركتها مع Home.tsx.

**الجدولان:**
1. **الكفالات النشطة:** `endDate >= today`
2. **الكفالات المنتهية:** `endDate < today`

**أعمدة كلا الجدولين (10 أعمدة):**
اسم الزبون | رقم الهاتف | نمرة السيارة | **نوع العملية** | القطعة/الخدمة | تاريخ البداية | المدة | تاريخ الانتهاء | الأيام المتبقية/منتهية | الإجراءات

**نوع العملية badge:**
- `maintenance` → `mi-badge-orange` "صيانة"
- `direct_sale` → `mi-badge-blue` "بيع مباشر"
- يدوي (source_id=0) → يظهر النوع المسجّل

**الفلاتر:**
- بحث Fuse.js باسم الزبون + اسم القطعة
- تبويبات: نشطة / منتهية
- فلتر المصدر: الكل / صيانة / بيع مباشر / يدوي

**إضافة يدوية:** نموذج يملأ source_id=0 مع تحديد source يدوياً

**ملاحظة:** الكفالات التلقائية (source_id > 0) تُدار من صفحات الصيانة/البيع المباشر. الحذف اليدوي من هذه الصفحة مسموح به، لكن عند تعديل الفاتورة المصدر ستُعاد المزامنة.

---

### التقارير — `src/pages/Reports.tsx`
**المسار:** `/reports`

**5 تبويبات:**

1. **يومي:** اختيار تاريخ → تقرير `report:daily`
   - بطاقات: إجمالي وارد/صادر/صافي + دخل صيانة/بيع مباشر/تحصيل ديون/مشتريات موردين/مصاريف/رواتب
   - جدول عمليات اليوم مفصّل

2. **شهري:** `type="month"` picker → 12 استدعاء `report:monthly`
   - بطاقات: وارد/صادر/صافي
   - جدول: كل يوم في الشهر + وارد/صادر/صافي

3. **سنوي:** dropdown السنة (6 سنوات) → 12 استدعاء `report:monthly`
   - يجمّع كل الأشهر في تقرير واحد
   - جدول: كل شهر بالاسم العربي + وارد/صادر/صافي

4. **تقرير الديون:** `report:debts`
   - بطاقتان: إجمالي ديون الزبائن + إجمالي ديون الموردين
   - جدولان: ديون الزبائن (مصدر+مبالغ) + ديون الموردين

5. **أفضل الزبائن:** `report:topCustomers(20)` — تبويب جديد
   - جدول: # | اسم الزبون | رقم الهاتف | عدد الفواتير | إجمالي الإنفاق
   - يجمع من maintenance_invoices + direct_sale_invoices مُرتَّباً تنازلياً حسب total_spent

**الطباعة:** زر "طباعة التقرير" يُنشئ HTML مناسب حسب التبويب الحالي ويستدعي `printPdf()` (يشمل تبويب أفضل الزبائن)

**تصدير CSV:** زر "⬇ تصدير CSV" يظهر في التبويبات (يومي/شهري/سنوي/ديون) دون تبويب أفضل الزبائن؛ يستدعي `exportToCsv()` من `src/utils/exportCsv.ts`

---

### الإعدادات — `src/pages/Settings.tsx`
**المسار:** `/settings`

**القسم الوحيد حالياً: النسخ الاحتياطي**

**تصدير نسخة احتياطية:**
- زر "تصدير" → `dbService.backup.export()` → يفتح نافذة حفظ ملف (save dialog)
- يحفظ نسخة من `garage.db` بصيغة `.db` في المسار المختار
- يعرض مسار الملف المحفوظ عند النجاح

**استيراد نسخة احتياطية:**
- زر "استيراد" (أحمر) → ConfirmDialog مع كلمة سر أولاً
- عند التأكيد → `dbService.backup.import()` → يفتح نافذة اختيار ملف
- يتحقق من صحة الملف → ينشئ نسخة احتياطية تلقائية → يُبدّل الملف → يُعيد تشغيل التطبيق
- تحذير: "هذه العملية لا يمكن التراجع عنها"

---

## 6. المكونات المشتركة

### `src/components/Sidebar.tsx`
- **13 رابط تنقل:** لوحة التحكم / الصندوق / فواتير البيع / فواتير الشراء / الصيانة / البيع المباشر / الديون المعلقة / المصاريف / الموردون / الموظفون / الكفالات / التقارير / **الإعدادات** (أيقونة ⚙)
- يعرض التاريخ الحالي بالعربي في الأسفل (`toLocaleDateString('ar-EG-u-nu-latn', ...)` — أرقام لاتينية)
- شعار "**كراج التل الأخضر**" في الأعلى
- `.sidebar` يستخدم `overflow: hidden` (بدلاً من `position: sticky`)
- `.sidebar-nav` يستخدم `overflow-y: auto` و`min-height: 0` للتمرير عند الشاشات الصغيرة

### `src/components/ConfirmDialog.tsx`
```tsx
<ConfirmDialog
  title="عنوان"
  message="رسالة"
  onConfirm={fn}
  onCancel={fn}
  requirePassword={true}  // افتراضي: true
/>
```
- عند `requirePassword=true`: أول نقرة "تأكيد" تُظهر `<PasswordInput>` بدلاً من `<input type="password">` العادي
- كلمة السر الصحيحة (APP_PASSWORD) → تُستدعى `onConfirm()`
- الأخطاء تُعرض داخل المودال

### `src/components/PasswordGate.tsx`
- شاشة مظلمة (#1E2A38) مع شعار "كراج" باللون الأخضر
- يستخدم `<PasswordInput>` بدلاً من `<input type="password">` العادي
- عند الصواب يستدعي `onUnlock()`
- يُلفّ كامل التطبيق في `App.tsx`

### `src/components/PasswordInput.tsx`
```tsx
<PasswordInput
  value={string}
  onChange={(value: string) => void}
  placeholder?: string
  autoFocus?: boolean
  className?: string          // يُضاف لـ pwd-wrapper
  inputClassName?: string     // يُضاف لـ pwd-input
  inputStyle?: CSSProperties  // أنماط inline للـ input
  onKeyDown?: (e) => void
/>
```
**السلوك:**
- يعرض `<input type="password">` افتراضياً
- زر (👁/👁‍🗨) يبدّل بين type="password" وtype="text"
- يرصد حالة `CapsLock` عبر `getModifierState('CapsLock')` في onKeyDown وonKeyUp
- عند تفعيل Caps Lock: يظهر `<span className="pwd-capslock-warning">⚠ مفتاح Caps Lock مفعّل</span>`

### `src/store/GarageContext.tsx`
- **يوفّر:** جميع البيانات المحمّلة من DB + `reload()` + `loading` + `getLinkedOps()`
- **يُحمّل عند الإطلاق:** 11 استدعاء متوازٍ (Promise.all) لكل قنوات `getAll`
- **`getLinkedOps(phone, currentSource, currentId)`:** يُعيد عمليات سابقة لنفس رقم الهاتف من maintenance + direct_sale + supplier invoices
- **`reload()`:** يُعيد تشغيل كل الاستدعاءات → يُحدّث كل الشاشات

**الأنواع المُعرَّفة في GarageContext:**

| النوع | الوصف |
|---|---|
| `CarRecord` | فاتورة صيانة في UI (يشمل amountPaid?, amountRemaining? الاختياريَّين) |
| `CarItem` | بند صيانة في UI |
| `SaleRecord` | فاتورة بيع مباشر في UI |
| `SaleItem` | بند بيع مباشر في UI |
| `PaymentRow` | صف دفع (مع تفاصيل شيك/فيزا) |
| `DebtRecord` | دين معلق |
| `DebtType` | `'maintenance'` \| `'direct_sale'` |
| `SaleInvoice` | فاتورة بيع مجمّعة |
| `SaleInvoiceType` | `'maintenance'` \| `'direct_sale'` |
| `SaleInvoiceStatus` | `'paid'` \| `'partial_debt'` \| `'full_debt'` |
| `PurchaseInvoice` | فاتورة شراء مجمّعة |
| `PurchaseType` | `'supplier'` \| `'expense'` \| `'salary'` |
| `PurchaseStatus` | نفس SaleInvoiceStatus |
| `Supplier` | مورد في الدليل |
| `SupplierRecord` | فاتورة مورد في UI |
| `SupplierItem` | بند فاتورة مورد |
| `Expense` | مصروف يومي |
| `Employee` | موظف (يشمل dailyWage: number) |
| `SalaryRecord` | دفعة راتب (يشمل dailyWageSnapshot, daysWorked, bonus, deduction) |
| `WarrantyRecord` | كفالة |
| `WarrantyPeriodUnit` | `'week'` \| `'month'` \| `'year'` |

---

## 7. الاتفاقيات المتبعة

### الألوان والـ CSS

**المتغيرات الرئيسية (src/index.css):**
```css
--primary: #2ECC71       /* أخضر — الأزرار الرئيسية */
--primary-dark: #27AE60  /* أخضر داكن عند Hover */
--accent-blue: #3498DB   /* أزرق — badges البيع المباشر */
--accent-orange: #E67E22 /* برتقالي — badges الصيانة */
--danger: #E74C3C        /* أحمر — الحذف والديون */
--text-main: #1E2A38     /* كحلي داكن — النصوص */
--bg: #F5F5F5            /* رمادي فاتح — الخلفية */
--card-bg: #FFFFFF       /* أبيض — الكروت */
```

**أصناف CSS المشتركة المهمة:**
- `mi-badge-orange` / `mi-badge-blue` / `mi-badge-green` / `mi-badge-red` / `mi-badge-yellow` / `mi-badge-gray` / `mi-badge-purple` — شارات النوع والحالة
- `mi-card` — بطاقة بحدود وظل خفيف
- `mi-table`, `mi-table-wrap`, `mi-row-even`, `mi-row-odd`, `mi-clickable-row` — جداول
- `mi-modal-overlay`, `mi-modal`, `mi-modal-sm`, `mi-modal-lg` — مودالات
- `mi-detail-grid`, `mi-detail-item`, `mi-detail-label`, `mi-detail-full` — عرض تفاصيل
- `mi-form-grid`, `mi-field`, `mi-field-full`, `mi-required`, `mi-err`, `mi-input-err` — نماذج
- `stat-card`, `stat-label`, `stat-value` — بطاقات الإحصائيات
- `btn`, `btn-primary`, `btn-secondary`, `btn-ghost`, `btn-danger`, `btn-sm-outline`, `btn-danger-sm`, `btn-sm-green` — أزرار
- `cl-amount-in` (أخضر) / `cl-amount-out` (أحمر) — مبالغ الصندوق
- `pd-paid` (أخضر) / `pd-remaining` (أحمر) — مدفوع/متبقي
- `mi-amount` — مبلغ عادي
- `mi-plate` — نمرة السيارة
- `mi-phone-highlight` — رقم الهاتف
- `pwd-wrapper`, `pwd-input-wrap`, `pwd-input`, `pwd-toggle-btn`, `pwd-capslock-warning` — مكوّن PasswordInput (معرَّفة في `App.css`)

**إصلاحات Sidebar (App.css):**
- `.sidebar`: أُزيلت `position: sticky` و`top: 0`، أُضيفت `overflow: hidden`
- `.sidebar-nav`: أُضيفت `overflow-y: auto` و`min-height: 0` للسماح بالتمرير
- `.sidebar-nav::-webkit-scrollbar`: شريط تمرير رفيع شبه شفاف (4px)
- `@media (max-height: 800px)`: تقليل padding وfont-size للـ logo, nav links, date عند الشاشات المنخفضة

### أسماء الدوال والمتغيرات

- **DB types:** `snake_case` (مثال: `customer_name`, `amount_paid`)
- **UI types:** `camelCase` (مثال: `customerName`, `amountPaid`)
- **التحويل:** دوال `dbMapper.ts` تُحوّل بينهما
- **الدوال في DB:** تأخذ `db` كأول معامل (better-sqlite3 instance)
- **القنوات IPC:** `namespace:action` (مثال: `maintenance:add`, `warranty:getAll`)

### معالجة رقم الهاتف

- **في DB:** `NULL` إذا لم يُدخَل
- **في UI:** يُعرض كـ `'0000'` sentinel أو فراغ حسب الشاشة
- **في dbMapper:** `NULL` من DB → `'0000'` في UI و `'0000'` من UI → `NULL` في DB
- **في العرض:** إذا كان `phone === '0000'` أو فارغ → يُعرض "غير معروف" بـ `mi-badge-gray`

### البحث والفلترة (Fuse.js)

```ts
const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا')   // توحيد الألف
   .replace(/ة/g, 'ه')        // ة → ه
   .replace(/ى/g, 'ي')        // ى → ي
   .replace(/\s+/g, '')        // حذف المسافات
   .toLowerCase()              // أحرف صغيرة (للإنجليزية)
```

- `threshold: 0.4` — درجة التطابق المسموح بها
- `ignoreLocation: true` — البحث في أي موقع من النص
- النمط: تُنشأ `fuseItems` من البيانات مع `_idx` للرجوع للعنصر الأصلي
- النتائج: `fuse.search(normalizeAr(q)).map(r => data[r.item._idx])`

### الـ Validation

- تحقق من الحقول عند `submitAttempted = true` (بعد أول محاولة حفظ)
- الحقول المطلوبة تُعرض `<span className="mi-required">*</span>`
- الأخطاء تُعرض أسفل الحقل: `<span className="mi-err">{error}</span>`
- الحقل الخاطئ يحصل على: `className="mi-input-err"`
- دالة مشتركة: `showErr(msg) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null`

### كفالة الضمان (JSON format)

```ts
// تخزين:
JSON.stringify({ value: 3, unit: 'month' })  // "{"value":3,"unit":"month"}"

// استرجاع:
function parseWarrantyJson(raw: string): { value: number; unit: WarrantyPeriodUnit } | null {
  try { return JSON.parse(raw) } catch { return null }
}

// عرض للمستخدم:
function warrantyLabel(raw: string): string {
  const parsed = parseWarrantyJson(raw)
  if (!parsed) return raw || '—'
  const unitMap = { week: 'أسبوع', month: 'شهر', year: 'سنة' }
  return `${parsed.value} ${unitMap[parsed.unit]}`
}

// حساب تاريخ الانتهاء (src/utils/warranty.ts):
export function calcEndDate(startDate: string, value: number, unit: WarrantyPeriodUnit): string
export function daysRemaining(endDate: string): number
```

### تصدير CSV (src/utils/exportCsv.ts)

```ts
exportToCsv(filename: string, headers: string[], rows: (string | number)[][]): void
```
- يُضيف BOM (`﻿`) لضمان عرض العربية صحيحاً في Excel
- يهرب الفواصل والاقتباسات وأسطر جديدة داخل الخلايا
- يُنشئ Blob وينقره تلقائياً (no server needed)

### طرق الدفع

| في DB | في UI | الوصف |
|---|---|---|
| `'cash'` | `'cash'` | كاش |
| `'cheque'` | `'check'` | شيك (تحويل في dbMapper) |
| `'visa'` | `'visa'` | فيزا |
| — | `'debt'` | دين (لا يُخزَّن كطريقة دفع، يُقلّل amount_remaining) |

### مسار قاعدة البيانات

```ts
// في التطوير:
path.join(app.getPath('userData'), 'garage.db')
// في الإنتاج (مُعبَّأ):
path.join(process.resourcesPath, 'schema.sql')  // للـ schema فقط
```

### الطباعة

```ts
printPdf(title: string, bodyHtml: string): void
```
- يفتح نافذة popup جديدة
- يُضيف: Tajawal font + RTL layout + A4 print styles
- الرأس: "**كراج التل الأخضر**" + العنوان
- يُحقن `bodyHtml` في الجسم
- يستخدم `toLocaleDateString('ar-EG-u-nu-latn', ...)` لتاريخ الطباعة (أرقام لاتينية)
- يستدعي `window.print()` ثم يُغلق النافذة

### الـ Draft (المسودة)

- يُخزَّن النموذج قيد التحرير في localStorage
- يُستعاد عند إعادة فتح الشاشة
- يُحذف عند الحفظ الناجح أو الإلغاء
- مفاتيح Draft الموجودة:
  - `'garage-mi-draft-v2'` — صيانة
  - `'garage-ds-draft-v2'` — بيع مباشر
  - `'garage-exp-draft'` — مصاريف يومية

---

## 8. الأشياء المكتملة والناقصة

### مكتمل

- [x] CRUD كامل لفواتير الصيانة (إضافة/تعديل/تسليم/حذف/طباعة)
- [x] CRUD كامل للبيع المباشر
- [x] CRUD كامل لفواتير الموردين + دفعات + سداد ديون
- [x] CRUD للمصاريف اليومية
- [x] CRUD للموظفين والرواتب
- [x] نظام الديون المعلقة مع إضافة دفعات وتحصيل
- [x] صندوق رئيسي (Ledger) يسجّل كل العمليات تلقائياً
- [x] إحصاء نهاية اليوم (مقارنة فعلي/نظام) مع حفظ السجل
- [x] تقارير (يومي/شهري/سنوي/ديون) مع طباعة
- [x] فواتير البيع المجمّعة (صيانة + بيع مباشر) مع فلاتر متقدمة
- [x] فواتير الشراء المجمّعة (مورد + مصروف + راتب)
- [x] الكفالات: CRUD يدوي + مزامنة تلقائية من الصيانة والبيع المباشر
- [x] نظام الكفالات المنظّم (dropdown وحدة + عدد) مخزّن كـ JSON
- [x] عمود "نوع العملية" في شاشة الكفالات
- [x] دليل الموردين منفصل
- [x] بحث Fuse.js مع تطبيع عربي في كل الشاشات
- [x] LinkedOps (عمليات سابقة لنفس الزبون) في التفاصيل
- [x] PasswordGate + ConfirmDialog مع كلمة سر
- [x] مكوّن PasswordInput مع إظهار/إخفاء كلمة السر ومؤشر Caps Lock
- [x] Draft localStorage للنماذج الطويلة
- [x] طباعة لكل نوع فاتورة
- [x] دعم طرق دفع متعددة: كاش/شيك/فيزا/دين مع التفاصيل الكاملة
- [x] part_type (قطعة/خدمة) لبنود الصيانة
- [x] TypeScript صحيح بلا أخطاء (`tsc --noEmit` ينجح)
- [x] **تعديل بنود الصيانة:** نموذج التعديل يستدعي `getOne` لجلب البنود الكاملة بكفالاتها وأنواعها
- [x] **تعديل بنود البيع المباشر:** `directSale:updateItems` تحذف البنود وتُعيد إدراجها + تُحدّث الإجمالي
- [x] **نظام الرواتب باليومية:** daily_wage في employees + 4 أعمدة في salary_payments + migration تلقائي + salary:update
- [x] **تقرير أفضل الزبائن:** تبويب جديد في Reports.tsx يستدعي `report:topCustomers(20)`
- [x] **تنبيه الكفالات القريبة من الانتهاء:** بطاقة تفاعلية في Home.tsx تعرض الكفالات التي تنتهي خلال 7 أيام
- [x] **تصدير CSV:** زر تصدير في Reports.tsx لتبويبات يومي/شهري/سنوي/ديون
- [x] **نسخ احتياطي:** backup:export و backup:import مع التحقق والنسخة التلقائية + صفحة Settings.tsx

### غير مكتمل / قيود معروفة

- [ ] **تعديل الكميات بعد التسليم:** لا يمكن تعديل الكميات أو الأسعار في الفاتورة المُسلَّمة.

---

## 9. ملاحظات للمطور الذي سيكمل المشروع

### تركيب المشروع وتشغيله

```bash
npm install
npm run dev      # يشغّل Vite + Electron معاً
npm run build    # يبني Vite ثم يحزم Electron
```

**إعادة بناء better-sqlite3 للإلكترون:**
```bash
npx electron-rebuild -f -w better-sqlite3
```

### أهم الأشياء التي يجب فهمها أولاً

1. **الـ IPC هو النقطة الوحيدة للتواصل مع DB.** لا يمكن للـ Renderer أن يستدعي DB مباشرةً. كل استدعاء يمر عبر `window.ipcRenderer.invoke` → `ipcMain.handle`.

2. **`dbService`** في `src/services/db.ts` هو طبقة ملاءمة فقط — كل دالة فيها تستدعي `window.ipcRenderer.invoke` وتُعيد البيانات المُرجَّعة. لإضافة قناة جديدة: أضف handler في ipc-handlers.ts + أضف دالة في dbService + أضف الدالة المقابلة في db/types.ts.

3. **GarageContext يُحمَّل مرة واحدة** عند الإطلاق. بعد كل عملية كتابة، يجب استدعاء `reload()` لتحديث كل الشاشات. لا تُحدّث state الشاشة مباشرةً — استخدم reload.

4. **مزامنة الكفالات** تحدث تلقائياً من ipc-handlers.ts عند كل حفظ/تعديل لفواتير الصيانة والبيع المباشر. لا تتوقع أن تُحدّث جدول warranties يدوياً من الصفحات.

5. **التحويل بين أنواع DB والـ UI** يتم فقط في `dbMapper.ts`. أي حقل جديد يحتاج إضافة في:
   - `src/db/types.ts` (النوع على مستوى DB)
   - `src/store/GarageContext.tsx` (النوع على مستوى UI)
   - `src/utils/dbMapper.ts` (دالة التحويل)
   - `electron/schema.sql` (التعريف في DB)
   - `src/database.ts` (migration إذا كانت الجداول موجودة مسبقاً)

6. **Ledger يُسجَّل تلقائياً** في كل عملية مالية. إذا أضفت نوع دفع جديد، أضف استدعاء `recordLedgerEntry` في المكان المناسب وأضف `reference_type` ثابتاً في `src/db/ledger.ts`.

7. **طريقة الدفع 'check' في UI تتحوّل إلى 'cheque' في DB** (انتبه لهذا التناقض في dbMapper).

8. **نمط بنية CSS لمكوّنات جديدة:** استخدم بادئة مميزة للأصناف (مثل `pwd-` لـ PasswordInput) لتجنّب التعارض مع أصناف `mi-` العامة. عرّف الأصناف في `App.css`.

### إضافة شاشة جديدة

1. أنشئ `src/pages/NewPage.tsx`
2. أضف Route في `src/App.tsx`
3. أضف رابط في `src/components/Sidebar.tsx`
4. إذا احتاجت بيانات: أضف قناة IPC في ipc-handlers.ts + دالة في dbService + نوع في types.ts + تحميل في GarageContext.reload()

### إضافة جدول جديد في DB

1. أضف `CREATE TABLE IF NOT EXISTS` في `electron/schema.sql`
2. أضف أنواع في `src/db/types.ts`
3. أضف دوال CRUD في ملف جديد `src/db/new-module.ts`
4. أضف قنوات في `electron/ipc-handlers.ts`
5. أضف دوال في `src/services/db.ts`
6. أضف أنواع UI في `GarageContext.tsx`
7. أضف دوال تحويل في `dbMapper.ts`
8. إذا كانت قواعد بيانات موجودة بحاجة تحديث: أضف `ALTER TABLE` في migrations بـ `src/database.ts`

### أنماط CSS الشائعة للشاشات الجديدة

اتبع نفس بنية الشاشات الموجودة:
```jsx
<div>
  <div className="page-header mi-page-header">
    <h1 className="page-title">عنوان الشاشة</h1>
    <button className="btn btn-primary">+ إضافة</button>
  </div>
  
  <div className="mi-card">
    <h2 className="mi-section-title">العنوان الفرعي</h2>
    <div className="mi-filters">...</div>
    <div className="mi-table-wrap">
      <table className="mi-table">...</table>
    </div>
  </div>
</div>
```

### الأمان وكلمة السر

- `APP_PASSWORD = 'garage2026'` في `src/utils/auth.ts`
- تغيير كلمة السر = تغيير هذا الثابت فقط
- `ConfirmDialog` يطلب كلمة السر عند `requirePassword={true}` (الافتراضي)
- `PasswordGate` يحجب التطبيق كاملاً حتى إدخال الكلمة الصحيحة
- كلا المكوّنَين يستخدمان `PasswordInput` لتجربة أفضل (إظهار/إخفاء + Caps Lock)

### مسار قاعدة البيانات في التطوير vs الإنتاج

```ts
// في src/database.ts:
const dbPath = app.getPath('userData') + '/garage.db'
// على Linux: ~/.config/Car-Repair/garage.db
// على Windows: C:\Users\<user>\AppData\Roaming\Car-Repair\garage.db
// على macOS: ~/Library/Application Support/Car-Repair/garage.db
```

---

*آخر تحديث: 2026-07-01*
*الإصدار الموثَّق: يشمل كل التعديلات حتى تاريخ كتابة هذا الملف*
