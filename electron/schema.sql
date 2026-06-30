PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS maintenance_invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
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
    total_amount     REAL    NOT NULL DEFAULT 0,
    amount_paid      REAL    NOT NULL DEFAULT 0,
    amount_remaining REAL    NOT NULL DEFAULT 0,
    created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS direct_sale_invoices (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name    TEXT    NOT NULL,
    customer_phone   TEXT,
    sale_date        TEXT    NOT NULL,  
    warranty         TEXT,             
    notes            TEXT,
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
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id   INTEGER NOT NULL,
    invoice_type TEXT    NOT NULL,  
    payment_date TEXT    NOT NULL,  
    method       TEXT    NOT NULL, 
    amount       REAL    NOT NULL,
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS payment_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT    NOT NULL,
    issue_date     TEXT    NOT NULL, 
    cash_date      TEXT    NOT NULL, 
    bank_name      TEXT    NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS payment_visa (
    payment_id         INTEGER PRIMARY KEY,
    bank_name          TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS debt_payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id   INTEGER NOT NULL,
    invoice_type TEXT    NOT NULL,  
    payment_date TEXT    NOT NULL,  
    method       TEXT    NOT NULL, 
    amount       REAL    NOT NULL,
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);

-- تفاصيل شيك سداد الديون
CREATE TABLE IF NOT EXISTS debt_payment_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT NOT NULL,
    issue_date     TEXT NOT NULL,
    cash_date      TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
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
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL,
    item_name  TEXT    NOT NULL,
    quantity   INTEGER NOT NULL DEFAULT 1,
    unit_price REAL    NOT NULL DEFAULT 0,
    notes      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS supplier_payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id   INTEGER NOT NULL,
    payment_date TEXT    NOT NULL,
    method       TEXT    NOT NULL,  
    amount       REAL    NOT NULL,
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE
);

-- تفاصيل شيك الموردين
CREATE TABLE IF NOT EXISTS supplier_payment_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT NOT NULL,
    issue_date     TEXT NOT NULL,
    cash_date      TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
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
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id   INTEGER NOT NULL,
    payment_date TEXT    NOT NULL,
    method       TEXT    NOT NULL,
    amount       REAL    NOT NULL,
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
    FOREIGN KEY (invoice_id) REFERENCES supplier_invoices(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_debt_cheque (
    payment_id     INTEGER PRIMARY KEY,
    cheque_number  TEXT NOT NULL,
    issue_date     TEXT NOT NULL,
    cash_date      TEXT NOT NULL,
    bank_name      TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES supplier_debt_payments(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS supplier_debt_visa (
    payment_id         INTEGER PRIMARY KEY,
    bank_name          TEXT NOT NULL,
    transaction_number TEXT NOT NULL,
    FOREIGN KEY (payment_id) REFERENCES supplier_debt_payments(id) ON DELETE CASCADE
);


CREATE TABLE IF NOT EXISTS daily_expenses (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    description  TEXT    NOT NULL,
    amount       REAL    NOT NULL,
    expense_date TEXT    NOT NULL,  
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);


CREATE TABLE IF NOT EXISTS employees (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT    NOT NULL,
    phone      TEXT,
    created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
);


CREATE TABLE IF NOT EXISTS salary_payments (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id  INTEGER NOT NULL,
    amount       REAL    NOT NULL,
    payment_date TEXT    NOT NULL, 
    notes        TEXT,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
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