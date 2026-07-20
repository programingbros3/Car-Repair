PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ملاحظة M8: هذا الملف هو المصدر الكامل لبنية قاعدة بيانات جديدة. حلقة الـ
-- migrations في src/database.ts تبقى لترقية القواعد القديمة الموجودة عند العملاء
-- (أوامر ALTER فيها آمنة/idempotent — تتخطّى العمود الموجود). أي عمود يُضاف
-- مستقبلاً يجب أن يُكتب هنا وفي migrations معاً.
CREATE TABLE IF NOT EXISTS maintenance_invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number   TEXT,
    customer_name    TEXT    NOT NULL,
    customer_phone   TEXT,
    car_plate        TEXT    NOT NULL,
    car_type         TEXT,
    car_color        TEXT,
    date_received    TEXT    NOT NULL,
    date_released    TEXT,
    status           TEXT    NOT NULL DEFAULT 'in_progress',

    warranty         TEXT,
    notes            TEXT,
    discount_type    TEXT,
    discount_value   REAL    DEFAULT 0,
    total_amount     REAL    NOT NULL DEFAULT 0,
    amount_paid      REAL    NOT NULL DEFAULT 0,
    amount_remaining REAL    NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS direct_sale_invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number   TEXT,
    customer_name    TEXT    NOT NULL,
    customer_phone   TEXT,
    sale_date        TEXT    NOT NULL,
    warranty         TEXT,
    notes            TEXT,
    discount_type    TEXT,
    discount_value   REAL    DEFAULT 0,
    total_amount     REAL    NOT NULL DEFAULT 0,
    amount_paid      REAL    NOT NULL DEFAULT 0,
    amount_remaining REAL    NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS invoice_items (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id      INTEGER NOT NULL,
    invoice_type    TEXT    NOT NULL,
    item_name       TEXT    NOT NULL,
    quantity        INTEGER NOT NULL DEFAULT 1,
    unit_price      REAL    NOT NULL DEFAULT 0,
    customer_owned  INTEGER NOT NULL DEFAULT 0,
    part_type       TEXT    NOT NULL DEFAULT 'part',  -- 'part' | 'service' (للصيانة)
    warranty        TEXT,                              -- كفالة القطعة/الخدمة (للصيانة)
    notes           TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);


CREATE TABLE IF NOT EXISTS payments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id          INTEGER NOT NULL,
    invoice_type        TEXT    NOT NULL,
    payment_date        TEXT    NOT NULL,
    method              TEXT    NOT NULL,
    amount              REAL    NOT NULL,
    settlement_discount REAL    NOT NULL DEFAULT 0,  -- خصم تسوية (لا يُسجَّل في cash_ledger)
    notes               TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payment_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT    NOT NULL,
    issue_date     TEXT    NOT NULL,
    cash_date      TEXT    NOT NULL,
    bank_name      TEXT    NOT NULL,
    status         TEXT    NOT NULL DEFAULT 'pending',  -- M3: pending | cashed | bounced
    cashed_date    TEXT,                                -- تاريخ الصرف الفعلي
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS payment_visa (
    payment_id         INTEGER PRIMARY KEY,
    bank_name          TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS debt_payments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id          INTEGER NOT NULL,
    invoice_type        TEXT    NOT NULL,
    payment_date        TEXT    NOT NULL,
    method              TEXT    NOT NULL,
    amount              REAL    NOT NULL,
    settlement_discount REAL    NOT NULL DEFAULT 0,  -- خصم تسوية (لا يُسجَّل في cash_ledger)
    notes               TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- تفاصيل شيك سداد الديون
CREATE TABLE IF NOT EXISTS debt_payment_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT NOT NULL,
    issue_date     TEXT NOT NULL,
    cash_date      TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',  -- M3
    cashed_date    TEXT,
    FOREIGN KEY (payment_id) REFERENCES debt_payments(id) ON DELETE CASCADE
);

-- تفاصيل فيزا سداد الديون
CREATE TABLE IF NOT EXISTS debt_payment_visa (
    payment_id         INTEGER PRIMARY KEY,
    bank_name          TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES debt_payments(id) ON DELETE CASCADE
);


-- قائمة الموردين (دليل الموردين المتكرّرين)
CREATE TABLE IF NOT EXISTS suppliers (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    phone      TEXT,
    notes      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS supplier_invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_number   TEXT,
    supplier_name    TEXT    NOT NULL,
    supplier_phone   TEXT,
    purchase_date    TEXT    NOT NULL,  -- YYYY-MM-DD
    notes            TEXT,
    total_amount     REAL    NOT NULL DEFAULT 0,
    amount_paid      REAL    NOT NULL DEFAULT 0,
    amount_remaining REAL    NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);


CREATE TABLE IF NOT EXISTS supplier_items (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id     INTEGER NOT NULL,
    item_name      TEXT    NOT NULL,
    quantity       INTEGER NOT NULL DEFAULT 1,
    unit_price     REAL    NOT NULL DEFAULT 0,
    discount_type  TEXT,                       -- خصم على مستوى البند
    discount_value REAL    DEFAULT 0,
    notes          TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS supplier_payments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id          INTEGER NOT NULL,
    payment_date        TEXT    NOT NULL,
    method              TEXT    NOT NULL,
    amount              REAL    NOT NULL,
    settlement_discount REAL    NOT NULL DEFAULT 0,  -- خصم تسوية (لا يُسجَّل في cash_ledger)
    notes               TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE
);

