import { useState, useEffect, useMemo, useRef } from 'react'
import Fuse from 'fuse.js'
import { useGarage, CarRecord, PayMethod, PaymentRow, WarrantyPeriodUnit, DiscountType } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import CollapsibleCard from '../components/CollapsibleCard'
import MaintenanceForm, { hasMaintenanceDraft, clearMaintenanceDraft, type MaintenanceFormHandle } from '../components/forms/MaintenanceForm'
import Pagination from '../components/Pagination'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import { useSettlementTotal } from '../utils/useSettlementTotal'
import type { VatSettings } from '../db/types'

/* ════════════════════════════════════════
   Local helpers
════════════════════════════════════════ */
const UNIT_AR: Record<string, string> = { week: 'أسبوع', month: 'شهر', year: 'سنة' }

function parseWarrantyJson(raw: string): { value: number; unit: WarrantyPeriodUnit } | null {
  if (!raw) return null
  try {
    const w = JSON.parse(raw)
    if (w.value && w.unit) return { value: Number(w.value), unit: w.unit as WarrantyPeriodUnit }
  } catch {
    // ignore malformed warranty JSON
  }
  return null
}

function warrantyLabel(raw: string): string {
  if (!raw) return '—'
  const w = parseWarrantyJson(raw)
  if (w) return `${w.value} ${UNIT_AR[w.unit] ?? w.unit}`
  return raw || '—'
}

/* تفكيك خصم الفاتورة للعرض (مودال التفاصيل/الإيصال): total مخزَّن بعد الخصم.
   itemsSubtotal يُمرَّر عند توفّر البنود (getOne)، وإلا يُشتق المجموع قبل الخصم
   من total والخصم (بنود صفوف الجدول من GarageContext لا تحمل البنود). */
type DiscountBreakdown = { subtotal: number | null; label: string }
function discountBreakdown(
  total: number, type: DiscountType | null | undefined, value: number | undefined,
  itemsSubtotal: number | null,
): DiscountBreakdown | null {
  const v = value ?? 0
  if (!type || v <= 0) return null
  const round2 = (n: number) => Math.round(n * 100) / 100
  const fmtN = (n: number) => n.toLocaleString('en-US')
  if (type === 'fixed') {
    return { subtotal: round2(itemsSubtotal ?? total + v), label: `${fmtN(v)} ₪` }
  }
  const subtotal = itemsSubtotal ?? (v < 100 ? (total * 100) / (100 - v) : null)
  const amount = subtotal != null ? round2(subtotal - total) : null
  return {
    subtotal: subtotal != null ? round2(subtotal) : null,
    label: `${v}%${amount != null ? ` (${fmtN(amount)} ₪)` : ''}`,
  }
}

/* الضريبة (VAT) للعرض فقط (derived): تُحسب على المجموع بعد الخصم (total المخزَّن).
   تُرجع null عندما تكون الضريبة معطّلة أو النسبة ≤ 0 — فلا يظهر أي شيء متعلق بها. */
type VatBreakdown = { rate: number; tax: number; grand: number }
function vatBreakdown(base: number, vat: VatSettings | null): VatBreakdown | null {
  if (!vat || !vat.enabled || vat.rate <= 0) return null
  const round2 = (n: number) => Math.round(n * 100) / 100
  const tax = round2(base * vat.rate / 100)
  return { rate: vat.rate, tax, grand: round2(base + tax) }
}

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today   = () => new Date().toISOString().slice(0, 10)
let nextPayId = 100

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++, method: 'cash', amount: '' as unknown as number,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const daysInShop = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000))

const PAY_LABELS: Record<Exclude<PayMethod, 'debt'>, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }

function applySectionFilters(
  cars: CarRecord[], fuse: Fuse<{ _idx: number; customerName: string; invoiceNumber: string }>,
  search: string, phone: string, plate: string,
  from: string, to: string, amtMin: string, amtMax: string,
): CarRecord[] {
  const q = search.trim()
  let r = q ? fuse.search(normalizeAr(q)).map(x => cars[x.item._idx]) : [...cars]
  if (phone)  r = r.filter(c => c.phone.includes(phone))
  if (plate)  r = r.filter(c => normalizeAr(c.carPlate).includes(normalizeAr(plate)))
  if (from)   r = r.filter(c => c.dateReceived >= from)
  if (to)     r = r.filter(c => c.dateReceived <= to)
  if (amtMin) r = r.filter(c => c.total >= Number(amtMin))
  if (amtMax) r = r.filter(c => c.total <= Number(amtMax))
  return r
}

