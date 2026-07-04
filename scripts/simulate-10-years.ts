/* ════════════════════════════════════════════════════════════════════════
   simulate-10-years.ts — مولّد بيانات محاكاة واقعية لكراج ضخم يغطّي ~10 سنوات.

   سكربت **مستقل تماماً**: يفتح better-sqlite3 مباشرةً على قاعدة معزولة يحدّدها
   متغيّر البيئة GARAGE_DB_PATH، يطبّق نفس electron/schema.sql بلا أي تعديل عليه،
   ثم يولّد بيانات منطقية متوازنة محاسبياً من 2016-01-01 حتى تاريخ اليوم بمعدّل
   لا يقلّ عن 50 معاملة يومياً. لا يستورد أي شيء من src/ ولا يمسّ قاعدة الإنتاج
   (garage.db) إطلاقاً. لا ينفّذ أي أمر git.

   التشغيل (يتطلّب better-sqlite3 مبنيّاً لـ Node — راجع scripts/README.md):
     GARAGE_DB_PATH=./scripts/preview-db/garage-simulation.db \
       node --experimental-strip-types scripts/simulate-10-years.ts

   الثوابت المحاسبية المضمونة بالبناء (يؤكّدها verify-integrity.ts):
     • cash_ledger.balance_after تراكمي متسق بالترتيب الزمني (id ASC = تاريخي).
     • لكل فاتورة: amount_paid + amount_remaining + Σ(settlement) = total_amount.
     • الشيك المعلّق/المرتدّ لا يُسجَّل نقداً في الصندوق؛ المصروف فقط يُسجَّل.
     • أرقام فواتير فريدة (INV مشترك صيانة/بيع، PUR للموردين، تسلسل سنوي).
     • لا كفالات يتيمة ولا دفعات شيك/فيزا بلا صف تفصيل.
════════════════════════════════════════════════════════════════════════ */
import { createRequire } from 'node:module'
import path from 'node:path'
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
type BetterSqlite3 = import('better-sqlite3').Database

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')

// ── مسار القاعدة المعزولة ─────────────────────────────────────────────────────
const DB_PATH = process.env.GARAGE_DB_PATH
  ? path.resolve(process.env.GARAGE_DB_PATH)
  : path.join(ROOT, 'scripts', 'preview-db', 'garage-simulation.db')

if (path.basename(DB_PATH) === 'garage.db') {
  console.error('⛔ رُفض التشغيل: GARAGE_DB_PATH يشير إلى قاعدة الإنتاج garage.db')
  process.exit(1)
}

// بناء نظيف: احذف القاعدة القديمة وملفّات WAL المرافقة قبل التوليد
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
for (const suffix of ['', '-wal', '-shm']) {
  try { fs.rmSync(DB_PATH + suffix) } catch { /* غير موجود */ }
}

const db: BetterSqlite3 = new Database(DB_PATH)
db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// تطبيق schema.sql الأصلي حرفياً (المصدر الوحيد لبنية القاعدة)
const schema = fs.readFileSync(path.join(ROOT, 'electron', 'schema.sql'), 'utf-8')
db.exec(schema)

/* ══════════════════ مولّد أرقام شبه-عشوائي مبذور (نتائج متكرّرة) ══════════════ */
let seed = 20260704
function rnd(): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
function ri(a: number, b: number): number { return a + Math.floor(rnd() * (b - a + 1)) }
function pick<T>(arr: T[]): T { return arr[ri(0, arr.length - 1)] }
function chance(p: number): boolean { return rnd() < p }
function money(a: number, b: number): number { return Math.round((a + rnd() * (b - a)) * 2) / 2 } // نصف شيكل
function round2(x: number): number { return Math.round(x * 100) / 100 }

