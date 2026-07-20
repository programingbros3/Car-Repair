/* ════════════════════════════════════════════════════════════════════════
   verify-integrity.ts — فحص آلي لسلامة قاعدة بيانات المحاكاة.
   يقارن قنوات التقارير الحقيقية بمجاميع الجداول الخام مباشرة. أي تعارض = خطأ
   حقيقي في منطق التطبيق. يعمل على القاعدة المحدَّدة عبر SIM_USERDATA (لا يمسّ
   قاعدة المستخدم). يُنهي بكود 1 عند أي فشل.

   التشغيل:
     SIM_USERDATA=<dir> node --experimental-strip-types \
       --import ./scripts/register.mjs scripts/verify-integrity.ts
════════════════════════════════════════════════════════════════════════ */
import { initDB, getDB } from '../src/database.ts'
import { registerIpcHandlers } from '../electron/ipc-handlers.ts'
import { invoke } from './electron-stub.mjs'

initDB()
const db = getDB()
registerIpcHandlers(db)

const EPS = 0.01
let failures = 0
function ok(name: string) { console.log(`  ✅ ${name}`) }
function fail(name: string, detail: string) { failures++; console.log(`  ❌ ${name}\n       ${detail}`) }
function approx(a: number, b: number) { return Math.abs(a - b) <= EPS }

function one<T = any>(sql: string, ...p: unknown[]): T { return db.prepare(sql).get(...p) as T }
function all<T = any>(sql: string, ...p: unknown[]): T[] { return db.prepare(sql).all(...p) as T[] }

console.log('══════════ فحص سلامة قاعدة المحاكاة ══════════')

// ── 1) رصيد الصندوق التراكمي ────────────────────────────────────────────────
{
  const rows = all<{ id: number; amount_in: number; amount_out: number; balance_after: number }>(
    'SELECT id, amount_in, amount_out, balance_after FROM cash_ledger ORDER BY id ASC')
  let running = 0, bad = 0, firstBad = ''
  for (const r of rows) {
    running += r.amount_in - r.amount_out
    if (!approx(running, r.balance_after)) { bad++; if (!firstBad) firstBad = `صف id=${r.id}: متوقّع ${running.toFixed(2)} مخزّن ${r.balance_after.toFixed(2)}` }
  }
  const sum = one<{ ti: number; to: number }>('SELECT COALESCE(SUM(amount_in),0) ti, COALESCE(SUM(amount_out),0) to_ FROM cash_ledger') as any
  const totIn = one<{ v: number }>('SELECT COALESCE(SUM(amount_in),0) v FROM cash_ledger').v
  const totOut = one<{ v: number }>('SELECT COALESCE(SUM(amount_out),0) v FROM cash_ledger').v
  const last = rows.length ? rows[rows.length - 1].balance_after : 0
  if (bad === 0 && approx(totIn - totOut, last)) ok(`رصيد الصندوق: كل ${rows.length} صف متسق، وآخر balance_after = Σin−Σout = ${last.toFixed(2)}`)
  else fail('رصيد الصندوق التراكمي', bad ? `${bad} صف غير متسق. أول واحد: ${firstBad}` : `آخر رصيد ${last} ≠ Σin−Σout ${(totIn - totOut).toFixed(2)}`)
}

