/* ════════════════════════════════════════════════════════════════════════
   simulate-bulk-payments.ts — اختبار محاكاة شامل لميزة «الدفعة العامة للمورد»
   (supplier bulk payment) وما يتّصل بها من توزيع FIFO/يدوي، دورة الشيك/الفيزا،
   وحذف الفواتير المرتبطة. يعمل مباشرةً على قاعدة SQLite حقيقية عبر نفس دوال
   src/db/suppliers.ts الفعلية (قنوات IPC الحقيقية) — لا محاكاة موازية.

   لا يمسّ قاعدة الإنتاج: يعمل على قاعدة تجريبية معزولة عبر GARAGE_DB_PATH
   (يهيّئها المشغّل scripts/run-bulk-test.mjs في os.tmpdir() ويحذفها بعده).

   كل سيناريو يتحقّق تلقائياً (assert فعلي يطبع ✅/❌) ثم يُطبع تقرير نهائي.

   التشغيل: node scripts/run-bulk-test.mjs
════════════════════════════════════════════════════════════════════════ */
import { initDB, getDB } from '../src/database.ts'
import { registerIpcHandlers } from '../electron/ipc-handlers.ts'
import { invoke } from './electron-stub.mjs'
import { REF } from '../src/db/ledger.ts'
// منطق بناء نص الملاحظة الحقيقي (المشترك مع شاشة سجل الصندوق) — لاختبار BULK_NOTE_MAX
import { buildBulkSummary, BULK_NOTE_MAX } from '../src/utils/bulkNote.ts'
// منطق توزيع FIFO الحقيقي (المشترك مع شاشة الموردين) — لبناء التوزيع الافتراضي
import { sortFifo, buildFifoAllocations } from '../src/utils/bulkAllocation.ts'
import type { PaymentInput, PaymentMethod } from '../src/db/types.ts'

// ── التهيئة ──────────────────────────────────────────────────────────────────
initDB()
const db = getDB()
registerIpcHandlers(db)

const EPS = 0.01
const approx = (a: number, b: number) => Math.abs(a - b) <= EPS

function one<T = any>(sql: string, ...p: unknown[]): T { return db.prepare(sql).get(...p) as T }
function all<T = any>(sql: string, ...p: unknown[]): T[] { return db.prepare(sql).all(...p) as T[] }

// ── إطار الفحص (assert فعلي، يجمّع نتائج كل سيناريو على حدة) ──────────────────
type Res = { n: number; title: string; fails: string[] }
const results: Res[] = []
let cur: Res = { n: 0, title: '(تهيئة)', fails: [] }

function scenario(n: number, title: string) {
  cur = { n, title, fails: [] }
  results.push(cur)
  console.log(`\n══════════ سيناريو ${n}: ${title} ══════════`)
}
function ok(msg: string) { console.log(`  ✅ ${msg}`) }
function bad(msg: string, expected: unknown, actual: unknown) {
  cur.fails.push(`${msg} — متوقّع: ${expected} | فعلي: ${actual}`)
  console.log(`  ❌ ${msg}\n       متوقّع: ${expected}\n       فعلي:   ${actual}`)
}
function eqNum(msg: string, actual: number, expected: number) {
  if (approx(actual, expected)) ok(`${msg} = ${actual}`)
  else bad(msg, expected, actual)
}
function eq(msg: string, actual: unknown, expected: unknown) {
  if (actual === expected) ok(`${msg} = ${actual}`)
  else bad(msg, expected, actual)
}
function truthy(msg: string, cond: boolean, detail = 'غير محقّق') {
  if (cond) ok(msg); else bad(msg, 'صحيح', detail)
}
async function throws(msg: string, fn: () => Promise<unknown>): Promise<Error | null> {
  try { await fn(); bad(msg, 'يرمي خطأ (رفض)', 'لم يرمِ أي خطأ'); return null }
  catch (e) { ok(`${msg} — رُفض فعلياً: «${(e as Error).message}»`); return e as Error }
}