/* ══════════════════ أدوات التاريخ (YYYY-MM-DD محليّ) ══════════════════════════ */
function ymd(dt: Date): string {
  const y = dt.getFullYear()
  const m = String(dt.getMonth() + 1).padStart(2, '0')
  const d = String(dt.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
function addDays(base: Date, n: number): Date { const x = new Date(base); x.setDate(x.getDate() + n); return x }
function daysBetween(a: Date, b: Date): number { return Math.round((b.getTime() - a.getTime()) / 86_400_000) }

/* ══════════════════ بيانات خيالية واقعية الشكل (لا أشخاص فعليون) ═══════════════ */
const FIRST_NAMES = [
  'أحمد', 'محمد', 'محمود', 'خالد', 'يوسف', 'إبراهيم', 'عمر', 'علي', 'سامي', 'وسيم',
  'رامي', 'زياد', 'باسل', 'طارق', 'نبيل', 'فادي', 'مازن', 'هاني', 'كمال', 'سليم',
  'ليلى', 'نور', 'هالة', 'ريم', 'دعاء', 'رنا', 'سلمى', 'مها', 'عبير', 'رغد',
]
const LAST_NAMES = [
  'عبد الله', 'الحسن', 'خليل', 'درويش', 'الأحمد', 'الشريف', 'قاسم', 'حمدان', 'العلي',
  'زعبي', 'الخطيب', 'سرحان', 'أبو ديّة', 'مصطفى', 'حجازي', 'نصّار', 'الطويل', 'شاهين',
  'الرجوب', 'بركات', 'عوّاد', 'صبّاح', 'الجعبري', 'أبو سنينة', 'الفرا', 'دغمش',
]
const CAR_MAKES: Record<string, string[]> = {
  'تويوتا': ['كورولا', 'كامري', 'يارس', 'هايلوكس', 'راف٤', 'لاندكروزر', 'أفانزا'],
  'هيونداي': ['أكسنت', 'إلنترا', 'توسان', 'i10', 'i30', 'سنتافي'],
  'كيا': ['ريو', 'سيراتو', 'سبورتاج', 'بيكانتو', 'سورينتو'],
  'سكودا': ['أوكتافيا', 'فابيا', 'سوبيرب'],
  'فولكسفاغن': ['غولف', 'باسات', 'بولو', 'تيغوان'],
  'فورد': ['فوكس', 'فييستا', 'ترانزيت', 'رينجر'],
  'ميتسوبيشي': ['لانسر', 'أتراج', 'باجيرو', 'L200'],
  'نيسان': ['صني', 'قشقاي', 'نافارا', 'تيدا'],
  'مرسيدس': ['C180', 'E200', 'سبرنتر', 'فيتو'],
  'بي إم دبليو': ['320i', '520i', 'X5'],
  'بيجو': ['301', '208', '3008', 'بارتنر'],
  'رينو': ['ميغان', 'كليو', 'كانجو', 'داستر'],
  'مازda': ['3', '6', 'CX5'],
  'أوبل': ['أسترا', 'كورسا', 'إنسيغنيا'],
  'شيفروليه': ['أفيو', 'كروز', 'كابتيفا'],
}
const CAR_MAKE_LIST = Object.keys(CAR_MAKES)
const COLORS = ['أبيض', 'أسود', 'رمادي', 'فضّي', 'أحمر', 'أزرق', 'بنّي', 'ذهبي', 'أخضر']

const SERVICE_ITEMS = [
  'تغيير زيت المحرك', 'تغيير فلتر الزيت', 'فحص كمبيوتر', 'برمجة كمبيوتر', 'ضبط زوايا',
  'تنظيف بخّاخات', 'صيانة فرامل', 'خراطة ديسكات', 'تغيير سير الكاتينة', 'صيانة تكييف',
  'شحن غاز مكيّف', 'صيانة كهرباء', 'إصلاح دينمو', 'إصلاح سلف', 'تبديل بوجيهات',
  'صيانة جير أوتوماتيك', 'تغيير زيت الجير', 'موازنة إطارات', 'كشف عام', 'تلحيم عادم',
]
const PART_ITEMS = [
  'فلتر هواء', 'فلتر بنزين', 'فلتر مكيّف', 'بطارية ٧٠ أمبير', 'بطارية ١٠٠ أمبير',
  'إطار ١٥"', 'إطار ١٦"', 'إطار ١٧"', 'طقم فحمات أمامي', 'طقم فحمات خلفي', 'ديسك فرامل',
  'مساحات زجاج', 'شمعات إشعال', 'سير مروحة', 'مضخة ماء', 'ثرموستات', 'كويل إشعال',
  'زيت محرك ٥w٣٠', 'زيت جير', 'ماء رادياتير', 'كبّاس تكييف', 'دينمو', 'سلف',
  'مصباح أمامي', 'مرآة جانبية', 'مقصّ علوي', 'رأس عكس', 'بلية عجل',
]
const DIRECT_SALE_ITEMS = [
  'إطار جديد', 'بطارية', 'زيت محرك ٤ لتر', 'زيت محرك ٥ لتر', 'فلتر هواء', 'فلتر زيت',
  'مساحات', 'شمعات', 'مصباح LED', 'سائل تبريد', 'معطّر سيارة', 'كفرات دواسات',
  'شاحن سيارة', 'مثلّث عاكس', 'طفّاية حريق', 'حقيبة إسعافات', 'غطاء مقاعد', 'جلد طبلون',
]
const SUPPLIER_ITEMS = [
  'كرتونة زيوت', 'دفعة إطارات', 'دفعة بطاريات', 'قطع غيار متنوعة', 'فلاتر بالجملة',
  'فحمات فرامل بالجملة', 'شمعات إشعال بالجملة', 'سيور محرّكات', 'زيوت جير', 'سوائل تبريد',
  'مصابيح وإضاءة', 'أدوات ورشة', 'قطع كهرباء سيارات', 'إكسسوارات سيارات',
]
const SUPPLIERS = [
  'شركة الأصيل لقطع الغيار', 'مؤسّسة النور للزيوت', 'مخازن الإطارات الحديثة',
  'الشرق لبطاريات السيارات', 'مركز الوفاء لكهرباء السيارات', 'التقوى لقطع الغيار الأصلية',
  'الرواد لتجارة الزيوت', 'مستودع السلام للفلاتر', 'شركة المدار للإكسسوارات',
  'الفارس لقطع غيار المحرّكات',
]
const BANKS = ['بنك فلسطين', 'البنك العربي', 'بنك القاهرة عمّان', 'البنك الإسلامي الفلسطيني', 'بنك الأردن', 'البنك الوطني']
const EXPENSE_DESCS = [
  'فاتورة كهرباء الورشة', 'فاتورة ماء', 'قرطاسية ومطبوعات', 'وقود مولّد', 'ضيافة وقهوة',
  'صيانة معدّات الورشة', 'أدوات ومستهلكات', 'إيجار المحل', 'نظافة', 'اتصالات وإنترنت',
]
const EMPLOYEE_NAMES = ['محمد سالم', 'أحمد يوسف', 'خالد نصّار', 'سامي درويش', 'وسيم قاسم', 'رامي حجازي', 'باسل شاهين', 'طارق عوّاد']

function fullName(): string { return `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}` }
function phone(): string { return `05${pick(['9', '6', '7'])}${ri(1000000, 9999999)}` }
function landline(): string { return `0${ri(2, 9)}${ri(1000000, 9999999)}` }
function plate(): string { return `${ri(10, 99)}-${ri(100, 999)}` }
function carType(): { type: string; color: string } {
  const make = pick(CAR_MAKE_LIST)
  return { type: `${make} ${pick(CAR_MAKES[make])}`, color: pick(COLORS) }
}

/* ══════════════════ حالة التوليد ══════════════════════════════════════════════ */
type Customer = { name: string; phone: string; cars: { plate: string; type: string; color: string }[] }
const customers: Customer[] = []
function makeCustomer(): Customer {
  const c: Customer = { name: fullName(), phone: phone(), cars: [] }
  const n = ri(1, 2)
  for (let i = 0; i < n; i++) { const ct = carType(); c.cars.push({ plate: plate(), ...ct }) }
  customers.push(c)
  return c
}
// زبون للفاتورة: غالباً زبون عائد (بيانات واقعية متكرّرة) وأحياناً جديد
function getCustomer(): Customer {
  if (customers.length > 0 && chance(0.72)) return pick(customers)
  return makeCustomer()
}

let chequeSeq = 1
let txnSeq = 1

// عدّادات أرقام الفواتير السنوية (INV مشترك صيانة/بيع، PUR للموردين)
const invCounter = new Map<number, number>()
const purCounter = new Map<number, number>()
function nextInv(year: number): string {
  const n = (invCounter.get(year) ?? 0) + 1; invCounter.set(year, n)
  return `INV-${year}-${String(n).padStart(4, '0')}`
}
function nextPur(year: number): string {
  const n = (purCounter.get(year) ?? 0) + 1; purCounter.set(year, n)
  return `PUR-${year}-${String(n).padStart(4, '0')}`
}

// أحداث الصندوق تُجمَّع ثم تُدرَج في النهاية مرتّبة زمنياً كي يبقى balance_after
// تراكمياً متسقاً و id ASC مطابقاً للترتيب الزمني (ما يتوقّعه عرض الصندوق وفحص السلامة).
type CashEvent = { date: string; refType: string; refId: number; in: number; out: number; method: 'cash' | 'visa' | 'cheque'; notes: string; seq: number }
const cashEvents: CashEvent[] = []
let cashSeqCtr = 0
function addCash(date: string, refType: string, refId: number, amountIn: number, amountOut: number, method: 'cash' | 'visa' | 'cheque', notes: string): void {
  cashEvents.push({ date, refType, refId, in: amountIn, out: amountOut, method, notes, seq: cashSeqCtr++ })
}

const stats = {
  maintenance: 0, directSale: 0, supplier: 0, expense: 0, salary: 0,
  payments: 0, releases: 0, debtCollections: 0, supplierDebtPays: 0,
  cheques: 0, chequesCashed: 0, chequesPending: 0, chequesBounced: 0,
  settlements: 0, warranties: 0, cashAudits: 0, floorFills: 0,
  txTotal: 0,
}

/* ══════════════════ عبارات SQL مُحضَّرة (المسارات الساخنة) ══════════════════════ */
const S = {
  maintInsert: db.prepare(`INSERT INTO maintenance_invoices
    (invoice_number, customer_name, customer_phone, car_plate, car_type, car_color,
     date_received, date_released, status, warranty, notes, discount_type, discount_value,
     total_amount, amount_paid, amount_remaining, created_at)
    VALUES (@invoice_number,@customer_name,@customer_phone,@car_plate,@car_type,@car_color,
     @date_received,@date_released,@status,@warranty,@notes,@discount_type,@discount_value,
     @total_amount,@amount_paid,@amount_remaining,@created_at)`),
  dsInsert: db.prepare(`INSERT INTO direct_sale_invoices
    (invoice_number, customer_name, customer_phone, sale_date, warranty, notes, discount_type, discount_value,
     total_amount, amount_paid, amount_remaining, created_at)
    VALUES (@invoice_number,@customer_name,@customer_phone,@sale_date,@warranty,@notes,@discount_type,@discount_value,
     @total_amount,@amount_paid,@amount_remaining,@created_at)`),
  supInsert: db.prepare(`INSERT INTO supplier_invoices
    (invoice_number, supplier_name, supplier_phone, purchase_date, notes,
     total_amount, amount_paid, amount_remaining, created_at)
    VALUES (@invoice_number,@supplier_name,@supplier_phone,@purchase_date,@notes,
     @total_amount,@amount_paid,@amount_remaining,@created_at)`),
  itemInsert: db.prepare(`INSERT INTO invoice_items
    (invoice_id, invoice_type, item_name, quantity, unit_price, customer_owned, part_type, warranty, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`),
  supItemInsert: db.prepare(`INSERT INTO supplier_items
    (invoice_id, item_name, quantity, unit_price, discount_type, discount_value, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?)`),
  payInsert: db.prepare(`INSERT INTO payments
    (invoice_id, invoice_type, payment_date, method, amount, settlement_discount, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?)`),
  debtPayInsert: db.prepare(`INSERT INTO debt_payments
    (invoice_id, invoice_type, payment_date, method, amount, settlement_discount, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?)`),
  supPayInsert: db.prepare(`INSERT INTO supplier_payments
    (invoice_id, payment_date, method, amount, settlement_discount, notes, created_at)
    VALUES (?,?,?,?,?,?,?)`),
  supDebtInsert: db.prepare(`INSERT INTO supplier_debt_payments
    (invoice_id, payment_date, method, amount, settlement_discount, notes, created_at)
    VALUES (?,?,?,?,?,?,?)`),
  chqInsert: (t: string) => db.prepare(`INSERT INTO ${t}
    (payment_id, cheque_number, issue_date, cash_date, bank_name, status, cashed_date) VALUES (?,?,?,?,?,?,?)`),
  visaInsert: (t: string) => db.prepare(`INSERT INTO ${t}
    (payment_id, bank_name, transaction_number) VALUES (?,?,?)`),
  warrantyInsert: db.prepare(`INSERT INTO warranties
    (source, source_id, customer_name, customer_phone, car_plate, car_type, car_color, item_name, start_date, period_value, period_unit, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  expInsert: db.prepare(`INSERT INTO daily_expenses (description, amount, expense_date, notes, created_at) VALUES (?,?,?,?,?)`),
  empInsert: db.prepare(`INSERT INTO employees (name, phone, daily_wage, created_at) VALUES (?,?,?,?)`),
  salInsert: db.prepare(`INSERT INTO salary_payments
    (employee_id, amount, daily_wage_snapshot, days_worked, bonus, deduction, payment_date, notes, created_at)
    VALUES (?,?,?,?,?,?,?,?,?)`),
  auditInsert: db.prepare(`INSERT INTO daily_cash_audits
    (audit_date, system_total, actual_amount, actual_cash, actual_visa, actual_check, difference, created_at) VALUES (?,?,?,?,?,?,?,?)`),
  supDirInsert: db.prepare(`INSERT INTO suppliers (name, phone, notes, created_at) VALUES (?,?,?,?)`),
  updMaint: db.prepare(`UPDATE maintenance_invoices SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ? WHERE id = ?`),
  updMaintRelease: db.prepare(`UPDATE maintenance_invoices SET date_released = ?, status = 'delivered' WHERE id = ?`),
  updDs: db.prepare(`UPDATE direct_sale_invoices SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ? WHERE id = ?`),
  updSup: db.prepare(`UPDATE supplier_invoices SET amount_paid = amount_paid + ?, amount_remaining = amount_remaining - ? WHERE id = ?`),
  updMaintRemainOnly: db.prepare(`UPDATE maintenance_invoices SET amount_remaining = amount_remaining - ? WHERE id = ?`),
  updDsRemainOnly: db.prepare(`UPDATE direct_sale_invoices SET amount_remaining = amount_remaining - ? WHERE id = ?`),
  updSupRemainOnly: db.prepare(`UPDATE supplier_invoices SET amount_remaining = amount_remaining - ? WHERE id = ?`),
}
const chqTables = {
  payment: S.chqInsert('payment_cheque'), debt: S.chqInsert('debt_payment_cheque'),
  supplier_payment: S.chqInsert('supplier_payment_cheque'), supplier_debt: S.chqInsert('supplier_debt_cheque'),
}
const visaTables = {
  payment: S.visaInsert('payment_visa'), debt: S.visaInsert('debt_payment_visa'),
  supplier_payment: S.visaInsert('supplier_payment_visa'), supplier_debt: S.visaInsert('supplier_debt_visa'),
}
type ChqKind = keyof typeof chqTables

/* ══════════════════ منطق الدفعات (يطابق دلالات db/payments.ts و cheques.ts) ═════ */
// يُنشئ صف دفعة + تفاصيل شيك/فيزا + (اختياري) قيد صندوق. يعيد المبلغ "المُحتسَب
// مدفوعاً" على الفاتورة (الشيك المرتدّ = 0، أي لا يُخصم من المتبقّي).
function insertPayment(opts: {
  kind: ChqKind
  stmt: typeof S.payInsert
  invoiceId: number
  invoiceType?: 'maintenance' | 'direct_sale'  // للصيانة/البيع فقط
  date: string
  method: 'cash' | 'visa' | 'cheque'
  amount: number
  refType: string
  direction: 'in' | 'out'
  createdAt: string
}): number {
  const { kind, stmt, invoiceId, invoiceType, date, method, amount, refType, direction, createdAt } = opts
  const args: unknown[] = invoiceType
    ? [invoiceId, invoiceType, date, method, amount, 0, null, createdAt]
    : [invoiceId, date, method, amount, 0, null, createdAt]
  const payId = Number(stmt.run(...args).lastInsertRowid)
  stats.payments++

  if (method === 'visa') {
    visaTables[kind].run(payId, pick(BANKS), `TXN-${txnSeq++}`)
    addCash(date, refType, payId, direction === 'in' ? amount : 0, direction === 'out' ? amount : 0, 'visa', `دفعة #${payId}`)
    return amount
  }

  if (method === 'cheque') {
    stats.cheques++
    const issue = date
    const cash = ymd(addDays(new Date(date), ri(20, 120)))
    // مصير الشيك: المستقبلي معلّق؛ الماضي غالباً مصروف، وقليل معلّق/مرتدّ
    let status: 'pending' | 'cashed' | 'bounced'
    if (cash > TODAY_STR) status = 'pending'
    else { const r = rnd(); status = r < 0.9 ? 'cashed' : (r < 0.965 ? 'pending' : 'bounced') }
    const cashedDate = status === 'cashed' ? cash : null
    chqTables[kind].run(payId, `CHQ-${chequeSeq++}`, issue, cash, pick(BANKS), status, cashedDate)
    if (status === 'cashed') {
      stats.chequesCashed++
      addCash(cash, refType, payId, direction === 'in' ? amount : 0, direction === 'out' ? amount : 0, 'cheque', `صرف شيك — دفعة #${payId}`)
      return amount
    }
    if (status === 'pending') { stats.chequesPending++; return amount }  // محتسَب مدفوعاً، بلا نقدية
    stats.chequesBounced++; return 0                                     // مرتدّ: غير محتسَب
  }

  // نقد
  addCash(date, refType, payId, direction === 'in' ? amount : 0, direction === 'out' ? amount : 0, 'cash', `دفعة #${payId}`)
  return amount
}

function pickMethod(): 'cash' | 'visa' | 'cheque' {
  const r = rnd()
  return r < 0.62 ? 'cash' : r < 0.82 ? 'visa' : 'cheque'
}

/* ══════════════════ سجلّات مفتوحة للتحصيل/التسليم اللاحق ═══════════════════════ */
type PendingRelease = { id: number; releaseDate: string; remaining: number; total: number; car: { plate: string; type: string; color: string }; date: string }
type CustomerDebt = { id: number; type: 'maintenance' | 'direct_sale'; remaining: number; invoiceDate: string }
type SupplierDebt = { id: number; remaining: number; invoiceDate: string }
const pendingReleases: PendingRelease[] = []
const customerDebts: CustomerDebt[] = []
const supplierDebts: SupplierDebt[] = []

/* ══════════════════ التوليد اليومي ════════════════════════════════════════════ */
const START = new Date('2016-01-01T00:00:00')
const TODAY = new Date()
const TODAY_STR = ymd(TODAY)
const TOTAL_DAYS = daysBetween(START, TODAY) + 1

// معامل الازدحام حسب يوم الأسبوع (الجمعة أخفّ، وسط الأسبوع أنشط)
const DOW_FACTOR = [1.05, 1.2, 1.15, 1.1, 1.15, 0.35, 0.72] // الأحد..السبت
const TX_FLOOR = 50

let employeeIds: number[] = []

function generateDay(today: Date): void {
  const dateStr = ymd(today)
  const year = today.getFullYear()
  const createdAt = `${dateStr} ${String(ri(8, 18)).padStart(2, '0')}:${String(ri(0, 59)).padStart(2, '0')}:00`
  const dow = today.getDay()
  const dowF = DOW_FACTOR[dow]
  // نمو تدريجي: كراج صغير 2016 يكبر حتى 2026
  const g = 1 + 0.14 * (year - 2016)
  let dayTx = 0

  // ── تسليم سيارات صيانة استحقّ تسليمها اليوم ──
  for (let i = pendingReleases.length - 1; i >= 0; i--) {
    const pr = pendingReleases[i]
    if (pr.releaseDate > dateStr) continue
    pendingReleases.splice(i, 1)
    S.updMaintRelease.run(pr.releaseDate, pr.id)
    stats.releases++; dayTx++
    // دفعة عند التسليم
    if (pr.remaining > 0.001) {
      const frac = chance(0.6) ? 1 : rnd() * 0.8 + 0.1
      let pay = round2(pr.remaining * frac)
      if (pay > pr.remaining) pay = pr.remaining
      if (pay > 0.001) {
        const applied = insertPayment({
          kind: 'payment', stmt: S.payInsert, invoiceId: pr.id, invoiceType: 'maintenance',
          date: pr.releaseDate, method: pickMethod(), amount: pay, refType: 'maintenance_release', direction: 'in', createdAt: `${pr.releaseDate} 12:00:00`,
        })
        if (applied > 0) { S.updMaint.run(applied, applied, pr.id); pr.remaining = round2(pr.remaining - applied) }
      }
    }
    if (pr.remaining > 0.001) customerDebts.push({ id: pr.id, type: 'maintenance', remaining: pr.remaining, invoiceDate: pr.date })
  }

  // ── فواتير الصيانة ──
  const maintCount = Math.min(18, Math.max(0, Math.round(ri(8, 12) * g * dowF)))
  for (let k = 0; k < maintCount; k++) {
    if ((invCounter.get(year) ?? 0) >= 9990) break
    dayTx += createMaintenance(dateStr, year, createdAt, today)
  }

  // ── فواتير البيع المباشر ──
  const dsCount = Math.min(12, Math.max(0, Math.round(ri(5, 8) * g * dowF)))
  for (let k = 0; k < dsCount; k++) {
    if ((invCounter.get(year) ?? 0) >= 9990) break
    dayTx += createDirectSale(dateStr, year, createdAt)
  }

  // ── فواتير الموردين ──
  if (chance(0.6)) {
    const n = Math.max(1, Math.round(ri(1, 3) * Math.sqrt(g)))
    for (let k = 0; k < n; k++) dayTx += createSupplier(dateStr, year, createdAt)
  }

  // ── مصاريف يومية ──
  const expCount = ri(2, 4)
  for (let k = 0; k < expCount; k++) {
    const amt = money(15, 250)
    const eid = Number(S.expInsert.run(pick(EXPENSE_DESCS), amt, dateStr, null, createdAt).lastInsertRowid)
    addCash(dateStr, 'daily_expense', eid, 0, amt, 'cash', 'مصروف يومي')
    stats.expense++; dayTx++
  }

  // ── رواتب (نهاية الشهر) ──
  if (today.getDate() >= 27 && today.getDate() <= 29) {
    for (const emp of employeeIds) {
      if (!chance(0.85)) continue
      dayTx += paySalary(emp, dateStr, createdAt)
    }
  }

  // ── تحصيل ديون العملاء ──
  const collectN = Math.min(customerDebts.length, Math.round(customerDebts.length * 0.02) + ri(3, 9))
  for (let k = 0; k < collectN && customerDebts.length > 0; k++) {
    const idx = ri(0, customerDebts.length - 1)
    dayTx += collectCustomerDebt(idx, dateStr, createdAt)
  }

  // ── سداد ديون الموردين ──
  const supN = Math.min(supplierDebts.length, Math.round(supplierDebts.length * 0.03) + ri(1, 4))
  for (let k = 0; k < supN && supplierDebts.length > 0; k++) {
    const idx = ri(0, supplierDebts.length - 1)
    dayTx += collectSupplierDebt(idx, dateStr, createdAt)
  }

  // ── ضمان أرضية 50 معاملة/يوم: مبيعات نقدية سريعة إضافية ──
  while (dayTx < TX_FLOOR && (invCounter.get(year) ?? 0) < 9990) {
    dayTx += createDirectSale(dateStr, year, createdAt, /*forceCash*/ true)
    stats.floorFills++
  }

  // ── إحصاء صندوق نهاية اليوم (أحياناً، مع فرق بسيط متعمّد) ──
  if (chance(0.3)) dailyAuditPending.push({ date: dateStr, createdAt })

  stats.txTotal += dayTx
}

/* ── فاتورة صيانة ── */
function createMaintenance(dateStr: string, year: number, createdAt: string, today: Date): number {
  const cust = getCustomer()
  const car = cust.cars.length ? pick(cust.cars) : { plate: plate(), ...carType() }
  const nItems = ri(1, 5)
  const items: { name: string; qty: number; price: number; part_type: 'part' | 'service'; owned: boolean; warranty: { value: number; unit: string } | null }[] = []
  for (let i = 0; i < nItems; i++) {
    const isService = chance(0.45)
    const owned = !isService && chance(0.08)
    const warranty = (!isService && chance(0.35)) ? { value: ri(1, 12), unit: pick(['week', 'month', 'year']) } : null
    items.push({
      name: isService ? pick(SERVICE_ITEMS) : pick(PART_ITEMS),
      qty: isService ? 1 : ri(1, 4),
      price: isService ? money(30, 600) : money(20, 1200),
      part_type: isService ? 'service' : 'part',
      owned, warranty,
    })
  }
  const subtotal = items.reduce((s, it) => s + (it.owned ? 0 : it.qty * it.price), 0)
  const disc = invoiceDiscount(subtotal)
  const total = round2(applyDiscount(subtotal, disc.type, disc.value))

  // خطّة الدفع الأولية عند الاستلام
  const { paid, method } = initialPaymentPlan(total)
  const invNo = nextInv(year)
  const delivered = !isRecent(today, 12) || chance(0.6)
  const info = S.maintInsert.run({
    invoice_number: invNo, customer_name: cust.name, customer_phone: chance(0.85) ? cust.phone : null,
    car_plate: car.plate.toUpperCase(), car_type: car.type, car_color: car.color,
    date_received: dateStr, date_released: null, status: 'in_progress',
    warranty: null, notes: chance(0.2) ? 'ملاحظة فنيّة' : null,
    discount_type: disc.type, discount_value: disc.value,
    total_amount: total, amount_paid: 0, amount_remaining: total, created_at: createdAt,
  })
  const id = Number(info.lastInsertRowid)
  stats.maintenance++
  let tx = 1

  // البنود + الكفالات
  for (const it of items) {
    const wJson = it.warranty ? JSON.stringify(it.warranty) : null
    S.itemInsert.run(id, 'maintenance', it.name, it.qty, it.price, it.owned ? 1 : 0, it.part_type, wJson, null, createdAt)
    if (it.warranty) {
      S.warrantyInsert.run('maintenance', id, cust.name, chance(0.85) ? cust.phone : null, car.plate.toUpperCase(), car.type, car.color, it.name, dateStr, it.warranty.value, it.warranty.unit, null, createdAt)
      stats.warranties++
    }
  }

  // دفعة أولية (عند الاستلام)
  let remaining = total
  if (paid > 0.001) {
    const applied = insertPayment({
      kind: 'payment', stmt: S.payInsert, invoiceId: id, invoiceType: 'maintenance',
      date: dateStr, method, amount: paid, refType: 'maintenance_payment', direction: 'in', createdAt,
    })
    if (applied > 0) { S.updMaint.run(applied, applied, id); remaining = round2(remaining - applied) }
    tx++
  }

  if (delivered) {
    const rel = ymd(addDays(today, ri(0, 9)))
    pendingReleases.push({ id, releaseDate: rel > TODAY_STR ? TODAY_STR : rel, remaining, total, car, date: dateStr })
  }
  // غير المسلّمة (in_progress حديثة) تبقى بمتبقّيها؛ ليست في مجمع التحصيل بعد.
  return tx
}

/* ── فاتورة بيع مباشر ── */
function createDirectSale(dateStr: string, year: number, createdAt: string, forceCash = false): number {
  const cust = getCustomer()
  const nItems = forceCash ? 1 : ri(1, 4)
  const items: { name: string; qty: number; price: number }[] = []
  for (let i = 0; i < nItems; i++) items.push({ name: pick(DIRECT_SALE_ITEMS), qty: ri(1, 5), price: money(15, 900) })
  const subtotal = items.reduce((s, it) => s + it.qty * it.price, 0)
  const disc = forceCash ? { type: null as null, value: 0 } : invoiceDiscount(subtotal)
  const total = round2(applyDiscount(subtotal, disc.type, disc.value))
  const warranty = (!forceCash && chance(0.25)) ? { value: ri(1, 12), unit: pick(['week', 'month', 'year']) } : null

  const { paid, method } = forceCash ? { paid: total, method: 'cash' as const } : initialPaymentPlan(total)
  const invNo = nextInv(year)
  const info = S.dsInsert.run({
    invoice_number: invNo, customer_name: cust.name, customer_phone: chance(0.8) ? cust.phone : null,
    sale_date: dateStr, warranty: warranty ? JSON.stringify(warranty) : null, notes: null,
    discount_type: disc.type, discount_value: disc.value,
    total_amount: total, amount_paid: 0, amount_remaining: total, created_at: createdAt,
  })
  const id = Number(info.lastInsertRowid)
  stats.directSale++
  let tx = 1

  for (const it of items) S.itemInsert.run(id, 'direct_sale', it.name, it.qty, it.price, 0, 'part', null, null, createdAt)
  if (warranty) {
    S.warrantyInsert.run('direct_sale', id, cust.name, chance(0.8) ? cust.phone : null, null, null, null, 'كفالة شاملة', dateStr, warranty.value, warranty.unit, null, createdAt)
    stats.warranties++
  }

  let remaining = total
  if (paid > 0.001) {
    const applied = insertPayment({
      kind: 'payment', stmt: S.payInsert, invoiceId: id, invoiceType: 'direct_sale',
      date: dateStr, method, amount: paid, refType: 'direct_sale_payment', direction: 'in', createdAt,
    })
    if (applied > 0) { S.updDs.run(applied, applied, id); remaining = round2(remaining - applied) }
    tx++
  }
  if (remaining > 0.001) customerDebts.push({ id, type: 'direct_sale', remaining, invoiceDate: dateStr })
  return tx
}

/* ── فاتورة مورّد ── */
function createSupplier(dateStr: string, year: number, createdAt: string): number {
  const nItems = ri(1, 4)
  let total = 0
  const items: { name: string; qty: number; price: number; dtype: 'fixed' | 'percentage' | null; dval: number }[] = []
  for (let i = 0; i < nItems; i++) {
    const qty = ri(1, 12), price = money(20, 700), gross = qty * price
    const dr = rnd()
    const dtype = dr < 0.72 ? null : dr < 0.88 ? 'percentage' as const : 'fixed' as const
    const dval = dtype === null ? 0 : dtype === 'percentage' ? ri(5, 20) : Math.min(gross, money(10, 60))
    let line = gross
    if (dtype === 'percentage') line -= line * dval / 100
    else if (dtype === 'fixed') line = Math.max(0, line - dval)
    total += line
    items.push({ name: pick(SUPPLIER_ITEMS), qty, price, dtype, dval })
  }
  total = round2(total)
  const supplierName = pick(SUPPLIERS)
  const { paid, method } = supplierPaymentPlan(total)
  const invNo = nextPur(year)
  const info = S.supInsert.run({
    invoice_number: invNo, supplier_name: supplierName, supplier_phone: landline(),
    purchase_date: dateStr, notes: null, total_amount: total, amount_paid: 0, amount_remaining: total, created_at: createdAt,
  })
  const id = Number(info.lastInsertRowid)
  stats.supplier++
  for (const it of items) S.supItemInsert.run(id, it.name, it.qty, it.price, it.dtype, it.dval, null, createdAt)

  let remaining = total
  if (paid > 0.001) {
    const applied = insertPayment({
      kind: 'supplier_payment', stmt: S.supPayInsert, invoiceId: id,
      date: dateStr, method, amount: paid, refType: 'supplier_payment', direction: 'out', createdAt,
    })
    if (applied > 0) { S.updSup.run(applied, applied, id); remaining = round2(remaining - applied) }
  }
  if (remaining > 0.001) supplierDebts.push({ id, remaining, invoiceDate: dateStr })
  return 1
}

/* ── تحصيل دين عميل ── */
function collectCustomerDebt(idx: number, dateStr: string, createdAt: string): number {
  const d = customerDebts[idx]
  if (d.remaining <= 0.001) { customerDebts.splice(idx, 1); return 0 }
  const full = chance(0.55)
  let pay = full ? d.remaining : round2(d.remaining * (rnd() * 0.7 + 0.15))
  if (pay > d.remaining) pay = d.remaining
  const invoiceType = d.type
  const table = invoiceType === 'maintenance' ? S.updMaint : S.updDs
  const remainOnly = invoiceType === 'maintenance' ? S.updMaintRemainOnly : S.updDsRemainOnly
  let tx = 0
  if (pay > 0.001) {
    const applied = insertPayment({
      kind: 'debt', stmt: S.debtPayInsert, invoiceId: d.id, invoiceType,
      date: dateStr, method: pickMethod(), amount: pay, refType: 'debt_customer', direction: 'in', createdAt,
    })
    if (applied > 0) { table.run(applied, applied, d.id); d.remaining = round2(d.remaining - applied) }
    stats.debtCollections++; tx = 1
  }
  // خصم تسوية أحياناً لإغلاق بقايا صغيرة (يُخصم من المتبقّي دون نقدية)
  if (d.remaining > 0.5 && chance(0.18)) {
    const settle = d.remaining
    S.debtPayInsert.run(d.id, invoiceType, dateStr, 'cash', 0, settle, 'خصم تسوية', createdAt)
    remainOnly.run(settle, d.id)
    d.remaining = 0
    stats.settlements++
  }
  if (d.remaining <= 0.001) customerDebts.splice(idx, 1)
  return tx
}

/* ── سداد دين مورّد ── */
function collectSupplierDebt(idx: number, dateStr: string, createdAt: string): number {
  const d = supplierDebts[idx]
  if (d.remaining <= 0.001) { supplierDebts.splice(idx, 1); return 0 }
  const full = chance(0.5)
  let pay = full ? d.remaining : round2(d.remaining * (rnd() * 0.7 + 0.15))
  if (pay > d.remaining) pay = d.remaining
  let tx = 0
  if (pay > 0.001) {
    const applied = insertPayment({
      kind: 'supplier_debt', stmt: S.supDebtInsert, invoiceId: d.id,
      date: dateStr, method: pickMethod(), amount: pay, refType: 'supplier_debt', direction: 'out', createdAt,
    })
    if (applied > 0) { S.updSup.run(applied, applied, d.id); d.remaining = round2(d.remaining - applied) }
    stats.supplierDebtPays++; tx = 1
  }
  if (d.remaining > 0.5 && chance(0.15)) {
    const settle = d.remaining
    S.supDebtInsert.run(d.id, dateStr, 'cash', 0, settle, 'خصم تسوية', createdAt)
    S.updSupRemainOnly.run(settle, d.id)
    d.remaining = 0
    stats.settlements++
  }
  if (d.remaining <= 0.001) supplierDebts.splice(idx, 1)
  return tx
}

/* ── راتب موظّف ── */
function paySalary(empId: number, dateStr: string, createdAt: string): number {
  const wage = empWages.get(empId) ?? 100
  const days = ri(22, 27)
  const bonus = chance(0.3) ? money(50, 400) : 0
  const deduction = chance(0.15) ? money(20, 200) : 0
  const amount = round2(wage * days + bonus - deduction)
  if (amount <= 0) return 0
  const sid = Number(S.salInsert.run(empId, amount, wage, days, bonus, deduction, dateStr, null, createdAt).lastInsertRowid)
  addCash(dateStr, 'salary', sid, 0, amount, 'cash', 'راتب موظّف')
  stats.salary++
  return 1
}

/* ══════════════════ خطط الدفع والخصومات ══════════════════════════════════════ */
function initialPaymentPlan(total: number): { paid: number; method: 'cash' | 'visa' | 'cheque' } {
  if (total <= 0) return { paid: 0, method: 'cash' }
  const r = rnd()
  if (r < 0.55) return { paid: total, method: pickMethod() }            // دفع كامل
  if (r < 0.80) return { paid: round2(total * (rnd() * 0.6 + 0.2)), method: pickMethod() } // جزئي
  return { paid: 0, method: 'cash' }                                     // دين كامل
}
function supplierPaymentPlan(total: number): { paid: number; method: 'cash' | 'visa' | 'cheque' } {
  if (total <= 0) return { paid: 0, method: 'cash' }
  const r = rnd()
  if (r < 0.4) return { paid: total, method: pickMethod() }
  if (r < 0.72) return { paid: round2(total * (rnd() * 0.6 + 0.2)), method: pickMethod() }
  return { paid: 0, method: 'cash' }
}
function invoiceDiscount(subtotal: number): { type: 'fixed' | 'percentage' | null; value: number } {
  if (subtotal <= 0) return { type: null, value: 0 }
  const r = rnd()
  if (r < 0.7) return { type: null, value: 0 }
  if (r < 0.9) return { type: 'percentage', value: ri(5, 20) }
  return { type: 'fixed', value: Math.min(subtotal, money(10, Math.max(11, Math.floor(subtotal / 3)))) }
}
function applyDiscount(subtotal: number, type: 'fixed' | 'percentage' | null, value: number): number {
  if (!type || value === 0) return subtotal
  if (type === 'percentage') return subtotal - subtotal * value / 100
  return Math.max(0, subtotal - value)
}
function isRecent(today: Date, days: number): boolean { return daysBetween(today, TODAY) <= days }

/* ══════════════════ التهيئة: موظّفون + دليل موردين + زبائن بذور ═══════════════ */
const empWages = new Map<number, number>()
const initSetup = db.transaction(() => {
  const nEmp = ri(6, 8)
  for (let i = 0; i < nEmp; i++) {
    const wage = money(90, 170)
    const id = Number(S.empInsert.run(EMPLOYEE_NAMES[i % EMPLOYEE_NAMES.length], phone(), wage, '2016-01-01 08:00:00').lastInsertRowid)
    employeeIds.push(id); empWages.set(id, wage)
  }
  for (const s of SUPPLIERS) S.supDirInsert.run(s, landline(), null, '2016-01-01 08:00:00')
  for (let i = 0; i < 120; i++) makeCustomer()  // قاعدة زبائن ابتدائية صغيرة (تنمو لاحقاً)
})
initSetup()

/* ══════════════════ الحلقة الرئيسية: transaction لكل سنة ═════════════════════ */
const dailyAuditPending: { date: string; createdAt: string }[] = []

let cursor = new Date(START)
const firstYear = START.getFullYear()
const lastYear = TODAY.getFullYear()
console.log(`⏳ توليد بيانات المحاكاة من ${ymd(START)} حتى ${TODAY_STR} (${TOTAL_DAYS} يوماً)…`)
for (let year = firstYear; year <= lastYear; year++) {
  const genYear = db.transaction(() => {
    while (cursor.getFullYear() === year && ymd(cursor) <= TODAY_STR) {
      generateDay(cursor)
      cursor = addDays(cursor, 1)
    }
  })
  genYear()
  process.stdout.write(`  ✓ ${year} (${customers.length} زبون تراكمي، ${cashEvents.length} قيد صندوق)\n`)
}

/* ══════════════════ إدراج قيود الصندوق مرتّبة زمنياً + رصيد تراكمي ══════════════ */
cashEvents.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.seq - b.seq))
const ledgerInsert = db.prepare(`INSERT INTO cash_ledger
  (transaction_date, reference_type, reference_id, amount_in, amount_out, balance_after, method, notes, created_at)
  VALUES (?,?,?,?,?,?,?,?,?)`)
