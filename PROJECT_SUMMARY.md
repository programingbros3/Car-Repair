# ملخص مشروع كراج الخط الأخضر

---

## 1. اسم المشروع والتقنيات المستخدمة

**اسم المشروع:** كراج الخط الأخضر — نظام إدارة ورشة سيارات

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
| SheetJS (`xlsx`) | تصدير تقارير Excel حقيقية (.xlsx) من الواجهة عبر Blob — بجانب تصدير CSV الموجود |
| bcryptjs | تشفير (hash) كلمة سر التطبيق — نسخة JS خالصة، بدون بناء أصلي/electron-rebuild |
| Tajawal Font | خط عربي، محزَّم محلياً عبر حزمة npm `@fontsource/tajawal` (لا يعتمد على اتصال إنترنت أو Google Fonts CDN) |

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
│   ├── auto-backup.ts       — النسخ الاحتياطي التلقائي الدوري (منفصل عن backup:export/import)
│   ├── vat.ts               — إعدادات الضريبة (VAT) الاختيارية في app_settings (نفس نمط auto-backup.ts) — معطّلة افتراضياً
│   ├── auth.ts              — كلمة السر (bcrypt hash)، القفل عند تجاوز المحاولات، القفل التلقائي، سجل النشاط
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
│   │   ├── reports.ts       — دوال التقارير (يومي/شهري/ديون/أعمار ديون/أفضل زبائن)
│   │   ├── suppliers.ts     — دوال CRUD للموردين وفواتيرهم
│   │   ├── cheques.ts       — الشيكات: المستحقة قريباً (getUpcomingCheques) + كل الشيكات (getAllCheques) — قراءة فقط
│   │   ├── invoiceNumber.ts — nextInvoiceNumber(): توليد رقم الفاتورة المنسّق (INV/PUR) عند الإضافة
│   │   ├── discount.ts      — applyDiscount(): تطبيق خصم الفاتورة (ثابت/نسبة) على مجموع البنود مع validation
│   │   └── warranties.ts    — دوال CRUD للكفالات (إضافة/تعديل/حذف يدوي)
│   │
│   ├── services/
│   │   └── db.ts            — طبقة الخدمة: تُغلّف window.ipcRenderer.invoke لكل قناة
│   │
│   ├── store/
│   │   └── GarageContext.tsx — React Context: يحمل كل البيانات + reload() + getLinkedOps() (بالهاتف) + getLinkedOpsByPlate() (بنمرة السيارة)
│   │
│   ├── utils/
│   │   ├── auth.ts          — DEFAULT_PASSWORD: بذرة كلمة السر لأول تشغيل فقط (المصدر الحقيقي: hash في app_settings عبر electron/auth.ts)
│   │   ├── notify.ts        — showError(): يُطلق حدث `app-error` (toast) بدل `alert()` المجمِّد للتطبيق — راجع "رسائل الخطأ (Toast)" أدناه
│   │   ├── printPdf.ts      — printPdf(title, bodyHtml): يفتح نافذة طباعة HTML
│   │   ├── dbMapper.ts      — دوال التحويل بين أنواع DB (snake_case) وأنواع UI (camelCase)
│   │   ├── warranty.ts      — calcEndDate() و daysRemaining(): دوال مشتركة لحساب الكفالة
│   │   ├── exportCsv.ts     — exportToCsv(): تصدير البيانات إلى ملف CSV
│   │   ├── exportXlsx.ts    — exportToXlsx(): تصدير البيانات إلى ملف Excel حقيقي (.xlsx) عبر SheetJS — إضافة موازية لـ exportCsv دون المساس به
│   │   └── useAutoLock.ts   — hook: يقفل التطبيق تلقائياً (يعيد عرض PasswordGate) بعد فترة خمول
│   │
│   ├── components/
│   │   ├── Sidebar.tsx      — شريط التنقل الجانبي (13 رابط) + التاريخ العربي بأرقام لاتينية
│   │   ├── ConfirmDialog.tsx — مودال تأكيد مع اختياري كلمة سر (يستخدم PasswordInput) — الرسالة تدعم أسطراً متعددة (`whiteSpace: pre-line`)
│   │   ├── PasswordGate.tsx — شاشة إدخال كلمة السر قبل فتح التطبيق (يستخدم PasswordInput)
│   │   ├── PasswordInput.tsx — حقل إدخال كلمة السر مع زر إظهار/إخفاء
│   │   ├── ErrorToast.tsx   — يستمع لحدث `app-error` ويعرض رسائل الخطأ كـ toast غير مُجمِّد (بديل `alert()`) — راجع "رسائل الخطأ (Toast)" أدناه
│   │   ├── SourcePickerModal.tsx — مودال عام لاختيار نوع العملية (Source) قبل فتح نموذج الإضافة — راجع "الإضافة المباشرة من الصفحات المجمّعة" أدناه
│   │   ├── AddSalesInvoiceButton.tsx — زر «إضافة» + اختيار مصدر (صيانة/بيع مباشر) يفتح نموذج الإضافة المشترك داخل Modal — يُستخدم في الديون/فواتير البيع/الكفالات
│   │   ├── AddPurchaseInvoiceButton.tsx — زر «إضافة» + اختيار نوع (مورد/مصروف/راتب) يفتح النموذج المشترك المناسب — يُستخدم في فواتير الشراء
│   │   └── forms/           — نماذج الإضافة/التعديل المشتركة (استُخرجت من الصفحات لتُعاد مشاركتها بلا تكرار) — راجع "الإضافة المباشرة من الصفحات المجمّعة"
│   │       ├── MaintenanceForm.tsx     — نموذج فاتورة الصيانة (add inline + edit modal + إضافة من الصفحات المجمّعة) عبر forwardRef يكشف save()
│   │       ├── DirectSaleForm.tsx      — نموذج فاتورة البيع المباشر (نفس النمط)
│   │       ├── SupplierInvoiceForm.tsx — نموذج فاتورة المورد (نفس النمط)
│   │       ├── ExpenseForm.tsx         — نموذج المصروف اليومي (نفس النمط)
│   │       └── SalaryForm.tsx          — نموذج دفعة الراتب (نفس النمط، بلا مسودة)
│   │
│   └── pages/
│       ├── CashLedger.tsx       — الصندوق الرئيسي: سجل الحركات + إحصاء نهاية اليوم (شاشة الهبوط الافتراضية عند "/")
│       ├── MaintenanceInvoices.tsx — فواتير الصيانة: CRUD كامل + بنود + دفعات + طباعة
│       ├── DirectSales.tsx      — البيع المباشر: CRUD + تعديل البنود + دفعات + كفالة الفاتورة
│       ├── SalesInvoices.tsx    — فواتير البيع (عرض مجمّع صيانة+بيع مباشر)
│       ├── PurchaseInvoices.tsx — فواتير الشراء (مجمّع مورد+مصروف+راتب)
│       ├── PendingDebts.tsx     — الديون المعلقة: عرض + سداد + تعديل
│       ├── Cheques.tsx          — الشيكات: عرض كل الشيكات (من الجداول الأربعة) + فلاتر (رقم/بنك/تاريخ/مبلغ) — قراءة فقط بالكامل
│       ├── DailyExpenses.tsx    — المصاريف اليومية: CRUD + بحث + فلترة
│       ├── Suppliers.tsx        — الموردون: فواتير الشراء CRUD + دفعات + موردون دليل
│       ├── Employees.tsx        — الموظفون والرواتب: CRUD + اليومية + حساب الراتب تلقائياً
│       ├── Warranties.tsx       — الكفالات: عرض نشطة/منتهية + تعديل/حذف + نوع العملية + زر «إضافة كفالة» يفتح نموذج فاتورة صيانة/بيع مباشر (الكفالة تُنشأ عبر المزامنة التلقائية، لا إدراج يدوي في جدول warranties)
│       ├── Reports.tsx          — التقارير: يومي/شهري/سنوي/ديون/أعمار ديون/أفضل زبائن + تصدير CSV + تصدير Excel
│       └── Settings.tsx         — الإعدادات: نسخ احتياطي (يدوي + تلقائي دوري) + الأمان (تغيير كلمة السر، القفل التلقائي، سجل النشاط)
│
├── public/
│   └── icon.png             — أيقونة التطبيق (favicon في index.html + أيقونة نافذة Electron عبر VITE_PUBLIC)
│
├── src/assets/icon.png      — نسخة مصدر لنفس الأيقونة (غير مُستوردة مباشرة في كود الواجهة)
│
├── build/                   — أيقونات التعبئة لـ electron-builder (غير متتبَّعة بـ git، تُنشأ محلياً): icon.icns (mac) / icon.ico (win) / icon.png (linux)
│
├── package.json             — تعريف المشروع، الاعتماديات، سكريبتات البناء
├── electron-builder.json5   — إعدادات تعبئة Electron (يشمل مسارات أيقونات build/ لكل منصة)
├── vite.config.ts           — إعدادات Vite
├── tsconfig.json            — إعدادات TypeScript
└── PROJECT_SUMMARY.md       — هذا الملف
```

**أيقونة التطبيق:** استُبدلت أيقونة Vite/Electron الافتراضية (`electron-vite.svg`) بأيقونة مخصّصة `icon.png`. تُستخدم في ثلاثة مواضع منفصلة: `index.html` (favicon المتصفح/الـ renderer)، `electron/main.ts` (أيقونة نافذة BrowserWindow عبر `process.env.VITE_PUBLIC`)، و`electron-builder.json5` (أيقونة الملف التنفيذي المُعبّأ لكل من mac/win/linux عبر مجلد `build/`).

---

## 3. قاعدة البيانات

### الجداول والأعمدة

#### `maintenance_invoices` — فواتير الصيانة
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| invoice_number | TEXT | رقم فاتورة منسّق للزبون بصيغة `INV-{سنة}-{تسلسل 4 خانات}` — أُضيف عبر migration، راجع "ترقيم الفواتير" أدناه |
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
| discount_type | TEXT | نوع خصم الفاتورة: `'fixed'` أو `'percentage'` أو NULL (بدون خصم) — أُضيف عبر migration، راجع "خصم الفاتورة" أدناه |
| discount_value | REAL DEFAULT 0 | قيمة الخصم (₪ إن كان fixed، نسبة 0-100 إن كان percentage) — أُضيف عبر migration |
| total_amount | REAL DEFAULT 0 | الإجمالي **بعد الخصم** (يُحسب من البنود ثم يُطبَّق الخصم) |
| amount_paid | REAL DEFAULT 0 | المدفوع |
| amount_remaining | REAL DEFAULT 0 | المتبقي |
| created_at | TEXT | توقيت الإنشاء |

#### `direct_sale_invoices` — فواتير البيع المباشر
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| invoice_number | TEXT | نفس تسلسل `INV-{سنة}-{تسلسل}` المشترك مع `maintenance_invoices` — راجع "ترقيم الفواتير" أدناه |
| customer_name | TEXT NOT NULL | |
| customer_phone | TEXT | |
| sale_date | TEXT NOT NULL | تاريخ البيع |
| warranty | TEXT | JSON كفالة الفاتورة: `{"value":N,"unit":"week"|"month"|"year"}` أو NULL |
| notes | TEXT | |
| discount_type | TEXT | نفس خصم فواتير الصيانة: `'fixed'` / `'percentage'` / NULL — أُضيف عبر migration |
| discount_value | REAL DEFAULT 0 | قيمة الخصم — أُضيف عبر migration |
| total_amount | REAL DEFAULT 0 | الإجمالي **بعد الخصم** |
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
| amount | REAL | مبلغ الدفعة النقدية الفعلية |
| settlement_discount | REAL NOT NULL DEFAULT 0 | خصم تسوية يُسقَط من `amount_remaining` **دون** تسجيله كنقدية في `cash_ledger` — أُضيف عبر migration، راجع "خصم تسوية عند الدفع" أدناه و"تحديث 2026-07-02 (١١)". صف الخصم يُدرَج مستقلاً (`amount=0`, `method='cash'`, `notes='خصم تسوية'`). |
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
نفس بنية `payments` لكن في جدول منفصل لتمييز دفعات التحصيل — بما في ذلك عمود `settlement_discount REAL NOT NULL DEFAULT 0` (خصم التسوية، راجع "خصم تسوية عند الدفع").

#### `debt_payment_cheque` / `debt_payment_visa` — نفس تفاصيل `payment_cheque` / `payment_visa`

#### `supplier_invoices` — فواتير الموردين
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| invoice_number | TEXT | رقم فاتورة منسّق بصيغة `PUR-{سنة}-{تسلسل 4 خانات}` — تسلسل مستقل تماماً عن `INV-*`، راجع "ترقيم الفواتير" أدناه |
| supplier_name | TEXT NOT NULL | |
| supplier_phone | TEXT | |
| purchase_date | TEXT NOT NULL | |
| notes | TEXT | |
| total_amount | REAL DEFAULT 0 | |
| amount_paid | REAL DEFAULT 0 | |
| amount_remaining | REAL DEFAULT 0 | |
| created_at | TEXT | |

#### `supplier_items` — بنود فواتير الموردين
يحتوي: id, invoice_id (FK→supplier_invoices CASCADE), item_name, quantity, unit_price, notes, created_at، بالإضافة إلى `discount_type` (TEXT: `'fixed'`/`'percentage'`/NULL) و`discount_value` (REAL DEFAULT 0) — **خصم على مستوى البند الفردي** (لا الفاتورة كاملة)، أُضيفا عبر migration. راجع "خصم بنود فاتورة المورد" أدناه و"تحديث 2026-07-02 (١٠)".

#### `supplier_payments` — دفعات للموردين (عند الشراء)
يحتوي: id, invoice_id, payment_date, method, amount, notes, created_at، بالإضافة إلى `settlement_discount REAL NOT NULL DEFAULT 0` (خصم التسوية عند الدفع للمورد — راجع "خصم تسوية عند الدفع").

#### `supplier_payment_cheque` / `supplier_payment_visa` — تفاصيل دفعات الموردين

#### `supplier_debt_payments` — سداد ديون الموردين لاحقاً
نفس بنية `supplier_payments` (يشمل `settlement_discount REAL NOT NULL DEFAULT 0` — خصم التسوية عند سداد دين المورد). هذا هو الجدول الذي يستخدمه مودال "إضافة دفعة" في `Suppliers.tsx`.
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

**ملاحظة migration:** الأعمدة الجديدة في `employees` و`salary_payments` و`maintenance_invoices`/`direct_sale_invoices`/`supplier_invoices` (`invoice_number`، راجع "ترقيم الفواتير" أدناه؛ و`discount_type`/`discount_value` في جدولي الصيانة والبيع المباشر، راجع "خصم الفاتورة" أدناه) و`invoice_items` (`warranty`, `part_type`) و`supplier_items` (`discount_type`, `discount_value` — خصم البند الفردي، راجع "خصم بنود فاتورة المورد" أدناه) و`daily_cash_audits` (`actual_cash`, `actual_visa`, `actual_check` — راجع "إحصاء نهاية اليوم حسب طريقة الدفع" أدناه) و`payments`/`debt_payments`/`supplier_payments`/`supplier_debt_payments` (`settlement_discount` — خصم التسوية عند الدفع، راجع "خصم تسوية عند الدفع" أدناه) لم تُضَف في `schema.sql` مباشرةً لتجنّب فقدان البيانات في قواعد البيانات الموجودة. تُشغَّل migrations في `src/database.ts → initDB()` بصيغة `ALTER TABLE ... ADD COLUMN` داخل حلقة `for` مع `try/catch` يتجاهل خطأ `duplicate column name` — وبهذا تُشغَّل مرة واحدة فقط ثم تصبح no-op في كل إطلاق لاحق.

#### ترقيم الفواتير (`invoice_number`) — منذ 2026-07-02

قبل هذا التحديث لم يكن للفاتورة أي معرّف يُعرض للزبون سوى `id` الداخلي في قاعدة البيانات (تسلسل واحد مشترك بين كل الجداول لا يبدأ من 1 لكل نوع ولا يُعاد للصفر كل سنة). الآن كل فاتورة صيانة/بيع مباشر/مورد تحمل بالإضافة إلى `id` (الذي **لم يتغيّر ولم يُحذف** ويبقى المفتاح الداخلي الوحيد لكل العلاقات) عمود `invoice_number` نصّي منسّق يُعرض للزبون في الجداول والمودالات والإيصالات المطبوعة.

**قرار التصميم — تسلسل واحد مشترك بين الصيانة والبيع المباشر:**
فواتير الصيانة (`maintenance_invoices`) والبيع المباشر (`direct_sale_invoices`) تستخدمان بادئة **`INV`** بتسلسل **واحد مشترك** بينهما (وليس عدّاداً منفصلاً لكل جدول)، لأنهما تُعرضان أصلاً مجتمعتين كفاتورة بيع واحدة للزبون في `SalesInvoices.tsx`. لو استُخدم عدّاد منفصل لكل جدول بنفس البادئة لأمكن ظهور نفس الرقم (مثلاً `INV-2026-0001`) على فاتورتين مختلفتين تماماً (واحدة صيانة وواحدة بيع مباشر)، وهو ما يُفقد الرقم صفة "معرّف فريد يعرفه الزبون". فواتير الموردين (`supplier_invoices`) تستخدم بادئة **`PUR`** بتسلسل **مستقل تماماً** عن `INV-*` (لا علاقة تجارية بين المورد والزبون تستدعي توحيدهما).

**الصيغة:** `{PREFIX}-{سنة}-{تسلسل 4 خانات معاد للصفر كل سنة}`، مثال: `INV-2026-0001`، `PUR-2026-0007`.

**التوليد عند الإضافة (`src/db/invoiceNumber.ts → nextInvoiceNumber(prefix, tables, year)`):**
تُستدعى من داخل نفس `db.transaction()` الذي يضمّ `INSERT` الفاتورة في `addMaintenanceInvoice`/`addDirectSaleInvoice` (`src/db/maintenance.ts`/`direct-sale.ts`، بادئة `INV`، الجدولان معاً) و`addSupplierInvoice` (`src/db/suppliers.ts`، بادئة `PUR`، جدول واحد). تبحث عن أعلى تسلسل مستخدم لنفس **السنة الحالية** (`new Date().getFullYear()` وقت الإضافة، **وليس** تاريخ الفاتورة الذي يُدخله المستخدم يدوياً وقد يكون بأثر رجعي) عبر كل الجداول المُمرَّرة معاً ثم تزيده بـ 1؛ إن لم يوجد أي رقم لهذه السنة بعد يبدأ التسلسل من `0001`. لا حاجة لقفل صريح: better-sqlite3 متزامن على اتصال واحد ضمن عملية Node.js وحيدة الخيط، فلا يمكن لعملية إضافة أخرى أن تتداخل بين قراءة أعلى رقم وإدراج الفاتورة طالما كلاهما يحدث داخل نفس `db.transaction()`.

**تعبئة السجلات القديمة (`src/database.ts → backfillInvoiceNumbers()`):** تُستدعى مرة واحدة بعد حلقة الـ migrations في `initDB()`. لكل مجموعة (`INV` = صيانة+بيع مباشر، `PUR` = موردون) تجلب كل الصفوف التي `invoice_number IS NULL` بعمودي `id`/`created_at` من كل جدول في المجموعة، ثم **تُرتَّب كلها معاً** (وليس كل جدول على حدة) ترتيباً زمنياً صرفاً حسب `created_at ASC` (وقت الإدخال الفعلي)، وتُرقَّم تصاعدياً ضمن مجموعة كل سنة — والسنة المستخدمة في كل رقم هي سنة **تاريخ الفاتورة نفسه** (`date_received`/`sale_date`/`purchase_date`) لا سنة `created_at`. تُهيّئ العدّادات أولاً من أي أرقام مُسنَدة مسبقاً (`WHERE invoice_number IS NOT NULL`) لتبقى آمنة عند التشغيل الجزئي/المتكرر — إن لم يبقَ أي صف بلا رقم تُصبح no-op فورية (نفس فلسفة باقي الـ migrations). تم التحقق يدوياً من الخوارزمية بمحاكاة قاعدة بيانات تجريبية تحوي بيانات موزّعة على سنتين مختلفتين قبل الدمج: الترقيم جاء متسلسلاً زمنياً بشكل صحيح، معاد الصفر لكل سنة، بلا أي تكرار بين الجدولين، ومطابق بعد التشغيل مرتين متتاليتين (idempotent).

**العرض:** `invoice_number` يظهر بدل الاعتماد على `id` الداخلي في: جداول `MaintenanceInvoices.tsx`/`DirectSales.tsx`/`SalesInvoices.tsx`/`Suppliers.tsx` (عمود "رقم الفاتورة")، مودالات التفاصيل في نفس الصفحات، ورأس كل إيصال مطبوع (`printPdf` — العنوان + أول سطر في `detail-grid`). أُضيف أيضاً كحقل بحث في كل نسخة `Fuse.js` بهذه الصفحات (بجانب اسم الزبون/المورد). فواتير الشراء المجمّعة (`PurchaseInvoices.tsx`) تعرض `invoice_number` للموردين فقط (المصاريف والرواتب ليس لها رقم فاتورة، تبقى `#{id}` كما كانت).

#### خصم الفاتورة (`discount_type` / `discount_value`) — منذ 2026-07-02

> ملاحظة: هذا القسم يخص **فواتير الصيانة والبيع المباشر فقط** حيث الخصم على مستوى الفاتورة كاملة. **فواتير الموردين** تستخدم نموذجاً مختلفاً — خصم على مستوى **البند الفردي** — راجع "خصم بنود فاتورة المورد" أدناه.

خصم اختياري **على مستوى الفاتورة كاملة** (وليس على مستوى البند الفردي — قرار تبسيط مقصود) لفواتير الصيانة والبيع المباشر فقط:
- `discount_type`: `'fixed'` (مبلغ ثابت بالشيكل) أو `'percentage'` (نسبة مئوية من مجموع البنود) أو `NULL` (بدون خصم).
- `discount_value`: المبلغ أو النسبة (0-100).
- **`total_amount` يُخزَّن دائماً بعد الخصم**: `total_amount = applyDiscount(مجموع qty × unit_price للبنود, discount_type, discount_value)`، و`amount_remaining` يُحسب من هذا الإجمالي المخصوم. لا يُخزَّن المجموع قبل الخصم — يُشتق للعرض من البنود (عند توفّرها عبر `getOne`) أو عكسياً من `total_amount` والخصم (دوال `discountBreakdown` المحلية في الصفحتين).
- **المنطق المركزي (`src/db/discount.ts → applyDiscount(subtotal, type, value)`):** يُطبَّق في main process عند كل إضافة/تعديل، ويرمي خطأً عربياً عند القيم غير الصالحة (سالبة، نسبة > 100، مبلغ ثابت > مجموع البنود) — حماية أخيرة تضمن ألا يصبح `total_amount` سالباً أبداً؛ الواجهة تتحقق من نفس القواعد قبل الإرسال (`discountErr` في الصفحتين).
- **اصطلاح `undefined` مقابل `null` في مدخلات التعديل:** `discount_type === undefined` في `maintenance:update`/`directSale:update` يعني "المستدعي لا يحمل الخصم — أبقِ المخزَّن كما هو" (شاشتا `SalesInvoices.tsx`/`PendingDebts.tsx` اللتان تعدّلان بيانات الفاتورة دون معرفة خصمها)، بينما `null` يعني "أزل الخصم" (اختيار "بدون خصم" في نموذجَي الصيانة/البيع المباشر). التحويل في `dbMapper.ts` يحافظ على هذا التمييز.
- **إعادة الحساب:** `updateMaintenanceInvoice` يعيد حساب `total_amount`/`amount_remaining` من بنود الجدول الفعلية عند تغيّر البنود **أو** الخصم (البنود والخصم يصلان معاً في نفس الاستدعاء/الـ transaction)؛ `recalcDirectSaleTotals(invoiceId)` (في `direct-sale.ts`) تفعل الشيء نفسه للبيع المباشر وتُستدعى من `updateDirectSaleItems` ومن قناة `directSale:update` عند تمرير خصم.
- **ذرّية الخصم مع البنود في البيع المباشر:** نموذج التعديل في `DirectSales.tsx` يمرّر الخصم الجديد كوسيط ثالث اختياري لـ `directSale:updateItems` (`{ type, value }`) فيُكتب داخل نفس transaction البنود الجديدة **قبل** إعادة الحساب، ويستدعي `directSale:update` بخصم `undefined` (لا تلمس) — كي لا يُقيَّم الخصم الجديد مقابل البنود القديمة (كان سيرمي خطأً زائفاً لو كان الخصم الثابت الجديد أكبر من مجموع البنود القديمة رغم صلاحيته للبنود الجديدة).

#### خصم بنود فاتورة المورد (`supplier_items.discount_type` / `discount_value`) — منذ 2026-07-02

