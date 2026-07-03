/* ════════════════════════════════════════════════════════════════════════
   simulate-history.ts — محاكاة ~10 سنوات من عمل الكراج على قاعدة بيانات تجريبية.
   يستدعي الكود الحقيقي عبر قنوات IPC الفعلية (electron مُستبدَل بـ stub تجريبي).
   لا يمسّ أي قاعدة بيانات حقيقية للمستخدم — يعمل على مجلد مؤقت عبر SIM_USERDATA.

   التشغيل:
     SIM_USERDATA=<dir> node --experimental-strip-types \
       --import ./scripts/register.mjs scripts/simulate-history.ts
════════════════════════════════════════════════════════════════════════ */
import { initDB, getDB } from '../src/database.ts'
import { registerIpcHandlers } from '../electron/ipc-handlers.ts'
import { invoke } from './electron-stub.mjs'
import type { PaymentInput, PaymentMethod } from '../src/db/types.ts'

// ── PRNG مبذور (متكرّر النتائج) ──────────────────────────────────────────────
let seed = 20260703
function rnd(): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff }
function ri(a: number, b: number): number { return a + Math.floor(rnd() * (b - a + 1)) }
function pick<T>(arr: T[]): T { return arr[ri(0, arr.length - 1)] }
function chance(p: number): boolean { return rnd() < p }
function money(a: number, b: number): number { return ri(a, b) + (chance(0.5) ? 0.5 : 0) }

function d(dt: Date): string { return dt.toISOString().slice(0, 10) }
function addDays(base: Date, n: number): Date { const x = new Date(base); x.setDate(x.getDate() + n); return x }

const NAMES = ['أحمد', 'محمد', 'خالد', 'يوسف', 'سامي', 'ليلى', 'عمر', 'ربيع', 'نور', 'زيد', 'هالة', 'وسيم']
const PLATES = ['12-345', '67-890', '11-222', '33-444', '55-666', '77-888', '99-000', '10-101']
const CARS = ['تويوتا', 'هيونداي', 'كيا', 'نيسان', 'فورد', 'مرسيدس']
const COLORS = ['أبيض', 'أسود', 'رمادي', 'أحمر', 'أزرق']
const SUPPLIERS = ['مورد القطع الأصلية', 'شركة الزيوت', 'مخزن الإطارات', 'كهرباء السيارات', 'مورد البطاريات']
const UNITS = ['week', 'month', 'year'] as const
const BANKS = ['البنك العربي', 'بنك فلسطين', 'الكويتي', 'القاهرة عمان']

let chequeCounter = 1

// دفعة بطريقة عشوائية لا تتجاوز المبلغ المتاح؛ تُنتج تفاصيل شيك/فيزا صحيحة.
function makePayment(maxAmount: number, date: Date, allowDebt = true): PaymentInput | null {
  if (maxAmount <= 0) return allowDebt ? { method: 'debt', amount: 0 } : null
  const roll = rnd()
  let method: PaymentMethod
  if (roll < 0.55) method = 'cash'
  else if (roll < 0.72) method = 'cheque'
  else if (roll < 0.85) method = 'visa'
  else method = 'debt'

  if (method === 'debt') return { method: 'debt', amount: 0 }

  // أحياناً دفع كامل، أحياناً جزئي
  const amount = chance(0.45) ? maxAmount : Math.min(maxAmount, money(10, Math.max(11, Math.floor(maxAmount))))
  if (amount <= 0) return { method: 'debt', amount: 0 }

  const p: PaymentInput = { method, amount }
  if (method === 'cheque') {
    p.chequeNumber = `CHQ-${chequeCounter++}`
    p.issueDate = d(date)
    // تواريخ استحقاق ماضية ومستقبلية
    p.cashDate = d(addDays(date, ri(-30, 120)))
    p.bankName = pick(BANKS)
  } else if (method === 'visa') {
    p.bankName = pick(BANKS)
    p.transactionNumber = `TXN-${ri(100000, 999999)}`
  }
  return p
}