// ── مساعدات إنشاء البيانات عبر القنوات الحقيقية ──────────────────────────────
let chequeCounter = 1
function buildPayment(method: PaymentMethod, amount: number, date: string): PaymentInput {
  const p: PaymentInput = { method, amount }
  if (method === 'cheque') {
    p.chequeNumber = `CHQ-BULK-${chequeCounter++}`
    p.issueDate = date; p.cashDate = date; p.bankName = 'بنك فلسطين'
  } else if (method === 'visa') {
    p.bankName = 'بنك فلسطين'; p.transactionNumber = `TXN-${chequeCounter++}`
  }
  return p
}

// فاتورة مورد بمبلغ محدّد بالضبط (بند واحد بلا خصم) وبلا دفعة أولية (كامل المبلغ دَيْن)
async function addInvoice(supplier: string, total: number, date: string): Promise<number> {
  return await invoke('supplierInvoice:add', {
    supplier_name: supplier,
    supplier_phone: `04${1000000 + Math.floor(total)}`,
    purchase_date: date,
    items: [{ item_name: 'قطعة اختبار', quantity: 1, unit_price: total, discount_type: null, discount_value: 0 }],
    payments: [{ method: 'debt', amount: 0 }],
  })
}

const rem = (id: number): number => one<{ v: number }>('SELECT amount_remaining v FROM supplier_invoices WHERE id=?', id).v
const allocsOf = (bulkId: number) =>
  all<{ invoice_id: number; amount: number; payment_id: number }>(
    'SELECT invoice_id, amount, payment_id FROM supplier_bulk_payment_allocations WHERE bulk_payment_id=? ORDER BY id ASC', bulkId)

// الفواتير غير المسدَّدة للمورد بترتيب FIFO الحقيقي (نفس منطق شاشة الموردين)
function unpaidFifo(supplier: string) {
  const rows = all<{ id: number; invoice_number: string; purchase_date: string; amount_remaining: number }>(
    'SELECT id, invoice_number, purchase_date, amount_remaining FROM supplier_invoices WHERE supplier_name=? AND amount_remaining > 0.001',
    supplier)
  return sortFifo(rows.map(r => ({
    id: r.id, purchaseDate: r.purchase_date, amountRemaining: r.amount_remaining, invoiceNumber: r.invoice_number,
  })))
}