على عكس خصم الفاتورة الكاملة في الصيانة/البيع المباشر أعلاه، فواتير الموردين تدعم خصماً **على مستوى البند الفردي** — لكل بند في `supplier_items` خصمه الخاص:
- `discount_type`: `'fixed'` (مبلغ ثابت بالشيكل) أو `'percentage'` (نسبة 0-100 من إجمالي البند) أو `NULL` (بدون خصم). `discount_value`: المبلغ أو النسبة.
- **المجموع الكلي للفاتورة** `total_amount = Σ applyDiscount(qty × unit_price لكل بند, discount_type, discount_value)` — أي مجموع إجمالي كل بند **بعد خصمه الخاص**. تُعيد استخدام نفس `applyDiscount` من `src/db/discount.ts` (لا تكرار للمنطق) في `calcTotal` داخل `src/db/suppliers.ts`.
- **الحساب في `src/db/suppliers.ts`:** `addSupplierInvoice` يُدرج البنود مع عمودَي الخصم ويحسب `total_amount` عبر `calcTotal` المحدَّثة. أُضيفت `updateSupplierInvoice(id, input)` (بديلة عن التحديث المباشر السابق في `ipc-handlers.ts` الذي كان يعدّل الترويسة فقط دون البنود): تُعيد إدراج البنود بالكامل داخل transaction واحدة، تعيد حساب `total_amount` من خصومات البنود، ثم `amount_remaining = total_amount − amount_paid` (الدفعات لا تُعدَّل هنا). قناة `supplierInvoice:update` تستدعيها.
- **الواجهة (`SupplierInvoiceForm.tsx`):** لكل بند في جدول البنود عمود "الإجمالي" (qty × unit_price محسوب حياً)، dropdown خصم (بدون خصم/مبلغ ثابت/نسبة %) + حقل قيمة، وعمود "بعد الخصم" لكل بند حياً. المجموع الكلي أسفل الجدول = مجموع "بعد الخصم" لكل البنود. حسابات العرض الحيّة تعيد استخدام `applyDiscount` (مغلّفة بـ try/catch للعرض) والتحقق من القيم غير الصالحة يمنع الحفظ.
- **العرض في `Suppliers.tsx`:** مودال التفاصيل والإيصال المطبوع يعرضان لكل بند: العدد، السعر، الإجمالي قبل الخصم، الخصم إن وُجد، والإجمالي بعد الخصم — مع المجموع الكلي في الأسفل (helpers `itemDiscountLabel`/`itemNetTotal` تعيد استخدام `applyDiscount`).

#### خصم تسوية عند الدفع (`settlement_discount`) — منذ 2026-07-02

> ملاحظة تمييز مهمّة: هذا الخصم **مختلف تماماً** عن `discount_type`/`discount_value` على مستوى الفاتورة/البند أعلاه. تلك خصومات تُطبَّق وقت إنشاء/تعديل الفاتورة وتُنقِص `total_amount`. أمّا `settlement_discount` فهو **إسقاط تسوية وقت الدفع**: يُنقِص `amount_remaining` المتبقّي فقط **دون أن يمسّ `total_amount` ولا `amount_paid` ولا `cash_ledger`**.

الغرض: عند التحصيل/الدفع يتّفق الطرفان على إسقاط جزء من المتبقّي (مثلاً المتبقّي 500، دفع الزبون 450 واتُّفِق على إسقاط 50)، فيصبح `amount_remaining = 0` **بدون** تسجيل الـ 50 كنقدية داخلة (`amount_in`) في الصندوق.

- **التخزين:** عمود `settlement_discount REAL NOT NULL DEFAULT 0` في الجداول الأربعة `payments` / `debt_payments` / `supplier_payments` / `supplier_debt_payments` (عبر migration). عند وجود خصم يُدرَج **صف مخصّص** في جدول الدفعات المعني: `amount = 0`, `method = 'cash'`, `settlement_discount = المبلغ`, `notes = 'خصم تسوية'` — فيبقى موثّقاً في سجل الدفعات ومنفصلاً بوضوح عن الدفعات النقدية.
- **الأثر على المتبقّي:** `amount_remaining` الجديد = `amount_remaining` الحالي − مجموع الدفعات النقدية الفعلية − `settlement_discount`. **`amount_paid` لا يتغيّر بخصم التسوية** (ليس نقدية مقبوضة)، لذا بعد التسوية يصير `total_amount = amount_paid + amount_remaining + settlement_discount` (وليس `paid + remaining` فقط). لهذا حُدِّثت `saleStatus(total, paid, remaining?)` في `dbMapper.ts` لتشتقّ الحالة من `amount_remaining` المخزَّن عند تمريره (كي تُعرَض "مدفوع" عند `remaining ≈ 0` رغم أن `paid < total`).
- **صفر قيد صندوق:** خصم التسوية **لا يُسجَّل في `cash_ledger` إطلاقاً** (لا `amount_in` ولا `amount_out`) — فلا يؤثّر على الرصيد ولا على التقارير ولا على إحصاء نهاية اليوم (`cashAudit:getSystemBreakdown` يجمع `amount` حسب الطريقة، وصف الخصم `amount=0` فلا يضيف شيئاً).
- **الحماية (نفس فلسفة حماية تجاوز المتبقّي):** يُرمى خطأ عربي واضح إن كان الخصم سالباً أو إن تجاوز `الدفعات الفعلية + خصم التسوية` المتبقّيَ (هامش تسامح `0.001`). المنطق مركزي في `applySettlementDiscount()` (مُصدَّرة من `src/db/payments.ts`، تُعاد استخدامها في `releaseMaintenanceCar` بـ `src/db/maintenance.ts`)، ونظير له داخل `insertSupplierPayments()` في `src/db/suppliers.ts` (لأن جداول الموردين بلا عمود `invoice_type`).
- **الأماكن الخمسة (backend):** `addPayment` و`addDebtPayment` (`payments.ts`)، `releaseMaintenanceCar` (`maintenance.ts`)، `addSupplierPayment` و`addSupplierDebtPayment` (`suppliers.ts`) — كلها تقبل وسيطاً اختيارياً `settlementDiscount = 0` يمرّ عبر قنوات IPC (`directSale:addPayment`, `maintenance:deliver`, `debt:addPayment`, `supplierInvoice:addPayment`, `supplierInvoice:addDebtPayment`) ودوال `services/db.ts`.
- **الواجهة (الإدخال):** حقل رقمي اختياري "خصم / إسقاط مبلغ (تسوية) ₪" بجانب صفوف الدفع في مودالات: تحصيل دين الزبون (`PendingDebts.tsx`)، دفعة البيع المباشر (`DirectSales.tsx`)، تسليم الصيانة (`MaintenanceInvoices.tsx`)، ودفعة/سداد المورد (`Suppliers.tsx`) — مع عرض حيّ لسطر "خصم تسوية" و"المتبقي بعد الدفعة والخصم".
- **الواجهة (العرض/القراءة) — راجع "تحديث 2026-07-03 (٣)":** خصم التسوية يظهر **بصف/سطر منفصل موسوم "خصم تسوية"** (بلون برتقالي مميّز، ليس نقدية داخلة/خارجة) في **كل** مكان تُعرض فيه تفاصيل الدفعات، لا مكان الإدخال فقط:
  - **الإيصالات المطبوعة** (صيانة/بيع مباشر/مورد/دين): تفصل الدفعات النقدية (`amount > 0`) في جدول عن سطر "خصم تسوية" (مجموع `settlement_discount`). إيصال الدين المعلّق (`printDebt` في `PendingDebts.tsx`) أُضيف له جدول تفصيل الدفعات + سطر خصم التسوية (كان يعرض المجاميع فقط).
  - **مودالات التفاصيل** (`MaintenanceInvoices`/`DirectSales`/`PendingDebts`/`Suppliers`): سطر "خصم تسوية (إسقاط — ليس نقداً)" يظهر ضمن مجاميع المودال حين `settlement_discount > 0`، عبر الـ hook المشترك `src/utils/useSettlementTotal.ts` الذي يجلب المجموع من قنوات القراءة أدناه. **لا يُدمج مع "المدفوع" النقدي إطلاقاً** (يبقى `amount_paid` نقدية صرفة).
- **قنوات القراءة (تُعيد `settlement_discount`) تجمع كلا جدولَي كل مسار:** `payments:getByInvoice` تُوحِّد (`UNION ALL`) جدولَي `payments` + `debt_payments` لنفس الفاتورة (كي يظهر خصم التسوية المسجَّل وقت **تحصيل الدين** لا وقت الاستلام/التسليم فقط)، و`supplierPayments:getByInvoice` تُوحِّد `supplier_payments` + `supplier_debt_payments`. بلا مسّ لأي حساب — قراءة فقط.

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

#### `app_settings` — إعدادات التطبيق (key/value)
| العمود | النوع |
|---|---|
| key | TEXT PRIMARY KEY |
| value | TEXT |

تُستخدم لإعدادات النسخ الاحتياطي التلقائي (`auto_backup_*` — راجع قسم "النسخ الاحتياطي التلقائي" أدناه)، ولإعدادات الأمان (`app_password_hash`, `auth_failed_attempts`, `auth_lockout_until`, `auth_lockout_level`, `auto_lock_enabled`, `auto_lock_minutes` — راجع قسم "الأمان" أدناه)، ولإعدادات الضريبة (`vat_enabled` بقيمة `'0'`/`'1'` افتراضي `'0'`، و`vat_rate` نسبة مئوية افتراضي `'16'` — راجع قسم "الضريبة (VAT)" أدناه).

#### `activity_log` — سجل النشاط (توثيق خفيف للعمليات الحساسة)
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| action_type | TEXT NOT NULL | `'update'` أو `'delete'` |
| entity_type | TEXT NOT NULL | مثل `'maintenance_invoice'`, `'employee'`, `'warranty'`، إلخ |
| entity_id | INTEGER | id السجل المتأثر (بدون FK — نفس فلسفة `cash_ledger.reference_id`) |
| details | TEXT | وصف عربي مختصر |
| created_at | TEXT | |

يُسجَّل تلقائياً من `electron/auth.ts → logActivity()` عند نجاح أي عملية تعديل/حذف محمية بـ `ConfirmDialog` — راجع قسم "الأمان" ضمن الـ Backend أدناه لتفاصيل نطاق التسجيل. قراءة فقط من الواجهة (لا تعديل ولا حذف يدوي لسجلاته).

#### `daily_cash_audits` — إحصاءات نهاية اليوم
| العمود | النوع | الوصف |
|---|---|---|
| id | INTEGER PK AUTOINCREMENT | |
| audit_date | TEXT UNIQUE (YYYY-MM-DD) | |
| system_total | REAL | إجمالي النظام (كل الطرق مجتمعة) |
| actual_amount | REAL | المبلغ الفعلي الكلي = actual_cash + actual_visa + actual_check |
| actual_cash | REAL NOT NULL DEFAULT 0 | الفعلي كاش — أُضيف عبر migration |
| actual_visa | REAL NOT NULL DEFAULT 0 | الفعلي فيزا — أُضيف عبر migration |
| actual_check | REAL NOT NULL DEFAULT 0 | الفعلي شيك — أُضيف عبر migration |
| difference | REAL | الفرق الكلي (فعلي − نظام) |
| created_at | TEXT | |

راجع قسم "إحصاء نهاية اليوم حسب طريقة الدفع" ضمن شاشة الصندوق أدناه.

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
| car_type | TEXT | نوع السيارة — صيانة فقط، يُكتب عبر المزامنة من الفاتورة (NULL لبيع مباشر واليدوي القديم) — أُضيف عبر migration، راجع "تحديث 2026-07-02 (٦)" |
| car_color | TEXT | لون السيارة — صيانة فقط (NULL لبيع مباشر واليدوي القديم) — أُضيف عبر migration |
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
| `maintenance:deliver` | { id, payments, date, settlementDiscount? } | void | تسليم السيارة + دفعة التسليم + خصم تسوية اختياري + Ledger |
| `maintenance:delete` | id | void | حذف الفاتورة + بنودها + دفعاتها + كفالاتها |

#### البيع المباشر
| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `directSale:getAll` | filters? | SaleRow[] | جلب كل فواتير البيع |
| `directSale:getOne` | id | SaleRow + items[] + payments[] | تفاصيل كاملة |
| `directSale:add` | SaleInput | { id } | إضافة فاتورة + بنود + دفعات + مزامنة كفالات |
| `directSale:update` | SaleRecord | void | تحديث بيانات الفاتورة + مزامنة كفالات |
| `directSale:updateItems` | { invoiceId, items[], discount? } | void | حذف البنود القديمة وإعادة إدراجها + كتابة الخصم إن مُرِّر + إعادة حساب total بعد الخصم |
| `directSale:addPayment` | { id, payments, date, settlementDiscount? } | void | إضافة دفعة + خصم تسوية اختياري + Ledger |
| `directSale:delete` | id | void | حذف + بنود + دفعات + كفالات |

#### فواتير الموردين
| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `supplierInvoice:getAll` | filters? | SupplierRow[] | |
| `supplierInvoice:getOne` | id | SupplierRow + items[] + payments[] | |
| `supplierInvoice:add` | SupplierInput | { id } | |
| `supplierInvoice:update` | id, SupplierInput | void | تحديث الترويسة + إعادة إدراج البنود (بخصومات البند) + إعادة حساب `total_amount`/`amount_remaining` عبر `updateSupplierInvoice` |
| `supplierInvoice:addPayment` | { id, payments, date, settlementDiscount? } | void | دفعة عادية + خصم تسوية اختياري |
| `supplierInvoice:addDebtPayment` | { id, payments, date, settlementDiscount? } | void | سداد دين + خصم تسوية اختياري (مودال «إضافة دفعة» في Suppliers.tsx) |
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
| `debt:addPayment` | تحصيل دين + خصم تسوية اختياري (settlementDiscount) + Ledger |

#### الصندوق
| القناة | الوصف |
|---|---|
| `ledger:getSummary` | إجمالي الوارد والصادر والرصيد الحالي |
| `ledger:getByDateRange` | الحركات بين تاريخين |

#### التقارير
| القناة | الوصف |
|---|---|
| `report:daily` | تقرير يوم محدد: مجاميع حسب reference_type (يشمل الحقول المجمّعة `today_sales_income`/`today_expenses`/`today_supplier_payments`/`today_salaries` لبطاقات ملخّص الصندوق — راجع "تحديث 2026-07-02 (١٣)") |
| `report:monthly` | تقرير شهر: GROUP BY يوم |
| `report:debts` | كل ديون الزبائن والموردين |
| `report:topCustomers` | أفضل الزبائن حسب الإنفاق (UNION maintenance+direct_sale, GROUP BY customer) |
| `report:debtsAging` | كل الديون المعلقة (UNION maintenance+direct_sale+supplier) مصنّفة حسب عمرها منذ تاريخ الفاتورة — منذ 2026-07-02 |

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
| `cashAudit:getAll` | ORDER BY audit_date DESC (يشمل actual_cash/visa/check) |
| `cashAudit:save` | INSERT OR REPLACE (ON CONFLICT audit_date DO UPDATE) — يحفظ التفصيل حسب الطريقة |
| `cashAudit:delete` | حذف سجل إحصاء واحد بالـ id — منذ 2026-07-02 |
| `cashAudit:getSystemBreakdown` | صافي حركات اليوم مقسّماً {cash, visa, cheque} = (وارد − صادر) لكل طريقة، محسوباً مباشرة من جداول الدفعات لا من `cash_ledger` — منذ 2026-07-02 |

#### الكفالات
| القناة | الوصف |
|---|---|
| `warranty:getAll` | كل الكفالات (يدوية + تلقائية) |
| `warranty:update` | تحديث كفالة |
| `warranty:delete` | حذف كفالة |

#### الدفعات (للطباعة)
| القناة | الوصف |
|---|---|
| `payments:getByInvoice` | { invoiceId, invoiceType } → دفعات فاتورة (`UNION ALL` بين `payments` + `debt_payments` — تشمل خصم التسوية وقت التحصيل، راجع "تحديث 2026-07-03 (٣)") |
| `supplierPayments:getByInvoice` | دفعات فاتورة مورد (`UNION ALL` بين `supplier_payments` + `supplier_debt_payments` — راجع "تحديث 2026-07-03 (٣)") |

#### الشيكات (`cheques:getUpcoming` + `cheques:getAll`) — منذ 2026-07-02

| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `cheques:getUpcoming` | daysAhead? (افتراضي 14) | `UpcomingChequeRow[]` | UNION من الشيكات (عادية + دين، عملاء + موردين) حيث `cash_date` بين اليوم و(اليوم + daysAhead)، مرتّبة تصاعدياً حسب `cash_date` |
| `cheques:getAll` | filters? (`ChequeFilters`) | `ChequeRow[]` | **كل** الشيكات التي دخلت البرنامج على الإطلاق (الماضية والمستقبلية، بلا قيد "قادم")، نفس UNION ALL مع إضافة `issue_date`، مرتّبة تنازلياً حسب `cash_date` (الأحدث أولاً) — راجع "صفحة الشيكات" أدناه |

**قراءة فقط بالكامل** — لا تعديل على بنية أي جدول من جداول الشيكات الأربعة الموجودة أصلاً (`payment_cheque`, `debt_payment_cheque`, `supplier_payment_cheque`, `supplier_debt_cheque`)؛ الميزة تعتمد فقط على الحقول الموجودة فيها مسبقاً (`cash_date`, `issue_date`, `cheque_number`, `bank_name`).

**المنطق (`src/db/cheques.ts` → `getUpcomingCheques(daysAhead)`):** UNION ALL لخمس جمل SELECT (شيكات دفعات الصيانة + شيكات دفعات البيع المباشر + شيكات تحصيل ديون العملاء مصنّفة حسب `invoice_type` إلى maintenance/direct_sale + شيكات دفعات الموردين + شيكات سداد ديون الموردين)، مع `JOIN` على جدول الفاتورة المصدر لجلب اسم الطرف (`party_name`: اسم الزبون أو المورد). كل صف يحمل `source` من أربع قيم: `'maintenance' | 'direct_sale' | 'supplier' | 'supplier_debt'`. `days_remaining` يُحسب داخل SQL بفارق تقويمي صرف بين تاريخين (`julianday(cash_date) - julianday(date('now','localtime'))`، وليس `julianday('now','localtime')` مباشرة) لتفادي انحراف النتيجة حسب ساعة اليوم الحالية — بنفس فلسفة `daysRemaining()` في `warranty.ts`.

**المنطق (`src/db/cheques.ts` → `getAllCheques(filters)`):** دالة **جديدة منفصلة تماماً** عن `getUpcomingCheques` (لا تعدّلها). نفس UNION ALL للجداول الأربعة وبنفس منطق `JOIN` جلب اسم الطرف، لكن بلا قيد "قادم خلال X يوم" — كل الشيكات بلا استثناء — مع إضافة عمود `issue_date` (تاريخ إصدار الشيك) اللازم للعرض، مرتّبة تنازلياً حسب `cash_date`. تبني جملة `WHERE` ديناميكية من `ChequeFilters` (كلها اختيارية): `chequeNumber` (بحث جزئي `LIKE`), `bankName` (بحث جزئي `LIKE`), `dateFrom`/`dateTo` (على `cash_date`), `amountMin`/`amountMax` (على `amount`) — كلها عبر بارامترات مُهيّأة (prepared params) لا سلاسل مُدمجة.

**صفحة الشيكات (`src/pages/Cheques.tsx`) — منذ 2026-07-03:** شاشة **قراءة فقط بالكامل** (لا إضافة ولا تعديل ولا حذف — أي تعديل على شيك يبقى من صفحته الأصلية، بنفس فلسفة قسم الشيكات المستحقة قريباً). تجلب البيانات عبر `dbService.cheques.getAll(filters)` داخل `useEffect` يُعاد تشغيله عند تغيّر أي فلتر (الفلترة تتمّ في SQL في main process لا في الواجهة). شريط فلاتر `mi-filters` بنفس نمط باقي الصفحات: بحث رقم الشيك، بحث اسم البنك، تاريخ صرف من–إلى، مبلغ من–إلى، وزر "مسح الفلاتر". جدول `mi-table` بأعمدة: رقم الشيك، اسم البنك، تاريخ الإصدار، تاريخ الصرف، المبلغ، الطرف، **نوع العملية** (badge: صيانة `mi-badge-orange` / بيع مباشر `mi-badge-blue` / مورد `mi-badge-purple` / دين مورد `mi-badge-red`)، و**حالة الاستحقاق** (منتهي `mi-badge-gray` عند `daysRemaining < 0` / اليوم `mi-badge-yellow` عند `=0` / قادم `mi-badge-green` عند `>0`، بمقارنة `cash_date` باليوم الحالي). بلا أي CSS جديد. النوع في الواجهة `ChequeRecord` (= `UpcomingCheque` + `issueDate`)، والتحويل عبر `dbRowToCheque` في `dbMapper.ts`.

#### النسخ الاحتياطي
| القناة | الوصف |
|---|---|
| `backup:export` | يفتح نافذة حفظ ملف → ينسخ garage.db إلى المسار المختار (بعد WAL checkpoint) |
| `backup:import` | يفتح نافذة اختيار ملف → يتحقق من صحته → ينسخ القاعدة الحالية تلقائياً → يُبدّل الملف → يُعيد تشغيل التطبيق |

**ملاحظة backup:import:** قبل الاستبدال يُنشئ نسخة تلقائية بمسار `{dbPath}.backup-{timestamp}`. يتحقق من صحة الملف المستورد بـ `ATTACH DATABASE ... AS _imported_validate` والتحقق من وجود جدول `maintenance_invoices`. يستخدم `ipcMain.handle` مباشرةً (لا wrapper) لأنه يحتاج `dialog` و`app` من Electron.

#### النسخ الاحتياطي التلقائي (منفصل تماماً عن backup:export/backup:import أعلاه)
| القناة | الوصف |
|---|---|
| `autoBackup:getSettings` | يرجع `{ enabled, folder, keepCount }` الحالية من جدول `app_settings` |
| `autoBackup:updateSettings` | يحدّث أياً من `enabled` / `folder` / `keepCount` (partial update) ويرجع الإعدادات الكاملة بعد التحديث |
| `autoBackup:runNow` | ينفّذ نسخة فورية لمسار الإعدادات الحالي (بصرف النظر عن `enabled`) — للاختبار اليدوي من الإعدادات |
| `autoBackup:getStatus` | يرجع `{ lastRunAt, lastStatus, lastError, lastSuccessAt }` |
| `autoBackup:pickFolder` | يفتح `dialog.showOpenDialog({ properties: ['openDirectory'] })` ويرجع المسار المختار أو `null` |

**المنطق (`electron/auto-backup.ts`):**
- الإعدادات تُخزَّن في جدول جديد **`app_settings (key TEXT PRIMARY KEY, value TEXT)`** داخل `garage.db` نفسه (وليس ملف JSON منفصل) — قرار مقصود: القاعدة مهيّأة أصلاً، ونمط key/value موجود بالفعل في `daily_cash_audits` كسلوك مشابه، والأهم أن الإعدادات تُنسخ تلقائياً ضمن أي نسخة احتياطية (يدوية أو تلقائية) لأنها جزء من نفس الملف.
- مفاتيح `app_settings` المستخدمة: `auto_backup_enabled`, `auto_backup_folder`, `auto_backup_keep_count`, `auto_backup_last_run_at` (كل محاولة)، `auto_backup_last_status`, `auto_backup_last_error`, `auto_backup_last_success_at` (فقط عند النجاح — هذا هو أساس شرط "مرّ يوم كامل").
- `runAutoBackup(db)`: يتحقق أن المجلد قابل للكتابة (`fs.accessSync(..., W_OK)`) → `db.pragma('wal_checkpoint(FULL)')` (نفس أسلوب backup:export) → ينسخ إلى `garage-backup-YYYY-MM-DD-HHmmss.db` → `applyRotation` تحذف أقدم الملفات الزائدة عن `keepCount` (المطابقة عبر regex على اسم الملف، الترتيب الأبجدي = الزمني). لا يرمي استثناءً أبداً — أي فشل (مجلد غير موجود/غير قابل للكتابة) يُسجَّل بالحالة فقط.
- `maybeRunAutoBackupOnStartup(db)`: يُستدعى من `main.ts` بعد `registerIpcHandlers`، إذا `enabled` ومرّ يوم كامل (24 ساعة) منذ `auto_backup_last_success_at` (أو لم تُنفَّذ نسخة ناجحة من قبل) → ينفّذ بالخلفية عبر `setImmediate` دون حجب بدء التطبيق.
- `runAutoBackupOnQuit(db)`: يُستدعى من `app.on('before-quit', ...)` في `main.ts`، ينفّذ نسخة إذا `enabled` (بصرف النظر عن التوقيت) — لأنه `fs.copyFileSync` متزامن، لا حاجة لـ `event.preventDefault()`.
- **لا يوجد أي تكامل مع Google Drive API أو أي API سحابي** — الميزة تنسخ الملف محلياً فقط؛ أي مزامنة سحابية تعتمد على برنامج مثبّت عند المستخدم (Google Drive Desktop، Dropbox، إلخ) يراقب المجلد المحدد.