-- تفاصيل شيك الموردين
CREATE TABLE IF NOT EXISTS supplier_payment_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT NOT NULL,
    issue_date     TEXT NOT NULL,
    cash_date      TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',  -- M3
    cashed_date    TEXT,
    FOREIGN KEY (payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE
);

-- تفاصيل فيزا الموردين
CREATE TABLE IF NOT EXISTS supplier_payment_visa (
    payment_id         INTEGER PRIMARY KEY,
    bank_name          TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES supplier_payments(id) ON DELETE CASCADE
);

-- سداد ديون الموردين
CREATE TABLE IF NOT EXISTS supplier_debt_payments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id          INTEGER NOT NULL,
    payment_date        TEXT    NOT NULL,
    method              TEXT    NOT NULL,
    amount              REAL    NOT NULL,
    settlement_discount REAL    NOT NULL DEFAULT 0,  -- خصم تسوية (لا يُسجَّل في cash_ledger)
    notes               TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_debt_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT NOT NULL,
    issue_date     TEXT NOT NULL,
    cash_date      TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending',  -- M3
    cashed_date    TEXT,
    FOREIGN KEY (payment_id) REFERENCES supplier_debt_payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_debt_visa (
    payment_id         INTEGER PRIMARY KEY,
    bank_name          TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES supplier_debt_payments(id) ON DELETE CASCADE
);

-- دفعة عامة لمورد: مبلغ واحد يُوزَّع على عدة فواتير غير مسدَّدة (FIFO افتراضياً).
-- التوزيع الفعلي يُسجَّل كصفوف supplier_debt_payments عادية (فتبقى دورة الصندوق
-- والشيكات وحذف الفواتير بلا أي تغيير)، وهذا الجدول ترويسة تجمعها معاً.
-- جدولان جديدان (لا أعمدة على جداول موجودة) ⇒ لا يحتاجان ALTER في migrations:
-- db.exec(schema) يعمل في كل إقلاع فيُنشئهما على القواعد القديمة أيضاً (IF NOT EXISTS).
CREATE TABLE IF NOT EXISTS supplier_bulk_payments (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    supplier_name TEXT    NOT NULL,
    payment_date  TEXT    NOT NULL,
    method        TEXT    NOT NULL,   -- cash | cheque | visa
    amount        REAL    NOT NULL,
    notes         TEXT,
    created_at    TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- توزيع الدفعة العامة: كم غطّت من كل فاتورة، مع مرجع صف الدفعة الفعلي الناتج
CREATE TABLE IF NOT EXISTS supplier_bulk_payment_allocations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    bulk_payment_id INTEGER NOT NULL,
    invoice_id      INTEGER NOT NULL,
    payment_id      INTEGER NOT NULL,   -- صف supplier_debt_payments المقابل
    amount          REAL    NOT NULL,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (bulk_payment_id) REFERENCES supplier_bulk_payments(id)  ON DELETE CASCADE,
    FOREIGN KEY (invoice_id)      REFERENCES supplier_invoices(id)       ON DELETE CASCADE,
    FOREIGN KEY (payment_id)      REFERENCES supplier_debt_payments(id)  ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_bulk_alloc_bulk ON supplier_bulk_payment_allocations(bulk_payment_id);
CREATE INDEX IF NOT EXISTS idx_bulk_alloc_inv  ON supplier_bulk_payment_allocations(invoice_id);


CREATE TABLE IF NOT EXISTS daily_expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    description  TEXT    NOT NULL,
    amount       REAL    NOT NULL,
    expense_date TEXT    NOT NULL,  
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);


CREATE TABLE IF NOT EXISTS employees (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    phone       TEXT,
    daily_wage  REAL    NOT NULL DEFAULT 0,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);