// ── 2) توازن كل فاتورة: paid + remaining + Σsettlement ≈ total ───────────────
function checkInvoiceBalance(label: string, table: string, paymentTables: string[], typeScoped: boolean) {
  const invs = all<{ id: number; total_amount: number; amount_paid: number; amount_remaining: number }>(
    `SELECT id, total_amount, amount_paid, amount_remaining FROM ${table}`)
  let bad = 0, firstBad = ''
  for (const inv of invs) {
    let settle = 0
    for (const pt of paymentTables) {
      const cond = typeScoped ? `invoice_id=? AND invoice_type=?` : `invoice_id=?`
      const params = typeScoped ? [inv.id, label === 'صيانة' ? 'maintenance' : 'direct_sale'] : [inv.id]
      settle += one<{ v: number }>(`SELECT COALESCE(SUM(settlement_discount),0) v FROM ${pt} WHERE ${cond}`, ...params).v
    }
    if (!approx(inv.amount_paid + inv.amount_remaining + settle, inv.total_amount)) {
      bad++
      if (!firstBad) firstBad = `id=${inv.id}: paid ${inv.amount_paid}+rem ${inv.amount_remaining}+settle ${settle} ≠ total ${inv.total_amount}`
    }
  }
  if (bad === 0) ok(`توازن فواتير ${label}: كل ${invs.length} فاتورة (paid+remaining+settlement = total)`)
  else fail(`توازن فواتير ${label}`, `${bad} فاتورة غير متوازنة. أول واحدة: ${firstBad}`)
}
checkInvoiceBalance('صيانة', 'maintenance_invoices', ['payments', 'debt_payments'], true)
checkInvoiceBalance('بيع مباشر', 'direct_sale_invoices', ['payments', 'debt_payments'], true)
checkInvoiceBalance('موردين', 'supplier_invoices', ['supplier_payments', 'supplier_debt_payments'], false)

// ── 3) لا تكرار في invoice_number ──────────────────────────────────────────
{
  const nums = [
    ...all<{ n: string }>(`SELECT invoice_number n FROM maintenance_invoices WHERE invoice_number IS NOT NULL`),
    ...all<{ n: string }>(`SELECT invoice_number n FROM direct_sale_invoices WHERE invoice_number IS NOT NULL`),
    ...all<{ n: string }>(`SELECT invoice_number n FROM supplier_invoices WHERE invoice_number IS NOT NULL`),
  ].map(r => r.n)
  const seen = new Set<string>(); const dups = new Set<string>()
  for (const n of nums) { if (seen.has(n)) dups.add(n); else seen.add(n) }
  if (dups.size === 0) ok(`أرقام الفواتير: ${nums.length} رقماً كلها فريدة (INV مشترك صيانة/بيع، PUR للموردين)`)
  else fail('تكرار أرقام الفواتير', `مكرّرات: ${[...dups].slice(0, 5).join(', ')}`)
}

// ── 4) لا amount_remaining سالب ────────────────────────────────────────────
{
  let bad = 0; const parts: string[] = []
  for (const [label, table] of [['صيانة', 'maintenance_invoices'], ['بيع', 'direct_sale_invoices'], ['مورد', 'supplier_invoices']] as const) {
    const c = one<{ c: number }>(`SELECT COUNT(*) c FROM ${table} WHERE amount_remaining < -${EPS}`).c
    if (c > 0) { bad += c; parts.push(`${label}:${c}`) }
  }
  if (bad === 0) ok('لا يوجد amount_remaining سالب في أي جدول فواتير')
  else fail('متبقّي سالب', parts.join(' | '))
}