**Settings.tsx:** قسم "النسخ الاحتياطي التلقائي" بطاقة `mi-card` منفصلة تماماً عن طاقة "النسخ الاحتياطي" اليدوية أعلاها — نفس الصفحة، بصرياً مفصولة. يعرض: مسار المجلد الحالي + زر "اختيار مجلد…" (`autoBackup:pickFolder`) → يحفظ فوراً عبر `updateSettings`، مفتاح تفعيل (checkbox `mi-checkbox`)، حقل رقمي لعدد النسخ (`onBlur` يحفظ)، زر "نسخ الآن يدوياً" (`autoBackup:runNow` ثم يُحدّث الحالة المعروضة)، وعرض "آخر نسخة ناجحة" + "آخر محاولة: نجحت/فشلت" مع رسالة الخطأ إن وُجدت. **القسم القديم "النسخ الاحتياطي" (تصدير/استيراد عبر backup:export/backup:import) لم يتغيّر إطلاقاً** — نفس الأزرار، نفس الحالة، نفس السلوك.

#### الأمان (`electron/auth.ts`) — منذ 2026-07-01

قبل هذا التحديث كانت كلمة السر ثابتة نصياً (`APP_PASSWORD` في `src/utils/auth.ts`) وتُقارَن مباشرة في الـ Renderer — أي شخص يفتح DevTools أو يفكّك ملفات الحزمة يراها بوضوح. الآن التحقق يتم حصراً في الـ main process عبر IPC، وكلمة السر تُخزَّن كـ **bcrypt hash** في `app_settings` (مفتاح `app_password_hash`) — نفس نمط `auto-backup.ts` بالضبط (يأخذ `db` كمعامل، يخزّن حالته في `app_settings`).

| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `auth:verifyPassword` | password | `{valid, lockedUntil, attemptsRemaining}` | يتحقق من كلمة السر مقابل الـ hash المخزَّن، مع احترام القفل المؤقت الحالي |
| `auth:changePassword` | oldPassword, newPassword | void (يرمي خطأ عند الفشل) | يتحقق من القديمة (يفيد من نفس منطق القفل)، يتحقق من طول الجديدة (≥6)، يخزّن hash جديد |
| `auth:getLockoutStatus` | — | `{lockedUntil, attemptsRemaining}` | حالة القفل الحالية دون محاولة تحقق |
| `auth:getAutoLockSettings` | — | `{enabled, minutes}` | إعدادات القفل التلقائي عند الخمول (افتراضي: مفعّل، 10 دقائق) |
| `auth:updateAutoLockSettings` | Partial\<{enabled, minutes}\> | `{enabled, minutes}` | تحديث جزئي، يحفظ فوراً |
| `activityLog:getAll` | limit? (افتراضي 200) | `ActivityLogRow[]` | آخر سجلات النشاط، الأحدث أولاً |

**بذرة أول تشغيل (`ensurePasswordSeeded`):** تُستدعى من `electron/main.ts` بعد `initDB()` مباشرة (وقبل `registerIpcHandlers`). إذا لم يوجد `app_password_hash` في `app_settings` بعد (أول إطلاق بعد هذا التحديث)، يُنشئ hash لكلمة السر الحالية `'garage2026'` (الثابت `DEFAULT_PASSWORD` في `src/utils/auth.ts` — يُستخدم فقط كبذرة، وليس مصدر الحقيقة) ويخزّنه — بهذا تستمر كلمة السر الحالية بالعمل للمستخدمين الموجودين دون أي انقطاع، وتصبح قابلة للتغيير لاحقاً من شاشة الإعدادات. no-op في كل إطلاق لاحق (نفس فلسفة migrations `src/database.ts`).

**القفل عند تجاوز المحاولات:** 5 محاولات فاشلة متتالية (`MAX_ATTEMPTS`) → قفل مؤقت متصاعد: 30 ثانية → دقيقة → 5 دقائق (يُحسب عبر `auth_lockout_level` الذي يزداد مع كل قفل جديد ولا يُصفَّر إلا عند نجاح التحقق). الحالة (`auth_failed_attempts`, `auth_lockout_until`, `auth_lockout_level`) مخزَّنة في `app_settings` — **تصمد أمام إعادة تشغيل التطبيق**، وليست state في الذاكرة فقط (قفل يُلغى بإعادة فتح التطبيق يكون عديم الفائدة).

**القفل التلقائي عند الخمول:** `src/utils/useAutoLock.ts` (hook مستدعى من `App.tsx`) يستمع لأحداث `mousemove/keydown/mousedown/scroll/touchstart` على `window`، ويقارن دورياً (كل 5 ثوانٍ) وقت آخر حركة بالمهلة المُعدَّة؛ عند التجاوز يستدعي نفس `setIsUnlocked(false)` المستخدم للقفل الأولي — أي يُعاد عرض `PasswordGate` بالضبط كما لو أُغلق التطبيق وأُعيد فتحه.

**`PasswordGate.tsx` و`ConfirmDialog.tsx`:** كلاهما يستدعيان `dbService.auth.verifyPassword(password)` (async) بدل المقارنة النصية المحلية السابقة `password === APP_PASSWORD`. عند `lockedUntil` يُعرض عدّاد تنازلي بالثواني (`setInterval` محلي) ويُعطَّل زر التأكيد حتى ينتهي القفل.

**سجل النشاط:** `logActivity(db, actionType, entityType, entityId, details)` يُستدعى من `ipc-handlers.ts` بعد نجاح **بالضبط** نفس مجموعة القنوات المحمية بـ `ConfirmDialog` (تعديل/حذف) في كل الصفحات: `maintenance:update/delete`, `directSale:update/delete`, `supplierInvoice:update/delete`, `expense:update/delete`, `employee:update/delete`, `salary:update/delete`, `warranty:update/delete`, `suppliers:update/delete` (دليل الموردين). لا تسجيل لعمليات الإضافة (لا تمر عبر `ConfirmDialog` أصلاً). يُعرض للقراءة فقط في `Settings.tsx` (قسم "سجل النشاط").

**Transactions atomic بالكامل:** `maintenance:add`/`maintenance:update`/`directSale:add`/`directSale:update` في `ipc-handlers.ts` أصبحت ملفوفة بـ `db.transaction(() => {...})()` خارجي واحد يضمّ كتابة الفاتورة **و** مزامنة الكفالات (`syncWarrantiesForMaintenance`/`syncWarrantiesForDirectSale`) معاً — كانتا سابقاً transaction-ين منفصلتين متتاليتين (كل منهما atomic بمفردها، لكن غير atomic معاً)، فإذا انهار التطبيق بينهما تبقى الفاتورة محفوظة بدون مزامنة كفالات. better-sqlite3 يدعم تداخل `db.transaction()` تلقائياً عبر SAVEPOINT، فلم يلزم أي تعديل على `src/db/maintenance.ts`/`direct-sale.ts` أو دوال المزامنة نفسها — فقط لفّة خارجية إضافية في `ipc-handlers.ts`. بقية عمليات الكتابة المركّبة في المشروع كانت ملفوفة بـ `db.transaction()` بالفعل من قبل.

#### الضريبة (VAT) — منذ 2026-07-02

ميزة **اختيارية بالكامل ومعطّلة افتراضياً** لإضافة الضريبة على القيمة المضافة إلى مودالات تفاصيل الفواتير والإيصالات المطبوعة — بعض عملاء الكراج لا يحتاجون فوترة ضريبية رسمية، لذا لا يجب أن تظهر أي إشارة للضريبة في أي مكان ما لم تُفعَّل صراحةً من الإعدادات، مع عدم تغيير أي سلوك حالي للمستخدمين الذين لا يفعّلونها.

| القناة | المدخلات | الخرج | الوصف |
|---|---|---|---|
| `vat:getSettings` | — | `VatSettings` (`{enabled, rate}`) | يرجع إعدادات الضريبة الحالية من `app_settings` |
| `vat:updateSettings` | `Partial<{enabled, rate}>` | `VatSettings` | تحديث جزئي (يحفظ فوراً) ويرجع الإعدادات الكاملة |

**المنطق (`electron/vat.ts`):** نفس نمط `auto-backup.ts`/`auth.ts` بالضبط (يأخذ `db` كمعامل، يخزّن حالته في `app_settings` عبر `getSetting`/`setSetting` بنمط key/value). مفتاحان فقط: `vat_enabled` (`'0'`/`'1'`، افتراضي `'0'` = معطّلة) و`vat_rate` (نسبة مئوية نصّية، `DEFAULT_RATE = 16` = الضريبة الرسمية في فلسطين، قابلة للتعديل). `getVatSettings` يرجع `enabled=false` والنسبة الافتراضية عند غياب المفاتيح تماماً (المستخدمون القدامى)، فلا حاجة لأي migration أو seeding — no-op بطبيعته حتى يفعّلها المستخدم. `updateVatSettings` يحرس النسبة (`Math.max(0, ...)`) فلا تصبح سالبة.

**حقل محسوب وقت العرض فقط (derived) — لا يُخزَّن أبداً:** الضريبة **لا** تُضاف إلى `total_amount` في قاعدة البيانات ولا تمسّ `amount_paid`/`amount_remaining` — تُحسب وقت العرض فقط في الواجهة من `total` المخزَّن (الذي هو أصلاً المجموع **بعد الخصم**). القاعدة (`base`) = `total`، والضريبة = `base × rate/100`، والإجمالي شامل الضريبة = `base + tax`. بهذا لا يتعقّد منطق الديون/الدفعات الحالي إطلاقاً، وتبقى قيم قاعدة البيانات كما هي سواء فُعّلت الضريبة أو عُطّلت.

**العرض (فقط عند `vat_enabled='1'`):** دالة محلية `vatBreakdown(base, vat)` (نسخة متطابقة في `MaintenanceInvoices.tsx` و`DirectSales.tsx`، بنفس أسلوب `discountBreakdown` المكرَّرة محلياً في كل صفحة) تُرجع `null` عندما تكون الضريبة معطّلة أو النسبة ≤ 0 — فلا يُعرَض أي شيء. عند التفعيل تُضاف ثلاثة أسطر بعد سطر الإجمالي (بعد الخصم إن وُجد) في مودال التفاصيل والإيصال المطبوع لكل من الصيانة والبيع المباشر: "المجموع قبل الضريبة" / "الضريبة (X%)" / "الإجمالي شامل الضريبة". كل صفحة تحمّل الإعدادات مرة واحدة عبر `dbService.vat.getSettings()` في `useEffect` إلى حالة `vat: VatSettings | null` (تبقى `null` عند أي فشل فتظل الضريبة مخفية).

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

#### `src/db/invoiceNumber.ts` — منذ 2026-07-02
- `nextInvoiceNumber(prefix, tables, year?)` — الرقم التسلسلي التالي `{prefix}-{year}-{تسلسل 4 خانات}`؛ تبحث عن أعلى تسلسل مستخدم لنفس السنة عبر كل الجداول المُمرَّرة معاً (وليس كل جدول على حدة). يجب استدعاؤها من داخل نفس `db.transaction()` الذي يحتوي `INSERT` الفاتورة.
- `SALES_INVOICE_NUMBER_TABLES` = `['maintenance_invoices', 'direct_sale_invoices']` — تسلسل `INV` مشترك بينهما (راجع "ترقيم الفواتير" أعلاه لسبب القرار)
- `PURCHASE_INVOICE_NUMBER_TABLES` = `['supplier_invoices']` — تسلسل `PUR` مستقل

#### `src/db/discount.ts` — منذ 2026-07-02
- `applyDiscount(subtotal, discountType, discountValue)` — يطبّق خصماً (fixed يُطرح كما هو / percentage نسبة من المجموع) ويرمي خطأً عربياً عند القيم غير الصالحة. دالة عامة تُستخدم لخصم الفاتورة الكاملة (صيانة/بيع مباشر — راجع "خصم الفاتورة" أعلاه) **وأيضاً** لخصم البند الفردي في فواتير الموردين (راجع "خصم بنود فاتورة المورد") — تُستدعى في main process (`suppliers.ts`) وفي الواجهة (`SupplierInvoiceForm.tsx`/`Suppliers.tsx`) دون تكرار المنطق.

#### `src/db/maintenance.ts`
- `addMaintenanceInvoice(db, input)` — INSERT (يشمل الآن `invoice_number` عبر `nextInvoiceNumber('INV', SALES_INVOICE_NUMBER_TABLES)` داخل نفس transaction، و`discount_type`/`discount_value` مع `total_amount` بعد الخصم) + insertItems (يكتب warranty وpart_type في DB) + insertPayments
- `updateMaintenanceInvoice(db, car)` — UPDATE فاتورة (يشمل حقلَي الخصم عند تمريرهما) + يحذف البنود القديمة ويُعيد إدراجها + يعيد حساب `total_amount` (بعد الخصم) و`amount_remaining` من بنود الجدول الفعلية عند تغيّر البنود أو الخصم
- `deliverMaintenance(db, id, payments, date)` — UPDATE status='delivered' + date_released + دفعات + Ledger. يقبل الآن `settlementDiscount` اختياري (`ReleaseCarInput.settlementDiscount`) يُطبَّق عبر `applySettlementDiscount` (خصم من المتبقّي بلا Ledger — راجع "خصم تسوية عند الدفع")
- `deleteMaintenanceInvoice(db, id)` — DELETE + بنودها + دفعاتها
- `getMaintenanceInvoices(db, filters)` — SELECT مع فلاتر (بحث، تاريخ، حالة)
- `getMaintenanceInvoice(db, id)` — SELECT + بنود كاملة (يُعيد warranty وpart_type لكل بند)

**ملاحظة:** دالة `addMaintenanceItem` (وقناة `maintenance:addItem` المقابلة) لإضافة بند واحد لفاتورة موجودة دون تعديلها بالكامل — أُزيلتا لعدم استخدامهما (نموذج التعديل الكامل في `MaintenanceInvoices.tsx` يغطي نفس الحاجة).

#### `src/db/direct-sale.ts`
- `addDirectSaleInvoice(db, input)` — INSERT (يشمل الآن `invoice_number` عبر نفس تسلسل `INV` المشترك مع الصيانة، و`discount_type`/`discount_value` مع `total_amount` بعد الخصم) + invoice_items + payments + Ledger
- `recalcDirectSaleTotals(invoiceId)` — يعيد حساب `total_amount` (مجموع البنود بعد الخصم المخزَّن) و`amount_remaining`؛ تُستدعى من `updateDirectSaleItems` ومن قناة `directSale:update` عند تمرير خصم
- `updateDirectSaleItems(db, invoiceId, items, discount?)` — يحذف بنود 'direct_sale' للفاتورة ويُعيد إدراجها + يكتب الخصم إن مُرِّر (`{ type, value }`) داخل نفس الـ transaction + `recalcDirectSaleTotals`
- `getDirectSaleInvoices(db, filters)` — SELECT مع فلاتر
- `getDirectSaleInvoice(db, id)` — SELECT + items + payments

#### `src/db/ledger.ts`
- `recordLedgerEntry(db, entry)` — يقرأ آخر `balance_after` ثم يُدرج سجلاً جديداً
- `getLedgerSummary(db)` — SUM(amount_in), SUM(amount_out), balance
- `getLedgerByDateRange(db, from, to)` — WHERE transaction_date BETWEEN

#### `src/db/payments.ts`
- `addPayment(db, invoiceId, invoiceType, payments, date, settlementDiscount?)` — INSERT + تحديث amount_paid/remaining + Ledger. **حماية تجاوز المتبقي (منذ 2026-07-02):** يرفض داخل الـ transaction أي مجموع دفعات (باستثناء طريقة `debt`) يتجاوز `amount_remaining` الحالي (بهامش تسامح `0.001`) ويرمي خطأً عربياً يبيّن مجموع الدفعة والمتبقي. نفس الحماية مطبّقة في `releaseMaintenanceCar` (دفعة التسليم) في `src/db/maintenance.ts`. يقبل الآن `settlementDiscount` اختياري (خصم تسوية يُخصم من المتبقّي بلا Ledger).
- `addDebtPayment(db, invoiceId, invoiceType, payments, date, settlementDiscount?)` — INSERT debt_payments + تحديث + Ledger + خصم تسوية اختياري
- `applySettlementDiscount(db, paymentsTable, invoiceId, invoiceType, invoiceTable, date, discount, remainingBefore)` — دالة مركزية (مُصدَّرة، تُعاد استخدامها في `maintenance.ts`) تُدرِج صف خصم مخصّص (`amount=0`) وتخصم المبلغ من `amount_remaining` فقط مع حماية تجاوز المتبقّي — بلا `cash_ledger` وبلا مسّ `amount_paid`. راجع "خصم تسوية عند الدفع"
- `getPendingDebts(db, filters)` — UNION maintenance+direct_sale WHERE amount_remaining > 0

#### `src/db/reports.ts`
- `getDailyReport(db, date)` — يجمّع Ledger entries لليوم المحدد حسب reference_type (يُعيد أيضاً الحقول المجمّعة الأربعة `today_sales_income`/`today_expenses`/`today_supplier_payments`/`today_salaries` لبطاقات ملخّص الصندوق — راجع "تحديث 2026-07-02 (١٣)")
- `getMonthlyReport(db, month, year)` — GROUP BY transaction_date للشهر
- `getDebtReport(db)` — كل ديون الزبائن + كل ديون الموردين
- `getTopCustomers(db, limit)` — UNION maintenance+direct_sale, GROUP BY customer, ORDER BY total_spent DESC
- `getDebtsAging(db)` — منذ 2026-07-02: UNION من maintenance_invoices + direct_sale_invoices + supplier_invoices (WHERE amount_remaining > 0) في صف واحد موحّد لكل دين، مع `days_old` محسوب بـ `julianday(date('now','localtime')) - julianday(invoice_date)` وتصنيف `bucket` عبر دالة داخلية `agingBucket()` إلى أربع شرائح: `'0-30' | '31-60' | '61-90' | '90+'`. دالة مستقلة عن `getDebtReport` (التي تُبقي الزبائن/الموردين في مصفوفتين منفصلتين لتبويب "تقرير الديون" الحالي) لأن الشكل الموحّد المطلوب هنا (جدول واحد لكل الديون بغضّ النظر عن نوعها) لا يتقاطع معها بسهولة.

#### `src/db/suppliers.ts`
- `addSupplierInvoice` (INSERT يشمل الآن `invoice_number` عبر `nextInvoiceNumber('PUR', PURCHASE_INVOICE_NUMBER_TABLES)`، ويُدرج البنود مع خصم كل بند ويحسب `total_amount` عبر `calcTotal` = مجموع `applyDiscount` لكل بند)، `updateSupplierInvoice(id, input)` (يعيد إدراج البنود + إعادة حساب `total_amount`/`amount_remaining` من خصومات البنود داخل transaction — راجع "خصم بنود فاتورة المورد")، `deleteSupplierInvoice`
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

### الصندوق الرئيسي — `src/pages/CashLedger.tsx`
**المسار:** `/cash-ledger` (وأيضاً شاشة الهبوط الافتراضية: `/` يُعاد توجيهها إليها عبر `<Navigate>`)

**الأقسام:**

0. **4 بطاقات ملخّص اليوم (منذ 2026-07-02 — أعلى بطاقات الإحصاء في `stats-grid` مستقلة، كلها مرتبطة بنفس `selectedDate` وتتحدّث حياً عند تغييره دون أي زر):**
   - **إيرادات اليوم (صيانة + بيع مباشر) ₪** (أخضر `#2ECC71`): مجموع `amount_in` من `cash_ledger` حيث `reference_type IN ('maintenance_payment','maintenance_release','direct_sale_payment')` لليوم المحدد.
   - **مصاريف اليوم ₪** (أحمر `#E74C3C`): مجموع `amount_out` حيث `reference_type = 'daily_expense'`.
   - **مدفوعات الموردين اليوم ₪** (أحمر): مجموع `amount_out` حيث `reference_type IN ('supplier_payment','supplier_debt')`.
   - **رواتب اليوم ₪** (أحمر): مجموع `amount_out` حيث `reference_type = 'salary'`.

   القيم الأربع تُشتق من **حقول جديدة أُضيفت لنتيجة `report:daily` نفسها** (`today_sales_income`/`today_expenses`/`today_supplier_payments`/`today_salaries` في `getDailyReport` بـ `src/db/reports.ts` ونوع `DailyReport` بـ `src/db/types.ts`) — بلا قناة IPC جديدة، مجمّعة من نفس `cash_ledger` entries المُجمَّعة أصلاً لليوم حسب `reference_type` (نفس المصدر الذي تجمّعه الدالة للحقول القائمة). تُخزَّن في حالة `dayTotals` وتُملأ داخل `loadDayData` بجانب `dailyNet`. راجع "تحديث 2026-07-02 (١٣)".

1. **5 بطاقات إحصاء — مرتبطة كلها بحقل "تاريخ الحساب" (`selectedDate`) وتتحدّث حياً عند تغييره دون أي زر إضافي:**
   - **إجمالي النظام ₪:** صافي حركات `cash_ledger` لليوم المحدد فقط (`dailyNet`، من `report:daily(selectedDate)`)
   - **المبلغ الفعلي ₪:** إن وُجد سجل محفوظ مسبقاً في `daily_cash_audits` لنفس `audit_date = selectedDate` (يُبحث عنه بالفلترة على `auditRecords` المُحمَّلة أصلاً من `cashAudit:getAll` — بدون قناة IPC جديدة) يُعرض `actual_amount` المحفوظ منه، وإلا تُعرض القيمة الحية المُدخلة في حقل "المبلغ الفعلي في الصندوق" أو "—" إن كانت فارغة
   - **الفرق ₪:** إن وُجد سجل محفوظ لنفس التاريخ تُعرض `difference` المحفوظة (بنفس ألوان `diffColor`)، وإلا تُحسب حياً = إجمالي النظام − المبلغ الفعلي المُدخل حالياً (تتحدّث مع كل ضغطة مفتاح دون الحاجة لزر "احسب الفرق")، أو "—" إن لم يُدخَل مبلغ بعد
   - **إحصاء العمليات:** عدد صفوف `cash_ledger` لليوم المحدد فقط (`rows.length`)
   - **الوارد / الصادر ₪:** مجموع `amount_in` (أخضر) ومجموع `amount_out` (أحمر) لنفس اليوم المحدد، بجانب بعضهما بصيغة "وارد / صادر"

   **ملاحظة إصلاح سابق:** كانت بطاقة "الفرق" قديماً تُعرض من `auditRecords[0]` (أحدث سجل إحصاء بالتاريخ الكلي عبر `ORDER BY audit_date DESC`) دون أي فلترة على `selectedDate`، فكانت تعرض قيمة إحصاء يوم آخر تماماً عند تصفّح تاريخ مختلف. أصبحت الآن جميع البطاقات الخمس مشتقّة من IIFE واحد بالكامل معتمد على `selectedDate` (عبر `rows`, `dailyNet`, `auditRecords.find(...)`, و`actualAmount`).

2. **إحصاء نهاية اليوم حسب طريقة الدفع (مُحدَّث 2026-07-02):**
   - حقل اختيار تاريخ (افتراضي: اليوم).
   - **إجمالي النظام مقسّم إلى ثلاث طرق** (كاش/فيزا/شيك) يُجلب من `cashAudit:getSystemBreakdown(date)` — صافي (وارد − صادر) لكل طريقة محسوباً مباشرة من جداول الدفعات (`payments`/`debt_payments` وارد، `supplier_payments`/`supplier_debt_payments`/`daily_expenses`/`salary_payments` صادر) لا من `cash_ledger`. المصاريف اليومية والرواتب تُعامَل كاملة كـ**كاش صادر**.
   - **ثلاثة حقول للمبلغ الفعلي** — كاش/فيزا/شيك منفصلة (`actualCash`/`actualVisa`/`actualCheck`)، وإجمالي الفعلي = مجموعها.
   - المودال يعرض جدول مقارنة ثلاثي الأعمدة (نظام / فعلي / فرق) لكل طريقة على حدة بالإضافة إلى الإجمالي، مع تلوين الفرق (`diffColor`: أخضر مطابق / أحمر نقص / برتقالي زيادة).
   - يُحفظ عبر `cashAudit:save` بكامل التفصيل (`actual_cash`/`actual_visa`/`actual_check` + `actual_amount` الكلي + `difference`).

3. **سجل العمليات:** جدول الحركات لليوم المختار (يُحمَّل من `ledger:getByDateRange`)
   - الضغط على صف → مودال التفاصيل مع زر طباعة إيصال

4. **سجل الإحصاءات اليومية:** جدول `daily_cash_audits` مع badge الحالة (مطابق/زيادة/نقص) وزر طباعة، **وأزرار تعديل** (يعيد فتح حقول الفعلي المفصّلة ويحفظ عبر `cashAudit:save`) **وحذف** (`cashAudit:delete` بعد تأكيد) — منذ 2026-07-02

5. **الشيكات المستحقة قريباً** (منذ 2026-07-02، أسفل "سجل العمليات" مباشرة): بطاقة `mi-card` قراءة فقط، مصدرها `cheques:getUpcoming(daysAhead)`. فلتر أعلى الجدول بنمط `pd-type-tabs`/`pd-tab` (نفس تبويبات النوع في `PendingDebts.tsx`) لاختيار المدى: 7/14/30 يوماً (افتراضي 14). الجدول: الطرف | المصدر (badge: `mi-badge-orange` صيانة / `mi-badge-blue` بيع مباشر / `mi-badge-purple` مورد أو دين مورد) | رقم الشيك | البنك | المبلغ | تاريخ الاستحقاق | الأيام المتبقية (badge بنفس أصناف الكفالات: `mi-badge-red` عند ≤3 أيام، `mi-badge-yellow` عند ≤7 أيام، `mi-badge-green` غير ذلك — لا كلاسات CSS جديدة). لا إجراءات تعديل/حذف على هذه الشاشة؛ أي تعديل على شيك يتم من صفحته الأصلية (الصيانة/البيع المباشر/الموردين).