/* ════════════════════════════════════════
   Linked Ops Mini Table (reusable inside modal)
════════════════════════════════════════ */
function LinkedOpsSection({ phone, source, id }: { phone: string; source: string; id: number }) {
  const { getLinkedOps } = useGarage()
  const ops = useMemo(() => getLinkedOps(phone, source, id), [phone, source, id, getLinkedOps])
  if (!ops.length) return null
  const fmt = (n: number) => n.toLocaleString('en-US')
  return (
    <div className="linked-ops-section">
      <h4 className="linked-ops-title">عمليات سابقة لهذا الزبون ({ops.length})</h4>
      <div className="mi-parts-table-wrap">
        <table className="mi-parts-table">
          <thead>
            <tr><th>التاريخ</th><th>نوع العملية</th><th>الاسم / الوصف</th><th>الإجمالي</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {ops.map(op => (
              <tr key={`${op.source}-${op.id}`}>
                <td>{op.date}</td>
                <td><span className={op.sourceCls}>{op.sourceLabel}</span></td>
                <td>{op.name}</td>
                <td className="mi-amount">{fmt(op.total)} ₪</td>
                <td>{op.statusLabel && <span className={op.statusCls}>{op.statusLabel}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* عمليات سابقة مرتبطة بنمرة السيارة (بجانب قسم الهاتف — كلاهما يظهران معاً) */
function LinkedOpsByPlateSection({ carPlate, source, id }: { carPlate: string; source: string; id: number }) {
  const { getLinkedOpsByPlate } = useGarage()
  const ops = useMemo(() => getLinkedOpsByPlate(carPlate, source, id), [carPlate, source, id, getLinkedOpsByPlate])
  if (!ops.length) return null
  const fmt = (n: number) => n.toLocaleString('en-US')
  return (
    <div className="linked-ops-section">
      <h4 className="linked-ops-title">عمليات سابقة لهذه السيارة ({ops.length})</h4>
      <div className="mi-parts-table-wrap">
        <table className="mi-parts-table">
          <thead>
            <tr><th>التاريخ</th><th>نوع العملية</th><th>الاسم / الوصف</th><th>الإجمالي</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {ops.map(op => (
              <tr key={`${op.source}-${op.id}`}>
                <td>{op.date}</td>
                <td><span className={op.sourceCls}>{op.sourceLabel}</span></td>
                <td>{op.name}</td>
                <td className="mi-amount">{fmt(op.total)} ₪</td>
                <td>{op.statusLabel && <span className={op.statusCls}>{op.statusLabel}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function MaintenanceInvoices() {
  const { maintenanceCars: cars, reload } = useGarage()

  /* form (add inline + edit modal via shared MaintenanceForm) */
  const [showAddForm, setShowAddForm] = useState(hasMaintenanceDraft())
  const [editCar, setEditCar]         = useState<CarRecord | null>(null)
  const formRef = useRef<MaintenanceFormHandle>(null)
  const showForm = showAddForm || !!editCar

  /* modals */
  const [detailsCar, setDetailsCar]           = useState<CarRecord | null>(null)
  const detailsSettlement = useSettlementTotal(detailsCar ? 'maintenance' : null, detailsCar?.id ?? null)
  const [warnCar, setWarnCar]                 = useState<CarRecord | null>(null)
  const [deliveryCar, setDeliveryCar]         = useState<CarRecord | null>(null)
  const [deliveryDate, setDeliveryDate]       = useState(today())
  const [paymentRows, setPaymentRows]         = useState<PaymentRow[]>([])
  const [settleDiscount, setSettleDiscount]   = useState('')
  const [deleteCar, setDeleteCar]             = useState<CarRecord | null>(null)
  const [confirmDeliveryDebt, setConfirmDeliveryDebt] = useState(false)

  /* In-progress filters */
  const [ipSearch, setIpSearch] = useState(''); const [ipPhone, setIpPhone] = useState('')
  const [ipPlate, setIpPlate]   = useState(''); const [ipFrom, setIpFrom]   = useState('')
  const [ipTo, setIpTo]         = useState(''); const [ipAmtMin, setIpAmtMin] = useState('')
  const [ipAmtMax, setIpAmtMax] = useState('')

  /* Delivered filters */
  const [dlSearch, setDlSearch] = useState(''); const [dlPhone, setDlPhone] = useState('')
  const [dlPlate, setDlPlate]   = useState(''); const [dlFrom, setDlFrom]   = useState('')
  const [dlTo, setDlTo]         = useState(''); const [dlAmtMin, setDlAmtMin] = useState('')
  const [dlAmtMax, setDlAmtMax] = useState('')

  const inProgressCars = useMemo(() => cars.filter(c => c.status === 'in_progress'), [cars])
  const deliveredCars  = useMemo(() => cars.filter(c => c.status === 'delivered'),   [cars])

  const ipFuseItems = useMemo(() => inProgressCars.map((c, i) => ({ _idx: i, customerName: normalizeAr(c.customerName), invoiceNumber: normalizeAr(c.invoiceNumber ?? '') })), [inProgressCars])
  const ipFuse      = useMemo(() => new Fuse(ipFuseItems, { keys: ['customerName', 'invoiceNumber'], threshold: 0.4, ignoreLocation: true }), [ipFuseItems])
  const dlFuseItems = useMemo(() => deliveredCars.map((c, i) => ({ _idx: i, customerName: normalizeAr(c.customerName), invoiceNumber: normalizeAr(c.invoiceNumber ?? '') })), [deliveredCars])
  const dlFuse      = useMemo(() => new Fuse(dlFuseItems, { keys: ['customerName', 'invoiceNumber'], threshold: 0.4, ignoreLocation: true }), [dlFuseItems])

  const filteredInProgress = useMemo(() => applySectionFilters(inProgressCars, ipFuse, ipSearch, ipPhone, ipPlate, ipFrom, ipTo, ipAmtMin, ipAmtMax), [inProgressCars, ipFuse, ipSearch, ipPhone, ipPlate, ipFrom, ipTo, ipAmtMin, ipAmtMax])
  const filteredDelivered  = useMemo(() => applySectionFilters(deliveredCars,  dlFuse, dlSearch, dlPhone, dlPlate, dlFrom, dlTo, dlAmtMin, dlAmtMax), [deliveredCars,  dlFuse, dlSearch, dlPhone, dlPlate, dlFrom, dlTo, dlAmtMin, dlAmtMax])

  const hasIpFilters = !!(ipSearch || ipPhone || ipPlate || ipFrom || ipTo || ipAmtMin || ipAmtMax)
  const hasDlFilters = !!(dlSearch || dlPhone || dlPlate || dlFrom || dlTo || dlAmtMin || dlAmtMax)
  const clearIpFilters = () => { setIpSearch(''); setIpPhone(''); setIpPlate(''); setIpFrom(''); setIpTo(''); setIpAmtMin(''); setIpAmtMax('') }
  const clearDlFilters = () => { setDlSearch(''); setDlPhone(''); setDlPlate(''); setDlFrom(''); setDlTo(''); setDlAmtMin(''); setDlAmtMax('') }

  /* ── Pagination: In Progress ── */
  const [ipPage, setIpPage] = useState(1)
  const [ipPageSize, setIpPageSize] = useState(10)

  useEffect(() => {
    setIpPage(1)
  }, [ipSearch, ipPhone, ipPlate, ipFrom, ipTo, ipAmtMin, ipAmtMax])

  const paginatedInProgress = useMemo(() => {
    const start = (ipPage - 1) * ipPageSize
    return filteredInProgress.slice(start, start + ipPageSize)
  }, [filteredInProgress, ipPage, ipPageSize])

  /* ── Pagination: Delivered ── */
  const [dlPage, setDlPage] = useState(1)
  const [dlPageSize, setDlPageSize] = useState(10)

  useEffect(() => {
    setDlPage(1)
  }, [dlSearch, dlPhone, dlPlate, dlFrom, dlTo, dlAmtMin, dlAmtMax])

  const paginatedDelivered = useMemo(() => {
    const start = (dlPage - 1) * dlPageSize
    return filteredDelivered.slice(start, start + dlPageSize)
  }, [filteredDelivered, dlPage, dlPageSize])

  /* إعدادات الضريبة (VAT) — تُحمَّل مرة واحدة؛ null افتراضياً فلا يظهر أي شيء متعلق بها */
  const [vat, setVat] = useState<VatSettings | null>(null)
  useEffect(() => { dbService.vat.getSettings().then(setVat).catch(() => { /* تجاهل — تبقى الضريبة مخفية */ }) }, [])

  /* Edit flow — يجلب البنود الكاملة ثم يفتح نموذج التعديل المشترك */
  const openEdit = (car: CarRecord) => setWarnCar(car)

  const confirmEditCar = async () => {
    if (!warnCar) return
    const car = warnCar
    setWarnCar(null)
    clearMaintenanceDraft()
    try {
      const full = await dbService.maintenance.getOne(car.id)
      setEditCar(full ?? car)
    } catch (err) {
      showError('تعذّر تحميل بيانات الفاتورة', err)
    }
  }

  const openAddForm = () => { setEditCar(null); setShowAddForm(true) }
  const closeAddForm = () => { clearMaintenanceDraft(); setShowAddForm(false) }
  const closeEditForm = () => setEditCar(null)
  const onAddSaved  = () => setShowAddForm(false)
  const onEditSaved = () => setEditCar(null)

  /* Delivery modal */
  const openDelivery      = (car: CarRecord) => { setDeliveryCar(car); setDeliveryDate(today()); setPaymentRows([emptyPayRow()]); setSettleDiscount('') }
  const addPaymentRow     = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow  = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow  = (id: number, u: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...u }))

  const invoiceTotal   = deliveryCar?.total ?? 0
  const alreadyPaid    = deliveryCar?.amountPaid ?? 0
  const invoiceRemaining = deliveryCar ? Math.max(0, invoiceTotal - alreadyPaid) : 0
  const totalPaid      = paymentRows.reduce((s, r) => s + Number(r.amount || 0), 0)
  const settleNum      = Math.max(0, Number(settleDiscount || 0))
  const remaining      = invoiceRemaining - totalPaid - settleNum
  const deliveryExceeds = totalPaid + settleNum > invoiceRemaining + 0.001

  const handleDeliverySave = () => {
    if (!deliveryCar) return
    if (deliveryExceeds) {
      showError(`مجموع الدفعة والخصم (${fmt(totalPaid + settleNum)} ₪) يتجاوز المتبقي (${fmt(invoiceRemaining)} ₪)`, null)
      return
    }
    if (remaining > 0.009) {
      setConfirmDeliveryDebt(true)
      return
    }
    doDeliverConfirmed()
  }

  const doDeliverConfirmed = async () => {
    if (!deliveryCar) return
    const rows = paymentRows.filter(r => Number(r.amount) > 0)
    try {
      await dbService.maintenance.deliver(deliveryCar.id, deliveryDate, rows, settleNum)
      await reload()
      setConfirmDeliveryDebt(false)
      setDeliveryCar(null)
    } catch (err) {
      showError('تعذّر تسليم السيارة', err)
    }
  }

  /* UI helpers */
  const fmt = (n: number) => n.toLocaleString('en-US')

  const handlePrintCar = async (car: CarRecord) => {
    try {
      const PAY_AR: Record<string, string> = { cash: 'نقداً', cheque: 'شيك', check: 'شيك', visa: 'فيزا', debt: 'دين' }
      const [detail, payments] = await Promise.all([
        dbService.maintenance.getOne(car.id),
        dbService.invoicePayments.get(car.id, 'maintenance'),
      ])
      const full = detail || car
      const rows = full.items.map(item => `
        <tr>
          <td>${item.partType === 'service' ? 'خدمة' : 'قطعة'}</td>
          <td>${item.name}</td>
          <td>${item.quantity}</td>
          <td>${fmt(item.unitPrice)} ₪</td>
          <td>${fmt(item.quantity * item.unitPrice)} ₪</td>
          <td>${warrantyLabel(item.warranty)}</td>
          <td>${item.notes || '—'}</td>
        </tr>`).join('')
      const settlementTotal = payments.reduce((s, p) => s + Number(p.settlement_discount || 0), 0)
      const payRows = payments.filter(p => Number(p.amount) > 0).map(p => `
        <tr>
          <td>${PAY_AR[p.method] || p.method}</td>
          <td class="amount-in">${fmt(p.amount)} ₪</td>
        </tr>`).join('')
        + (settlementTotal > 0 ? `
        <tr>
          <td>خصم تسوية</td>
          <td class="amount-out">−${fmt(settlementTotal)} ₪</td>
        </tr>` : '')
      const body = `
        <div class="detail-grid">
          <div class="detail-item"><label>رقم الفاتورة</label><span>${full.invoiceNumber || '—'}</span></div>
          <div class="detail-item"><label>اسم الزبون</label><span>${full.customerName}</span></div>
          <div class="detail-item"><label>رقم الهاتف</label><span>${full.phone && full.phone !== '0000' ? full.phone : 'غير معروف'}</span></div>
          <div class="detail-item"><label>نمرة السيارة</label><span>${full.carPlate}</span></div>
          <div class="detail-item"><label>نوع السيارة</label><span>${full.carType || '—'}</span></div>
          <div class="detail-item"><label>اللون</label><span>${full.carColor || '—'}</span></div>
          <div class="detail-item"><label>تاريخ الاستلام</label><span>${full.dateReceived}</span></div>
          ${full.deliveredDate ? `<div class="detail-item"><label>تاريخ التسليم</label><span>${full.deliveredDate}</span></div>` : ''}
          ${full.notes ? `<div class="detail-item"><label>ملاحظات</label><span>${full.notes}</span></div>` : ''}
        </div>
        ${full.items.length > 0 ? `
        <table>
          <thead><tr><th>النوع</th><th>القطعة / الخدمة</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الكفالة</th><th>ملاحظات</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : ''}
        <div class="detail-grid" style="margin-top:16px;">
          ${(() => {
            const itemsSubtotal = full.items.length
              ? full.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0) : null
            const bd = discountBreakdown(full.total, full.discountType, full.discountValue, itemsSubtotal)
            return bd ? `
          <div class="detail-item"><label>المجموع قبل الخصم</label><span>${bd.subtotal != null ? `${fmt(bd.subtotal)} ₪` : '—'}</span></div>
          <div class="detail-item"><label>الخصم</label><span class="amount-out">−${bd.label}</span></div>
          <div class="detail-item"><label>الإجمالي بعد الخصم</label><span class="amount-in">${fmt(full.total)} ₪</span></div>`
            : `
          <div class="detail-item"><label>الإجمالي الكلي</label><span class="amount-in">${fmt(full.total)} ₪</span></div>`
          })()}
          ${(() => {
            const vb = vatBreakdown(full.total, vat)
            return vb ? `
          <div class="detail-item"><label>المجموع قبل الضريبة</label><span>${fmt(full.total)} ₪</span></div>
          <div class="detail-item"><label>الضريبة (${vb.rate}%)</label><span>${fmt(vb.tax)} ₪</span></div>
          <div class="detail-item"><label>الإجمالي شامل الضريبة</label><span class="amount-in">${fmt(vb.grand)} ₪</span></div>` : ''
          })()}
          <div class="detail-item"><label>المدفوع</label><span class="amount-in">${fmt(full.amountPaid ?? 0)} ₪</span></div>
          <div class="detail-item"><label>المتبقي</label><span class="amount-out">${fmt(full.amountRemaining ?? 0)} ₪</span></div>
        </div>
        ${payRows ? `
        <table style="margin-top:12px;">
          <thead><tr><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
          <tbody>${payRows}</tbody>
        </table>` : ''}`
      printPdf(`فاتورة صيانة ${full.invoiceNumber || ''}`.trim(), body)
    } catch (err) {
      showError('تعذّر طباعة الفاتورة', err)
    }
  }

  const renderFilters = (
    search: string, setSearch: (v:string)=>void, phone: string, setPhone: (v:string)=>void,
    plate: string, setPlate: (v:string)=>void, from: string, setFrom: (v:string)=>void,
    to: string, setTo: (v:string)=>void, amtMin: string, setAmtMin: (v:string)=>void,
    amtMax: string, setAmtMax: (v:string)=>void, hasFilters: boolean, clearFilters: ()=>void,
  ) => (
    <div className="mi-filters pd-filter-bar">
      <div className="mi-search-wrap">
        <input type="text" className="mi-search-input" placeholder="🔍  بحث باسم الزبون..." value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <div className="mi-search-wrap" style={{ minWidth: 150, flex: '0 0 auto' }}>
        <input type="text" className="mi-search-input" placeholder="📞  رقم الهاتف..." value={phone} onChange={e => setPhone(e.target.value)} />
      </div>
      <div className="mi-search-wrap" style={{ minWidth: 140, flex: '0 0 auto' }}>
        <input type="text" className="mi-search-input" placeholder="🚗  نمرة السيارة..." value={plate} onChange={e => setPlate(e.target.value)} />
      </div>
      <div className="mi-date-range">
        <div className="mi-filter-field"><span className="mi-filter-label">من تاريخ</span>
          <input type="date" className="mi-date-input" value={from} max={today()} onChange={e => setFrom(e.target.value > today() ? today() : e.target.value)} /></div>
        <div className="mi-filter-field"><span className="mi-filter-label">إلى تاريخ</span>
          <input type="date" className="mi-date-input" value={to} max={today()} onChange={e => setTo(e.target.value > today() ? today() : e.target.value)} /></div>
      </div>
      <div className="mi-date-range">
        <div className="mi-filter-field"><span className="mi-filter-label">من مبلغ ₪</span>
          <input type="number" min={0} className="mi-amount-input" value={amtMin} onChange={e => setAmtMin(e.target.value)} placeholder="0" /></div>
        <div className="mi-filter-field"><span className="mi-filter-label">إلى مبلغ ₪</span>
          <input type="number" min={0} className="mi-amount-input" value={amtMax} onChange={e => setAmtMax(e.target.value)} placeholder="∞" /></div>
      </div>
      {hasFilters && <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلاتر</button>}
    </div>
  )

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">سيارات الصيانة</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={openAddForm}>
            + إضافة سيارة جديدة
          </button>
        )}
      </div>

      {/* ════ Add Form (inline — نموذج الإضافة المشترك بقي داخل الصفحة) ════ */}
      {showAddForm && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">بيانات السيارة</h2>
          <MaintenanceForm ref={formRef} key="new" editingCar={null} useDraft onSaved={onAddSaved} />
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={() => formRef.current?.save()}>حفظ الفاتورة</button>
            <button className="btn btn-ghost" onClick={closeAddForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Edit Form (modal popup — لكل فواتير الصيانة: قيد الصيانة والمُسلَّمة) ════ */}
      {editCar && (
        <div className="mi-modal-overlay" onClick={closeEditForm}>
          <div className="mi-modal mi-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل بيانات السيارة — {editCar.carPlate}</h3>
              <button className="mi-modal-close" onClick={closeEditForm}>✕</button>
            </div>
            <div className="mi-modal-body">
              <MaintenanceForm ref={formRef} key={editCar.id} editingCar={editCar} onSaved={onEditSaved} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>حفظ التعديلات</button>
              <button className="btn btn-secondary" onClick={closeEditForm}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Section 1: قيد الصيانة ════ */}
      <CollapsibleCard title="سيارات قيد الصيانة">
        {renderFilters(ipSearch, setIpSearch, ipPhone, setIpPhone, ipPlate, setIpPlate, ipFrom, setIpFrom, ipTo, setIpTo, ipAmtMin, setIpAmtMin, ipAmtMax, setIpAmtMax, hasIpFilters, clearIpFilters)}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th><th>اسم الزبون</th><th>نمرة السيارة</th><th>النوع</th><th>اللون</th>
                <th>تاريخ الاستلام</th><th>أيام في الكراج</th><th>الإجمالي</th><th>الحالة</th><th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInProgress.length === 0 ? (
                <tr><td colSpan={10} className="mi-empty-row">لا توجد سيارات تطابق البحث</td></tr>
              ) : paginatedInProgress.map((car, i) => (
                <tr key={car.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => { if ((e.target as HTMLElement).closest('.mi-actions')) return; setDetailsCar(car) }}>
                  <td>{car.invoiceNumber || '—'}</td>
                  <td>{car.customerName}</td>
                  <td><span className="mi-plate">{car.carPlate}</span></td>
                  <td>{car.carType}</td>
                  <td>{car.carColor}</td>
                  <td>{car.dateReceived}</td>
                  <td><span className="mi-days">{daysInShop(car.dateReceived)} أيام</span></td>
                  <td className="mi-amount">{fmt(car.total)} ₪</td>
                  <td><span className="mi-badge-orange">قيد الصيانة</span></td>
                  <td>
                    <div className="mi-actions">
                      <button className="btn btn-sm-outline" style={{ color: '#E67E22', borderColor: '#E67E22' }} onClick={() => openEdit(car)}>تعديل</button>
                      <button className="btn btn-sm-green" onClick={() => openDelivery(car)}>تسليم</button>
                      <button className="btn btn-danger-sm" onClick={() => setDeleteCar(car)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={ipPage}
          totalItems={filteredInProgress.length}
          pageSize={ipPageSize}
          onPageChange={setIpPage}
          onPageSizeChange={(size) => {
            setIpPageSize(size)
            setIpPage(1)
          }}
        />
        {!showForm && <p className="mi-row-hint">اضغط على أي صف لعرض التفاصيل</p>}
      </CollapsibleCard>

      <hr className="mi-section-divider" />

      {/* ════ Section 2: تم التسليم ════ */}
      <CollapsibleCard title="تم التسليم">
        {renderFilters(dlSearch, setDlSearch, dlPhone, setDlPhone, dlPlate, setDlPlate, dlFrom, setDlFrom, dlTo, setDlTo, dlAmtMin, setDlAmtMin, dlAmtMax, setDlAmtMax, hasDlFilters, clearDlFilters)}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>رقم الفاتورة</th><th>اسم الزبون</th><th>نمرة السيارة</th><th>النوع</th><th>اللون</th>
                <th>تاريخ الاستلام</th><th>تاريخ التسليم</th><th>الإجمالي</th><th>الحالة</th><th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDelivered.length === 0 ? (
                <tr><td colSpan={10} className="mi-empty-row">لا توجد سيارات تطابق البحث</td></tr>
              ) : paginatedDelivered.map((car, i) => (
                <tr key={car.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => { if ((e.target as HTMLElement).closest('.mi-actions')) return; setDetailsCar(car) }}>
                  <td>{car.invoiceNumber || '—'}</td>
                  <td>{car.customerName}</td>
                  <td><span className="mi-plate">{car.carPlate}</span></td>
                  <td>{car.carType}</td>
                  <td>{car.carColor}</td>
                  <td>{car.dateReceived}</td>
                  <td>{car.deliveredDate || '—'}</td>
                  <td className="mi-amount">{fmt(car.total)} ₪</td>
                  <td><span className="mi-badge-delivered">تم التسليم</span></td>
                  <td>
                    <div className="mi-actions">
                      <button className="btn btn-sm-outline" style={{ color: '#E67E22', borderColor: '#E67E22' }} onClick={() => openEdit(car)}>تعديل</button>
                      <button className="btn btn-danger-sm" onClick={() => setDeleteCar(car)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={dlPage}
          totalItems={filteredDelivered.length}
          pageSize={dlPageSize}
          onPageChange={setDlPage}
          onPageSizeChange={(size) => {
            setDlPageSize(size)
            setDlPage(1)
          }}
        />
      </CollapsibleCard>

      {/* ════ Details Modal ════ */}
      {detailsCar && (
        <div className="mi-modal-overlay" onClick={() => setDetailsCar(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل السيارة</h3>
              <button className="mi-modal-close" onClick={() => setDetailsCar(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item"><span className="mi-detail-label">رقم الفاتورة</span><strong>{detailsCar.invoiceNumber || '—'}</strong></div>
                <div className="mi-detail-item"><span className="mi-detail-label">اسم الزبون</span><strong>{detailsCar.customerName}</strong></div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsCar.phone && detailsCar.phone !== '0000'
                    ? <span className="mi-phone-highlight">{detailsCar.phone}</span>
                    : <span className="mi-badge-gray">غير معروف</span>}
                </div>
                <div className="mi-detail-item"><span className="mi-detail-label">نمرة السيارة</span><span className="mi-plate">{detailsCar.carPlate}</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">نوع السيارة</span><span>{detailsCar.carType}</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">اللون</span><span>{detailsCar.carColor}</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">تاريخ الاستلام</span><span>{detailsCar.dateReceived}</span></div>
                {detailsCar.deliveredDate && (
                  <div className="mi-detail-item"><span className="mi-detail-label">تاريخ التسليم</span><span>{detailsCar.deliveredDate}</span></div>
                )}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الحالة</span>
                  {detailsCar.status === 'in_progress' ? <span className="mi-badge-orange">قيد الصيانة</span> : <span className="mi-badge-delivered">تم التسليم</span>}
                </div>
                <div className="mi-detail-item"><span className="mi-detail-label">الإجمالي</span><span className="mi-amount">{fmt(detailsCar.total)} ₪</span></div>
                {detailsCar.notes && (
                  <div className="mi-detail-item mi-detail-full"><span className="mi-detail-label">ملاحظات</span><span>{detailsCar.notes}</span></div>
                )}
              </div>

              <h4 className="mi-modal-subtitle">القطع والخدمات</h4>
              <div className="mi-parts-table-wrap">
                <table className="mi-parts-table">
                  <thead>
                    <tr><th>النوع</th><th>القطعة / الخدمة</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الكفالة</th><th>ملاحظات</th></tr>
                  </thead>
                  <tbody>
                    {detailsCar.items.map((item, idx) => (
                      <tr key={idx}>
                        <td className="mi-td-center">
                          {item.partType === 'service'
                            ? <span className="mi-badge-blue">خدمة</span>
                            : <span className="mi-badge-orange">قطعة</span>}
                        </td>
                        <td>{item.name}</td>
                        <td className="mi-td-center">{item.quantity}</td>
                        <td className="mi-td-center">{fmt(item.unitPrice)} ₪</td>
                        <td className="mi-td-center">{fmt(item.quantity * item.unitPrice)} ₪</td>
                        <td>{warrantyLabel(item.warranty)}</td>
                        <td>{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const itemsSubtotal = detailsCar.items.length
                  ? detailsCar.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0) : null
                const bd = discountBreakdown(detailsCar.total, detailsCar.discountType, detailsCar.discountValue, itemsSubtotal)
                return bd ? (
                  <>
                    <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                      المجموع قبل الخصم: <strong>{bd.subtotal != null ? `${fmt(bd.subtotal)} ₪` : '—'}</strong>
                    </div>
                    <div className="mi-total-row" style={{ marginBottom: 0 }}>
                      الخصم: <strong>−{bd.label}</strong>
                    </div>
                    <div className="mi-total-row" style={{ marginBottom: 0 }}>
                      الإجمالي بعد الخصم: <strong>{fmt(detailsCar.total)} ₪</strong>
                    </div>
                  </>
                ) : (
                  <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                    الإجمالي الكلي: <strong>{fmt(detailsCar.total)} ₪</strong>
                  </div>
                )
              })()}
              {(() => {
                const vb = vatBreakdown(detailsCar.total, vat)
                if (!vb) return null
                return (
                  <>
                    <div className="mi-total-row" style={{ marginBottom: 0 }}>
                      المجموع قبل الضريبة: <strong>{fmt(detailsCar.total)} ₪</strong>
                    </div>
                    <div className="mi-total-row" style={{ marginBottom: 0 }}>
                      الضريبة ({vb.rate}%): <strong>{fmt(vb.tax)} ₪</strong>
                    </div>
                    <div className="mi-total-row" style={{ marginBottom: 0 }}>
                      الإجمالي شامل الضريبة: <strong>{fmt(vb.grand)} ₪</strong>
                    </div>
                  </>
                )
              })()}

              {detailsSettlement > 0 && (
                <div className="mi-total-row" style={{ marginBottom: 0, color: '#E67E22' }}>
                  خصم تسوية (إسقاط — ليس نقداً): <strong>−{fmt(detailsSettlement)} ₪</strong>
                </div>
              )}

              {/* Previous operations for same phone */}
              <LinkedOpsSection phone={detailsCar.phone} source="maintenance" id={detailsCar.id} />
              {/* Previous operations for same car plate (نمرة السيارة) */}
              <LinkedOpsByPlateSection carPlate={detailsCar.carPlate} source="maintenance" id={detailsCar.id} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary" onClick={() => handlePrintCar(detailsCar)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsCar(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Confirm before edit ════ */}
      {warnCar && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={
            warnCar.status === 'delivered'
              ? `هذه الفاتورة مكتملة (تم التسليم) للزبون "${warnCar.customerName}" - نمرة السيارة ${warnCar.carPlate} - الإجمالي ${fmt(warnCar.total)} ₪ - تاريخ التسليم ${warnCar.deliveredDate}. هل أنت متأكد من رغبتك في التعديل؟`
              : `هل أنت متأكد من رغبتك في تعديل فاتورة الصيانة للزبون "${warnCar.customerName}"؟`
          }
          onConfirm={confirmEditCar}
          onCancel={() => setWarnCar(null)}
        />
      )}

      {/* ════ Delivery Modal ════ */}
      {deliveryCar && (
        <div className="mi-modal-overlay" onClick={() => setDeliveryCar(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تسليم السيارة</h3>
              <button className="mi-modal-close" onClick={() => setDeliveryCar(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-delivery-info">
                <span className="mi-detail-label">الزبون:</span>
                <strong>{deliveryCar.customerName}</strong>
                <span className="mi-plate">{deliveryCar.carPlate}</span>
              </div>
              <div className="mi-form-grid mi-delivery-grid" style={{ marginBottom: '1.25rem' }}>
                <label className="mi-field">
                  <span>تاريخ التسليم</span>
                  <input type="date" value={deliveryDate} max={today()} onChange={e => setDeliveryDate(e.target.value > today() ? today() : e.target.value)} />
                </label>
              </div>
              <div className="pay-section-title">طريقة الدفع</div>
              {paymentRows.map(row => (
                <div key={row.id} className="pay-row">
                  <div className="pay-row-main">
                    <select className="pay-select" value={row.method} onChange={e => updatePaymentRow(row.id, { method: e.target.value as PayMethod })}>
                      {(['cash', 'check', 'visa'] as Exclude<PayMethod, 'debt'>[]).map(val => (
                        <option key={val} value={val}>{PAY_LABELS[val]}</option>
                      ))}
                    </select>
                    <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount === 0 || row.amount === ('' as unknown as number) ? '' : row.amount}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePaymentRow(row.id, { amount: e.target.value === '' ? ('' as unknown as number) : Math.max(0, Number(e.target.value)) })}
                      onBlur={(e) => { if (!e.target.value) updatePaymentRow(row.id, { amount: 0 }) }} />
                    <button className="btn btn-danger-sm" disabled={paymentRows.length === 1} onClick={() => removePaymentRow(row.id)}>حذف</button>
                  </div>
                  {row.method === 'check' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>رقم الشيك</span><input type="text" className="mi-td-input" value={row.checkNumber} onChange={e => updatePaymentRow(row.id, { checkNumber: e.target.value })} /></label>
                      <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الإصدار</span><input type="date" className="mi-td-input" value={row.issueDate} max={today()} onChange={e => updatePaymentRow(row.id, { issueDate: e.target.value > today() ? today() : e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الصرف</span><input type="date" className="mi-td-input" value={row.clearDate} onChange={e => updatePaymentRow(row.id, { clearDate: e.target.value })} /></label>
                    </div>
                  )}
                  {row.method === 'visa' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>رقم الحركة</span><input type="text" className="mi-td-input" value={row.transactionNum} onChange={e => updatePaymentRow(row.id, { transactionNum: e.target.value })} /></label>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-secondary pay-add-btn" onClick={addPaymentRow}>+ إضافة طريقة دفع</button>
              <label className="mi-field" style={{ marginTop: '1rem', maxWidth: 260 }}>
                <span>خصم / إسقاط مبلغ (تسوية) ₪</span>
                <input type="number" min={0} placeholder="0" value={settleDiscount}
                  className="mi-td-input"
                  onChange={e => setSettleDiscount(e.target.value)} />
                <span style={{ fontSize: '0.72rem', color: '#888' }}>يُسقَط من المتبقي دون تسجيله كنقدية في الصندوق</span>
              </label>
              {deliveryExceeds && <p className="pd-pay-error">مجموع الدفعة والخصم ({fmt(totalPaid + settleNum)} ₪) يتجاوز المتبقي ({fmt(invoiceRemaining)} ₪)</p>}
              <div className="pay-summary">
                <div className="pay-summary-row"><span>إجمالي الفاتورة</span><strong>{fmt(invoiceTotal)} ₪</strong></div>
                {alreadyPaid > 0 && <div className="pay-summary-row"><span>المدفوع سابقاً</span><strong className="pay-paid">{fmt(alreadyPaid)} ₪</strong></div>}
                <div className="pay-summary-row"><span>المتبقي قبل هذه الدفعة</span><strong className="pay-due">{fmt(invoiceRemaining)} ₪</strong></div>
                <div className="pay-summary-row"><span>إجمالي هذه الدفعة</span><strong className="pay-paid">{fmt(totalPaid)} ₪</strong></div>
                {settleNum > 0 && <div className="pay-summary-row"><span>خصم تسوية</span><strong className="pay-over">−{fmt(settleNum)} ₪</strong></div>}
                <div className="pay-summary-row pay-summary-last">
                  <span>المتبقي بعد الدفعة والخصم</span>
                  <strong className={remaining <= 0.001 ? 'pay-ok' : deliveryExceeds ? 'pay-over' : 'pay-due'}>{fmt(Math.max(0, remaining))} ₪</strong>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handleDeliverySave} disabled={deliveryExceeds}>تأكيد التسليم</button>
              <button className="btn btn-ghost" onClick={() => setDeliveryCar(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Delivery with unpaid debt confirmation ════ */}
      {confirmDeliveryDebt && deliveryCar && (
        <ConfirmDialog
          title="⚠️ تسليم بدون سداد كامل"
          message={`الزبون "${deliveryCar.customerName}" (${deliveryCar.carPlate}) مدين بمبلغ ${fmt(remaining)} ₪ لم يُسدَّد بعد.\n\nهل أنت متأكد من تسليم السيارة وهو مدين بهذا المبلغ؟`}
          onConfirm={doDeliverConfirmed}
          onCancel={() => setConfirmDeliveryDebt(false)}
          requirePassword={false}
        />
      )}

      {/* ════ Delete Confirm ════ */}
      {deleteCar && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف سيارة "${deleteCar.customerName}" — ${deleteCar.carPlate}؟`}
          onConfirm={async () => {
            try { await dbService.maintenance.delete(deleteCar.id); await reload(); setDeleteCar(null) }
            catch (err) { showError('تعذّر حذف السيارة', err) }
          }}
          onCancel={() => setDeleteCar(null)}
        />
      )}
    </div>
  )
}