// ── 5) لا كفالات يتيمة (source_id بلا فاتورة مصدر) ──────────────────────────
{
  const orphans = all<{ id: number; source: string; source_id: number }>(`
    SELECT w.id, w.source, w.source_id FROM warranties w
    WHERE (w.source='maintenance' AND NOT EXISTS (SELECT 1 FROM maintenance_invoices m WHERE m.id=w.source_id))
       OR (w.source='direct_sale' AND NOT EXISTS (SELECT 1 FROM direct_sale_invoices d WHERE d.id=w.source_id))`)
  const total = one<{ c: number }>('SELECT COUNT(*) c FROM warranties').c
  if (orphans.length === 0) ok(`الكفالات: كل ${total} كفالة لها فاتورة مصدر موجودة (لا يتيمة)`)
  else fail('كفالات يتيمة', `${orphans.length} كفالة بلا فاتورة مصدر. أمثلة: ${orphans.slice(0, 5).map(o => `w#${o.id}→${o.source}#${o.source_id}`).join(', ')}`)
}

// ── 6) كل دفعة شيك/فيزا لها صف تفصيل مطابق ──────────────────────────────────
{
  const map: [string, string, string][] = [
    ['payments', 'payment_cheque', 'payment_visa'],
    ['debt_payments', 'debt_payment_cheque', 'debt_payment_visa'],
    ['supplier_payments', 'supplier_payment_cheque', 'supplier_payment_visa'],
    ['supplier_debt_payments', 'supplier_debt_cheque', 'supplier_debt_visa'],
  ]
  let bad = 0; const parts: string[] = []
  for (const [pay, chq, visa] of map) {
    const missChq = one<{ c: number }>(`SELECT COUNT(*) c FROM ${pay} p WHERE p.method='cheque' AND NOT EXISTS (SELECT 1 FROM ${chq} d WHERE d.payment_id=p.id)`).c
    const missVisa = one<{ c: number }>(`SELECT COUNT(*) c FROM ${pay} p WHERE p.method='visa' AND NOT EXISTS (SELECT 1 FROM ${visa} d WHERE d.payment_id=p.id)`).c
    if (missChq) { bad += missChq; parts.push(`${pay}.cheque:${missChq}`) }
    if (missVisa) { bad += missVisa; parts.push(`${pay}.visa:${missVisa}`) }
  }
  if (bad === 0) ok('كل دفعات الشيك/الفيزا في الجداول الأربعة لها صف تفصيل مطابق')
  else fail('دفعات بلا تفصيل', parts.join(' | '))
}

// ── 7) اتساق التقارير مع مجاميع الجداول الخام ───────────────────────────────
{
  // 7-أ) report:daily لعيّنة تواريخ = مجاميع cash_ledger لليوم، وbreakdown = net
  const dates = all<{ d: string }>(`SELECT DISTINCT transaction_date d FROM cash_ledger ORDER BY transaction_date`).map(r => r.d)
  const sample = dates.filter((_, i) => i % 37 === 0).slice(0, 60)
  let dailyBad = 0, bdBad = 0, firstD = ''
  for (const date of sample) {
    const rep = await invoke('report:daily', date)
    const raw = one<{ ti: number; to: number }>(`SELECT COALESCE(SUM(amount_in),0) ti, COALESCE(SUM(amount_out),0) to_ FROM cash_ledger WHERE transaction_date=?`, date) as any
    const rawIn = one<{ v: number }>(`SELECT COALESCE(SUM(amount_in),0) v FROM cash_ledger WHERE transaction_date=?`, date).v
    const rawOut = one<{ v: number }>(`SELECT COALESCE(SUM(amount_out),0) v FROM cash_ledger WHERE transaction_date=?`, date).v
    if (!approx(rep.total_in, rawIn) || !approx(rep.total_out, rawOut)) { dailyBad++; if (!firstD) firstD = `${date}: تقرير in=${rep.total_in}/out=${rep.total_out} خام in=${rawIn}/out=${rawOut}` }
    const bd = await invoke('cashAudit:getSystemBreakdown', date)
    /* الـ breakdown يَنسِب الشيك ليوم *استلامه* (منطق إحصاء نهاية اليوم: الشيك
       المستلَم اليوم موجود فعلياً بالدرج)، بينما الصندوق (ledger) يَنسِبه ليوم
       *صرفه*. الفرق بين المجموعين يجب أن يساوي بالضبط فرق التوقيت هذا:
         (شيكات واردة استُلمت اليوم − شيكات واردة صُرفت اليوم)
       − (شيكات صادرة سُلِّمت اليوم − شيكات صادرة صُرفت اليوم)                */
    const inPaidToday =
      one<{ v: number }>(`SELECT COALESCE(SUM(amount),0) v FROM payments WHERE payment_date=? AND method='cheque'`, date).v +
      one<{ v: number }>(`SELECT COALESCE(SUM(amount),0) v FROM debt_payments WHERE payment_date=? AND method='cheque'`, date).v
    const inCashedToday =
      one<{ v: number }>(`SELECT COALESCE(SUM(p.amount),0) v FROM payments p JOIN payment_cheque c ON c.payment_id=p.id WHERE c.cashed_date=? AND c.status='cashed'`, date).v +
      one<{ v: number }>(`SELECT COALESCE(SUM(p.amount),0) v FROM debt_payments p JOIN debt_payment_cheque c ON c.payment_id=p.id WHERE c.cashed_date=? AND c.status='cashed'`, date).v
    const outPaidToday =
      one<{ v: number }>(`SELECT COALESCE(SUM(amount),0) v FROM supplier_payments WHERE payment_date=? AND method='cheque'`, date).v +
      one<{ v: number }>(`SELECT COALESCE(SUM(amount),0) v FROM supplier_debt_payments WHERE payment_date=? AND method='cheque'`, date).v
    const outCashedToday =
      one<{ v: number }>(`SELECT COALESCE(SUM(p.amount),0) v FROM supplier_payments p JOIN supplier_payment_cheque c ON c.payment_id=p.id WHERE c.cashed_date=? AND c.status='cashed'`, date).v +
      one<{ v: number }>(`SELECT COALESCE(SUM(p.amount),0) v FROM supplier_debt_payments p JOIN supplier_debt_cheque c ON c.payment_id=p.id WHERE c.cashed_date=? AND c.status='cashed'`, date).v
    const chequeTimingAdj = (inPaidToday - inCashedToday) - (outPaidToday - outCashedToday)
    if (!approx(bd.cash + bd.visa + bd.cheque, rep.net + chequeTimingAdj)) { bdBad++ }
  }
  if (dailyBad === 0) ok(`report:daily متسق مع الصندوق الخام في ${sample.length} تاريخ عيّنة`)
  else fail('report:daily', `${dailyBad}/${sample.length} تاريخ غير متسق. أول: ${firstD}`)
  if (bdBad === 0) ok(`cashAudit:getSystemBreakdown = صافي اليوم بعد تسوية توقيت الشيكات في ${sample.length} تاريخ`)
  else fail('cashAudit breakdown', `${bdBad}/${sample.length} تاريخ: مجموع الطرق ≠ صافي اليوم (بعد تسوية توقيت الشيكات)`)

  // 7-ب) report:monthly لعيّنة أشهر
  const months = all<{ m: string }>(`SELECT DISTINCT substr(transaction_date,1,7) m FROM cash_ledger ORDER BY m`).map(r => r.m)
  const sampleM = months.filter((_, i) => i % 11 === 0)
  let monBad = 0, firstM = ''
  for (const ym of sampleM) {
    const [y, mo] = ym.split('-').map(Number)
    const rep = await invoke('report:monthly', mo, y)
    const rawIn = one<{ v: number }>(`SELECT COALESCE(SUM(amount_in),0) v FROM cash_ledger WHERE substr(transaction_date,1,7)=?`, ym).v
    const rawOut = one<{ v: number }>(`SELECT COALESCE(SUM(amount_out),0) v FROM cash_ledger WHERE substr(transaction_date,1,7)=?`, ym).v
    if (!approx(rep.total_in, rawIn) || !approx(rep.total_out, rawOut)) { monBad++; if (!firstM) firstM = `${ym}: تقرير ${rep.total_in}/${rep.total_out} خام ${rawIn}/${rawOut}` }
  }
  if (monBad === 0) ok(`report:monthly متسق مع الصندوق الخام في ${sampleM.length} شهر عيّنة`)
  else fail('report:monthly', `${monBad} شهر غير متسق. أول: ${firstM}`)

  // 7-ج) report:debtsAging = مجموع المتبقّي>0 عبر الجداول الثلاثة
  const aging = await invoke('report:debtsAging')
  const agingSum = aging.reduce((s: number, r: any) => s + r.amount_remaining, 0)
  const rawDebt =
    one<{ v: number }>(`SELECT COALESCE(SUM(amount_remaining),0) v FROM maintenance_invoices WHERE amount_remaining>${EPS}`).v +
    one<{ v: number }>(`SELECT COALESCE(SUM(amount_remaining),0) v FROM direct_sale_invoices WHERE amount_remaining>${EPS}`).v +
    one<{ v: number }>(`SELECT COALESCE(SUM(amount_remaining),0) v FROM supplier_invoices WHERE amount_remaining>${EPS}`).v
  if (approx(agingSum, rawDebt)) ok(`report:debtsAging: مجموع الديون ${agingSum.toFixed(2)} = المجموع الخام (${aging.length} دين)`)
  else fail('report:debtsAging', `مجموع التقرير ${agingSum.toFixed(2)} ≠ الخام ${rawDebt.toFixed(2)}`)
}

// ── 8) اتساق جداول الدفعة العامة للمورد ─────────────────────────────────────
{
  // (أ) amount بالترويسة = مجموع توزيعاتها الفعلي (تسامح 0.001)
  const headers = all<{ id: number; amount: number; alloc_total: number; alloc_count: number }>(`
    SELECT bp.id, bp.amount,
           COALESCE(SUM(a.amount), 0) AS alloc_total,
           COUNT(a.id)               AS alloc_count
      FROM supplier_bulk_payments bp
      LEFT JOIN supplier_bulk_payment_allocations a ON a.bulk_payment_id = bp.id
     GROUP BY bp.id`)
  const mismatched = headers.filter(h => Math.abs(h.amount - h.alloc_total) > 0.001)
  if (mismatched.length === 0) ok(`الدفعات العامة: amount كل ${headers.length} ترويسة = مجموع توزيعاتها`)
  else fail('تطابق مبلغ الدفعة العامة مع توزيعها',
    `${mismatched.length} ترويسة غير مطابقة. أمثلة: ${mismatched.slice(0, 5).map(h => `#${h.id}: amount ${h.amount.toFixed(2)} ≠ Σalloc ${h.alloc_total.toFixed(2)}`).join('، ')}`)

  // (ب) لا ترويسة يتيمة بلا أي صف توزيع مرتبط بها إطلاقاً
  const orphanHeaders = headers.filter(h => h.alloc_count === 0)
  if (orphanHeaders.length === 0) ok('الدفعات العامة: لا ترويسة يتيمة بلا توزيع')
  else fail('ترويسات دفعة عامة يتيمة',
    `${orphanHeaders.length} ترويسة بلا أي توزيع. أمثلة: ${orphanHeaders.slice(0, 5).map(h => `#${h.id} (amount ${h.amount.toFixed(2)})`).join('، ')}`)

  // (ج) لا صف توزيع يشير لفاتورة مورد غير موجودة فعلياً
  const orphanAllocs = all<{ id: number; bulk_payment_id: number; invoice_id: number }>(`
    SELECT a.id, a.bulk_payment_id, a.invoice_id
      FROM supplier_bulk_payment_allocations a
     WHERE NOT EXISTS (SELECT 1 FROM supplier_invoices si WHERE si.id = a.invoice_id)`)
  const allocTotal = one<{ c: number }>('SELECT COUNT(*) c FROM supplier_bulk_payment_allocations').c
  if (orphanAllocs.length === 0) ok(`الدفعات العامة: كل ${allocTotal} صف توزيع يشير لفاتورة مورد موجودة`)
  else fail('توزيعات دفعة عامة يتيمة',
    `${orphanAllocs.length} توزيع يشير لفاتورة غير موجودة. أمثلة: ${orphanAllocs.slice(0, 5).map(a => `alloc#${a.id}→inv#${a.invoice_id} (bulk#${a.bulk_payment_id})`).join('، ')}`)
}

console.log('══════════════════════════════════════════════')
if (failures === 0) { console.log('🎉 نجحت كل الفحوص — لا تعارض بين منطق التطبيق والبيانات الخام.'); process.exit(0) }
else { console.log(`🔴 ${failures} فحص فشل.`); process.exit(1) }