---

### فواتير الصيانة — `src/pages/MaintenanceInvoices.tsx`
**المسار:** `/maintenance`

**حالة النموذج (FormState):**
```
customerName, phone, carPlate, carType, carColor, dateReceived, notes
discountType: ''|'fixed'|'percentage', discountValue: string
parts: FormPart[] = [{ id, partType:'part'|'service', name, qty, unitPrice, warrantyValue, warrantyUnit, notes }]
```

**عمود "الإجمالي" في جدول البنود (منذ 2026-07-02):** جدول البنود يعرض عموداً محسوباً "الإجمالي (₪)" = الكمية × سعر الوحدة لكل بند، يُحدَّث حياً أثناء الكتابة (خدمة → الكمية = 1). حقل عرض/واجهة بحت — لا عمود جديد في `invoice_items` ولا تعديل على منطق الحفظ؛ منفصل تماماً عن خصم الفاتورة العام (يوضّح مجموع البند **قبل** تطبيق الخصم). راجع "تحديث 2026-07-02 (٩)".

**خصم الفاتورة في النموذج (منذ 2026-07-02):** أسفل جدول البنود مباشرة: صف "المجموع قبل الخصم" ثم dropdown نوع الخصم (بدون خصم / مبلغ ثابت ₪ / نسبة مئوية %) + حقل رقمي للقيمة (يظهر فقط عند اختيار نوع) + **عرض حي "الإجمالي بعد الخصم"** بنفس أسلوب صندوق "صافي الراتب" الأخضر في `Employees.tsx` (يتحدّث فورياً مع كل تعديل على البنود أو الخصم). validation: نسبة 0-100، مبلغ ثابت ≤ مجموع البنود (`discountErr` يظهر بعد أول محاولة حفظ كباقي الحقول). مودال التفاصيل والإيصال المطبوع يعرضان عند وجود خصم: "المجموع قبل الخصم" / "الخصم" / "الإجمالي بعد الخصم" بدل سطر "الإجمالي الكلي" (عبر `discountBreakdown()` المحلية التي تشتق المجموع قبل الخصم من البنود عند توفّرها أو عكسياً من الإجمالي المخصوم).

**الضريبة (VAT) في العرض (منذ 2026-07-02):** عند تفعيل الضريبة من الإعدادات فقط (`vat_enabled='1'`)، يُضاف بعد سطر الإجمالي (بعد الخصم إن وُجد) في مودال التفاصيل والإيصال المطبوع ثلاثة أسطر: "المجموع قبل الضريبة" / "الضريبة (X%)" / "الإجمالي شامل الضريبة" — محسوبة وقت العرض فقط من `total` المخزَّن (بعد الخصم) عبر `vatBreakdown(base, vat)` المحلية، ولا تُخزَّن في قاعدة البيانات. الإعدادات تُحمَّل مرة واحدة عبر `dbService.vat.getSettings()` إلى حالة `vat`. عند التعطيل (الافتراضي) لا يظهر أي سطر ضريبة. راجع قسم "الضريبة (VAT)" في الـ Backend أعلاه.

حقل الكفالة في كل بند: `warrantyUnit` (select: لا كفالة/أسبوع/شهر/سنة) + `warrantyValue` (رقم، يظهر فقط عند اختيار وحدة). تُخزَّن كـ JSON عند الحفظ.

**Draft localStorage:** مفتاح `'garage-mi-draft-v2'` — يُحمَّل تلقائياً عند فتح الصفحة

**الفلاتر:**
- بحث نصي (Fuse.js على اسم الزبون + نمرة السيارة)
- بحث برقم الهاتف
- بحث بنمرة السيارة
- فلتر الحالة: الكل / قيد الصيانة / تم التسليم
- فلتر تاريخ (من-إلى)
- فلتر مبلغ (min-max)

**جدول العرض الأعمدة:** (منذ 2026-07-02: عمود "رقم الفاتورة" أول عمود في كلا القسمين — قيد الصيانة/تم التسليم)
رقم الفاتورة | اسم الزبون | نمرة السيارة | نوع السيارة | تاريخ الاستلام | تاريخ التسليم | الحالة | الإجمالي | المتبقي | الإجراءات

**ترقيم الفواتير:** `car.invoiceNumber` (بصيغة `INV-{سنة}-{تسلسل}`، راجع "ترقيم الفواتير" ضمن الـ Backend أعلاه) يظهر في الجدولين، أول حقل في مودال التفاصيل، عنوان الإيصال المطبوع (`printPdf` title)، وكحقل بحث إضافي في Fuse.js لكلا القسمين (بجانب اسم الزبون).

**الإجراءات في كل صف:**
- **تعديل:** ConfirmDialog أولاً (مع كلمة سر، `warnCar`/`confirmEditCar`) — لكل الفواتير بلا استثناء. الرسالة تختلف: إن كانت الفاتورة "مُسلَّمة" تُضمَّن تفاصيل إضافية (الزبون، النمرة، الإجمالي، تاريخ التسليم) ضمن نص التحذير؛ غير ذلك رسالة عامة. بعد التأكيد يُستدعى `dbService.maintenance.getOne(car.id)` لجلب البنود الكاملة (مع warranty وpart_type) ثم يملأ النموذج بها. يتجنّب الاعتماد على بيانات GarageContext التي لا تحمل البنود. *(سابقاً كانت الفواتير المُسلَّمة فقط تعرض تحذيراً مخصصاً بدون ConfirmDialog ولا كلمة سر، وبقية الفواتير تُفتح للتعديل مباشرة بلا أي تأكيد — تم توحيدها في 2026-07-01.)*
- **تسليم:** يفتح مودال التسليم (دفعات + حقل "خصم / إسقاط مبلغ (تسوية) ₪" اختياري + تأكيد) → `maintenance:deliver` (يمرّر `settlementDiscount`) — راجع "خصم تسوية عند الدفع"
- **طباعة:** async يجلب `getOne` + `payments:getByInvoice` ثم يطبع HTML كامل
- **حذف:** ConfirmDialog مع كلمة سر

**مودال التفاصيل:** (عند الضغط على الصف)
- بيانات الفاتورة + بطاقة بنود (جدول: اسم القطعة، النوع، الكمية، السعر، الإجمالي (الكمية × السعر)، الكفالة بصيغة نصية عربية، ملاحظات)
- قسم "عمليات سابقة لهذا الزبون" (LinkedOps بالهاتف عبر `getLinkedOps`)
- قسم "عمليات سابقة لهذه السيارة" (LinkedOps بنمرة السيارة عبر `getLinkedOpsByPlate` — صيانة + الكفالات المرتبطة؛ يظهر بجانب قسم الهاتف، كلاهما معاً) — راجع "تحديث 2026-07-02 (١٢)"
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
discountType: ''|'fixed'|'percentage', discountValue: string
```

**عمود "الإجمالي" في جدول البنود (منذ 2026-07-02):** نفس عمود "الإجمالي (₪)" المحسوب حياً (الكمية × سعر الوحدة لكل بند) الموجود في `MaintenanceForm` — حقل عرض بحت منفصل عن الخصم العام، بلا أي عمود جديد في `invoice_items`. راجع "تحديث 2026-07-02 (٩)".

**خصم الفاتورة في النموذج (منذ 2026-07-02):** نفس كتلة الخصم والعرض الحي الموجودة في `MaintenanceInvoices.tsx` بالضبط (dropdown + حقل قيمة + صندوق "الإجمالي بعد الخصم" الأخضر أسفل جدول البنود، مع نفس الـ validation). ملخّص الدفع عند الإضافة ("إجمالي الفاتورة"/"المتبقي") يعتمد الإجمالي **بعد الخصم**، وكذلك اشتقاق الحالة (مدفوع/دين جزئي/دين كامل). مودال التفاصيل والإيصال يعرضان تسلسل "المجموع قبل الخصم" / "الخصم" / "الإجمالي بعد الخصم" عند وجود خصم (`discountBreakdownDS()`).

**الضريبة (VAT) في العرض (منذ 2026-07-02):** نفس سلوك `MaintenanceInvoices.tsx` بالضبط — عند تفعيل الضريبة فقط تُضاف ثلاثة أسطر ("المجموع قبل الضريبة" / "الضريبة (X%)" / "الإجمالي شامل الضريبة") بعد سطر الإجمالي في مودال التفاصيل والإيصال المطبوع، محسوبة من `total` (بعد الخصم) عبر `vatBreakdown()` المحلية دون تخزين. معطّلة افتراضياً فلا يظهر شيء. راجع قسم "الضريبة (VAT)" في الـ Backend أعلاه.

**Draft localStorage:** مفتاح `'garage-ds-draft-v2'`

**الفلاتر:**
- بحث Fuse.js على اسم الزبون
- بحث برقم الهاتف
- فلتر تاريخ (من-إلى)
- فلتر مبلغ (min-max)
- فلتر الحالة: الكل / مدفوع / دين جزئي / دين كامل

**الجدول:** (منذ 2026-07-02: عمود "رقم الفاتورة" أول عمود) رقم الفاتورة | اسم الزبون | رقم الهاتف | تاريخ البيع | الكفالة | الإجمالي | المدفوع | المتبقي | الحالة | الإجراءات

**ترقيم الفواتير:** `inv.invoiceNumber` (نفس تسلسل `INV-{سنة}-{تسلسل}` المشترك مع فواتير الصيانة) يظهر في الجدول، مودال التفاصيل، عنوان الإيصال المطبوع، وكحقل بحث إضافي في Fuse.js.

**نموذج الكفالة (مستوى الفاتورة):**
- `<select>`: لا كفالة / أسبوع / شهر / سنة + `<input>` للعدد
- تُخزَّن كـ JSON: `JSON.stringify({ value, unit })` أو سلسلة فارغة إذا لا كفالة

**دفع عند الإضافة:** نفس نظام دفعات الصيانة (كاش/شيك/فيزا/دين) — **إلزامي** لإضافة فاتورة جديدة (خطأ validation إذا لا مبلغ ولا دين)

**التعديل:**
- ConfirmDialog أولاً (مع كلمة سر، `warnInv`/`confirmEditInv`) *(أُضيف بتاريخ 2026-07-01 — سابقاً كان زر "تعديل" يفتح المودال مباشرة بلا أي تأكيد)*
- بعد التأكيد يستدعي `dbService.directSale.getOne(id)` لجلب البنود الحالية، ثم عند الحفظ يستدعي `dbService.directSale.updateItems(id, newItems, { type, value })` لتحديث البنود والخصم معاً ذرّياً (وقناة `update` تُستدعى بخصم `undefined` = لا تغيير)

**البنود في البيع المباشر:**
- جدول قابل للتعديل المباشر: اسم البند، الكمية، السعر، الإجمالي (محسوب حياً = الكمية × السعر، عرض فقط)، ملاحظات (بدون كفالة فردية)
- عند **إضافة** فاتورة جديدة: البنود تُحفظ مع الفاتورة

**دالة `warrantyLabelDS(raw)`:**
تُحوّل JSON الكفالة لنص عربي مثل "3 أشهر" أو "أسبوع واحد". تُستخدم في مودال التفاصيل والطباعة.

---

### فواتير البيع — `src/pages/SalesInvoices.tsx`
**المسار:** `/sales-invoices`

**المصدر:** `salesInvoice:getAll` — UNION من maintenance_invoices + direct_sale_invoices

**الفلاتر:**
- بحث Fuse.js باسم الزبون + رقم الفاتورة + **نمرة السيارة** (`carPlate` — أُضيف كمفتاح Fuse، راجع "تحديث 2026-07-02 (١٢)")
- بحث برقم الهاتف
- بحث بنمرة السيارة (`plateSearch` — فلتر مباشر بجانب مفتاح Fuse)
- تبويبات النوع: الكل / صيانة / بيع مباشر
- تبويبات الحالة: الكل / مدفوع / دين جزئي / دين كامل
- فلتر تاريخ + فلتر مبلغ

**الجدول:** (منذ 2026-07-02: عمود "رقم الفاتورة" أول عمود) رقم الفاتورة | التاريخ | نوع الفاتورة | اسم الزبون | رقم الهاتف | الإجمالي | المدفوع | المتبقي | الحالة | الإجراءات

**ترقيم الفواتير:** بما أن هذه الشاشة عرض مجمّع لصيانة+بيع مباشر، يعرض `inv.invoiceNumber` الرقم الحقيقي (وليس `id`) في الجدول، عنوان مودال التفاصيل (`تفاصيل الفاتورة {invoiceNumber}` بدل `#{id}` سابقاً)، أول حقل داخل المودال، وعنوان الإيصال المطبوع — وأُضيف أيضاً كحقل بحث في Fuse.js.

**التعديل:**
- ConfirmDialog أولاً (مع كلمة سر)
- مودال تعديل يوجّه الحفظ حسب النوع:
  - maintenance → `dbService.maintenance.update(car)`
  - direct_sale → `dbService.directSale.update(sale)`

**إضافة دفعة:** (للفواتير ذات المتبقي > 0)
- يستخدم `dbService.debt.addPayment` — نفس قناة الديون (يشمل حقل "خصم / إسقاط مبلغ (تسوية) ₪" الاختياري — راجع "خصم تسوية عند الدفع")

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

**إضافة دفعة:** للموردين فقط عبر `supplierInvoice:addDebtPayment` (مع حقل "خصم / إسقاط مبلغ (تسوية) ₪" اختياري — راجع "خصم تسوية عند الدفع")

**الحذف:** يوجّه حسب النوع لـ expense/supplierInvoice/salary delete

**ترقيم الفواتير (منذ 2026-07-02):** عنوان طباعة الإيصال (`printInvoice`) يعرض `inv.invoiceNumber` (بصيغة `PUR-{سنة}-{تسلسل}`) لصفوف الموردين، ويبقى على `#{id}` القديم للمصاريف والرواتب (لا رقم فاتورة حقيقي لهما). لم يُضَف عمود "رقم الفاتورة" في جدول هذه الشاشة نفسها (يبقى متاحاً بالكامل من صفحة `Suppliers.tsx` للفواتير من نوع مورد) تفادياً لعمود شبه فارغ لبقية الأنواع.

---

### الديون المعلقة — `src/pages/PendingDebts.tsx`
**المسار:** `/pending-debts`

**البيانات:** من `debt:getAll` — UNION maintenance+direct_sale WHERE amount_remaining > 0

**الفلاتر:**
- بحث Fuse.js باسم الزبون + **نمرة السيارة** (`carPlate` — أُضيف كمفتاح Fuse، راجع "تحديث 2026-07-02 (١٢)")
- بحث برقم الهاتف
- بحث بنمرة السيارة (`plateSearch` — فلتر مباشر جزئي `includes` بجانب مفتاح Fuse؛ يعمل فعلياً على ديون الصيانة فقط لأن البيع المباشر بلا نمرة فتُستبعد صفوفه تلقائياً — راجع "تحديث 2026-07-03 (٢)")
- تبويبات: الكل / صيانة / بيع مباشر
- فلتر مبلغ المتبقي (min-max)

**الجدول:** اسم الزبون | رقم الهاتف | النوع | التاريخ | نمرة السيارة | الإجمالي | المدفوع | المتبقي | الإجراءات

**الإجراءات:**
1. **تعديل:** ConfirmDialog أولاً (مع كلمة سر، `warnDebt`/`confirmEditDebt`) *(أُضيف بتاريخ 2026-07-01 — سابقاً بلا تأكيد)*، ثم مودال يُعدّل بيانات الفاتورة الأصلية (يوجّه حسب `debt.type`)
2. **إضافة دفعة:** مودال الدفع (كاش/شيك/فيزا + حقل "خصم / إسقاط مبلغ (تسوية) ₪" اختياري) → `debt:addPayment` + Ledger — خصم التسوية يُسقَط من المتبقّي بلا نقدية (راجع "خصم تسوية عند الدفع")
3. **حذف:** ConfirmDialog مع كلمة سر، يحذف الفاتورة المصدر بالكامل

**LinkedOps:** تظهر في مودال التفاصيل

---

### المصاريف اليومية — `src/pages/DailyExpenses.tsx`
**المسار:** `/expenses`

**نموذج الإضافة (inline):**
- الوصف (مطلوب)، المبلغ (مطلوب > 0)، التاريخ، ملاحظات
- Draft يُحفظ في localStorage (مفتاح `'garage-exp-draft'`)

**التعديل:** ConfirmDialog أولاً (مع كلمة سر، `warnExp`/`confirmEditExp`) *(أُضيف بتاريخ 2026-07-01 — سابقاً كان زر "تعديل" يفتح المودال مباشرة بلا أي تأكيد)*، ثم مودال منفصل

**الفلاتر:**
- بحث Fuse.js بالوصف
- فلتر تاريخ (من-إلى)
- فلتر مبلغ (min-max)

**البطاقة:** إجمالي المصاريف المُصفّاة — **ملتصقة بصرياً** داخل نفس `mi-card` الخاصة بالجدول (وليست بطاقة `stats-grid` منفصلة فوقه): تُعرض كصف علوي (`className="stat-card"` مع `style` مُخصّص يُصفّر `boxShadow`/`borderRadius`/`padding`/`background` ويُحوّل الاتجاه لصف أفقي) مفصول عن عنوان "المصاريف المسجلة" وجدولها بـ `border-bottom: 1px solid #e8edf2` بدل ظل بطاقة مستقل. الإبقاء على كلاس `stat-card` ضروري لأن تنسيق `stat-label`/`stat-value` معرّف بمحدد CSS ابن-من-أب `.stat-card .stat-label` في `App.css`.

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
- جدول البنود: اسم البند، الكمية، السعر، **الإجمالي** (محسوب حياً)، **الخصم** (بدون/مبلغ ثابت/نسبة % — على مستوى البند الفردي)، **بعد الخصم** (محسوب حياً)، ملاحظات — راجع "خصم بنود فاتورة المورد" و"تحديث 2026-07-02 (١٠)"
- المجموع الكلي أسفل الجدول = مجموع إجمالي كل بند بعد خصمه الخاص
- قسم الدفع: كاش/شيك/فيزا (يمكن دين جزئي)

**تفاصيل الفاتورة والإيصال المطبوع:** يعرضان لكل بند العدد والسعر والإجمالي قبل الخصم والخصم إن وُجد والإجمالي بعد الخصم، مع المجموع الكلي في الأسفل.

**الفلاتر على الفواتير:** بحث Fuse.js باسم المورد + رقم الفاتورة (`invoiceNumber` — منذ 2026-07-02) + بحث برقم الهاتف (`phoneSearch`) + **فلتر تاريخ الشراء (من-إلى — حقلان منفصلان `filterFrom`/`filterTo`)** + فلتر مبلغ الإجمالي (min-max). كل الفلاتر تُطبَّق **client-side** على `supplierInvoices` من الـ Context ضمن `filteredSuppliers` — بنفس نمط `MaintenanceInvoices.tsx`/`DirectSales.tsx`/`DailyExpenses.tsx`. راجع "تحديث 2026-07-02 (١٤)". (الـ backend `getSupplierInvoices` وقناة `supplierInvoice:getAll` يدعمان `date_from`/`date_to` أصلاً في `SupplierFilters`، غير مستخدَمَين من هذه الصفحة لأن الفلترة تجري client-side.)

**ترقيم الفواتير (منذ 2026-07-02):** جدول فواتير الموردين يعرض عمود "رقم الفاتورة" (بصيغة `PUR-{سنة}-{تسلسل}`) كأول عمود، ويظهر أيضاً كأول حقل في مودال التفاصيل وفي عنوان الإيصال المطبوع.

**التعديل:**
- **فاتورة مورد:** ConfirmDialog أولاً (مع كلمة سر، `warnSup`/`confirmEditSup`) — لكل الفواتير بلا استثناء. إن كانت الفاتورة مدفوعة بالكامل (`amountRemaining === 0`) تُضمَّن تفاصيلها (المورد، تاريخ الشراء، الإجمالي) ضمن نص التحذير؛ غير ذلك رسالة عامة. *(سابقاً كانت الفواتير المدفوعة بالكامل فقط تعرض تحذيراً مخصصاً بدون ConfirmDialog ولا كلمة سر، وبقية الفواتير تُفتح للتعديل مباشرة بلا أي تأكيد — تم توحيدها في 2026-07-01.)*
- **مورد (دليل):** ConfirmDialog أولاً (مع كلمة سر، `warnSupplier`/`confirmSupEdit`) *(أُضيف بتاريخ 2026-07-01 — سابقاً بلا تأكيد)*

---

### الموظفون والرواتب — `src/pages/Employees.tsx`
**المسار:** `/employees`

**قسم الموظفين:**
- نموذج إضافة inline: اسم الموظف (حروف فقط) + رقم الهاتف + **اليومية (₪/يوم)** — الحقول الثلاثة مطلوبة
- التعديل: ConfirmDialog أولاً (مع كلمة سر، `warnEmp`/`confirmEmpEdit`) *(أُضيف بتاريخ 2026-07-01 — سابقاً بلا تأكيد)*، ثم مودال (يشمل تعديل اليومية)
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

**بطاقة "إجمالي الرواتب المدفوعة (الصافي)":** ملتصقة بصرياً داخل نفس `mi-card` لقسم "سجل الرواتب" أسفلها (وليست بطاقة `stats-grid` منفصلة فوقها) — بنفس الأسلوب المستخدم في `DailyExpenses.tsx` (صف علوي بكلاس `stat-card` مع `style` مُخصّص يُصفّر الظل/الحواف/الخلفية ويحوّله لصف أفقي، مفصول بـ `border-bottom: 1px solid #e8edf2` عن عنوان الجدول).

**جدول الرواتب (8 أعمدة):**
الموظف | اليومية (وقت الدفعة) | الأيام | بونص ₪ | خصم ₪ | الصافي ₪ | تاريخ الدفعة | الإجراءات

**إجراءات الراتب:** طباعة | تعديل | حذف

**طباعة إيصال الراتب:** يعرض: اسم الموظف، التاريخ، اليومية (وقت الدفعة)، عدد أيام الدوام، حاصل الضرب، البونص، الخصم، الصافي النهائي بارز بالأخضر.

**التعديل:** ConfirmDialog أولاً (مع كلمة سر، `warnSalary`/`confirmSalaryEdit`) *(أُضيف بتاريخ 2026-07-01 — سابقاً بلا تأكيد)*، ثم يستدعي `dbService.salary.update(id, salData)` مباشرةً — تُعاد كتابة Ledger entry ليطابق المبلغ الجديد.

**الفلاتر:** اختيار الموظف + تاريخ من-إلى

**بطاقة الإجمالي:** إجمالي الرواتب المدفوعة (الصافي) للفترة المُصفّاة

---

### الكفالات — `src/pages/Warranties.tsx`
**المسار:** `/warranties`

**دوال حساب انتهاء الكفالة (من `src/utils/warranty.ts`):**
```ts
// week  → تُحسب بحساب UTC صرف: startDate + value*7 أيام
// month/year → يُحوَّلان لعدد أشهر إجمالي، ثم يُثبَّت اليوم على آخر يوم في
//              الشهر الهدف عند التجاوز (مثال: 2026-01-31 + شهر = 2026-02-28
//              وليس 2026-03-03 كما كان يحدث مع setMonth() الافتراضي في JS)
export function calcEndDate(startDate: string, value: number, unit: WarrantyPeriodUnit): string

// مقارنة تقويمية صرفة (يوم UTC مقابل يوم UTC)، بمعزل عن التوقيت المحلي
// وساعة اليوم الحالية — لا تعتمد على Date.now()
export function daysRemaining(endDate: string): number
```

كانت هذه الدوال محلية في Warranties.tsx، نُقلت إلى `warranty.ts` لتكون قابلة للمشاركة. بعد حذف صفحة الرئيسية (Home.tsx) بتاريخ 2026-07-01، بقيت `calcEndDate` و`daysRemaining` في مكانهما بـ `warranty.ts` — لكن أُعيد كتابة داخلهما بتاريخ 2026-07-01 لإصلاح خطأين: (1) `setMonth()`/`setFullYear()` في `Date` المحلي كانا يتجاوزان نهاية الأشهر القصيرة بدل التثبيت على آخر يوم فيها، و(2) `daysRemaining` كان يعتمد على `Date.now()` (يشمل الساعة الحالية) فيُنتج نتائج غير مستقرة عبر اليوم نفسه بدل مقارنة تقويمية صرفة. لا يزالان مستخدمين مباشرة في `Warranties.tsx` بنفس التوقيع الخارجي (لا تغيير على استدعاءاتهما).

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
- بحث Fuse.js باسم الزبون + **نمرة السيارة** (`carPlate` — أُضيف كمفتاح Fuse، راجع "تحديث 2026-07-02 (١٢)")
- بحث برقم الهاتف
- تبويبات: نشطة / منتهية
- فلتر المصدر: الكل / صيانة / بيع مباشر / يدوي