const dailyNet = new Map<string, { cash: number; visa: number; cheque: number }>()
const insertLedger = db.transaction(() => {
  let balance = 0
  for (const e of cashEvents) {
    balance = round2(balance + e.in - e.out)
    ledgerInsert.run(e.date, e.refType, e.refId, e.in, e.out, balance, e.method, e.notes, `${e.date} 12:00:00`)
    const n = dailyNet.get(e.date) ?? { cash: 0, visa: 0, cheque: 0 }
    n[e.method] = round2(n[e.method] + e.in - e.out)
    dailyNet.set(e.date, n)
  }
})
insertLedger()

/* ══════════════════ إحصاءات صندوق نهاية اليوم (system_total = صافي اليوم) ═══════ */
const insertAudits = db.transaction(() => {
  for (const a of dailyAuditPending) {
    const n = dailyNet.get(a.date) ?? { cash: 0, visa: 0, cheque: 0 }
    const sysTotal = round2(n.cash + n.visa + n.cheque)
    const diff = chance(0.3) ? money(-40, 40) : 0
    S.auditInsert.run(a.date, sysTotal, round2(sysTotal + diff), round2(n.cash + diff), n.visa, n.cheque, diff, a.createdAt)
    stats.cashAudits++
  }
})
insertAudits()