CREATE TABLE IF NOT EXISTS salary_payments (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id         INTEGER NOT NULL,
    amount              REAL    NOT NULL,
    daily_wage_snapshot REAL    NOT NULL DEFAULT 0,
    days_worked         REAL    NOT NULL DEFAULT 0,
    bonus               REAL    NOT NULL DEFAULT 0,
    deduction           REAL    NOT NULL DEFAULT 0,
    payment_date        TEXT    NOT NULL,
    notes               TEXT,
    created_at          TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (employee_id) REFERENCES employees(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS cash_ledger (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_date TEXT  NOT NULL,
    reference_type TEXT    NOT NULL,
    reference_id   INTEGER NOT NULL,
    amount_in      REAL    NOT NULL DEFAULT 0,
    amount_out     REAL    NOT NULL DEFAULT 0,
    balance_after  REAL    NOT NULL DEFAULT 0,
    method         TEXT,                        -- M9: cash | visa | cheque
    notes          TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- الكفالات (مصدرها صيانة أو بيع مباشر)
CREATE TABLE IF NOT EXISTS warranties (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    source         TEXT    NOT NULL,   -- 'maintenance' | 'direct_sale'
    source_id      INTEGER NOT NULL,
    customer_name  TEXT    NOT NULL,
    customer_phone TEXT,
    car_plate      TEXT,               -- فارغ لـ direct_sale
    car_type       TEXT,               -- صيانة فقط
    car_color      TEXT,               -- صيانة فقط
    item_name      TEXT    NOT NULL,
    start_date     TEXT    NOT NULL,   -- YYYY-MM-DD
    period_value   INTEGER NOT NULL DEFAULT 1,
    period_unit    TEXT    NOT NULL DEFAULT 'month',  -- 'week' | 'month' | 'year'
    notes          TEXT,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_maintenance_plate    ON maintenance_invoices(car_plate);
CREATE INDEX IF NOT EXISTS idx_maintenance_status   ON maintenance_invoices(status);
CREATE INDEX IF NOT EXISTS idx_maintenance_date     ON maintenance_invoices(date_received);
CREATE INDEX IF NOT EXISTS idx_direct_sale_date     ON direct_sale_invoices(sale_date);
CREATE INDEX IF NOT EXISTS idx_invoice_items_inv    ON invoice_items(invoice_id, invoice_type);
CREATE INDEX IF NOT EXISTS idx_payments_inv         ON payments(invoice_id, invoice_type);
CREATE INDEX IF NOT EXISTS idx_payments_method      ON payments(method);
CREATE INDEX IF NOT EXISTS idx_debt_payments_inv    ON debt_payments(invoice_id, invoice_type);
CREATE INDEX IF NOT EXISTS idx_supplier_inv_date    ON supplier_invoices(purchase_date);
CREATE INDEX IF NOT EXISTS idx_supplier_payments    ON supplier_payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_daily_exp_date       ON daily_expenses(expense_date);
CREATE INDEX IF NOT EXISTS idx_salary_emp           ON salary_payments(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_date          ON salary_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_ledger_date          ON cash_ledger(transaction_date);
CREATE INDEX IF NOT EXISTS idx_ledger_ref           ON cash_ledger(reference_type, reference_id);

-- إعدادات التطبيق (key/value) — تُستخدم حالياً لإعدادات النسخ الاحتياطي التلقائي
CREATE TABLE IF NOT EXISTS app_settings (
    key   TEXT PRIMARY KEY,
    value TEXT
);

-- سجل النشاط (توثيق خفيف للعمليات الحساسة — تعديل/حذف — لغرض المراجعة)
CREATE TABLE IF NOT EXISTS activity_log (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    action_type TEXT    NOT NULL,   -- 'update' | 'delete'
    entity_type TEXT    NOT NULL,   -- 'maintenance_invoice' | 'direct_sale_invoice' | ...
    entity_id   INTEGER,
    details     TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_activity_log_date ON activity_log(created_at);

CREATE TABLE IF NOT EXISTS daily_cash_audits (
    id             INTEGER PRIMARY KEY AUTOINCREMENT,
    audit_date     TEXT    NOT NULL,
    -- الأعمدة الإجمالية القديمة تبقى للتوافق (تقارير/طباعة قديمة). تُحسَب دائماً
    -- كمجموع الأعمدة المفصّلة المقابلة: system_total = system_cash+visa+check،
    -- actual_amount = actual_cash+visa+check، difference = actual_amount - system_total.
    system_total   REAL    NOT NULL,
    actual_amount  REAL    NOT NULL,
    -- الفعلي المُدخل يدوياً مقسّماً حسب طريقة الدفع
    actual_cash    REAL    NOT NULL DEFAULT 0,
    actual_visa    REAL    NOT NULL DEFAULT 0,
    actual_check   REAL    NOT NULL DEFAULT 0,
    -- النظام المحسوب لكل طريقة (لقطة مجمَّدة وقت التثبيت/القفل)
    system_cash    REAL    NOT NULL DEFAULT 0,
    system_visa    REAL    NOT NULL DEFAULT 0,
    system_check   REAL    NOT NULL DEFAULT 0,
    difference     REAL    NOT NULL,
    -- 0 = مسودة غير مؤكَّدة بعد، 1 = مُثبَّت ومقفل (لا يُعدَّل إلا عبر مسار كلمة السر)
    is_locked      INTEGER NOT NULL DEFAULT 0,
    created_at     TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_cash_audit_date ON daily_cash_audits(audit_date);

-- M7: تفرّد رقم الفاتورة داخل كل جدول — تُنشأ فهارسه في migrateUniqueInvoiceNumbers()
-- (electron/database.ts) وليس هنا. السبب: عمود invoice_number يُضاف عبر migration
-- (ALTER TABLE) الذي يُنفَّذ بعد db.exec(schema)؛ لو أنشأنا الفهرس هنا لفشل
-- db.exec على أي قاعدة قديمة (نسخة احتياطية) لا تملك العمود بعد
-- (SqliteError: no such column: invoice_number) → تعطّل الإقلاع/الاستيراد.

-- M3: فهارس على حالة الشيك لتسريع صفحة الشيكات والاستحقاق القريب