**ملاحظة (مُحدَّثة 2026-07-02):** الإدراج اليدوي المباشر في جدول `warranties` (النموذج القديم بـ `source_id=0` + بطاقتا الإحصاء العلويتان) أُزيل بتاريخ 2026-07-01، ولم يعُد. لكن أُعيد زر **«+ إضافة كفالة»** أعلى الصفحة بمنطق مختلف: يفتح `AddSalesInvoiceButton` (اختيار صيانة/بيع مباشر ثم نموذج الفاتورة المشترك)، فتُنشأ فاتورة كاملة والكفالة تُولَّد تلقائياً عبر منطق المزامنة الحالي (`syncWarrantiesForMaintenance`/`syncWarrantiesForDirectSale`) — لا إدراج يدوي في الجدول ولا `source_id=0`. الصفحة تبقى تعرض/تعدّل/تحذف الكفالات القائمة، ونموذج تعديل الكفالة (`warranty:update`) بلا تغيير.

**الإجراءات:**
- **تعديل:** ConfirmDialog أولاً (مع كلمة سر، `warnWarranty`/`confirmEditWarranty`) *(أُضيف بتاريخ 2026-07-01 — سابقاً كان زر "تعديل" يفتح المودال مباشرة بلا أي تأكيد، وهي المشكلة التي أدّت لفحص شامل لكل الصفحات ثم توحيد هذه البوابة في كل مكان)*
- **حذف:** ConfirmDialog مع كلمة سر

**ملاحظة:** الكفالات التلقائية (source_id > 0) تُدار من صفحات الصيانة/البيع المباشر. الحذف اليدوي من هذه الصفحة مسموح به، لكن عند تعديل الفاتورة المصدر ستُعاد المزامنة.

---

### التقارير — `src/pages/Reports.tsx`
**المسار:** `/reports`

**6 تبويبات:**

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

5. **أفضل الزبائن:** `report:topCustomers(20)`
   - جدول: # | اسم الزبون | رقم الهاتف | عدد الفواتير | إجمالي الإنفاق
   - يجمع من maintenance_invoices + direct_sale_invoices مُرتَّباً تنازلياً حسب total_spent

6. **أعمار الديون** (منذ 2026-07-02): `report:debtsAging` — تبويب جديد
   - **4 بطاقات إحصاء** (`stats-grid`/`stat-card`، واحدة لكل شريحة عمرية: 0-30 / 31-60 / 61-90 / أكثر من 90 يوم) — كل بطاقة تعرض عدد الفواتير وإجمالي المتبقي في تلك الشريحة (محسوبة حياً من `debtsAging` عبر `.filter()`، بدون قناة IPC إضافية)
   - **جدول واحد** لكل الديون المعلقة (زبائن صيانة + بيع مباشر + موردين معاً): الشريحة العمرية (badge: `mi-badge-green` 0-30 / `mi-badge-yellow` 31-60 / `mi-badge-orange` 61-90 / `mi-badge-red` 90+) | الطرف | النوع (badge: `mi-badge-orange` صيانة / `mi-badge-blue` بيع مباشر / `mi-badge-purple` مورد) | التاريخ | الإجمالي | المتبقي | عدد الأيام
   - **ترتيب قابل للتبديل:** الضغط على رأس عمود "عدد الأيام" يبدّل بين تنازلي (▼، الأقدم أولاً، الافتراضي) وتصاعدي (▲) — فرز محلي (`useMemo` على `debtsAging` + `agingSort` state) دون إعادة استدعاء IPC
   - لا إجراءات تعديل/حذف في هذا التبويب؛ التعديل/السداد يتم من صفحاته الأصلية (الصيانة/البيع المباشر/الموردين/الديون المعلقة) كما في تبويب "تقرير الديون"

**الطباعة:** زر "طباعة التقرير" يُنشئ HTML مناسب حسب التبويب الحالي ويستدعي `printPdf()` (يشمل تبويبي أفضل الزبائن وأعمار الديون)

**تصدير CSV:** زر "⬇ تصدير CSV" يظهر في كل التبويبات ما عدا "أفضل الزبائن" (الشرط البرمجي `tab !== 'top_customers'`، لذا ظهر تلقائياً لتبويب "أعمار الديون" الجديد دون أي تعديل على شرط الإظهار)؛ يستدعي `exportToCsv()` من `src/utils/exportCsv.ts`

**تصدير Excel (.xlsx) — منذ 2026-07-02:** بجانب زر "⬇ تصدير CSV" أُضيف زر مواز "⬇ تصدير Excel" بنفس النمط البصري (`btn btn-secondary`) وبنفس شرط الإظهار (`tab !== 'top_customers'`)، يستدعي `handleExportXlsx()` → `exportToXlsx()` من `src/utils/exportXlsx.ts` (مكتبة SheetJS/`xlsx`). يُصدّر **نفس بيانات وأعمدة CSV بالضبط** لكل تبويب (يومي/شهري/سنوي/ديون/أعمار ديون) — إضافة موازية تماماً، ومنطق/زر CSV الأصلي **لم يُمَسّ إطلاقاً**. ينتج ملف xlsx حقيقياً (ليس CSV بامتداد مختلف): الأرقام تُكتب كخلايا أرقام حقيقية (`t:'n'`) لتعمل معادلات Excel مباشرة، والتواريخ تبقى نصاً مقروءاً (نفس نصوص CSV، لا تُحوَّل لتسلسل تاريخ Excel لأنها بصيغ غير موحّدة)، مع اتجاه ورقة RTL (`wb.Workbook.Views = [{ RTL: true }]`) واسم ورقة عربي لكل تقرير. تم التحقق من فتح الملف بنجاح في LibreOffice Calc (تحويل headless إلى CSV أعاد نفس البيانات بالعربية سليمة).

---

### الإعدادات — `src/pages/Settings.tsx`
**المسار:** `/settings`

**القسم الأول (بدون تغيير): النسخ الاحتياطي (يدوي)**

**تصدير نسخة احتياطية:**
- زر "تصدير" → `dbService.backup.export()` → يفتح نافذة حفظ ملف (save dialog)
- يحفظ نسخة من `garage.db` بصيغة `.db` في المسار المختار
- يعرض مسار الملف المحفوظ عند النجاح

**استيراد نسخة احتياطية:**
- زر "استيراد" (أحمر) → ConfirmDialog مع كلمة سر أولاً
- عند التأكيد → `dbService.backup.import()` → يفتح نافذة اختيار ملف
- يتحقق من صحة الملف → ينشئ نسخة احتياطية تلقائية → يُبدّل الملف → يُعيد تشغيل التطبيق
- تحذير: "هذه العملية لا يمكن التراجع عنها"

**القسم الثاني (جديد، بطاقة `mi-card` منفصلة): النسخ الاحتياطي التلقائي**

راجع تفاصيل القنوات والمنطق الكامل في قسم "النسخ الاحتياطي التلقائي" ضمن `electron/ipc-handlers.ts` أعلاه. ملخص واجهة المستخدم:
- **اختيار مجلد:** زر "اختيار مجلد…" → `dbService.autoBackup.pickFolder()` (يفتح `openDirectory` dialog) → يُحفظ فوراً عبر `updateSettings`
- **تفعيل/تعطيل:** checkbox يحفظ فوراً عند التبديل
- **عدد النسخ المحتفظ بها:** حقل رقمي (افتراضي 14)، يحفظ عند `onBlur`
- **"نسخ الآن يدوياً":** يستدعي `autoBackup:runNow` فوراً بصرف النظر عن حالة التفعيل، ثم يُحدّث عرض الحالة
- **عرض الحالة:** "آخر نسخة ناجحة" (تاريخ/وقت) + "آخر محاولة: نجحت/فشلت" مع رسالة الخطأ عند الفشل (مثلاً مجلد غير موجود أو غير قابل للكتابة) — بلا أي alert/نافذة مزعجة
- الإعدادات والحالة تُحمَّل عبر `useEffect` عند تحميل الصفحة (`getSettings` + `getStatus` بالتوازي)

**ملاحظة مهمة:** هذا القسم منفصل تماماً عن قسم "النسخ الاحتياطي" اليدوي أعلاه — قنوات مختلفة (`autoBackup:*` مقابل `backup:*`)، حالة React منفصلة، ولا يوجد أي كود مشترك بينهما عدا استخدام نفس أسلوب `wal_checkpoint(FULL)` قبل النسخ.

**القسم الثالث (جديد، بطاقة `mi-card` منفصلة): تغيير كلمة السر**

حقول: كلمة السر الحالية، الجديدة، تأكيد الجديدة (كلها `PasswordInput`). تحقق محلي أولاً (طول ≥6، تطابق التأكيد)، ثم `dbService.auth.changePassword(old, new)` — يرمي خطأ عربي واضح عند رفض القديمة (بما يشمل رسالة القفل المؤقت إن كان مقفلاً). عند النجاح تُفرَّغ الحقول الثلاثة وتظهر رسالة نجاح.

**القسم الرابع (جديد، بطاقة `mi-card` منفصلة): القفل التلقائي عند الخمول**

نفس نمط قسم "النسخ الاحتياطي التلقائي" بالضبط (checkbox تفعيل يحفظ فوراً + حقل رقمي "مدة الخمول بالدقائق" يحفظ عند `onBlur`) — عبر `dbService.auth.getAutoLockSettings`/`updateAutoLockSettings`.

**القسم الخامس (جديد، بطاقة `mi-card` منفصلة، للقراءة فقط): سجل النشاط**

يُحمَّل عبر `dbService.activityLog.getAll(200)` في `useEffect` عند فتح الصفحة. جدول: التاريخ | العملية (تعديل/حذف) | النوع (اسم الكيان بالعربي) | التفاصيل. لا إمكانية تعديل أو حذف من هذه الشاشة — راجع تفاصيل نطاق التسجيل الكامل ضمن قسم "الأمان" في الـ Backend أعلاه.

**القسم السادس (جديد، بطاقة `mi-card` منفصلة): الضريبة (VAT)** — منذ 2026-07-02

نفس نمط قسم "القفل التلقائي عند الخمول" بالضبط: checkbox "تفعيل الضريبة" يحفظ فوراً عند التبديل + حقل رقمي "نسبة الضريبة (%)" (يظهر **فقط** عند التفعيل) يحفظ عند `onBlur` — عبر `dbService.vat.getSettings`/`updateSettings`. الإعدادات تُحمَّل في `useEffect` عند فتح الصفحة إلى حالة `vatEnabled`/`vatRate`. معطّلة افتراضياً؛ عند التعطيل لا يظهر حقل النسبة ولا أي شيء متعلق بالضريبة في أي فاتورة أو إيصال. راجع التفاصيل الكاملة (القنوات، المنطق، سبب كونها derived غير مخزَّنة) في قسم "الضريبة (VAT)" ضمن الـ Backend أعلاه.

---

## 6. المكونات المشتركة

### `src/components/Sidebar.tsx`
- **13 رابط تنقل (بهذا الترتيب بالضبط):** الصندوق الرئيسي / فواتير البيع / البيع المباشر / سيارات الصيانة / فواتير الشراء / الموردون / المصاريف اليومية / الموظفون والرواتب / الديون المعلقة / **الشيكات** (أُضيف 2026-07-03) / الكفالات / التقارير / **الإعدادات** (أيقونة ⚙) *(أُعيد ترتيبها بتاريخ 2026-07-01)*
- يعرض التاريخ الحالي بالعربي في الأسفل (`toLocaleDateString('ar-EG-u-nu-latn', ...)` — أرقام لاتينية)
- شعار "**كراج الخط الأخضر**" في الأعلى
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
- **(منذ 2026-07-01)** كلمة السر تُتحقَّق منها عبر `dbService.auth.verifyPassword(password)` (async، عبر IPC → hash في main process) بدل المقارنة النصية المحلية السابقة → عند الصواب تُستدعى `onConfirm()`
- عند القفل المؤقت (تجاوز عدد المحاولات) يُعرض عدّاد تنازلي بالثواني ويُعطَّل زر التأكيد
- الأخطاء تُعرض داخل المودال