function warrantyJson(): string | undefined {
  if (!chance(0.4)) return undefined
  return JSON.stringify({ value: ri(1, 12), unit: pick([...UNITS]) })
}

// خصم فاتورة صيانة/بيع: أحياناً حالات حدّية (نسبة 100، ثابت = المجموع بالضبط)
function invoiceDiscount(subtotal: number): { discount_type: 'fixed' | 'percentage' | null; discount_value: number } {
  if (subtotal <= 0) return { discount_type: null, discount_value: 0 }
  const roll = rnd()
  if (roll < 0.6) return { discount_type: null, discount_value: 0 }
  if (roll < 0.75) return { discount_type: 'percentage', discount_value: ri(5, 30) }
  if (roll < 0.85) return { discount_type: 'percentage', discount_value: 100 }          // حدّي (صالح)
  if (roll < 0.95) return { discount_type: 'fixed', discount_value: Math.min(subtotal, money(5, Math.max(6, Math.floor(subtotal / 2)))) }
  return { discount_type: 'fixed', discount_value: subtotal }                            // حدّي: = المجموع بالضبط (صالح)
}

// ── التهيئة ──────────────────────────────────────────────────────────────────
initDB()
const db = getDB()
registerIpcHandlers(db)

const stats = {
  maintenance: 0, directSale: 0, supplier: 0, expense: 0, salary: 0,
  deliveries: 0, debtCollections: 0, settlements: 0,
  deletes: 0, edits: 0, cashAudits: 0,
  overflowAttempts: 0, overflowRejected: 0,
}
const findings: string[] = []

// موظفون
const employeeIds: number[] = []
for (let i = 0; i < 5; i++) {
  employeeIds.push(await invoke('employee:add', { name: pick(NAMES), phone: `059${ri(1000000, 9999999)}`, daily_wage: money(80, 150) }))
}

// سجلّ فواتير قابلة للتحصيل لاحقاً (فيها متبقّي)
type OpenInvoice = { id: number; type: 'maintenance' | 'direct_sale'; supplier?: boolean }
const openCustomer: OpenInvoice[] = []
const openSupplier: number[] = []
const maintenanceInProgress: number[] = []

const start = new Date('2016-01-01')
const totalDays = 3652 // ~10 سنوات