/* ══════════════════ الإغلاق والملخّص ══════════════════════════════════════════ */
db.pragma('wal_checkpoint(TRUNCATE)')
db.close()

const sizeBytes = fs.statSync(DB_PATH).size
const sizeMB = (sizeBytes / (1024 * 1024)).toFixed(1)
const yearsCovered = lastYear - firstYear + 1
const avgDaily = (stats.txTotal / TOTAL_DAYS).toFixed(1)

console.log('\n══════════════════ ملخّص المحاكاة ══════════════════')
console.log(`المدى الزمني        : ${ymd(START)} → ${TODAY_STR}`)
console.log(`عدد السنوات         : ${yearsCovered} سنة (${TOTAL_DAYS} يوماً)`)
console.log(`إجمالي المعاملات    : ${stats.txTotal.toLocaleString('en-US')}`)
console.log(`متوسط المعاملات/يوم : ${avgDaily}  ${Number(avgDaily) >= 50 ? '✅ (≥ 50)' : '⚠️ (< 50)'}`)
console.log(`حجم ملف القاعدة     : ${sizeMB} م.ب (${sizeBytes.toLocaleString('en-US')} بايت)`)
console.log('────────────────── تفصيل السجلّات ──────────────────')
console.log(`فواتير صيانة        : ${stats.maintenance.toLocaleString('en-US')}`)
console.log(`فواتير بيع مباشر    : ${stats.directSale.toLocaleString('en-US')} (منها تعبئة أرضية: ${stats.floorFills.toLocaleString('en-US')})`)
console.log(`فواتير موردين       : ${stats.supplier.toLocaleString('en-US')}`)
console.log(`تسليمات سيارات      : ${stats.releases.toLocaleString('en-US')}`)
console.log(`دفعات (كل الأنواع)  : ${stats.payments.toLocaleString('en-US')}`)
console.log(`تحصيل ديون عملاء    : ${stats.debtCollections.toLocaleString('en-US')}`)
console.log(`سداد ديون موردين    : ${stats.supplierDebtPays.toLocaleString('en-US')}`)
console.log(`شيكات               : ${stats.cheques.toLocaleString('en-US')} (مصروف ${stats.chequesCashed} / معلّق ${stats.chequesPending} / مرتدّ ${stats.chequesBounced})`)
console.log(`خصومات تسوية        : ${stats.settlements.toLocaleString('en-US')}`)
console.log(`كفالات              : ${stats.warranties.toLocaleString('en-US')}`)
console.log(`مصاريف يومية        : ${stats.expense.toLocaleString('en-US')}`)
console.log(`رواتب               : ${stats.salary.toLocaleString('en-US')}`)
console.log(`قيود الصندوق        : ${cashEvents.length.toLocaleString('en-US')}`)
console.log(`إحصاءات صندوق يومية : ${stats.cashAudits.toLocaleString('en-US')}`)
console.log(`ديون عملاء مفتوحة   : ${customerDebts.length.toLocaleString('en-US')}`)
console.log(`ديون موردين مفتوحة  : ${supplierDebts.length.toLocaleString('en-US')}`)
console.log('════════════════════════════════════════════════════')
console.log(`\n✅ القاعدة جاهزة: ${DB_PATH}`)
console.log(`   للمعاينة داخل التطبيق: GARAGE_DB_PATH=${DB_PATH} npm run dev`)