### `src/components/PasswordGate.tsx`
- شاشة مظلمة (#1E2A38) مع شعار "كراج" باللون الأخضر
- يستخدم `<PasswordInput>` بدلاً من `<input type="password">` العادي
- **(منذ 2026-07-01)** نفس آلية التحقق عبر IPC والقفل المؤقت الموجودة في `ConfirmDialog.tsx` أعلاه (نفس النمط بالضبط)
- عند الصواب يستدعي `onUnlock()`
- يُلفّ كامل التطبيق في `App.tsx` — ويُعاد عرضه تلقائياً أيضاً عند القفل التلقائي للخمول (`src/utils/useAutoLock.ts`)، وليس فقط عند إطلاق التطبيق لأول مرة

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
- `onKeyDown` (اختياري) يُمرَّر مباشرة لحقل الإدخال — يُستخدم مثلاً في `ConfirmDialog.tsx` لالتقاط Enter للتأكيد.

**ملاحظة تاريخية:** كان المكوّن يتضمّن سابقاً ميزة "مؤشر Caps Lock" (تحذير نصي يظهر عند تفعيل Caps Lock أثناء إدخال كلمة السر)، اعتمدت في محاولاتها المتعاقبة على `onKeyDown`/`onKeyUp`/`onFocus` محليّين ثم على مستمعين على مستوى `window` مرتبطين بحالة تركيز الحقل. تبيّن أن الفائدة لا تستحق التعقيد المصاحب لها، فأُزيلت الميزة بالكامل (الـ state، الـ useEffect، عنصر JSX الخاص بالتحذير، وتنسيق `pwd-capslock-warning` في `App.css`)، وأبقي المكوّن مقتصراً على وظيفته الأصلية: إظهار/إخفاء كلمة السر عبر زر أيقونة العين.

### `src/store/GarageContext.tsx`
- **يوفّر:** جميع البيانات المحمّلة من DB + `reload()` + `loading` + `getLinkedOps()` + `getLinkedOpsByPlate()`
- **يُحمّل عند الإطلاق:** 11 استدعاء متوازٍ (Promise.all) لكل قنوات `getAll`
- **`getLinkedOps(phone, currentSource, currentId)`:** يُعيد عمليات سابقة لنفس رقم الهاتف من maintenance + direct_sale + sales/purchase/supplier invoices + debts
- **`getLinkedOpsByPlate(carPlate, currentSource, currentId)`:** نظيرتها بنمرة السيارة (وسيلة ربط رئيسية إضافية بأهمية الهاتف، لا بديل عن أي مفتاح داخلي). البيع المباشر بلا عمود `car_plate` في القاعدة (SaleRecord بلا `carPlate`)، لذا تبحث فعلياً في فواتير الصيانة (`maintenance_invoices`) والكفالات المرتبطة (`warranties.car_plate` — للصيانة فقط) بمقارنة النمرة بعد إزالة الفراغات وتوحيد الحالة. راجع "تحديث 2026-07-02 (١٢)"
- **`reload()`:** يُعيد تشغيل كل الاستدعاءات → يُحدّث كل الشاشات

**الأنواع المُعرَّفة في GarageContext:**

| النوع | الوصف |
|---|---|
| `CarRecord` | فاتورة صيانة في UI (يشمل amountPaid?, amountRemaining? الاختياريَّين + discountType?/discountValue?) |
| `CarItem` | بند صيانة في UI |
| `SaleRecord` | فاتورة بيع مباشر في UI (يشمل discountType?/discountValue?) |
| `SaleItem` | بند بيع مباشر في UI |
| `PaymentRow` | صف دفع (مع تفاصيل شيك/فيزا) |
| `UpcomingCheque` | شيك مستحق قريباً في UI (قراءة فقط) |
| `ChequeRecord` | شيك في صفحة الشيكات = `UpcomingCheque` + `issueDate` (قراءة فقط) |
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
| `DiscountType` | `'fixed'` \| `'percentage'` — خصم الفاتورة (undefined = لا تغيير، null = بدون خصم) |

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
- `pwd-wrapper`, `pwd-input-wrap`, `pwd-input`, `pwd-toggle-btn` — مكوّن PasswordInput (معرَّفة في `App.css`)

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
- **مفاتيح البحث (`keys`) لكل شاشة:** نمرة السيارة (`carPlate`) مُضافة كمفتاح بحث في كل الشاشات التي تحمل بيانات سيارة — `MaintenanceInvoices` (بجانب فلتر النمرة المباشر `plate` عبر `includes`)، `SalesInvoices` (بجانب `customerName`+`invoiceNumber`)، `Warranties` و`PendingDebts` (بجانب `customerName`) — راجع "تحديث 2026-07-02 (١٢)"

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

### تصدير Excel (src/utils/exportXlsx.ts) — منذ 2026-07-02

```ts
exportToXlsx(filename: string, headers: string[], rows: (string | number)[][], sheetName?: string): void
```
- يبني ورقة عمل من `headers + rows` عبر `XLSX.utils.aoa_to_sheet` ثم يكتبها كملف xlsx حقيقي (SheetJS)
- الأرقام تبقى أرقاماً حقيقية في الخلايا (`t:'n'`) لتعمل معادلات Excel، والتواريخ نصوص مقروءة كما تصل من المُستدعي
- اتجاه الورقة RTL (`wb.Workbook.Views = [{ RTL: true }]`) واسم الورقة قابل للتخصيص (يُقصّ لـ 31 حرفاً — حد Excel)
- يُنشئ Blob وينقره تلقائياً (no server needed) — بنفس فلسفة `exportToCsv`
- **إضافة موازية:** لا يمسّ `exportToCsv` ولا زر/منطق CSV في `Reports.tsx` إطلاقاً

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
- يُضيف: خط Tajawal (400/700) + RTL layout + A4 print styles — الخط يُحقن كـ CSS نصّي مباشرة داخل الصفحة عبر استيراد Vite الخاص `@fontsource/tajawal/400.css?inline` و`700.css?inline` (مُعرَّف في `src/vite-env.d.ts`)، وليس رابط `<link>` لخادم خارجي، لذا تعمل الطباعة بدون اتصال إنترنت
- الرأس: "**كراج الخط الأخضر**" + العنوان
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
- [x] الكفالات: عرض/تعديل/حذف + مزامنة تلقائية من الصيانة والبيع المباشر (الإضافة اليدوية كانت موجودة سابقاً وأُزيلت عمداً بتاريخ 2026-07-01 بقرار من المستخدم — ليست نقصاً أو خطأ، بل تبسيط متعمّد للصفحة لتُدار الكفالات فقط عبر المزامنة التلقائية من فواتير الصيانة والبيع المباشر)
- [x] نظام الكفالات المنظّم (dropdown وحدة + عدد) مخزّن كـ JSON
- [x] عمود "نوع العملية" في شاشة الكفالات
- [x] دليل الموردين منفصل
- [x] بحث Fuse.js مع تطبيع عربي في كل الشاشات (يشمل نمرة السيارة `carPlate` في كل شاشة تحمل بيانات سيارة — راجع "تحديث 2026-07-02 (١٢)")
- [x] LinkedOps (عمليات سابقة لنفس الزبون بالهاتف) في التفاصيل
- [x] LinkedOps بنمرة السيارة (`getLinkedOpsByPlate` — "عمليات سابقة لهذه السيارة" في مودال فاتورة الصيانة، بجانب قسم الهاتف) — راجع "تحديث 2026-07-02 (١٢)"
- [x] PasswordGate + ConfirmDialog مع كلمة سر
- [x] مكوّن PasswordInput مع إظهار/إخفاء كلمة السر
- [x] Draft localStorage للنماذج الطويلة
- [x] طباعة لكل نوع فاتورة
- [x] دعم طرق دفع متعددة: كاش/شيك/فيزا/دين مع التفاصيل الكاملة
- [x] part_type (قطعة/خدمة) لبنود الصيانة
- [x] TypeScript صحيح بلا أخطاء (`tsc --noEmit` ينجح)
- [x] **تعديل بنود الصيانة:** نموذج التعديل يستدعي `getOne` لجلب البنود الكاملة بكفالاتها وأنواعها
- [x] **تعديل بنود البيع المباشر:** `directSale:updateItems` تحذف البنود وتُعيد إدراجها + تُحدّث الإجمالي
- [x] **نظام الرواتب باليومية:** daily_wage في employees + 4 أعمدة في salary_payments + migration تلقائي + salary:update
- [x] **تقرير أفضل الزبائن:** تبويب جديد في Reports.tsx يستدعي `report:topCustomers(20)`
- [x] **تصدير CSV:** زر تصدير في Reports.tsx لتبويبات يومي/شهري/سنوي/ديون
- [x] **تصدير Excel (.xlsx):** زر مواز لزر CSV في Reports.tsx (SheetJS) لنفس التبويبات، أرقام حقيقية + RTL، دون المساس بتصدير CSV
- [x] **نسخ احتياطي:** backup:export و backup:import مع التحقق والنسخة التلقائية + صفحة Settings.tsx
- [x] **نسخ احتياطي تلقائي دوري:** جدول app_settings + autoBackup:getSettings/updateSettings/runNow/getStatus/pickFolder + تشغيل عند بدء التطبيق وعند الإغلاق + rotation — منفصل تماماً عن النسخ اليدوي
- [x] **توحيد بوابة ConfirmDialog+كلمة السر على كل أزرار التعديل** (وليس الحذف فقط) عبر كل الصفحات — راجع "الأمان وكلمة السر"
- [x] **أيقونة تطبيق مخصّصة** لكل من نافذة Electron والملف التنفيذي المُعبّأ (mac/win/linux) بدل أيقونة Vite/Electron الافتراضية
- [x] **خط Tajawal محزَّم محلياً** (`@fontsource/tajawal`) بدل تحميله من Google Fonts CDN — يعمل التطبيق والطباعة بدون اتصال إنترنت
- [x] **إصلاح حساب انتهاء الكفالة:** `calcEndDate`/`daysRemaining` في `warranty.ts` أُعيدا كتابتهما بحساب UTC صرف لتفادي تجاوز نهاية الأشهر القصيرة وعدم استقرار العد اليومي
- [x] **كلمة سر مشفّرة (bcrypt hash)** بدل ثابت نصي، تحقق عبر IPC فقط + شاشة "تغيير كلمة السر" في الإعدادات
- [x] **قفل تلقائي عند الخمول** (افتراضي 10 دقائق، قابل للتعطيل/التعديل) — `src/utils/useAutoLock.ts`
- [x] **قفل مؤقت متصاعد عند تجاوز محاولات كلمة السر** (5 محاولات → 30 ثانية ← دقيقة ← 5 دقائق، يصمد أمام إعادة التشغيل)
- [x] **سجل نشاط** (`activity_log`) لكل عمليات التعديل/الحذف الحساسة — قراءة فقط في الإعدادات
- [x] **ضمان atomic كامل لكل عمليات الكتابة المركّبة:** لفّ `maintenance:add/update` و`directSale:add/update` بـ transaction خارجي واحد يضمّ كتابة الفاتورة ومزامنة الكفالات معاً (بقية عمليات الكتابة المركّبة كانت ملفوفة بالفعل)
- [x] **تقرير/تنبيه الشيكات المستحقة قريباً:** قناة `cheques:getUpcoming` (قراءة فقط بالكامل) + قسم جديد في `CashLedger.tsx` مع فلتر مدى 7/14/30 يوماً وتلوين حسب الإلحاح — بدون أي تعديل على بنية جداول الشيكات الأربعة الموجودة
- [x] **صفحة "الشيكات" (كل الشيكات):** قناة `cheques:getAll(filters)` + دالة `getAllCheques` (منفصلة عن `getUpcomingCheques`) تعرض **كل** الشيكات من الجداول الأربعة (الماضية والمستقبلية) مرتّبة تنازلياً حسب `cash_date`، صفحة `Cheques.tsx` جديدة (قراءة فقط) بفلاتر رقم الشيك/البنك/التاريخ/المبلغ + badge نوع العملية + حالة الاستحقاق (منتهي/اليوم/قادم)، رابط في `Sidebar.tsx` وRoute في `App.tsx` — بدون أي تعديل على بنية جداول الشيكات — راجع "تحديث 2026-07-03"
- [x] **تبويب "أعمار الديون" في Reports.tsx:** قناة `report:debtsAging` (قراءة فقط) تصنّف كل الديون المعلقة (زبائن + موردين) إلى 4 شرائح عمرية حسب تاريخ الفاتورة الأصلي، مع بطاقات إحصاء لكل شريحة، جدول موحّد قابل للفرز حسب عدد الأيام، وطباعة/تصدير CSV بنفس نمط بقية تبويبات Reports.tsx
- [x] **خصم على مستوى الفاتورة (صيانة + بيع مباشر):** `discount_type` (`fixed`/`percentage`/NULL) + `discount_value` عبر migration، منطق مركزي `applyDiscount` في `src/db/discount.ts` (يضمن ألا يصبح الإجمالي سالباً)، `total_amount` يُخزَّن بعد الخصم ويُعاد حساب `amount_remaining` منه، نموذج خصم + عرض حي للإجمالي بعد الخصم في `MaintenanceInvoices.tsx`/`DirectSales.tsx`، وعرض "المجموع قبل الخصم/الخصم/الإجمالي بعد الخصم" في مودالات التفاصيل والإيصالات المطبوعة
- [x] **خصم على مستوى البند الفردي في فواتير الموردين:** `supplier_items.discount_type`/`discount_value` عبر migration، `total_amount` = مجموع `applyDiscount` لكل بند (إعادة استخدام نفس `src/db/discount.ts`)، عمودا "الإجمالي" و"بعد الخصم" + dropdown خصم لكل بند في `SupplierInvoiceForm.tsx`، `updateSupplierInvoice` يعيد إدراج البنود ويعيد الحساب، وعرض الخصم/الإجمالي بعد الخصم في مودال التفاصيل والإيصال المطبوع في `Suppliers.tsx` — راجع "تحديث 2026-07-02 (١٠)"
- [x] **رقم فاتورة منسّق يظهر للزبون (`invoice_number`):** `INV-{سنة}-{تسلسل}` مشترك بين فواتير الصيانة والبيع المباشر (تسلسل واحد لضمان التفرّد بينهما بما أنهما يُعرضان مجتمعين)، و`PUR-{سنة}-{تسلسل}` مستقل لفواتير الموردين. عمود جديد + بحث Fuse.js + عنوان الإيصال المطبوع في `MaintenanceInvoices.tsx`/`DirectSales.tsx`/`SalesInvoices.tsx`/`Suppliers.tsx`. مُضاف عبر migration `ALTER TABLE ... ADD COLUMN` + تعبئة رجعية للسجلات القديمة (`backfillInvoiceNumbers`) بترتيب زمني صرف حسب `created_at`؛ الـ `id` الداخلي لم يتغيّر ولم يُحذف.
- [x] **إحصاء نهاية اليوم مقسّماً حسب طريقة الدفع (كاش/فيزا/شيك):** أعمدة `actual_cash`/`actual_visa`/`actual_check` عبر migration + قناة `cashAudit:getSystemBreakdown` (صافي كل طريقة من جداول الدفعات مباشرة) + جدول مقارنة ثلاثي + تعديل/حذف السجلات (`cashAudit:delete`) — راجع "تحديث 2026-07-02 (٥)"
- [x] **رسائل خطأ Toast غير مُجمِّدة بدل `alert()`:** حدث `app-error` + مكوّن `ErrorToast.tsx` (اختفاء تلقائي 8 ثوانٍ) — راجع "رسائل الخطأ (Toast)"
- [x] **حماية تجاوز المتبقي في الدفعات (موحّدة على كل القنوات الخمس):** `addPayment` + `addDebtPayment` (`payments.ts`) + `releaseMaintenanceCar` (`maintenance.ts`) + `addSupplierPayment` + `addSupplierDebtPayment` (`suppliers.ts`) يرفضون أي مجموع دفعات (عدا طريقة `debt`) يتجاوز `amount_remaining` الحالي داخل الـ transaction بهامش تسامح `0.001` بنفس الرسالة العربية — راجع "تحديث 2026-07-02 (١٥)"
- [x] **خصم تسوية عند الدفع (`settlement_discount`):** إسقاط اختياري لمبلغ من `amount_remaining` وقت التحصيل/الدفع دون تسجيله كنقدية في `cash_ledger`. عمود جديد عبر migration في `payments`/`debt_payments`/`supplier_payments`/`supplier_debt_payments`، منطق مركزي `applySettlementDiscount` (+ نظير في `insertSupplierPayments`) مع نفس حماية تجاوز المتبقّي، حقل "خصم / إسقاط مبلغ (تسوية) ₪" في مودالات الدفع الأربعة، وسطر "خصم تسوية" منفصل في الإيصالات المطبوعة — راجع "خصم تسوية عند الدفع" و"تحديث 2026-07-02 (١١)"
- [x] **منع إدخال تواريخ مستقبلية:** `useDateClampGuard` في `App.tsx` يقيّد أي `<input type="date">` له `max` عبر مستمع عام على مستوى التطبيق
- [x] **بطاقات ملخّص اليوم الأربع في الصندوق (إيرادات/مصاريف/موردين/رواتب):** 4 بطاقات `stat-card` أعلى بطاقات الإحصاء في `CashLedger.tsx`، مرتبطة بنفس `selectedDate` وتتحدّث حياً — مغذّاة بأربعة حقول مجمّعة جديدة أُضيفت لنتيجة `report:daily` (`today_sales_income`/`today_expenses`/`today_supplier_payments`/`today_salaries`) بلا قناة IPC جديدة — راجع "تحديث 2026-07-02 (١٣)"

### غير مكتمل / قيود معروفة

- [ ] **تعديل الكميات بعد التسليم:** لا يمكن تعديل الكميات أو الأسعار في الفاتورة المُسلَّمة.
- [ ] **تشفير قاعدة البيانات بالكامل (SQLCipher):** غير منفَّذ بعد — يتطلب استبدال محرك `better-sqlite3` بمكتبة متوافقة مع SQLCipher (مثل `better-sqlite3-multiple-ciphers`) وإعادة هيكلة تسلسل بدء التطبيق بالكامل (فتح قاعدة البيانات يحدث حالياً في `main.ts` قبل ظهور شاشة كلمة السر؛ التشفير يتطلب انتظار كلمة السر أولاً). قرار مؤجَّل عمداً لمرحلة مستقلة لاحقة — راجع نقاش القرار في محادثة تطوير الأمان بتاريخ 2026-07-01.

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

- **(منذ 2026-07-01) كلمة السر لم تعد ثابتاً نصياً.** تُخزَّن كـ **bcrypt hash** في جدول `app_settings` (مفتاح `app_password_hash`)، ويتم التحقق منها حصراً في الـ main process عبر قناة `auth:verifyPassword` — لا مقارنة نصية في الـ Renderer بعد الآن. راجع التفاصيل الكاملة (بذرة أول تشغيل، القفل عند تجاوز المحاولات، القفل التلقائي عند الخمول، سجل النشاط) ضمن قسم "الأمان (`electron/auth.ts`)" في الـ Backend أعلاه.
- **تغيير كلمة السر يتم الآن من شاشة الإعدادات** (`Settings.tsx` → قسم "تغيير كلمة السر")، **وليس** بتعديل أي ثابت في الكود وإعادة البناء. `src/utils/auth.ts` أصبح يحمل فقط `DEFAULT_PASSWORD` — بذرة أول تشغيل (لضمان استمرار كلمة السر الحالية `garage2026` دون انقطاع)، وليس مصدر الحقيقة.
- `ConfirmDialog` يطلب كلمة السر عند `requirePassword={true}` (الافتراضي) — التحقق نفسه أصبح عبر IPC (انظر أعلاه)
- `PasswordGate` يحجب التطبيق كاملاً حتى إدخال الكلمة الصحيحة — يظهر أيضاً تلقائياً عند **القفل التلقائي للخمول** (`src/utils/useAutoLock.ts`، افتراضياً بعد 10 دقائق خمول، قابل للتعطيل/التعديل من الإعدادات)، وليس فقط عند إطلاق التطبيق لأول مرة
- **القفل عند تجاوز المحاولات:** 5 محاولات خاطئة متتالية (في `PasswordGate` أو `ConfirmDialog`) → قفل مؤقت متصاعد 30 ثانية ← دقيقة ← 5 دقائق، يصمد أمام إعادة تشغيل التطبيق
- كلا المكوّنَين (`PasswordGate`, `ConfirmDialog`) يستخدمان `PasswordInput` لتجربة أفضل (إظهار/إخفاء كلمة السر)
- **سجل النشاط:** كل عملية تعديل/حذف تمر عبر `ConfirmDialog` تُسجَّل تلقائياً في جدول `activity_log` (قراءة فقط من `Settings.tsx`) — لغرض المراجعة التاريخية، بلا ربط بمستخدمين متعددين (النظام يبقى أحادي المستخدم بتصميم مقصود)
- **القاعدة المُوحَّدة (منذ 2026-07-01):** كل زر "تعديل" أو "حذف" حسّاس في أي صفحة (`src/pages/*.tsx`) يجب أن يمرّ عبر `ConfirmDialog` (مع `requirePassword` الافتراضي `true`) قبل تنفيذ العملية. الحذف كان مضبوطاً بهذه الطريقة في كل الصفحات من البداية؛ التعديل لم يكن كذلك في أغلب الصفحات (Warranties, DailyExpenses, DirectSales, Employees ×2, PendingDebts, Suppliers ×2, MaintenanceInvoices) — تم فحصها وتوحيدها جميعاً لتتبع نفس نمط `warnX`/`confirmXEdit` المستخدم أصلاً في PurchaseInvoices.tsx وSalesInvoices.tsx. لا يوجد الآن أي زر تعديل أو حذف في المشروع يتجاوز هذه البوابة.

### مسار قاعدة البيانات في التطوير vs الإنتاج

```ts
// في src/database.ts:
const dbPath = app.getPath('userData') + '/garage.db'
// على Linux: ~/.config/Car-Repair/garage.db
// على Windows: C:\Users\<user>\AppData\Roaming\Car-Repair\garage.db
// على macOS: ~/Library/Application Support/Car-Repair/garage.db
```

---

*آخر تحديث: 2026-07-02*
*الإصدار الموثَّق: يشمل كل التعديلات حتى تاريخ كتابة هذا الملف*

**تحديث 2026-07-01:** حُذفت صفحة "لوحة التحكم" (`src/pages/Home.tsx`) بالكامل — كانت شاشة تكرر إحصائيات موجودة أصلاً في CashLedger.tsx وReports.tsx وWarranties.tsx دون أن تضيف قيمة مستقلة. المسار الافتراضي `/` أصبح يُعيد التوجيه (`<Navigate>`) إلى `/cash-ledger`، وانخفض عدد روابط Sidebar من 13 إلى 12. الدوال `calcEndDate` و`daysRemaining` في `src/utils/warranty.ts` لم تُحذف لأنها لا تزال مستخدمة في `Warranties.tsx`.

**تحديث 2026-07-01 (٢):** أُضيفت ميزة "النسخ الاحتياطي التلقائي" (`electron/auto-backup.ts`) — نسخ دوري لـ garage.db إلى مجلد يحدده المستخدم (مثلاً مجلد Google Drive/Dropbox محلي)، بقنوات IPC جديدة `autoBackup:*` وجدول `app_settings` جديد، بدون أي تعديل على ميزة النسخ اليدوي `backup:export`/`backup:import` الموجودة أصلاً. راجع التفاصيل الكاملة ضمن قسم "النسخ الاحتياطي" و`src/pages/Settings.tsx` أعلاه.

**تحديث 2026-07-01 (٣):** ثلاثة تعديلات إضافية غير مرتبطة بالنسخ الاحتياطي:
1. **أيقونة تطبيق مخصّصة:** استُبدلت أيقونة Vite/Electron الافتراضية بأيقونة `icon.png` مخصّصة، مع أيقونات تعبئة مخصّصة (`build/icon.icns`/`.ico`/`.png`) لكل من mac/win/linux في `electron-builder.json5`. تم حذف ملفات SVG الافتراضية القديمة (`public/vite.svg`, `public/electron-vite.svg`, `public/electron-vite.animate.svg`).
2. **خط Tajawal محلي:** استُبدل تحميل الخط من Google Fonts CDN (في `index.html` وفي `printPdf.ts`) بحزمة npm محلية `@fontsource/tajawal` — مستوردة في `src/index.css` وكـ CSS نصّي مُحقَن مباشرة في `printPdf.ts` (`?inline` imports). يجعل التطبيق ونوافذ الطباعة تعمل بدون اتصال إنترنت.
3. **حُذفت دالة `addMaintenanceItem`** (وقناة `maintenance:addItem` المقابلة) من `src/db/maintenance.ts`/`ipc-handlers.ts`/`dbService` لعدم استخدامها — كانت مخصّصة لإضافة بند واحد لفاتورة صيانة موجودة دون فتح نموذج التعديل الكامل، لكن لم تُستدعَ من أي واجهة.

**تحديث 2026-07-01 (٤) — المرحلة 1 من خطة تحسينات الأمان:** إضافات أمنية بحتة، بدون حذف أو تعطيل أي ميزة/سلوك حالي:
1. **كلمة السر أصبحت hash** (`bcryptjs`) مخزَّن في `app_settings` بدل ثابت نصي `APP_PASSWORD`، والتحقق منها انتقل بالكامل إلى الـ main process عبر قنوات `auth:*` جديدة (`electron/auth.ts`) — الـ Renderer لم يعد يقارن كلمة السر محلياً إطلاقاً. كلمة السر الحالية `garage2026` تستمر بالعمل تلقائياً (بذرة أول تشغيل)، وتصبح قابلة للتغيير من شاشة إعدادات جديدة "تغيير كلمة السر".
2. **قفل تلقائي عند الخمول** (`src/utils/useAutoLock.ts`، افتراضي 10 دقائق، قابل للتعطيل/التعديل من الإعدادات) يُعيد عرض `PasswordGate` تلقائياً.
3. **قفل مؤقت متصاعد** عند 5 محاولات كلمة سر خاطئة متتالية (30 ثانية ← دقيقة ← 5 دقائق)، يصمد أمام إعادة تشغيل التطبيق (مخزَّن في `app_settings` لا في الذاكرة).
4. **سجل نشاط** جديد (جدول `activity_log`) يوثّق تلقائياً كل عملية تعديل/حذف حساسة (نفس نطاق `ConfirmDialog`)، معروض للقراءة فقط في الإعدادات.
5. **ضمان atomic كامل:** `maintenance:add/update` و`directSale:add/update` أصبحت مغلَّفة بـ transaction خارجي واحد يضمّ كتابة الفاتورة ومزامنة الكفالات معاً (بالاستفادة من دعم better-sqlite3 التلقائي لتداخل transactions عبر SAVEPOINT، دون أي تعديل على `src/db/maintenance.ts`/`direct-sale.ts`).
6. **تشفير قاعدة البيانات بالكامل (SQLCipher) أُجِّل عمداً** لمرحلة مستقلة لاحقة — راجع "غير مكتمل / قيود معروفة" أعلاه للتفاصيل والسبب.

راجع التفاصيل الكاملة ضمن قسم "الأمان (`electron/auth.ts`)" في الـ Backend، وقسم "الأمان وكلمة السر" آخر الملف.

**تحديث 2026-07-02 — تقرير/تنبيه الشيكات المستحقة قريباً:** ميزة قراءة فقط بالكامل، بدون أي تعديل على بنية أي جدول موجود ولا على أي قناة IPC أو سلوك سابق:
1. **قناة IPC جديدة `cheques:getUpcoming(daysAhead?)`** (`electron/ipc-handlers.ts`) تستدعي `getUpcomingCheques(daysAhead)` من ملف جديد `src/db/cheques.ts` — UNION ALL لست جمل SELECT عبر جداول الشيكات الأربعة الموجودة أصلاً (`payment_cheque`, `debt_payment_cheque`, `supplier_payment_cheque`, `supplier_debt_cheque`) بالاعتماد فقط على حقل `cash_date` الموجود فيها، بدون أي `ALTER TABLE` أو migration.
2. **أنواع جديدة:** `UpcomingChequeRow`/`UpcomingChequeKind` (DB، snake_case) في `src/db/types.ts`، و`UpcomingCheque`/`UpcomingChequeSource` (واجهة، camelCase) في `src/store/GarageContext.tsx` — مع دالة تحويل `dbRowToUpcomingCheque` جديدة في `dbMapper.ts` ودالة خدمة `dbService.cheques.getUpcoming` جديدة في `src/services/db.ts` (بنفس نمط `dbRowToSaleInvoice`/`dbRowToPurchaseInvoice` للعروض المجمّعة القراءة-فقط).
3. **قسم جديد "الشيكات المستحقة قريباً"** في `src/pages/CashLedger.tsx` أسفل "سجل العمليات" مباشرة — فلتر مدى 7/14/30 يوماً بنفس تبويبات `pd-type-tabs`/`pd-tab` المستخدمة أصلاً في `PendingDebts.tsx`، وتلوين عمود "الأيام المتبقية" بنفس أصناف badge الموجودة (`mi-badge-red` ≤3 أيام، `mi-badge-yellow` ≤7 أيام، `mi-badge-green` غير ذلك) — لم تُضَف أي أصناف CSS جديدة في `App.css`/`index.css`.
4. لا إجراءات تعديل/حذف في هذا القسم؛ التعديل على أي شيك يبقى من صفحته الأصلية (الصيانة/البيع المباشر/الموردين) كما كان.

**تحديث 2026-07-02 (٢) — تبويب "أعمار الديون" في Reports.tsx:** ميزة قراءة فقط بالكامل، بدون أي تعديل على قنوات أو صفحات موجودة (بما فيها تبويب "تقرير الديون" الحالي، الذي بقي كما هو تماماً):
1. **قناة IPC جديدة `report:debtsAging`** (`electron/ipc-handlers.ts`) تستدعي `getDebtsAging()` الجديدة في `src/db/reports.ts` — UNION ALL موحّد لثلاث جمل SELECT (maintenance_invoices + direct_sale_invoices + supplier_invoices، كلها WHERE amount_remaining > 0) في صف واحد لكل دين بدل مصفوفتين منفصلتين (خلافاً لـ `getDebtReport` الموجودة، التي بقيت بلا أي تعديل). `days_old` محسوب بفارق تقويمي صرف (`julianday(date('now','localtime')) - julianday(invoice_date)`، بنفس فلسفة `cheques.ts`/`warranty.ts`)، ثم يُصنَّف عبر دالة داخلية `agingBucket()` إلى 4 شرائح: `'0-30' | '31-60' | '61-90' | '90+'`.
2. **أنواع جديدة في `src/db/types.ts`:** `DebtAgingRow`, `DebtAgingKind`, `DebtAgingBucket` — قراءة فقط، بلا نظير UI/دالة تحويل في `dbMapper.ts`/`GarageContext.tsx` (بنفس فلسفة `DebtReport`/`TopCustomer` الموجودتين، اللتين لا نظير UI لهما أيضاً)؛ الصفحة تستهلك النوع DB مباشرة.
3. **`dbService.report.debtsAging()`** جديدة في `src/services/db.ts` (بجانب `daily`/`monthly`/`debts`/`topCustomers` في نفس الكائن `report`).
4. **تبويب سادس "أعمار الديون"** في `src/pages/Reports.tsx` (`Tab` أصبح يشمل `'debts_aging'`) — 4 بطاقات `stat-card` لكل شريحة (عدد + إجمالي المتبقي، محسوبة محلياً بـ `.filter()` من نفس المصفوفة المحمّلة، بدون طلبات IPC إضافية)، وجدول واحد موحّد بعمود "الشريحة العمرية" (badge: أخضر/أصفر/برتقالي/أحمر لكل شريحة على الترتيب) وعمود "النوع" (badge: `mi-badge-orange`/`mi-badge-blue`/`mi-badge-purple`). الترتيب حسب "عدد الأيام" قابل للتبديل تصاعدي/تنازلي بالضغط على رأس العمود (تنازلي هو الافتراضي — الأقدم أولاً)، ويتم بالكامل في الواجهة (`useMemo` + state محلي `agingSort`) دون إعادة الجلب من القناة.
5. **طباعة وتصدير CSV** لهذا التبويب أُضيفا بنفس نمط بقية التبويبات (`printPdf()`/`exportToCsv()`) — زر تصدير CSV ظهر تلقائياً دون أي تعديل على شرط إظهاره (`tab !== 'top_customers'`).

**تحديث 2026-07-02 (٣) — رقم فاتورة منسّق (`invoice_number`):** تعديل حساس على بيانات موجودة، نُفِّذ بحذر شديد وبالاعتماد الكامل على نمط migrations الموجود مسبقاً (نفس `ALTER TABLE ... ADD COLUMN` + `try/catch` يتجاهل `duplicate column name` المُستخدَم لـ `daily_wage`/`salary_payments`). لا حذف ولا تعديل لعمود `id` الداخلي في أي جدول — `invoice_number` إضافة موازية للعرض فقط.

1. **قرار الترقيم (مطلوب توثيقه صراحةً):** فواتير الصيانة (`maintenance_invoices`) والبيع المباشر (`direct_sale_invoices`) تشتركان بتسلسل **واحد** بالبادئة `INV` (`src/db/invoiceNumber.ts → SALES_INVOICE_NUMBER_TABLES`) بدل عدّاد منفصل لكل جدول — لأنهما تُعرضان أصلاً مجتمعتين كفاتورة بيع واحدة في `SalesInvoices.tsx`، وعدّادان منفصلان بنفس البادئة كانا سيُنتجان نفس الرقم على فاتورتين مختلفتين تماماً (يُفقد الرقم صفة "معرّف فريد"). فواتير الموردين تستخدم بادئة `PUR` بتسلسل مستقل تماماً (`PURCHASE_INVOICE_NUMBER_TABLES`). الصيغة: `{PREFIX}-{سنة}-{تسلسل 4 خانات معاد للصفر كل سنة}`.
2. **عمود جديد `invoice_number TEXT`** في `maintenance_invoices`/`direct_sale_invoices`/`supplier_invoices` عبر 3 أسطر `ALTER TABLE` جديدة في `src/database.ts → initDB()`.
3. **تعبئة رجعية (`backfillInvoiceNumbers()` في `src/database.ts`):** تُستدعى مرة واحدة بعد حلقة الـ migrations؛ لكل مجموعة (`INV` = صيانة+بيع مباشر مجتمعين، `PUR` = موردون) تُرقَّم كل الصفوف بلا رقم (`invoice_number IS NULL`) بترتيب زمني صرف حسب `created_at ASC` **عبر كل جداول المجموعة معاً** (وليس كل جدول على حدة، لتفادي التكرار)، والسنة المستخدمة في كل رقم هي سنة تاريخ الفاتورة نفسه لا سنة الإدخال. آمنة لإعادة التشغيل (no-op إذا لم يتبقَّ أي صف بلا رقم) — تحقّق يدوياً عبر محاكاة قاعدة بيانات تجريبية ببيانات موزّعة على سنتين: النتائج صحيحة ومتطابقة، ومطابقة تماماً عند إعادة تشغيل الـ backfill مرتين (idempotent) وعند إعادة تشغيل الـ `ALTER TABLE` migrations (لا رمي أخطاء).
4. **التوليد عند الإضافة (`src/db/invoiceNumber.ts → nextInvoiceNumber()`):** يُستدعى من داخل نفس `db.transaction()` الذي يضمّ `INSERT` الفاتورة في `addMaintenanceInvoice`/`addDirectSaleInvoice`/`addSupplierInvoice` — يبحث عن أعلى تسلسل مستخدم لنفس السنة **الحالية وقت الإضافة** (`new Date().getFullYear()`، وليس تاريخ الفاتورة الذي قد يُدخله المستخدم بأثر رجعي) ثم يزيده بـ 1؛ يبدأ من `0001` تلقائياً عند أول فاتورة في سنة جديدة. تحقّق يدوياً بمحاكاة إضافات متتالية عبر سنتين مختلفتين: الترقيم تسلسلي صحيح ويُعاد الصفر عند تغيّر السنة.
5. **العرض:** عمود "رقم الفاتورة" (أول عمود) + حقل بحث إضافي في Fuse.js + أول حقل في مودال التفاصيل + عنوان الإيصال المطبوع، في `MaintenanceInvoices.tsx`، `DirectSales.tsx`، `SalesInvoices.tsx` (بما يشمل إصلاح ترويسة مودال التفاصيل وتسمية الحقل في `printInvoice()` اللذين كانا يعرضان `id` الداخلي تحت تسمية "رقم الفاتورة" خطأً)، و`Suppliers.tsx`. في `PurchaseInvoices.tsx` أُصلح فقط تسمية "رقم الفاتورة" في إيصال الطباعة لتستخدم `invoiceNumber` الحقيقي لصفوف الموردين (تبقى `#{id}` للمصاريف/الرواتب التي لا رقم فاتورة حقيقياً لها) دون إضافة عمود جدول جديد لتفادي عمود شبه فارغ لبقية الأنواع.
6. **أنواع جديدة/مُعدَّلة:** `invoice_number` أُضيف لـ `MaintenanceInvoiceRow`/`DirectSaleRow`/`SupplierInvoiceRow`/`SaleInvoiceRow`/`PurchaseInvoiceRow` (`src/db/types.ts`)، و`invoiceNumber` لـ `CarRecord`/`SaleRecord`/`SupplierRecord`/`SaleInvoice`/`PurchaseInvoice` (`src/store/GarageContext.tsx`) مع تحديث دوال التحويل المقابلة في `dbMapper.ts` وقناتي `salesInvoice:getAll`/`purchaseInvoice:getAll` في `ipc-handlers.ts`.

**تحديث 2026-07-02 (٤) — خصم على مستوى الفاتورة (صيانة + بيع مباشر):**
1. **عمودان جديدان** `discount_type TEXT` (`'fixed'`/`'percentage'`/NULL) و`discount_value REAL DEFAULT 0` في `maintenance_invoices` و`direct_sale_invoices` عبر 4 أسطر `ALTER TABLE` جديدة في `src/database.ts` (نفس نمط migrations الموجود؛ السجلات القديمة تبقى بلا خصم — `NULL`/`0`). الخصم على مستوى الفاتورة كاملة وليس البند الفردي (تبسيط مقصود).
2. **منطق مركزي `src/db/discount.ts → applyDiscount(subtotal, type, value)`:** fixed يُطرح كما هو، percentage نسبة من مجموع البنود؛ يرمي خطأً عربياً عند القيم غير الصالحة (سالبة / نسبة > 100 / مبلغ > المجموع) كحماية أخيرة في main process. **`total_amount` يُخزَّن دائماً بعد الخصم** و`amount_remaining` يُحسب منه — لا تغيير على منطق الدفعات/الديون/الصندوق (كلها تعتمد `total_amount` أصلاً).
3. **إعادة الحساب:** `updateMaintenanceInvoice` يعيد حساب الإجمالي/المتبقي من بنود الجدول الفعلية عند تغيّر البنود أو الخصم؛ `recalcDirectSaleTotals()` الجديدة في `direct-sale.ts` تُستدعى من `updateDirectSaleItems` ومن قناة `directSale:update` (التي أصبحت تكتب حقلَي الخصم عند تمريرهما). في تعديل البيع المباشر يُمرَّر الخصم الجديد مع البنود الجديدة إلى `directSale:updateItems` (وسيط ثالث اختياري) ليُطبَّقا ذرّياً في transaction واحد — لا يُقيَّم الخصم الجديد مقابل البنود القديمة أبداً.
4. **اصطلاح `undefined` مقابل `null`:** في مدخلات التعديل `undefined` = لا تغيير على الخصم المخزَّن (شاشتا `SalesInvoices.tsx`/`PendingDebts.tsx` تعدّلان الفاتورة دون معرفة خصمها فلا تمحوه)، و`null` = إزالة الخصم. محفوظ عبر `dbMapper.ts` (`carToUpdateInput`/`saleToDbInput`).
5. **الواجهة:** في `MaintenanceInvoices.tsx`/`DirectSales.tsx` أسفل جدول البنود مباشرة: "المجموع قبل الخصم" + dropdown نوع الخصم + حقل قيمة + **عرض حي "الإجمالي بعد الخصم"** (نفس أسلوب صندوق "صافي الراتب" الأخضر في `Employees.tsx`)، مع validation (نسبة 0-100، ثابت ≤ مجموع البنود). ملخّص الدفع في البيع المباشر واشتقاق الحالة يعتمدان الإجمالي بعد الخصم.
6. **العرض:** مودال التفاصيل والإيصال المطبوع في الصفحتين يعرضان عند وجود خصم تسلسل "المجموع قبل الخصم" / "الخصم" / "الإجمالي بعد الخصم" (بدل "الإجمالي الكلي")؛ المجموع قبل الخصم يُشتق من البنود عند توفّرها (`getOne` في الطباعة) أو عكسياً من الإجمالي المخصوم (صفوف GarageContext لا تحمل البنود) عبر `discountBreakdown()`/`discountBreakdownDS()` المحليتين.
7. **أنواع:** `DiscountType` جديد في `src/db/types.ts` و`GarageContext.tsx`؛ `discount_type`/`discount_value` في `MaintenanceInvoiceRow`/`DirectSaleRow` + المدخلات، و`discountType?`/`discountValue?` في `CarRecord`/`SaleRecord`، مع تحديث `dbMapper.ts` بالاتجاهين.

**تحديث 2026-07-02 (٥) — إحصاء نهاية اليوم حسب طريقة الدفع + رسائل Toast + حمايات إدخال:** دفعة تحسينات على واجهة الاستخدام وسلامة البيانات، بلا كسر لأي بنية قائمة.

1. **إحصاء نهاية اليوم مقسّماً كاش/فيزا/شيك (`daily_cash_audits` + `CashLedger.tsx`):**
   - ثلاثة أعمدة جديدة `actual_cash`/`actual_visa`/`actual_check REAL NOT NULL DEFAULT 0` عبر `ALTER TABLE` في `src/database.ts` (نفس نمط migrations؛ السجلات القديمة تبقى بـ 0). `actual_amount` يبقى الإجمالي الكلي (= مجموع الثلاثة).
   - قناة جديدة `cashAudit:getSystemBreakdown(date)` ترجع `{cash, visa, cheque}` كصافي (وارد − صادر) لكل طريقة محسوباً **مباشرة من جداول الدفعات** لا من `cash_ledger`: الوارد من `payments`+`debt_payments` حسب `method`، والصادر من `supplier_payments`+`supplier_debt_payments` حسب `method` إضافةً إلى `daily_expenses`+`salary_payments` (كلاهما يُعامَل كـ**كاش صادر** بالكامل). نوع جديد `CashSystemBreakdown` في `src/db/types.ts`.
   - الواجهة: ثلاثة حقول فعلي منفصلة + جدول مقارنة ثلاثي (نظام/فعلي/فرق) لكل طريقة بالإضافة للإجمالي، مع تلوين الفرق.
   - قناة جديدة `cashAudit:delete(id)` + أزرار **تعديل/حذف** في جدول سجل الإحصاءات اليومية.

2. **رسائل الخطأ (Toast) بدل `alert()`:** `showError()` في `src/utils/notify.ts` صار يُطلق `window.dispatchEvent(new CustomEvent('app-error', {detail}))` بدل `alert()` الذي كان يُجمّد نافذة Electron. مكوّن جديد `src/components/ErrorToast.tsx` (مُركَّب في `App.tsx` داخل `GarageProvider`) يستمع للحدث ويعرض toasts حمراء أسفل الشاشة تختفي تلقائياً بعد 8 ثوانٍ (مع زر إغلاق يدوي) وتدعم أسطراً متعددة. `ConfirmDialog` صار كذلك يعرض رسائله بـ `whiteSpace: pre-line`.

3. **حماية تجاوز المتبقي في الدفعات:** `addPayment` (كل الفواتير) و`releaseMaintenanceCar` (دفعة التسليم) يرفضان الآن — داخل الـ transaction — أي مجموع دفعات (عدا طريقة `debt`) يتجاوز `amount_remaining` الحالي (هامش تسامح `0.001`) ويرميان خطأً عربياً يبيّن مجموع الدفعة والمتبقي. *(لاحقاً وُحِّدت هذه الحماية لتشمل كل قنوات الدفع الخمس — تحصيل ديون الزبائن ودفعات/ديون الموردين أيضاً — راجع "تحديث 2026-07-02 (١٥)".)*

4. **منع إدخال تواريخ مستقبلية (`useDateClampGuard` في `App.tsx`):** hook عام يُركَّب مرة واحدة على مستوى التطبيق، يلتقط أحداث `change`/`blur` (capture) لأي `<input type="date">` له `max`، فإن تجاوزت قيمته `max` يعيدها إلى `max` عبر setter الأصلي لـ `HTMLInputElement.value` ويُطلق حدث `input` — يحمي حقول التاريخ من الإدخال اليدوي (الكيبورد) لتاريخ لاحق دون الحاجة لتعديل كل شاشة على حدة.

5. **migrations أخرى:** أُضيف أيضاً عبر `ALTER TABLE` في `src/database.ts` عمودا `invoice_items.warranty TEXT` و`invoice_items.part_type TEXT NOT NULL DEFAULT 'part'` (توثيق للأعمدة التي كان الكود يكتبها/يقرأها أصلاً وضماناً لوجودها في القواعد القديمة).

**تحديث 2026-07-02 (٦) — إثراء تفاصيل الفواتير في الشاشات المجمّعة (ديون/كفالات/فواتير بيع/فواتير شراء):** تعديل **عرض بيانات فقط (read paths)** — لا كتابة، لا لمس لأي عمود موجود، لا تغيير على منطق التعديل/الحذف/ConfirmDialog. الشاشات التي تعرض بيانات مُجمَّعة (UNION) من عدة مصادر لم تكن تسحب كامل أعمدة الفاتورة المصدر في استعلامها، فمودالات تفاصيلها كانت تُخفي حقولاً موجودة أصلاً في القاعدة.

**المبدأ المتَّبع — كل حقل حسب مصدره فقط (لا حقول وهمية):** الحقول تُعرض فقط عندما تكون منطقية للمصدر، وتُخفى تماماً (شرط `{field && …}`) لا تُعرض فارغة أو "—" حين لا تنطبق:
- **maintenance (صيانة):** `car_plate` / `car_type` / `car_color` / `notes` / `date_released` / `status` — كلها موجودة أصلاً في `maintenance_invoices`.
- **direct_sale (بيع مباشر):** لا سيارة إطلاقاً — فقط `notes` (وحقول السيارة تُمرَّر `NULL`/`''` في فروع UNION المقابلة لتطابق الأعمدة كما تتطلب SQLite).
- **supplier / expense / salary (فواتير الشراء):** `supplier_phone` و`notes` كانا **معروضين أصلاً** في `PurchaseInvoices.tsx` (عبر `phone` و`details`) — لذا لم تلزم أي تعديلات على هذه الشاشة.
- **manual warranty (`source_id=0`):** تبقى `car_type`/`car_color` = `NULL` (لا مصدر فاتورة).

1. **الديون المعلقة (`getPendingDebts` في `src/db/payments.ts` + `PendingDebts.tsx`):** أُضيف `car_plate`/`car_type`/`car_color`/`notes` لكلا فرعي UNION (صيانة حقيقية، بيع مباشر `NULL` لحقول السيارة و`notes` حقيقية). أنواع: `PendingDebt` (اختيارية، تشمل `car_plate`) + `DebtRecord` (`carPlate` موجود أصلاً + `carType?`/`carColor?`/`notes?`) + `pendingDebtToRecord` (`carPlate: d.car_plate ?? ''`). عمود «نمرة السيارة» في الجدول والمودال والإيصال المطبوع يعرض نمرة/نوع/لون السيارة **فقط عند `type==='maintenance'`** (خلية الجدول تبقى فارغة للبيع المباشر لا "—")، والملاحظات بلا شرط نوع. **تصحيح لاحق (2026-07-02):** `car_plate` كان مفقوداً من استعلام الصيانة رغم وجود `car_type`/`car_color`، فكانت النمرة تظهر فارغة/"—" دائماً — أُكمِل سحبها في هذا التحديث.
2. **الكفالات (`warranties` + `Warranties.tsx`):** عمودان جديدان `car_type`/`car_color TEXT` في جدول `warranties` عبر `ALTER TABLE` في `src/database.ts` (نفس نمط migrations). `syncWarrantiesForMaintenance` يجلب `car_type`/`car_color` من الفاتورة ويكتبهما في كل سجل كفالة؛ `syncWarrantiesForDirectSale` يكتب `NULL` صراحةً؛ الكفالات اليدوية القديمة (`source_id=0`) تبقى `NULL` تلقائياً. **`warranty:update` لم يُعدَّل** (لا يمسّ العمودين فيُحافَظ عليهما عند تعديل الكفالة). أنواع: `WarrantyRow.car_type`/`car_color` + `WarrantyRecord.carType?`/`carColor?` + `dbRowToWarranty`. المودال والإيصال يعرضانهما عند `source==='maintenance'`.
3. **فواتير البيع (`salesInvoice:getAll` في `electron/ipc-handlers.ts` + `SalesInvoices.tsx`):** أُضيف لفرعي UNION `car_color`، و`date_released`، و`status AS car_status` (بيع مباشر: `''`/`NULL`). (`car_plate`/`car_type`/`notes` كانت موجودة أصلاً؛ و`date_received` معروض أصلاً كحقل `date`.) أنواع: `SaleInvoiceRow` (`car_color`/`date_released`/`car_status`) + `SaleInvoice` (`carColor?`/`dateReleased?`/`carStatus?`) + `dbRowToSaleInvoice`. المودال والإيصال يعرضان لون السيارة/حالة الصيانة (badge أخضر مُسلَّم / أصفر قيد الصيانة)/تاريخ التسليم **فقط عند `type==='maintenance'`**.
4. **فواتير الشراء (`PurchaseInvoices.tsx`):** لا تعديل — `supplier_phone` (عبر `phone`) و`notes` (عبر `details`) معروضان أصلاً في استعلام `purchaseInvoice:getAll` والمودال؛ لا حقول ناقصة تُضاف.

**ملاحظة SQLite:** كل فروع UNION في الاستعلامات المعدَّلة تحمل نفس عدد/ترتيب الأعمدة (بتمرير `NULL`/`''` حيث لا ينطبق الحقل). `tsc --noEmit` ينجح بعد التعديلات.

**تحديث 2026-07-02 (٧) — تعديل فواتير الصيانة كمودال popup بدل نموذج inline:** تغيير **عرض/حاوية فقط (presentation/container)** في `src/pages/MaintenanceInvoices.tsx` — لا لمس لأي منطق تعديل (validation، حساب الخصم والإجمالي بعد الخصم، الكفالات لكل بند، `dbService.maintenance.getOne`/`update`، إعادة الحساب، مزامنة الكفالات) ولا لبنية القاعدة ولا لأي قناة IPC.

1. **نموذج التعديل أصبح مودال popup** (overlay فوق الصفحة) لكل فواتير الصيانة على حد سواء (قيد الصيانة والمُسلَّمة)، بدل ظهوره inline داخل الصفحة وإبعاد باقي المحتوى. استُخدمت نفس أصناف المودالات الموجودة أصلاً بالمشروع (`mi-modal-overlay`/`mi-modal mi-modal-lg`/`mi-modal-header`/`mi-modal-body`/`mi-modal-footer`/`mi-modal-close`) بنفس نمط مودال `SalesInvoices.tsx`/`PurchaseInvoices.tsx` — بلا أي أصناف CSS جديدة. المحتوى قابل للتمرير عبر `.mi-modal-body { overflow-y: auto }` و`.mi-modal { max-height: 88vh }` الموجودَين أصلاً، فيعمل مع الفواتير الطويلة (عدة بنود + خصم).
2. **نموذج الإضافة (زر "+ إضافة سيارة جديدة") بقي كما هو تماماً** — inline داخل الصفحة (بطاقة `mi-card mi-form-card`)، غير متأثر. الفرق يُحسم بشرط `editingCar`: `showForm && !editingCar` → إضافة inline؛ `showForm && editingCar` → مودال تعديل.
3. **التنفيذ:** استُخرجت حقول النموذج المشتركة (بيانات الزبون/السيارة/التاريخ/الملاحظات + جدول البنود الكامل + الخصم + العرض الحي للإجمالي بعد الخصم) إلى متغيّر `formFields` (React fragment) يُعاد استخدامه حرفياً في كلتا الحاويتين — نفس الحقول ونفس الـ validation بالضبط. أزرار الحفظ/الإلغاء: `btn btn-primary` + (`btn btn-ghost` inline / `btn btn-secondary` في تذييل المودال) + زر إغلاق (✕) بالزاوية.
4. **`ConfirmDialog` مع كلمة السر قبل فتح مودال التعديل لم يتغيّر إطلاقاً** (نفس `warnCar`/`confirmEditCar`/`doOpenEdit`). أُزيل فقط `window.scrollTo({ top: 0 })` من `doOpenEdit` لأنه صار بلا معنى مع المودال (كان يُقفز الصفحة للأعلى قبل عرض النموذج inline).
5. **Draft (`'garage-mi-draft-v2'`) بلا تغيير:** يبقى محصوراً بحالة الإضافة فقط عبر شرط `showForm && !editingCar` في `useEffect` الحفظ — لا ينطبق على مودال التعديل. `tsc --noEmit` ينجح بعد التعديل.

**تحديث 2026-07-02 (٨) — الإضافة المباشرة من الصفحات المجمّعة + استخراج نماذج مشتركة:** تمكين إنشاء الفواتير مباشرةً من الصفحات المجمّعة (الديون المعلقة / فواتير البيع / الكفالات / فواتير الشراء) دون الانتقال لصفحة أخرى، **بإعادة استخدام نماذج الإضافة الأصلية نفسها** (لا CRUD جديد، لا قنوات IPC جديدة، لا تغيير على القاعدة/الـ schema/الخصومات/مزامنة الكفالات/الـ Ledger/ترقيم الفواتير/الأمان).

1. **استخراج النماذج إلى مكوّنات مشتركة (`src/components/forms/`):** انتُزعت نماذج الإضافة/التعديل من صفحاتها الأصلية إلى خمسة مكوّنات مشتركة — `MaintenanceForm`, `DirectSaleForm`, `SupplierInvoiceForm`, `ExpenseForm`, `SalaryForm`. كل مكوّن يملك حالته وvalidationه واستدعاء `dbService` وreload()، ويكشف `save()` عبر `forwardRef` + `useImperativeHandle` بينما تبقى أزرار الحفظ/الإلغاء في الحاوية الأم (كي لا يتغيّر أي تصميم قائم). حرفياً نفس الحقول ونفس المنطق السابق — مجرّد نقل مكان التعريف.
2. **الصفحات الأصلية تستهلك هذه المكوّنات:** `MaintenanceInvoices`/`DirectSales`/`Suppliers` (فاتورة المورد فقط)/`DailyExpenses`/`Employees` (الراتب فقط) صارت تُركِّب المكوّن المشترك للإضافة inline وللتعديل modal — فحُذفت مئات الأسطر المكرَّرة (الحالة، الـ validation، `handleSave`، جسم النموذج JSX). حقول المسودة (`garage-mi-draft-v2`/`garage-ds-draft-v2`/`garage-sup-draft`/`garage-exp-draft`) انتقلت داخل المكوّنات مع دوال `hasXDraft()`/`clearXDraft()` مُصدَّرة تستخدمها الصفحة الأصلية لاستئناف/مسح المسودة كما كان تماماً.
3. **زر الإضافة على الصفحات المجمّعة:** `AddSalesInvoiceButton` (صيانة/بيع مباشر) في `PendingDebts`/`SalesInvoices`/`Warranties`، و`AddPurchaseInvoiceButton` (مورد/مصروف/راتب) في `PurchaseInvoices` — كلاهما: زر → `SourcePickerModal` لاختيار المصدر → فتح نفس المكوّن المشترك داخل مودال بنفس أصناف المودالات الحالية. الحفظ يستدعي نفس قنوات IPC الأصلية ثم reload() (المعرَّفَين داخل المكوّن)، فتُنشأ فاتورة كاملة (بنود/دفعات/كفالات/Ledger/رقم فاتورة/خصم) تظهر تلقائياً كدين/كفالة/فاتورة حسب حالتها.
4. **لا تعارض مسودات:** المكوّنات المشتركة تُستخدم في الصفحات المجمّعة بـ `useDraft=false` فلا تكتب في مفاتيح المسودة الخاصة بصفحتي الصيانة/البيع/الموردين/المصاريف (تبقى المسودة سلوكاً حصرياً لنموذج الإضافة inline في صفحته الأصلية).
5. **الكفالات:** أُعيد زر «إضافة كفالة» (كان مُزالاً بقرار سابق) لكنه لا يُدرج في جدول `warranties` مباشرةً ولا يستخدم `source_id=0` — بل يفتح نموذج فاتورة صيانة/بيع مباشر، والكفالة تُنشأ عبر منطق المزامنة التلقائية الحالي دون تعديل. نموذج **تعديل** كفالة قائمة في `Warranties.tsx` (`warranty:update`) لم يتغيّر.
6. **إضافات طفيفة:** سكربت `typecheck` (`tsc --noEmit`) في `package.json`. `npm run typecheck` و`npm run build` (بما فيه electron-builder) ينجحان.

**تحديث 2026-07-02 (٩) — عمود "الإجمالي" المحسوب حياً في جدول بنود نموذجَي الصيانة والبيع المباشر:** تعديل **عرض/واجهة بحت (presentation only)** — لا عمود جديد في `invoice_items`، لا تعديل على القاعدة/الـ schema/الأنواع/قنوات IPC/منطق الحفظ أو إعادة الحساب. مجرّد خلية عرض مشتقة من قيمتين موجودتين أصلاً في حالة النموذج.

1. **الفورمان (`src/components/forms/MaintenanceForm.tsx` و`DirectSaleForm.tsx`):** أُضيف عمود جديد "الإجمالي (₪)" في جدول البنود بعد عمود "سعر الوحدة" مباشرة، يعرض لكل بند حاصل **الكمية × سعر الوحدة** ويُحسب ويُعرض حياً أثناء الكتابة عبر نفس القيم الموجودة في حالة الصف (`qty`/`unitPrice`) ودالة `fmt` الموجودة — بلا أي state جديد. في نموذج الصيانة الكمية للخدمة تُعامَل 1 (كما في بقية حساباته). القيمة معروضة فقط (`<td className="mi-td-center">`)، غير قابلة للتعديل.
2. **العلاقة بخصم الفاتورة:** مستقلّ تماماً عن خصم الفاتورة العام (`discount_type`/`discount_value` على مستوى الفاتورة كاملة) الذي لم يتغيّر إطلاقاً — هذا العمود يوضّح مجموع كل بند **قبل** تطبيق الخصم العام، بينما صفوف "المجموع قبل الخصم"/"الإجمالي بعد الخصم" أسفل الجدول تبقى كما هي.
3. **مودال التفاصيل والإيصال المطبوع (`MaintenanceInvoices.tsx`/`DirectSales.tsx`):** كانا يعرضان عمود "الإجمالي" (`item.quantity * item.unitPrice`) أصلاً في جدول البنود — لم يلزم تعديلهما (حُدِّث التوثيق فقط في قسمي الشاشتين ليطابق ذلك).
4. `tsc --noEmit` ينجح بعد التعديل.

**تحديث 2026-07-02 (١٠) — خصم على مستوى البند الفردي في فواتير الموردين:** ميزة جديدة لفواتير الموردين **فقط**، بنموذج مختلف عن خصم الفاتورة الكاملة في الصيانة/البيع المباشر (الذي لم يُلمَس إطلاقاً). هنا الخصم يخص **كل بند على حدة** في `supplier_items`، والمجموع الكلي للفاتورة = مجموع إجمالي كل بند بعد خصمه الخاص. راجع القسم المفصّل "خصم بنود فاتورة المورد" في قسم قاعدة البيانات أعلاه.

1. **القاعدة:** عمودان جديدان في `supplier_items` — `discount_type` (TEXT: `'fixed'`/`'percentage'`/NULL) و`discount_value` (REAL DEFAULT 0) — أُضيفا عبر migration بنمط `ALTER TABLE ... ADD COLUMN` مع `try/catch` يتجاهل `duplicate column name` (نفس أسلوب بقية migrations في `src/database.ts`).
2. **المنطق (`src/db/suppliers.ts`):** `calcTotal` صارت تجمع `applyDiscount(qty × unit_price, discount_type, discount_value)` لكل بند — **إعادة استخدام** `applyDiscount` من `src/db/discount.ts` بلا تكرار للمنطق. `addSupplierInvoice` يُدرج عمودَي الخصم لكل بند. أُضيفت `updateSupplierInvoice(id, input)` تعيد إدراج البنود بالكامل وتعيد حساب `total_amount` من خصومات البنود ثم `amount_remaining = total_amount − amount_paid` داخل transaction واحدة؛ قناة `supplierInvoice:update` صارت تستدعيها (بدل تحديث الترويسة فقط كما كانت سابقاً — كان تعديل البنود لا يُحفَظ أصلاً).
3. **الأنواع:** `SupplierItemInput`/`SupplierItemRow` في `src/db/types.ts`، و`SupplierItem` في `GarageContext.tsx`، ومحوّلات `supplierItemToDbInput`/`dbRowToSupplierItem` في `dbMapper.ts` — كلها أُضيف لها `discountType`/`discountValue` (snake_case في DB، camelCase في الواجهة).
4. **النموذج (`SupplierInvoiceForm.tsx`):** جدول البنود صار يحوي عمود "الإجمالي" (qty × unit_price حياً)، dropdown خصم (بدون خصم/مبلغ ثابت/نسبة %) + حقل قيمة، وعمود "بعد الخصم" لكل بند حياً. المجموع الكلي أسفل الجدول = مجموع "بعد الخصم" لكل البنود. الحسابات الحية تعيد استخدام `applyDiscount` (مغلّفة بـ try/catch للعرض)، والتحقق من القيم غير الصالحة (سالبة/نسبة > 100/ثابت > إجمالي البند) يمنع الحفظ عبر `partDiscountErr`.
5. **العرض (`Suppliers.tsx`):** مودال التفاصيل والإيصال المطبوع صارا يعرضان لكل بند: العدد، السعر، الإجمالي قبل الخصم، الخصم إن وُجد، والإجمالي بعد الخصم — مع المجموع الكلي في الأسفل (helpers `itemDiscountLabel`/`itemNetTotal` تعيدان استخدام `applyDiscount`).
6. **لم يُلمَس** خصم الفاتورة الكاملة في الصيانة/البيع المباشر ولا أي جدول/قناة أخرى. `tsc --noEmit` ينجح بعد التعديل.

**تحديث 2026-07-02 (١١) — خصم تسوية عند الدفع (`settlement_discount`):** مسار خصم/إسقاط جديد **وقت الدفع** لا يمسّ الصندوق إطلاقاً — منفصل تماماً عن خصومات الفاتورة/البند (`discount_type`/`discount_value`) التي تُطبَّق وقت إنشاء الفاتورة وتنقص `total_amount`. الغرض: المتبقّي 500، دفع الزبون 450 واتُّفِق على إسقاط 50 → `amount_remaining = 0` **بدون** تسجيل الـ 50 كنقدية داخلة. راجع القسم المفصّل "خصم تسوية عند الدفع" في قسم قاعدة البيانات أعلاه.

1. **القاعدة:** عمود `settlement_discount REAL NOT NULL DEFAULT 0` أُضيف عبر migration (`ALTER TABLE ... ADD COLUMN` مع `try/catch` يتجاهل `duplicate column name`) إلى الجداول الأربعة `payments` / `debt_payments` / `supplier_payments` / `supplier_debt_payments`، وأُضيف أيضاً إلى `electron/schema.sql` للقواعد الجديدة.
2. **المنطق:** دالة مركزية `applySettlementDiscount()` مُصدَّرة من `src/db/payments.ts` (تُدرِج صف خصم مخصّصاً `amount=0`/`method='cash'`/`notes='خصم تسوية'` وتخصم المبلغ من `amount_remaining` فقط — بلا `cash_ledger` وبلا مسّ `amount_paid`)، تُعاد استخدامها في `releaseMaintenanceCar` (`maintenance.ts`)، ونظير مكافئ داخل `insertSupplierPayments` (`suppliers.ts`، لأن جداول الموردين بلا عمود `invoice_type`). الحماية: يُرمى خطأ عربي إن كان الخصم سالباً أو إن تجاوز `الدفعات الفعلية + الخصم` المتبقّيَ (هامش `0.001`).
3. **الأماكن الخمسة (backend + IPC + services):** `addPayment`/`addDebtPayment` (`payments.ts`)، `releaseMaintenanceCar` (`maintenance.ts` عبر `ReleaseCarInput.settlementDiscount`)، `addSupplierPayment`/`addSupplierDebtPayment` (`suppliers.ts`) — كلها تقبل `settlementDiscount = 0` يمرّ عبر قنوات `directSale:addPayment`/`maintenance:deliver`/`debt:addPayment`/`supplierInvoice:addPayment`/`supplierInvoice:addDebtPayment` ودوال `services/db.ts`.
4. **الحالة (`saleStatus`):** حُدِّثت `saleStatus(total, paid, remaining?)` في `dbMapper.ts` لتشتقّ الحالة من `amount_remaining` المخزَّن عند تمريره — لأن خصم التسوية يجعل `total ≠ paid + remaining` (فبدونه كانت فاتورة مُسوّاة بالكامل ستظهر "دين جزئي" خطأً). مرِّر `amount_remaining` في `dbRowToSaleRecord`/`dbRowToSaleInvoice`/`dbRowToPurchaseInvoice`؛ السلوك للفواتير بلا تسوية لم يتغيّر (متوافق رجعياً).
5. **الواجهة:** حقل رقمي اختياري "خصم / إسقاط مبلغ (تسوية) ₪" بجانب صفوف الدفع في مودالات `PendingDebts.tsx` (تحصيل دين)، `DirectSales.tsx` (دفعة)، `MaintenanceInvoices.tsx` (تسليم)، `Suppliers.tsx` (سداد مورد) — مع سطر حيّ "خصم تسوية" و"المتبقي بعد الدفعة والخصم". قناتا القراءة `payments:getByInvoice`/`supplierPayments:getByInvoice` تُعيدان الآن `settlement_discount`، والإيصالات المطبوعة تفصل الدفعات النقدية (`amount > 0`) عن سطر "خصم تسوية" (مجموع `settlement_discount`).
6. **لم يُلمَس** حساب `cash_ledger` ولا `balance_after` ولا خصومات الفاتورة/البند القائمة. `tsc --noEmit` ينجح بعد التعديل.

**تحديث 2026-07-02 (١٢) — نمرة السيارة (`car_plate`) كوسيلة ربط وبحث رئيسية إضافية:** جعل نمرة السيارة وسيلة ربط/بحث بنفس مستوى أهمية رقم الهاتف الحالي، **دون أي تغيير على بنية قاعدة البيانات** (لا migration، لا عمود جديد، لا مسّ بأي مفتاح داخلي `id`). تعديل واجهة/منطق عرض بحت في طبقة React.

1. **دالة جديدة `getLinkedOpsByPlate(carPlate, currentSource, currentId)` في `src/store/GarageContext.tsx`:** نظير `getLinkedOps` الحالي (بالهاتف) لكن الربط بنمرة السيارة. المقارنة تجري بعد إزالة الفراغات وتوحيد حالة الأحرف. **قيد مهم موثّق في اسم/تعليق الدالة:** فواتير البيع المباشر (`direct_sale_invoices`) **لا تحمل عمود `car_plate`** في القاعدة (`SaleRecord` بلا `carPlate`)، لذا لا يمكن ربطها بالنمرة — تبحث الدالة فعلياً في فواتير الصيانة (`maintenance_invoices`) والكفالات المرتبطة (`warranties.car_plate` — تُملأ للصيانة فقط؛ كفالات البيع المباشر واليدوي بنمرة فارغة فلا تُطابق). صفوف الكفالة بلا إجمالي مالي (`total = 0`) وحالتها سارية/منتهية عبر `calcEndDate`/`daysRemaining` المعادة استخدامها من `src/utils/warranty.ts`. أُضيفت الدالة إلى `GarageContextType` وقيمة الـ Context ومصفوفة اعتماديات `useMemo`.

2. **مودال تفاصيل فاتورة الصيانة (`src/pages/MaintenanceInvoices.tsx`):** أُضيف مكوّن `LinkedOpsByPlateSection` (نسخة موازية لـ `LinkedOpsSection`) يعرض قسم **"عمليات سابقة لهذه السيارة"** بجانب القسم القائم **"عمليات سابقة لهذا الزبون"** (بالهاتف) — **كلاهما يظهران معاً، والقسم القديم لم يُحذف**. يُمرَّر `carPlate={detailsCar.carPlate}`.

3. **نمرة السيارة كمفتاح بحث Fuse.js حيثما نقص:** أُضيف `carPlate` (بعد `normalizeAr`) إلى `fuseItems` و`keys` في `Warranties.tsx` و`PendingDebts.tsx` و`SalesInvoices.tsx`. (`MaintenanceInvoices.tsx` و`DirectSales.tsx` تستخدمان `customerName`+`invoiceNumber` في Fuse أصلاً؛ والبيع المباشر بلا نمرة.)

4. **فلتر النمرة المباشر في `MaintenanceInvoices.tsx` (تحقّق، بلا تغيير):** فلتر النمرة القائم داخل `applySectionFilters` يعمل بمطابقة **مباشرة exact/partial** عبر `normalizeAr(c.carPlate).includes(normalizeAr(plate))` — مستقلّ تماماً عن بحث Fuse الضبابي، فيلتقط أي تطابق جزئي/تام مباشر للنمرة. لم يلزم تعديله.

5. **بلا مسّ للقاعدة/القنوات/الأنواع الأساسية:** لا تغيير على `schema.sql` ولا migrations ولا قنوات IPC ولا `id`؛ `car_plate` وسيلة ربط/بحث إضافية فقط. `tsc --noEmit` ينجح بعد التعديل.

---

**تحديث 2026-07-02 (١٣) — 4 بطاقات ملخّص اليوم في الصندوق الرئيسي (إيرادات/مصاريف/موردين/رواتب):** إضافة **عرض بحتة معتمدة على تجميع قائم** — لا قناة IPC جديدة، لا تغيير على قاعدة البيانات/الـ schema/الـ migrations/الـ Ledger، ولا لمس لبطاقات الإحصاء أو منطق إحصاء نهاية اليوم القائمة. أُضيفت 4 بطاقات `stat-card` أعلى بطاقات الإحصاء في `src/pages/CashLedger.tsx`، كلها مرتبطة بنفس `selectedDate` الموجود وتتحدّث حياً معه دون أي زر.

1. **مصدر البيانات — حقول جديدة على نتيجة `report:daily` القائمة (لا قناة جديدة):** أُضيفت 4 حقول إلى واجهة `DailyReport` (`src/db/types.ts`) وإلى الكائن المُرجَع من `getDailyReport` (`src/db/reports.ts`): `today_sales_income` (= `maintenance_income + direct_sale_income`)، `today_expenses` (= `daily_expenses`)، `today_supplier_payments` (= `supplier_expenses`)، `today_salaries` (= `salaries`). كلها مشتقّة من نفس `cash_ledger` entries التي تجمّعها الدالة أصلاً لليوم المحدد حسب `reference_type` — أي `sumIn`/`sumOut` القائمة نفسها، فقط أُعيدت كحقول جاهزة للعرض. **الحقول القائمة التي تستخدمها `Reports.tsx` من نفس القناة لم تُغيَّر ولم تُحذف** (إضافة صرفة).

2. **العرض (`CashLedger.tsx`):** حالة `dayTotals` جديدة تُملأ داخل `loadDayData` من `report` بجانب `dailyNet` (نفس `Promise.all` القائم، بلا استدعاء إضافي). تُعرض في `stats-grid` مستقلة فوق بطاقات الإحصاء الخمس، بأصناف `stat-card`/`stat-label`/`stat-value` القائمة: إيرادات اليوم بلون أخضر (`#2ECC71`)، والمصاريف/الموردين/الرواتب بلون أحمر (`#E74C3C`) — نفس ألوان `cl-amount-in`/`cl-amount-out`.

3. **بلا مسّ للقائم:** بطاقات الإحصاء الخمس ومنطقها، جدول مقارنة نهاية اليوم، سجل العمليات، وسجل الإحصاءات — كلها كما هي. `tsc --noEmit` ينجح بعد التعديل.

---

**تحديث 2026-07-02 (١٤) — فلتر نطاق تاريخ (من-إلى) على فواتير الموردين في `Suppliers.tsx`:** توحيد فلاتر صفحة الموردين مع باقي الصفحات بإضافة فلتر تاريخ نطاقي كامل. **تعديل واجهة بحت في طبقة React** — لا تغيير على قاعدة البيانات ولا الـ schema ولا القنوات ولا الأنواع.

1. **الحالة السابقة:** جدول "فواتير الموردين" في `Suppliers.tsx` كان يحمل فلاتر: بحث باسم المورد/رقم الفاتورة (Fuse.js) + بحث برقم الهاتف + فلتر مبلغ الإجمالي (min-max) — **بلا أي فلتر تاريخ في الواجهة إطلاقاً** (رغم أن وثيقة الملف كانت تذكر "فلتر تاريخ" خطأً). الـ backend كان (ولا يزال) يدعم `date_from`/`date_to` في `SupplierFilters`/`getSupplierInvoices`/قناة `supplierInvoice:getAll`، لكن الصفحة لا تستدعيها بفلاتر لأنها تعتمد بيانات الـ Context وتفلتر client-side.

2. **التعديل (`src/pages/Suppliers.tsx` فقط):** أُضيف حقلا تاريخ منفصلان `filterFrom`/`filterTo` (نفس أسماء وأسلوب `DailyExpenses.tsx`) — حقلا `<input type="date">` بصنف `mi-date-input` مع `max={today()}` وقصّ أي تاريخ مستقبلي، مُدرَجان داخل `mi-date-range` قبل حقلي المبلغ. الفلترة تُطبَّق في `filteredSuppliers` عبر `s.purchaseDate >= filterFrom` و`s.purchaseDate <= filterTo`، وأُضيف الحقلان إلى `hasFilters` و`clearFilters` وإلى مصفوفة اعتماديات `useMemo`.

3. **بلا مسّ للباقي:** نموذج إضافة الفاتورة، البنود، الدفعات، دليل الموردين، والمودالات — كلها كما هي تماماً. لم يلزم أي تغيير على `src/db/suppliers.ts` ولا القنوات لأن الدعم موجود أصلاً في الـ backend والفلترة client-side مثل باقي الصفحات. `tsc --noEmit` ينجح بعد التعديل.

**تحديث 2026-07-02 (١٥) — توحيد حماية تجاوز المتبقي على كل قنوات إضافة الدفعات:** قبل هذا التحديث كانت حماية "رفض أي دفعة تتجاوز `amount_remaining`" (تحديث (٥)) مطبَّقة فقط في قناتين — `addPayment` (`src/db/payments.ts`) و`releaseMaintenanceCar` (`src/db/maintenance.ts`). أمّا بقية قنوات الدفع فكانت تسجّل الدفعة وتُنقِص `amount_remaining` إلى ما دون الصفر دون أي اعتراض (الحماية الوحيدة فيها كانت على خصم التسوية فقط، لا على مجموع الدفعة النقدية نفسه). **تعديل منطق تحقّق حساس فقط — لا تغيير على أي حساب آخر (الخصومات، الإجماليات، الـ Ledger، خصم التسوية).**

**القنوات الخمس بعد التوحيد (كلها داخل نفس الـ transaction، هامش تسامح `0.001`، ونفس الرسالة العربية `مجموع الدفعة (X ₪) يتجاوز المتبقي (Y ₪)`):**
1. `addPayment` — صيانة/بيع مباشر (`src/db/payments.ts`) — كانت موجودة، بلا تغيير.
2. `releaseMaintenanceCar` — دفعة التسليم (`src/db/maintenance.ts`) — كانت موجودة، بلا تغيير.
3. `addDebtPayment` — تحصيل ديون الزبائن (`src/db/payments.ts`) — **أُضيفت**: كانت تحسب `totalNew` وتجلب الفاتورة لكن دون التحقّق من التجاوز؛ أُضيف الشرط بعد جلب الفاتورة مباشرة.
4. `addSupplierPayment` — دفعة للمورد (`src/db/suppliers.ts`) — **أُضيفت**.
5. `addSupplierDebtPayment` — سداد دين المورد (`src/db/suppliers.ts`) — **أُضيفت**.

**آلية التنفيذ في قنوات الموردين:** أُضيفت دالة مساعدة `assertSupplierPaymentWithinRemaining(invoiceId, payments)` في `src/db/suppliers.ts` (تجلب `amount_remaining` الحالي وتقارنه بمجموع `calcPaid(payments)`)، وتُستدعى **داخل transaction** كلٍّ من `addSupplierPayment` و`addSupplierDebtPayment` **قبل** `insertSupplierPayments`. لم تُوضَع الحماية داخل `insertSupplierPayments` نفسها لأنها تُستدعى أيضاً عند **إنشاء** الفاتورة (`addSupplierInvoice`) حيث يكون `amount_remaining` محسوباً مسبقاً بعد طرح دفعات الإنشاء (فوضعها هناك كان سيرفض دفعات إنشاء مشروعة خطأً).

**التكامل مع خصم التسوية:** الترتيب في كل قناة يضمن أن **الدفعة النقدية + خصم التسوية معاً** لا يتجاوزان `amount_remaining`: أولاً يُرفض تجاوز مجموع الدفعة النقدية، ثم يُتحقَّق من خصم التسوية مقابل ما يتبقّى بعد الدفعة (`applySettlementDiscount` / الفرع النظير في `insertSupplierPayments`).

**السطح والانتشار:** كل الأخطاء تُرمى من main process وتصل المستخدم عبر `showError`/Toast (`src/utils/notify.ts`) في مواضع الاستدعاء (`PendingDebts.tsx`, `Suppliers.tsx`, …) بنفس نمط `addPayment` الحالي — لا اعتماد على `console` فقط. لم تُمسّ القنوات ولا الأنواع ولا الـ schema. `tsc --noEmit` ينجح بعد التعديل.

---

**تحديث 2026-07-03 — صفحة "الشيكات" (كل الشيكات):** ميزة **قراءة فقط بالكامل** ومنفصلة تماماً عن "الشيكات المستحقة قريباً" الموجودة في `CashLedger.tsx`/`getUpcomingCheques` (التي لم تُلمَس إطلاقاً). لا أي تعديل على بنية جداول الشيكات الأربعة (`payment_cheque`, `debt_payment_cheque`, `supplier_payment_cheque`, `supplier_debt_cheque`) ولا على أي قناة/سلوك سابق — إضافة صرفة تعتمد فقط على الحقول الموجودة فيها مسبقاً.

1. **قناة IPC جديدة `cheques:getAll(filters)`** (`electron/ipc-handlers.ts`) تستدعي دالة **جديدة** `getAllCheques(filters)` في `src/db/cheques.ts` — **بجانب `getUpcomingCheques` الموجودة، دون تعديلها**. نفس UNION ALL للجداول الأربعة وبنفس منطق `JOIN` جلب اسم الطرف، لكن **بلا قيد "قادم خلال X يوم"** — كل الشيكات بلا استثناء (الماضية والمستقبلية) — مع إضافة عمود `issue_date`، مرتّبة **تنازلياً** حسب `cash_date` (الأحدث أولاً).

2. **فلاتر SQL (`ChequeFilters`، كلها اختيارية):** `chequeNumber` (بحث جزئي `LIKE`)، `bankName` (بحث جزئي `LIKE`)، `dateFrom`/`dateTo` (على `cash_date`)، `amountMin`/`amountMax` (على `amount`) — جملة `WHERE` تُبنى ديناميكياً عبر بارامترات مُهيّأة (prepared params) لا سلاسل مُدمجة. الفلترة كلها في main process؛ الصفحة تُعيد الجلب عبر `useEffect` عند تغيّر أي فلتر.

3. **أنواع جديدة:** `ChequeRow` (= `UpcomingChequeRow` + `issue_date`) و`ChequeFilters` في `src/db/types.ts`، و`ChequeRecord` (= `UpcomingCheque` + `issueDate`) في `src/store/GarageContext.tsx` — مع دالة تحويل `dbRowToCheque` جديدة في `dbMapper.ts` (تعيد استخدام `dbRowToUpcomingCheque`) ودالة خدمة `dbService.cheques.getAll(filters)` جديدة في `src/services/db.ts` بجانب `getUpcoming`.

4. **صفحة جديدة `src/pages/Cheques.tsx`** (قراءة فقط، بلا إضافة/تعديل/حذف — أي تعديل على شيك يبقى من صفحته الأصلية): شريط فلاتر `mi-filters` (رقم الشيك/البنك/تاريخ الصرف من–إلى/المبلغ من–إلى + مسح الفلاتر) وجدول `mi-table` بأعمدة رقم الشيك/البنك/تاريخ الإصدار/تاريخ الصرف/المبلغ/الطرف/**نوع العملية** (badge: صيانة `mi-badge-orange` / بيع مباشر `mi-badge-blue` / مورد `mi-badge-purple` / دين مورد `mi-badge-red`)/**حالة الاستحقاق** (منتهي `mi-badge-gray` / اليوم `mi-badge-yellow` / قادم `mi-badge-green` حسب مقارنة `cash_date` باليوم الحالي عبر `daysRemaining`). بلا أي CSS جديد — أصناف `mi-card`/`mi-table`/`mi-badge` القائمة فقط.

5. **التنقل:** رابط "الشيكات" (أيقونة 🧾) في `src/components/Sidebar.tsx` بين "الديون المعلقة" و"الكفالات" (صار 13 رابطاً)، وRoute `/cheques` جديد في `src/App.tsx`. `tsc --noEmit` ينجح بعد التعديل.

---

**تحديث 2026-07-03 (٢) — فلتر بحث بنمرة السيارة في صفحة الديون المعلقة (`src/pages/PendingDebts.tsx`):** إضافة حقل فلتر مستقل للبحث بنمرة السيارة، بنفس أسلوب `plateSearch` الموجود في `SalesInvoices.tsx`. **تعديل واجهة/فلترة بحت في طبقة React** — لا تغيير على قاعدة البيانات ولا الـ schema ولا القنوات ولا الأنواع، ولا مسّ بمنطق الإضافة/التعديل/الحذف/الدفعات.

1. **الحالة السابقة:** كانت الصفحة تحمل فلاتر: بحث Fuse.js باسم الزبون + نمرة السيارة، بحث برقم الهاتف، تبويبات النوع (الكل/صيانة/بيع مباشر)، وفلتر مبلغ المتبقي (min-max). نمرة السيارة كانت متاحة فقط ضمن مفتاح Fuse الضبابي — بلا حقل بحث مباشر جزئي مخصّص لها. `carPlate` كانت **موجودة أصلاً** في `DebtRecord` ومملوءة من `getPendingDebts` (`src/db/payments.ts`: `car_plate` لصفوف الصيانة، `NULL` لصفوف البيع المباشر) — راجع "تحديث 2026-07-02 (١٢)"، فلم يلزم أي تعديل على المصدر.

2. **التعديل:** أُضيف حقل `plateSearch` (`<input>` بصنف `mi-search-input` ونص إرشادي "🚗 بحث بنمرة السيارة...") بجانب حقل "بحث برقم الهاتف" مباشرة. الفلترة تُطبَّق في `filteredDebts` عبر `d.carPlate.toLowerCase().includes(plateSearch.toLowerCase())` — **مطابقة جزئية مباشرة** مطابِقة لنمط `SalesInvoices.tsx`. يعمل الفلتر بالتوازي مع باقي الفلاتر (AND). أُضيف `plateSearch` إلى `hasFilters` و`clearFilters` وإلى مصفوفة اعتماديات `useMemo`.

3. **البيع المباشر يُستبعد تلقائياً:** صفوف `direct_sale` تحمل `carPlate = ''` (لا نمرة سيارة)، فأي قيمة غير فارغة في `plateSearch` تُخرجها من النتائج تلقائياً عبر `includes` — أي أن الفلتر يعمل فعلياً على ديون الصيانة فقط دون حاجة لشرط نوع صريح. `tsc --noEmit` ينجح بعد التعديل.

---

**تحديث 2026-07-03 (٣) — إظهار "خصم التسوية" (`settlement_discount`) في كل أماكن عرض تفاصيل الدفعات، لا مكان الإدخال فقط:** استكمال لتحديث (١١). قبل هذا التحديث كان خصم التسوية يظهر بوضوح **وقت الإدخال** فقط (المودالات الحيّة) وفي الإيصالات المطبوعة لكن بتغطية **ناقصة**: قنوات القراءة كانت تقرأ جدول الدفعات "الأصلي" فقط فتُخفي أي خصم تسوية سُجِّل وقت **تحصيل الدين** — وهي الحالة الأكثر شيوعاً للخصم. **تعديل مسارات قراءة/عرض بحت (read paths) — لا مساس بمنطق `amount_remaining` ولا حمايات تجاوز الدفعات ولا `cash_ledger`.**

1. **قنوات القراءة توحِّد جدولَي كل مسار (`electron/ipc-handlers.ts`):**
   - `payments:getByInvoice` صارت `UNION ALL` بين `payments` (دفعات الاستلام/التسليم) و`debt_payments` (تحصيل الدين لاحقاً) لنفس `invoice_id`/`invoice_type` — فيظهر خصم التسوية المسجَّل وقت التحصيل. كانت تقرأ `payments` فقط.
   - `supplierPayments:getByInvoice` صارت `UNION ALL` بين `supplier_payments` و`supplier_debt_payments`. كانت تقرأ `supplier_payments` فقط.
   - كلاهما ما زال يُعيد نفس الأعمدة (`method, amount, payment_date, settlement_discount`) — لا تغيير على النوع المُعاد ولا على المستدعين. المستدعون الوحيدون هما إيصالات الطباعة والـ hook الجديد.

2. **hook مشترك جديد `src/utils/useSettlementTotal.ts`:** يجلب مجموع `settlement_discount` لفاتورة مفتوحة عبر القناة المناسبة (صيانة/بيع مباشر/مورد) ويعيده رقماً (0 حين لا مودال أو لا خصم). يُستدعى في المكوّن الأعلى لكل صفحة مع الـ id للمودال المفتوح.

3. **مودالات التفاصيل تعرض سطر خصم التسوية (حين > 0):**
   - `MaintenanceInvoices.tsx` / `DirectSales.tsx` / `Suppliers.tsx`: سطر `mi-total-row` برتقالي "خصم تسوية (إسقاط — ليس نقداً): −X ₪" ضمن مجاميع المودال.
   - `PendingDebts.tsx`: صف `mi-detail-item` بوسم `mi-badge-orange` "خصم تسوية (ليس نقداً): −X ₪".
   - في كل الحالات لا يُدمج الخصم مع "المدفوع" النقدي — فتتّسق المجاميع (`الإجمالي = المدفوع + المتبقي + خصم التسوية`).

4. **إيصال الدين المعلّق (`printDebt` في `PendingDebts.tsx`):** صار غير متزامن (`async`) يجلب دفعات الفاتورة ويعرض **جدول تفصيل الدفعات النقدية + سطر "خصم تسوية"** (كان يعرض مجاميع الإجمالي/المدفوع/المتبقي فقط بلا أي تفصيل دفعات). إيصالات الصيانة/البيع المباشر/المورد كانت أصلاً تفصل خصم التسوية (تحديث ١١) والآن تشمله كاملاً بفضل الـ `UNION`.

5. **`SalesInvoices.tsx` و`PurchaseInvoices.tsx`:** لا تعرضان أصلاً أي سجل/تفصيل دفعات (مجاميع فقط)، فلا تعديل عليهما — مطابق لشرط "إن كان يعرض سجل دفعات". `tsc --noEmit` ينجح بعد التعديل.