for (let day = 0; day < totalDays; day++) {
  const today = addDays(start, day)
  const dow = today.getDay()
  // عطلة: الجمعة غالباً، وتذبذب موسمي (شتاء أنشط قليلاً)
  if (dow === 5 && chance(0.8)) continue
  if (chance(0.15)) continue

  const month = today.getMonth()
  const seasonBoost = (month <= 1 || month === 11) ? 1.4 : 1.0
  const dailyInvoices = Math.round(ri(0, 3) * seasonBoost)

  for (let k = 0; k < dailyInvoices; k++) {
    // فاتورة صيانة
    const nItems = ri(1, 4)
    const items = Array.from({ length: nItems }, () => ({
      item_name: pick(['زيت محرك', 'فلتر', 'فرامل', 'بطارية', 'إطار', 'صيانة عامة', 'كهرباء']),
      quantity: ri(1, 4), unit_price: money(20, 400),
      part_type: chance(0.4) ? 'service' : 'part',
      customer_owned: chance(0.1),
      warranty: warrantyJson(),
    }))
    const subtotal = items.reduce((s, it) => s + (it.customer_owned ? 0 : it.quantity * it.unit_price), 0)
    const disc = invoiceDiscount(subtotal)
    // الإجمالي بعد الخصم لتحديد سقف الدفعة الأولية
    let total = subtotal
    if (disc.discount_type === 'percentage') total = subtotal - subtotal * disc.discount_value / 100
    else if (disc.discount_type === 'fixed') total = subtotal - disc.discount_value
    const pay = makePayment(chance(0.6) ? total : Math.min(total, money(0, Math.max(1, Math.floor(total)))), today)
    const mId = await invoke('maintenance:add', {
      customer_name: pick(NAMES), customer_phone: chance(0.8) ? `059${ri(1000000, 9999999)}` : undefined,
      car_plate: pick(PLATES), car_type: pick(CARS), car_color: pick(COLORS),
      date_received: d(today), notes: chance(0.3) ? 'ملاحظة صيانة' : undefined,
      discount_type: disc.discount_type, discount_value: disc.discount_value,
      items, payments: pay ? [pay] : [{ method: 'debt', amount: 0 }],
    })
    stats.maintenance++
    maintenanceInProgress.push(mId)
  }

  // فواتير بيع مباشر
  if (chance(0.5)) {
    const items = Array.from({ length: ri(1, 3) }, () => ({
      item_name: pick(['إطار', 'بطارية', 'زيت', 'مساحات', 'إكسسوار']),
      quantity: ri(1, 5), unit_price: money(15, 300),
    }))
    const subtotal = items.reduce((s, it) => s + it.quantity * it.unit_price, 0)
    const disc = invoiceDiscount(subtotal)
    let total = subtotal
    if (disc.discount_type === 'percentage') total = subtotal - subtotal * disc.discount_value / 100
    else if (disc.discount_type === 'fixed') total = subtotal - disc.discount_value
    const pay = makePayment(chance(0.7) ? total : Math.min(total, money(0, Math.max(1, Math.floor(total)))), today)
    const dId = await invoke('directSale:add', {
      customer_name: pick(NAMES), customer_phone: chance(0.7) ? `059${ri(1000000, 9999999)}` : undefined,
      sale_date: d(today), warranty: warrantyJson(),
      discount_type: disc.discount_type, discount_value: disc.discount_value,
      items, payments: pay ? [pay] : [{ method: 'debt', amount: 0 }],
    })
    stats.directSale++
    const rem = (await invoke('directSale:getOne', dId)).amount_remaining
    if (rem > 0.001) openCustomer.push({ id: dId, type: 'direct_sale' })
  }

  // فواتير موردين
  if (chance(0.3)) {
    const items = Array.from({ length: ri(1, 4) }, () => {
      const qty = ri(1, 10), price = money(20, 200), gross = qty * price
      const droll = rnd()
      const dtype = droll < 0.7 ? null : (droll < 0.85 ? 'percentage' as const : 'fixed' as const)
      const dval = dtype === null ? 0
        : dtype === 'percentage' ? ri(5, 20)
        : Math.min(gross, money(5, 30))   // خصم البند الثابت لا يتجاوز إجمالي البند
      return {
        item_name: pick(['قطع غيار', 'زيوت', 'إطارات', 'بطاريات']),
        quantity: qty, unit_price: price,
        discount_type: dtype, discount_value: dval,
      }
    })
    const total = items.reduce((s, it) => {
      let t = it.quantity * it.unit_price
      if (it.discount_type === 'percentage') t -= t * it.discount_value / 100
      else if (it.discount_type === 'fixed') t = Math.max(0, t - it.discount_value)
      return s + t
    }, 0)
    const pay = makePayment(chance(0.5) ? total : Math.min(total, money(0, Math.max(1, Math.floor(total)))), today, true)
    const sId = await invoke('supplierInvoice:add', {
      supplier_name: pick(SUPPLIERS), supplier_phone: `04${ri(1000000, 9999999)}`,
      purchase_date: d(today), items,
      payments: pay ? [pay] : [{ method: 'debt', amount: 0 }],
    })
    stats.supplier++
    const rem = (await invoke('supplierInvoice:getOne', sId)).amount_remaining
    if (rem > 0.001) openSupplier.push(sId)
  }

  // مصاريف يومية متكررة
  if (chance(0.6)) {
    await invoke('expense:add', { description: pick(['كهرباء', 'ماء', 'قرطاسية', 'وقود', 'صيانة معدات', 'ضيافة']), amount: money(10, 200), expense_date: d(today) })
    stats.expense++
  }

  // رواتب (نهاية الشهر)
  if (today.getDate() >= 28 && chance(0.5)) {
    const emp = pick(employeeIds)
    await invoke('salary:add', emp, { days_worked: ri(20, 26), bonus: chance(0.3) ? money(50, 300) : 0, deduction: chance(0.2) ? money(20, 150) : 0, payment_date: d(today) })
    stats.salary++
  }

  // تسليم سيارات صيانة قديمة (مع دفعة + أحياناً خصم تسوية)
  while (maintenanceInProgress.length > 0 && chance(0.5)) {
    const mId = maintenanceInProgress.shift()!
    const inv = await invoke('maintenance:getOne', mId)
    if (!inv || inv.status === 'delivered') continue
    const rem = inv.amount_remaining
    const payAmt = rem > 0 ? (chance(0.6) ? rem : Math.min(rem, money(0, Math.max(1, Math.floor(rem))))) : 0
    const settlement = (rem - payAmt > 1 && chance(0.25)) ? Math.min(rem - payAmt, money(1, Math.max(2, Math.floor(rem - payAmt)))) : 0
    if (settlement > 0) stats.settlements++
    try {
      await invoke('maintenance:deliver', {
        invoiceId: mId, date_released: d(today),
        payments: payAmt > 0 ? [makePaymentExact(payAmt, today)] : [{ method: 'debt', amount: 0 }],
        settlementDiscount: settlement,
      })
      stats.deliveries++
      const after = await invoke('maintenance:getOne', mId)
      if (after.amount_remaining > 0.001) openCustomer.push({ id: mId, type: 'maintenance' })
    } catch (e) {
      findings.push(`تسليم غير متوقع رُفض: ${(e as Error).message}`)
    }
  }

  // تحصيل ديون عملاء لاحقاً
  while (openCustomer.length > 0 && chance(0.4)) {
    const oc = openCustomer.shift()!
    const inv = await invoke(oc.type === 'maintenance' ? 'maintenance:getOne' : 'directSale:getOne', oc.id)
    if (!inv || inv.amount_remaining <= 0.001) continue
    const rem = inv.amount_remaining
    const payAmt = chance(0.5) ? rem : Math.min(rem, money(1, Math.max(2, Math.floor(rem))))
    const settlement = (rem - payAmt > 1 && chance(0.3)) ? (rem - payAmt) : 0
    if (settlement > 0) stats.settlements++
    await invoke('debt:addPayment', oc.id, oc.type, [makePaymentExact(payAmt, today)], d(today), settlement)
    stats.debtCollections++
    const after = await invoke(oc.type === 'maintenance' ? 'maintenance:getOne' : 'directSale:getOne', oc.id)
    if (after.amount_remaining > 0.001) openCustomer.push(oc)
  }

  // سداد ديون موردين لاحقاً
  while (openSupplier.length > 0 && chance(0.35)) {
    const sId = openSupplier.shift()!
    const inv = await invoke('supplierInvoice:getOne', sId)
    if (!inv || inv.amount_remaining <= 0.001) continue
    const rem = inv.amount_remaining
    const payAmt = chance(0.5) ? rem : Math.min(rem, money(1, Math.max(2, Math.floor(rem))))
    const settlement = (rem - payAmt > 1 && chance(0.3)) ? (rem - payAmt) : 0
    if (settlement > 0) stats.settlements++
    await invoke('supplierInvoice:addDebtPayment', sId, [makePaymentExact(payAmt, today)], d(today), settlement)
    const after = await invoke('supplierInvoice:getOne', sId)
    if (after.amount_remaining > 0.001) openSupplier.push(sId)
  }

  // محاولات تجاوز المتبقّي المتعمّدة (يجب أن تُرفض)
  if (chance(0.05)) {
    const cand = await invoke('debt:getAll', {})
    if (cand.length > 0) {
      const t = cand[ri(0, cand.length - 1)]
      stats.overflowAttempts++
      try {
        await invoke('debt:addPayment', t.invoice_id, t.invoice_type, [{ method: 'cash', amount: t.amount_remaining + money(50, 200) }], d(today), 0)
        findings.push(`⚠️ تجاوز المتبقّي لم يُرفض: فاتورة ${t.invoice_type} #${t.invoice_id}`)
      } catch { stats.overflowRejected++ }
    }
  }

  // تعديل فاتورة صيانة قديمة (بنود جديدة إجماليها ≥ المدفوع مسبقاً — تعديل واقعي)
  if (chance(0.04)) {
    const all = await invoke('maintenance:getAll', {})
    if (all.length > 0) {
      const inv = all[ri(0, all.length - 1)]
      // بند رئيسي يغطّي المدفوع + بنود صغيرة، كي لا يهبط الإجمالي تحت المدفوع (يُرفض عمداً)
      const base = Math.ceil(inv.amount_paid) + ri(50, 500)
      const newItems = [
        { item_name: 'بند معدّل رئيسي', quantity: 1, unit_price: base, part_type: 'part' },
        ...Array.from({ length: ri(0, 2) }, () => ({ item_name: 'بند معدّل', quantity: ri(1, 3), unit_price: money(30, 250), part_type: 'part' })),
      ]
      try {
        await invoke('maintenance:update', inv.id, { items: newItems, discount_type: null, discount_value: 0, notes: 'تعديل تدقيق' })
        stats.edits++
      } catch { /* قد يُرفض لأسباب مشروعة */ }
    }
  }

  // حذف فاتورة قديمة أحياناً
  if (chance(0.02)) {
    const all = await invoke('directSale:getAll', {})
    if (all.length > 3) {
      const victim = all[all.length - 1]
      await invoke('directSale:delete', victim.id)
      stats.deletes++
      const idx = openCustomer.findIndex(o => o.id === victim.id && o.type === 'direct_sale')
      if (idx >= 0) openCustomer.splice(idx, 1)
    }
  }

  // إحصاء نهاية اليوم أحياناً (بعضها بفرق متعمّد)
  if (chance(0.2)) {
    const bd = await invoke('cashAudit:getSystemBreakdown', d(today))
    const sysTotal = bd.cash + bd.visa + bd.cheque
    const diff = chance(0.3) ? money(-50, 50) : 0
    await invoke('cashAudit:save', {
      audit_date: d(today), system_total: sysTotal,
      actual_cash: bd.cash + diff, actual_visa: bd.visa, actual_check: bd.cheque,
      actual_amount: sysTotal + diff, difference: diff,
    })
    stats.cashAudits++
  }
}

// دفعة نقدية بمبلغ محدّد بطريقة عشوائية (لا debt) — للتحصيل/التسليم
function makePaymentExact(amount: number, date: Date): PaymentInput {
  const roll = rnd()
  const method: PaymentMethod = roll < 0.6 ? 'cash' : roll < 0.8 ? 'cheque' : 'visa'
  const p: PaymentInput = { method, amount }
  if (method === 'cheque') {
    p.chequeNumber = `CHQ-${chequeCounter++}`; p.issueDate = d(date)
    p.cashDate = d(addDays(date, ri(-30, 120))); p.bankName = pick(BANKS)
  } else if (method === 'visa') {
    p.bankName = pick(BANKS); p.transactionNumber = `TXN-${ri(100000, 999999)}`
  }
  return p
}

console.log('── إحصاءات التوليد ──')
console.log(JSON.stringify(stats, null, 2))
if (findings.length) {
  console.log('\n⚠️ ملاحظات أثناء التوليد:')
  findings.forEach(f => console.log('  - ' + f))
} else {
  console.log('\n✅ لا ملاحظات أثناء التوليد (كل محاولات التجاوز رُفِضت كما يجب).')
}
console.log(`\nقاعدة المحاكاة: ${db.name}`)