// دفعة عامة بتوزيع FIFO الافتراضي الحقيقي
async function bulkFifo(supplier: string, amount: number, method: PaymentMethod, date: string, notes?: string): Promise<number> {
  const allocs = buildFifoAllocations(unpaidFifo(supplier), amount)
  return await invoke('supplierInvoice:addBulkPayment', {
    supplier_name: supplier,
    payment_date: date,
    payment: buildPayment(method, amount, date),
    notes,
    allocations: allocs.map(a => ({ invoice_id: a.invoice.id, amount: a.amount })),
  })
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 1 — مورد جديد + 4 فواتير شراء بمبالغ مختلفة وتواريخ متسلسلة
// ════════════════════════════════════════════════════════════════════════════
const A = 'مورد الاختبار ألف'
scenario(1, 'مورد جديد + 4 فواتير شراء (100، 250، 80، 300)')
const a1 = await addInvoice(A, 100, '2026-01-01')
const a2 = await addInvoice(A, 250, '2026-01-02')
const a3 = await addInvoice(A, 80,  '2026-01-03')
const a4 = await addInvoice(A, 300, '2026-01-04')
{
  const invs = all<{ total_amount: number; amount_remaining: number }>(
    'SELECT total_amount, amount_remaining FROM supplier_invoices WHERE supplier_name=? ORDER BY id', A)
  eqNum('عدد فواتير المورد', invs.length, 4)
  eqNum('إجمالي دين المورد', invs.reduce((s, r) => s + r.amount_remaining, 0), 730)
  truthy('متبقّي كل فاتورة = إجماليها (لا دفعة أولية)', invs.every(r => approx(r.amount_remaining, r.total_amount)))
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 2 — دفعة عامة تساوي دين فاتورة واحدة بالضبط
// ════════════════════════════════════════════════════════════════════════════
scenario(2, 'دفعة عامة (100) تساوي دين فاتورة واحدة بالضبط')
{
  const bulk = await bulkFifo(A, 100, 'cash', '2026-01-10')
  const al = allocsOf(bulk)
  eqNum('عدد التوزيعات (فاتورة واحدة فقط)', al.length, 1)
  eq('الفاتورة المسدَّدة هي الأقدم a1', al[0]?.invoice_id, a1)
  eqNum('متبقّي a1 بعد الدفع = 0', rem(a1), 0)
  eqNum('متبقّي a2 دون مساس', rem(a2), 250)
  eqNum('متبقّي a3 دون مساس', rem(a3), 80)
  eqNum('متبقّي a4 دون مساس', rem(a4), 300)
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 3 — دفعة عامة تغطي فاتورتين بالضبط بتوزيع FIFO (الأقدم أولاً)
// ════════════════════════════════════════════════════════════════════════════
scenario(3, 'دفعة عامة (330) تغطي فاتورتين بالضبط بتوزيع FIFO')
{
  // الفواتير المتبقّية FIFO الآن: a2(250) → a3(80) → a4(300)
  const bulk = await bulkFifo(A, 330, 'cash', '2026-01-15')
  const al = allocsOf(bulk)
  eqNum('عدد التوزيعات', al.length, 2)
  eq('الأقدم أولاً: التوزيع الأول = a2', al[0]?.invoice_id, a2)
  eqNum('مبلغ توزيع a2 (يُسدَّد بالكامل)', al[0]?.amount, 250)
  eq('التوزيع الثاني = a3', al[1]?.invoice_id, a3)
  eqNum('المتبقّي بعد a2 يذهب لـ a3 (330−250=80)', al[1]?.amount, 80)
  eqNum('مجموع التوزيع = مبلغ الدفعة', al.reduce((s, r) => s + r.amount, 0), 330)
  eqNum('متبقّي a2 = 0', rem(a2), 0)
  eqNum('متبقّي a3 = 0', rem(a3), 0)
  eqNum('متبقّي a4 دون مساس', rem(a4), 300)
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 4 — دفعة أكبر من إجمالي الديون المستحقة (يجب أن تُرفض بلا أي صف)
// ════════════════════════════════════════════════════════════════════════════
scenario(4, 'دفعة عامة (350) أكبر من إجمالي الدين المتبقّي (300) — تُرفض')
{
  // المتبقّي للمورد A الآن = a4 فقط (300)
  const hdrBefore = one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payments').c
  const allBefore = one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payment_allocations').c
  const remBefore = rem(a4)
  await throws('محاولة الدفعة الزائدة', async () => await invoke('supplierInvoice:addBulkPayment', {
    supplier_name: A, payment_date: '2026-01-20',
    payment: { method: 'cash', amount: 350 },
    allocations: [{ invoice_id: a4, amount: 350 }],
  }))
  eqNum('عدد ترويسات الدفعات لم يتغيّر', one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payments').c, hdrBefore)
  eqNum('عدد صفوف التوزيع لم يتغيّر (rollback)', one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payment_allocations').c, allBefore)
  eqNum('متبقّي a4 لم يتغيّر', rem(a4), remBefore)
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 5 — دفعة عامة بتوزيع يدوي مخصّص لا يتبع FIFO
// ════════════════════════════════════════════════════════════════════════════
scenario(5, 'دفعة عامة (250) بتوزيع يدوي مخصّص (ليس FIFO)')
{
  const B = 'مورد الاختبار باء'
  const b1 = await addInvoice(B, 200, '2026-02-01')
  const b2 = await addInvoice(B, 300, '2026-02-02')
  // FIFO الافتراضي لـ 250 سيكون b1=200, b2=50 — نُدخل عكسه يدوياً: b1=50, b2=200
  const fifoDefault = buildFifoAllocations(unpaidFifo(B), 250).map(a => ({ id: a.invoice.id, amount: a.amount }))
  const bulk = await invoke('supplierInvoice:addBulkPayment', {
    supplier_name: B, payment_date: '2026-02-10',
    payment: { method: 'cash', amount: 250 },
    allocations: [{ invoice_id: b1, amount: 50 }, { invoice_id: b2, amount: 200 }],
  })
  const al = allocsOf(bulk)
  truthy('التوزيع اليدوي يخالف FIFO الافتراضي',
    !(fifoDefault[0]?.id === b1 && approx(fifoDefault[0]?.amount, 50)),
    `FIFO=${JSON.stringify(fifoDefault)}`)
  eqNum('عدد التوزيعات', al.length, 2)
  eq('التوزيع الأول b1', al[0]?.invoice_id, b1)
  eqNum('مبلغ b1 محفوظ كما أُدخل (50)', al[0]?.amount, 50)
  eq('التوزيع الثاني b2', al[1]?.invoice_id, b2)
  eqNum('مبلغ b2 محفوظ كما أُدخل (200)', al[1]?.amount, 200)
  eqNum('متبقّي b1 = 150', rem(b1), 150)
  eqNum('متبقّي b2 = 100', rem(b2), 100)
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 6 — دفعة عامة بشيك: لا قيد صندوق قبل الصرف ثم يظهر بعده (سياسة M3)
// صرف الشيك يُؤجَّل لآخر السكربت (انظر «إتمام السيناريو 6» أدناه): قيد الصرف يحمل
// تاريخ اليوم — الأحدث — فيُدرَج آخِراً كي يبقى ترتيب قيود الصندوق زمنياً متصاعداً
// مع ترتيب الإدخال (id)، تماماً كالواقع (لا يُصرَف شيك قبل وجود عمليات سابقة).
// ════════════════════════════════════════════════════════════════════════════
scenario(6, 'دفعة عامة بشيك — لا قيد صندوق قبل الصرف ثم يظهر بعده')
const s6 = cur
let s6PayId = 0, s6C1 = 0
{
  const C = 'مورد الاختبار جيم'
  s6C1 = await addInvoice(C, 400, '2026-03-01')
  const bulk = await bulkFifo(C, 400, 'cheque', '2026-03-05')
  s6PayId = allocsOf(bulk)[0].payment_id
  const ledgerBefore = one<{ c: number }>(
    'SELECT COUNT(*) c FROM cash_ledger WHERE reference_type=? AND reference_id=?', REF.SUPPLIER_DEBT, s6PayId).c
  eqNum('قيود الصندوق قبل صرف الشيك = 0', ledgerBefore, 0)
  eqNum('متبقّي c1 = 0 (محتسَب مدفوعاً رغم أن الشيك معلّق)', rem(s6C1), 0)
  ok('(صرف الشيك والتحقّق من ظهور القيد يُنفَّذان في «إتمام السيناريو 6» بنهاية السكربت)')
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 7 — دفعة عامة بفيزا: قيد صندوق فوري و balance_after صحيح
// ════════════════════════════════════════════════════════════════════════════
scenario(7, 'دفعة عامة بفيزا — قيد صندوق فوري و balance_after صحيح')
{
  const D = 'مورد الاختبار دال'
  const d1 = await addInvoice(D, 500, '2026-04-01')
  const bulk = await bulkFifo(D, 500, 'visa', '2026-04-05')
  const payId = allocsOf(bulk)[0].payment_id
  const row = one<{ id: number; amount_in: number; amount_out: number; method: string; balance_after: number }>(
    'SELECT id, amount_in, amount_out, method, balance_after FROM cash_ledger WHERE reference_type=? AND reference_id=?',
    REF.SUPPLIER_DEBT, payId)
  truthy('قيد الصندوق أُنشئ فوراً', !!row, 'لا قيد')
  eqNum('المبلغ الصادر = 500', row?.amount_out, 500)
  eq('طريقة القيد = visa', row?.method, 'visa')
  eqNum('متبقّي d1 = 0', rem(d1), 0)
  // balance_after يتبع الترتيب الزمني (transaction_date, id) — نحسب الرصيد التراكمي حتى هذا القيد
  const chron = all<{ id: number; amount_in: number; amount_out: number }>(
    'SELECT id, amount_in, amount_out FROM cash_ledger ORDER BY transaction_date ASC, id ASC')
  let running = 0, target = NaN
  for (const r of chron) { running += r.amount_in - r.amount_out; if (r.id === row.id) { target = running; break } }
  eqNum('balance_after = الرصيد التراكمي الزمني حتى القيد', row.balance_after, target)
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 8 — حذف فاتورة كانت ضمن دفعة عامة (مواءمة الترويسة + سجل النشاط)
// ════════════════════════════════════════════════════════════════════════════
scenario(8, 'حذف فاتورة ضمن دفعة عامة — مواءمة الترويسة والحذف التلقائي')
{
  const E = 'مورد الاختبار هاء'
  const e1 = await addInvoice(E, 150, '2026-05-01')
  const e2 = await addInvoice(E, 250, '2026-05-02')
  const bulk = await bulkFifo(E, 400, 'cash', '2026-05-05')   // e1=150، e2=250
  eqNum('مبلغ الترويسة الابتدائي', one<{ amount: number }>('SELECT amount FROM supplier_bulk_payments WHERE id=?', bulk).amount, 400)

  // (أ) حذف e1: الترويسة تبقى ويُصحَّح مبلغها ليطابق التوزيع المتبقّي (e2=250)
  await invoke('supplierInvoice:delete', e1)
  const hdr = one<{ amount: number } | undefined>('SELECT amount FROM supplier_bulk_payments WHERE id=?', bulk)
  truthy('الترويسة ما زالت موجودة (غير يتيمة)', !!hdr, 'حُذفت الترويسة')
  eqNum('مبلغ الترويسة تحدّث تلقائياً ليطابق المتبقّي (250)', hdr?.amount ?? -1, 250)
  eqNum('عدد توزيعات الترويسة الآن = 1', one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payment_allocations WHERE bulk_payment_id=?', bulk).c, 1)
  const logUpd = one<{ c: number }>(
    `SELECT COUNT(*) c FROM activity_log WHERE entity_type='supplier_bulk_payment' AND entity_id=? AND action_type='update' AND details LIKE '%تحديث تلقائي%'`, bulk).c
  truthy('سجل نشاط بالتحديث التلقائي للترويسة', logUpd > 0, `عدد السجلات=${logUpd}`)

  // (ب) حذف e2 (آخر فاتورة): الترويسة تُحذف بالكامل (اختبار الإصلاح الأخير)
  await invoke('supplierInvoice:delete', e2)
  eqNum('الترويسة حُذفت بالكامل بعد حذف آخر فاتورة', one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payments WHERE id=?', bulk).c, 0)
  eqNum('لا توزيعات يتيمة للترويسة', one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payment_allocations WHERE bulk_payment_id=?', bulk).c, 0)
  const logDel = one<{ c: number }>(
    `SELECT COUNT(*) c FROM activity_log WHERE entity_type='supplier_bulk_payment' AND entity_id=? AND details LIKE '%حذف تلقائي%'`, bulk).c
  truthy('سجل نشاط بالحذف التلقائي للترويسة', logDel > 0, `عدد السجلات=${logDel}`)
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 9 — تكرار نفس الفاتورة في نفس التوزيع (يجب أن يُرفض)
// ════════════════════════════════════════════════════════════════════════════
scenario(9, 'تكرار نفس الفاتورة في التوزيع الواحد — يُرفض')
{
  const F = 'مورد الاختبار واو'
  const f1 = await addInvoice(F, 100, '2026-06-01')
  const hdrBefore = one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payments').c
  await throws('توزيع يكرّر الفاتورة نفسها', async () => await invoke('supplierInvoice:addBulkPayment', {
    supplier_name: F, payment_date: '2026-06-05',
    payment: { method: 'cash', amount: 100 },
    allocations: [{ invoice_id: f1, amount: 40 }, { invoice_id: f1, amount: 60 }],
  }))
  eqNum('لم تُنشأ أي ترويسة (rollback)', one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payments').c, hdrBefore)
  eqNum('متبقّي f1 لم يتغيّر', rem(f1), 100)
}

// ════════════════════════════════════════════════════════════════════════════
// السيناريو 10 — دفعة عامة على 6 فواتير: اختصار الملاحظة (BULK_NOTE_MAX)
// ════════════════════════════════════════════════════════════════════════════
scenario(10, `دفعة عامة على 6 فواتير — اختصار الملاحظة (BULK_NOTE_MAX=${BULK_NOTE_MAX})`)
{
  const G = 'مورد الاختبار زاي'
  for (let i = 0; i < 6; i++) await addInvoice(G, 50, `2026-07-0${i + 1}`)
  const bulk = await bulkFifo(G, 300, 'visa', '2026-07-10')   // 50 لكل فاتورة
  const bp = (await invoke('supplierInvoice:getBulkPayments', { supplier_name: G }))[0]
  eqNum('عدد الفواتير في الدفعة', bp.invoice_count, 6)

  // نص الملاحظة الخام كما بناه الـ backend فعلياً (من supplier_debt_payments)
  const rawNote = one<{ notes: string }>(
    `SELECT notes FROM supplier_debt_payments WHERE id = (
       SELECT payment_id FROM supplier_bulk_payment_allocations WHERE bulk_payment_id=? ORDER BY id LIMIT 1)`, bulk).notes
  const allocsForNote = bp.allocations.map((a: any) => ({ invoiceLabel: a.invoice_number || '', amount: a.amount }))

  // أكثر من BULK_NOTE_MAX ⇒ الملخّص يختصر ولا يسرد الفواتير فرادى
  const summary = buildBulkSummary(rawNote, allocsForNote)
  console.log(`       الملخّص الناتج: «${summary}»`)
  truthy(`عند ${allocsForNote.length} فواتير (>${BULK_NOTE_MAX}) يُختصر النص`,
    summary.includes(`غطّت ${allocsForNote.length} فواتير`) && summary.includes('انظر التوزيع أدناه'), summary)
  truthy('الملخّص المختصر لا يسرد الفواتير فرادى', !summary.includes('غطّت:'), summary)

  // حدّ العتبة: عند BULK_NOTE_MAX بالضبط تُسرد الفواتير فرادى (لا اختصار)
  const sub = buildBulkSummary(rawNote, allocsForNote.slice(0, BULK_NOTE_MAX))
  truthy(`عند ${BULK_NOTE_MAX} فواتير تماماً تُسرد فرادى`, sub.includes('غطّت:') && !sub.includes('انظر التوزيع أدناه'), sub)
}

// ════════════════════════════════════════════════════════════════════════════
// إتمام السيناريو 6 — صرف الشيك يُنفَّذ أخيراً (قيده يحمل تاريخ اليوم = الأحدث)
// ════════════════════════════════════════════════════════════════════════════
console.log('\n══════════ إتمام السيناريو 6: صرف الشيك (يظهر قيد الصندوق) ══════════')
cur = s6
{
  // محاكاة صرف الشيك فعلياً (نفس قناة صفحة الشيكات)
  await invoke('cheque:updateStatus', 'supplier_debt', s6PayId, 'cashed')
  const after = all<{ amount_in: number; amount_out: number; method: string }>(
    'SELECT amount_in, amount_out, method FROM cash_ledger WHERE reference_type=? AND reference_id=?', REF.SUPPLIER_DEBT, s6PayId)
  eqNum('قيد صندوق واحد بعد الصرف', after.length, 1)
  eqNum('المبلغ الصادر في القيد = 400', after[0]?.amount_out, 400)
  eqNum('لا وارد في القيد', after[0]?.amount_in, 0)
  eq('طريقة القيد = cheque', after[0]?.method, 'cheque')
  eqNum('متبقّي c1 ما زال 0 بعد الصرف', rem(s6C1), 0)
}

// ════════════════════════════════════════════════════════════════════════════
// التقرير النهائي
// ════════════════════════════════════════════════════════════════════════════
console.log('\n\n════════════════════ التقرير النهائي ════════════════════')
let passed = 0, failed = 0
for (const r of results) {
  if (r.fails.length === 0) { passed++; console.log(`  ✅ سيناريو ${r.n}: ${r.title}`) }
  else {
    failed++
    console.log(`  ❌ سيناريو ${r.n}: ${r.title}`)
    for (const f of r.fails) console.log(`        • ${f}`)
  }
}
console.log('─────────────────────────────────────────────────────────')
console.log(`  النتيجة: نجح ${passed} / ${results.length} سيناريو${failed ? ` — فشل ${failed}` : ''}`)
console.log(`  قاعدة الاختبار: ${db.name}`)
console.log('═════════════════════════════════════════════════════════')

if (failed > 0) {
  console.log('🔴 فشل سيناريو واحد أو أكثر (انظر التفاصيل أعلاه).')
  process.exit(1)
}
console.log('🎉 نجحت كل سيناريوهات الدفعة العامة.')
process.exit(0)
