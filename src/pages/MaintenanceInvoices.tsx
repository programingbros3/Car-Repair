import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage, CarRecord, CarItem, PayMethod, PaymentRow, WarrantyPeriodUnit } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   Local Types
════════════════════════════════════════ */
type FormPartType = 'part' | 'service'
type FormPart    = { id: number; partType: FormPartType; name: string; qty: number; unitPrice: number; warrantyValue: string; warrantyUnit: WarrantyPeriodUnit | ''; notes: string }
type FormPartErr = { nameErr: string; qtyErr: string }

const UNIT_OPTIONS: [WarrantyPeriodUnit, string][] = [['week', 'أسبوع'], ['month', 'شهر'], ['year', 'سنة']]
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

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const DRAFT_KEY = 'garage-mi-draft-v2'
const today     = () => new Date().toISOString().slice(0, 10)
let nextPartId  = 100
let nextPayId   = 100

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const emptyForm = () => ({
  customerName: '', phone: '', carPlate: '', carType: '', carColor: '',
  dateReceived: today(), generalNotes: '',
})

const newFormPart = (): FormPart => ({
  id: nextPartId++, partType: 'part', name: '', qty: 1, unitPrice: 0, warrantyValue: '1', warrantyUnit: '', notes: '',
})

const newFormService = (): FormPart => ({
  id: nextPartId++, partType: 'service', name: '', qty: 1, unitPrice: 0, warrantyValue: '1', warrantyUnit: '', notes: '',
})

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++, method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const daysInShop = (d: string) => Math.max(0, Math.floor((Date.now() - new Date(d).getTime()) / 86_400_000))

const blockDigits     = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault() }
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault() }
const validateName    = (v: string) => v.trim() ? '' : 'اسم الزبون مطلوب'
const validatePlate   = (v: string) => v.trim() ? '' : 'نمرة السيارة مطلوبة'
const validatePhone   = (v: string) => v.trim() ? '' : 'رقم الهاتف مطلوب'

const PAY_LABELS: Record<Exclude<PayMethod, 'debt'>, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }

function applySectionFilters(
  cars: CarRecord[], fuse: Fuse<{ _idx: number; customerName: string }>,
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

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function MaintenanceInvoices() {
  const { maintenanceCars: cars, reload } = useGarage()

  /* form */
  const [showForm, setShowForm]               = useState(false)
  const [editingCar, setEditingCar]           = useState<CarRecord | null>(null)
  const [form, setForm]                       = useState(emptyForm)
  const [parts, setParts]                     = useState<FormPart[]>([])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* modals */
  const [detailsCar, setDetailsCar]     = useState<CarRecord | null>(null)
  const [warnCar, setWarnCar]           = useState<CarRecord | null>(null)
  const [deliveryCar, setDeliveryCar]   = useState<CarRecord | null>(null)
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [paymentRows, setPaymentRows]   = useState<PaymentRow[]>([])
  const [deleteCar, setDeleteCar]       = useState<CarRecord | null>(null)

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

  const ipFuseItems = useMemo(() => inProgressCars.map((c, i) => ({ _idx: i, customerName: normalizeAr(c.customerName) })), [inProgressCars])
  const ipFuse      = useMemo(() => new Fuse(ipFuseItems, { keys: ['customerName'], threshold: 0.4, ignoreLocation: true }), [ipFuseItems])
  const dlFuseItems = useMemo(() => deliveredCars.map((c, i) => ({ _idx: i, customerName: normalizeAr(c.customerName) })), [deliveredCars])
  const dlFuse      = useMemo(() => new Fuse(dlFuseItems, { keys: ['customerName'], threshold: 0.4, ignoreLocation: true }), [dlFuseItems])

  const filteredInProgress = useMemo(() => applySectionFilters(inProgressCars, ipFuse, ipSearch, ipPhone, ipPlate, ipFrom, ipTo, ipAmtMin, ipAmtMax), [inProgressCars, ipFuse, ipSearch, ipPhone, ipPlate, ipFrom, ipTo, ipAmtMin, ipAmtMax])
  const filteredDelivered  = useMemo(() => applySectionFilters(deliveredCars,  dlFuse, dlSearch, dlPhone, dlPlate, dlFrom, dlTo, dlAmtMin, dlAmtMax), [deliveredCars,  dlFuse, dlSearch, dlPhone, dlPlate, dlFrom, dlTo, dlAmtMin, dlAmtMax])

  const hasIpFilters = !!(ipSearch || ipPhone || ipPlate || ipFrom || ipTo || ipAmtMin || ipAmtMax)
  const hasDlFilters = !!(dlSearch || dlPhone || dlPlate || dlFrom || dlTo || dlAmtMin || dlAmtMax)
  const clearIpFilters = () => { setIpSearch(''); setIpPhone(''); setIpPlate(''); setIpFrom(''); setIpTo(''); setIpAmtMin(''); setIpAmtMax('') }
  const clearDlFilters = () => { setDlSearch(''); setDlPhone(''); setDlPlate(''); setDlFrom(''); setDlTo(''); setDlAmtMin(''); setDlAmtMax('') }

  /* Draft */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const { form: f, parts: p } = JSON.parse(raw) as { form: typeof form; parts: FormPart[] }
      setShowForm(true); setForm(f); setParts(p)
      nextPartId = Math.max(100, ...p.map(x => x.id)) + 1
    } catch { localStorage.removeItem(DRAFT_KEY) }
  }, [])

  useEffect(() => {
    if (showForm && !editingCar) localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, parts }))
  }, [showForm, editingCar, form, parts])

  /* Form helpers */
  const setField    = (f: string, v: string) => setForm(prev => ({ ...prev, [f]: v }))
  const addPart     = () => setParts(prev => [...prev, newFormPart()])
  const addService  = () => setParts(prev => [...prev, newFormService()])
  const removePart  = (id: number) => setParts(prev => prev.filter(p => p.id !== id))
  const updatePart  = (id: number, field: keyof FormPart, value: string | number) =>
    setParts(prev => prev.map(p => p.id !== id ? p : { ...p, [field]: value }))

  const doOpenEdit = async (car: CarRecord) => {
    localStorage.removeItem(DRAFT_KEY)
    try {
      const full = await dbService.maintenance.getOne(car.id)
      const record = full ?? car
      setEditingCar(record)
      setForm({ customerName: record.customerName, phone: record.phone === '0000' ? '' : record.phone,
        carPlate: record.carPlate, carType: record.carType, carColor: record.carColor,
        dateReceived: record.dateReceived, generalNotes: record.notes })
      const ep: FormPart[] = record.items.length > 0
        ? record.items.map(item => {
            const w = parseWarrantyJson(item.warranty)
            return { id: nextPartId++, partType: item.partType, name: item.name, qty: item.quantity,
              unitPrice: item.unitPrice, warrantyValue: w ? String(w.value) : '1', warrantyUnit: w ? w.unit : '' as WarrantyPeriodUnit | '', notes: item.notes }
          })
        : []
      setParts(ep); setSubmitAttempted(false); setShowForm(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      showError('تعذّر تحميل بيانات الفاتورة', err)
    }
  }

  const openEdit = (car: CarRecord) => setWarnCar(car)

  const confirmEditCar = () => {
    if (!warnCar) return
    doOpenEdit(warnCar)
    setWarnCar(null)
  }

  /* Validation */
  const formTotal = parts.reduce((s, p) => s + p.qty * p.unitPrice, 0)
  const nameErr   = validateName(form.customerName)
  const plateErr  = validatePlate(form.carPlate)
  const phoneErr  = validatePhone(form.phone)
  const partsErrMap: Record<number, FormPartErr> = {}
  for (const p of parts) partsErrMap[p.id] = { nameErr: p.name.trim() ? '' : 'اسم القطعة مطلوب', qtyErr: p.qty >= 1 ? '' : 'العدد يجب أن يكون 1 على الأقل' }
  const hasErrors = !!nameErr || !!plateErr || !!phoneErr || Object.values(partsErrMap).some(e => e.nameErr || e.qtyErr)

  const handleSave = async () => {
    setSubmitAttempted(true)
    if (hasErrors) return
    const newItems: CarItem[] = parts.map(p => ({
      name: p.name, quantity: p.partType === 'service' ? 1 : p.qty, unitPrice: p.unitPrice,
      warranty: p.warrantyUnit ? JSON.stringify({ value: Math.max(1, parseInt(p.warrantyValue) || 1), unit: p.warrantyUnit }) : '',
      partType: p.partType, notes: p.notes,
    }))
    const phone = form.phone.trim()
    const carData: CarRecord = {
      id: editingCar?.id ?? 0,
      customerName: form.customerName, phone, carPlate: form.carPlate,
      carType: form.carType, carColor: form.carColor, dateReceived: form.dateReceived,
      status: editingCar?.status ?? 'in_progress', deliveredDate: editingCar?.deliveredDate,
      notes: form.generalNotes, total: formTotal, items: newItems,
    }
    try {
      if (editingCar) await dbService.maintenance.update(carData)
      else            await dbService.maintenance.add(carData)
      await reload()
      clearForm()
    } catch (err) {
      showError('تعذّر حفظ فاتورة الصيانة', err)
    }
  }

  const clearForm = () => {
    localStorage.removeItem(DRAFT_KEY); setShowForm(false); setSubmitAttempted(false)
    setForm(emptyForm()); setParts([]); setEditingCar(null)
  }

  /* Delivery modal */
  const openDelivery      = (car: CarRecord) => { setDeliveryCar(car); setDeliveryDate(today()); setPaymentRows([emptyPayRow()]) }
  const addPaymentRow     = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow  = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow  = (id: number, u: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...u }))

  const invoiceTotal = deliveryCar?.total ?? 0
  const totalPaid    = paymentRows.reduce((s, r) => s + (r.amount || 0), 0)
  const remaining    = invoiceTotal - totalPaid

  const handleDeliverySave = async () => {
    if (!deliveryCar) return
    const rows = paymentRows.filter(r => r.amount > 0)
    try {
      await dbService.maintenance.deliver(deliveryCar.id, deliveryDate, rows)
      await reload()
      setDeliveryCar(null)
    } catch (err) {
      showError('تعذّر تسليم السيارة', err)
    }
  }

  /* UI helpers */
  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showPartErr = (id: number, f: keyof FormPartErr) => submitAttempted && partsErrMap[id]?.[f] ? <span className="mi-err">{partsErrMap[id][f]}</span> : null
  const errCls      = (bad: boolean) => bad ? ' mi-input-err' : ''
  const fmt         = (n: number) => n.toLocaleString('en-US')

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
      const payRows = payments.map(p => `
        <tr>
          <td>${PAY_AR[p.method] || p.method}</td>
          <td class="amount-in">${fmt(p.amount)} ₪</td>
        </tr>`).join('')
      const body = `
        <div class="detail-grid">
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
          <div class="detail-item"><label>الإجمالي الكلي</label><span class="amount-in">${fmt(full.total)} ₪</span></div>
          <div class="detail-item"><label>المدفوع</label><span class="amount-in">${fmt(full.amountPaid ?? 0)} ₪</span></div>
          <div class="detail-item"><label>المتبقي</label><span class="amount-out">${fmt(full.amountRemaining ?? 0)} ₪</span></div>
        </div>
        ${payRows ? `
        <table style="margin-top:12px;">
          <thead><tr><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
          <tbody>${payRows}</tbody>
        </table>` : ''}`
      printPdf('فاتورة صيانة', body)
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
          <input type="date" className="mi-date-input" value={from} max={today()} onChange={e => setFrom(e.target.value)} /></div>
        <div className="mi-filter-field"><span className="mi-filter-label">إلى تاريخ</span>
          <input type="date" className="mi-date-input" value={to} max={today()} onChange={e => setTo(e.target.value)} /></div>
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
          <button className="btn btn-primary" onClick={() => { setEditingCar(null); setShowForm(true) }}>
            + إضافة سيارة جديدة
          </button>
        )}
      </div>

      {/* ════ Form ════ */}
      {showForm && (
        <div className={`mi-card mi-form-card${editingCar ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editingCar ? `تعديل بيانات السيارة — ${editingCar.carPlate}` : 'بيانات السيارة'}
          </h2>
          <div className="mi-form-grid">
            <label className="mi-field">
              <span>اسم الزبون <span className="mi-required">*</span></span>
              <input type="text" value={form.customerName} onKeyDown={blockDigits}
                onChange={e => setField('customerName', e.target.value)} placeholder="اسم الزبون"
                className={errCls(submitAttempted && !!nameErr)} />
              {showErr(nameErr)}
            </label>
            <label className="mi-field">
              <span>رقم الهاتف <span className="mi-required">*</span></span>
              <input type="text" value={form.phone} onKeyDown={allowPhoneChars}
                onChange={e => setField('phone', e.target.value)} placeholder="05XXXXXXXX"
                className={errCls(submitAttempted && !!phoneErr)} />
              {showErr(phoneErr)}
            </label>
            <label className="mi-field">
              <span>نمرة السيارة <span className="mi-required">*</span></span>
              <input type="text" value={form.carPlate}
                onChange={e => setField('carPlate', e.target.value)} placeholder="أ ب ج 123"
                className={errCls(submitAttempted && !!plateErr)} />
              {showErr(plateErr)}
            </label>
            <label className="mi-field">
              <span>نوع السيارة</span>
              <input type="text" value={form.carType} onChange={e => setField('carType', e.target.value)} placeholder="تويوتا كامري" />
            </label>
            <label className="mi-field">
              <span>لون السيارة</span>
              <input type="text" value={form.carColor} onChange={e => setField('carColor', e.target.value)} placeholder="أبيض" />
            </label>
            <label className="mi-field">
              <span>تاريخ الاستلام</span>
              <input type="date" value={form.dateReceived} max={today()} onChange={e => setField('dateReceived', e.target.value)} />
            </label>
            <label className="mi-field mi-field-full">
              <span>ملاحظات عامة</span>
              <textarea rows={3} value={form.generalNotes} onChange={e => setField('generalNotes', e.target.value)} placeholder="أي ملاحظات إضافية..." />
            </label>
          </div>

          <div className="mi-parts-header">
            <h2 className="mi-section-title">القطع والخدمات</h2>
            <div className="mi-actions">
              <button className="btn btn-secondary" onClick={addPart}>+ إضافة قطعة</button>
              <button className="btn btn-sm-green" onClick={addService}>+ إضافة خدمة</button>
            </div>
          </div>
          <div className="mi-parts-table-wrap">
            <table className="mi-parts-table">
              <thead>
                <tr><th>النوع</th><th>اسم القطعة / الخدمة</th><th>العدد</th><th>سعر الوحدة (₪)</th><th>الكفالة</th><th>ملاحظات</th><th></th></tr>
              </thead>
              <tbody>
                {parts.map(part => (
                  <tr key={part.id}>
                    <td className="mi-td-center">
                      {part.partType === 'service'
                        ? <span className="mi-badge-blue">خدمة</span>
                        : <span className="mi-badge-orange">قطعة</span>}
                    </td>
                    <td>
                      <input type="text" placeholder="اسم القطعة أو الخدمة" value={part.name}
                        className={'mi-td-input' + errCls(submitAttempted && !!partsErrMap[part.id]?.nameErr)}
                        onChange={e => updatePart(part.id, 'name', e.target.value)} />
                      {showPartErr(part.id, 'nameErr')}
                    </td>
                    <td>
                      <input type="number" min={1} value={part.partType === 'service' ? 1 : part.qty}
                        disabled={part.partType === 'service'}
                        className={'mi-td-input mi-td-num' + errCls(submitAttempted && !!partsErrMap[part.id]?.qtyErr)}
                        onChange={e => updatePart(part.id, 'qty', Math.max(1, Number(e.target.value)))} />
                      {showPartErr(part.id, 'qtyErr')}
                    </td>
                    <td>
                      <input type="number" min={0} value={part.unitPrice || ''} className="mi-td-input mi-td-num"
                        onChange={e => updatePart(part.id, 'unitPrice', Math.max(0, Number(e.target.value)))}
                        onBlur={(e) => { if (!e.target.value) updatePart(part.id, 'unitPrice', 0) }} />
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                        <select className="pay-select" style={{ flex: '1 1 0', minWidth: 70 }}
                          value={part.warrantyUnit}
                          onChange={e => updatePart(part.id, 'warrantyUnit', e.target.value)}>
                          <option value="">لا كفالة</option>
                          {UNIT_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                        </select>
                        {part.warrantyUnit && (
                          <input type="number" min={1} max={99} value={part.warrantyValue}
                            className="mi-td-input mi-td-num" style={{ width: 55 }}
                            onChange={e => updatePart(part.id, 'warrantyValue', e.target.value)} />
                        )}
                      </div>
                    </td>
                    <td><input type="text" placeholder="ملاحظة..." value={part.notes} className="mi-td-input" onChange={e => updatePart(part.id, 'notes', e.target.value)} /></td>
                    <td className="mi-td-center">
                      <button className="btn btn-danger-sm" onClick={() => removePart(part.id)}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mi-total-row">الإجمالي: <strong>{fmt(formTotal)} ₪</strong></div>
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSave}>{editingCar ? 'حفظ التعديلات' : 'حفظ الفاتورة'}</button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Section 1: قيد الصيانة ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">سيارات قيد الصيانة</h2>
        {renderFilters(ipSearch, setIpSearch, ipPhone, setIpPhone, ipPlate, setIpPlate, ipFrom, setIpFrom, ipTo, setIpTo, ipAmtMin, setIpAmtMin, ipAmtMax, setIpAmtMax, hasIpFilters, clearIpFilters)}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>اسم الزبون</th><th>نمرة السيارة</th><th>النوع</th><th>اللون</th>
                <th>تاريخ الاستلام</th><th>أيام في الكراج</th><th>الإجمالي</th><th>الحالة</th><th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredInProgress.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد سيارات تطابق البحث</td></tr>
              ) : filteredInProgress.map((car, i) => (
                <tr key={car.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => { if ((e.target as HTMLElement).closest('.mi-actions')) return; setDetailsCar(car) }}>
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
        {!showForm && <p className="mi-row-hint">اضغط على أي صف لعرض التفاصيل</p>}
      </div>

      <hr className="mi-section-divider" />

      {/* ════ Section 2: تم التسليم ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">تم التسليم</h2>
        {renderFilters(dlSearch, setDlSearch, dlPhone, setDlPhone, dlPlate, setDlPlate, dlFrom, setDlFrom, dlTo, setDlTo, dlAmtMin, setDlAmtMin, dlAmtMax, setDlAmtMax, hasDlFilters, clearDlFilters)}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>اسم الزبون</th><th>نمرة السيارة</th><th>النوع</th><th>اللون</th>
                <th>تاريخ الاستلام</th><th>تاريخ التسليم</th><th>الإجمالي</th><th>الحالة</th><th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredDelivered.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد سيارات تطابق البحث</td></tr>
              ) : filteredDelivered.map((car, i) => (
                <tr key={car.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => { if ((e.target as HTMLElement).closest('.mi-actions')) return; setDetailsCar(car) }}>
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
      </div>

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
              <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                الإجمالي الكلي: <strong>{fmt(detailsCar.total)} ₪</strong>
              </div>

              {/* Previous operations for same phone */}
              <LinkedOpsSection phone={detailsCar.phone} source="maintenance" id={detailsCar.id} />
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
                  <input type="date" value={deliveryDate} max={today()} onChange={e => setDeliveryDate(e.target.value)} />
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
                    <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount || ''}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePaymentRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                      onBlur={(e) => { if (!e.target.value) updatePaymentRow(row.id, { amount: 0 }) }} />
                    <button className="btn btn-danger-sm" disabled={paymentRows.length === 1} onClick={() => removePaymentRow(row.id)}>حذف</button>
                  </div>
                  {row.method === 'check' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>رقم الشيك</span><input type="text" className="mi-td-input" value={row.checkNumber} onChange={e => updatePaymentRow(row.id, { checkNumber: e.target.value })} /></label>
                      <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الإصدار</span><input type="date" className="mi-td-input" value={row.issueDate} max={today()} onChange={e => updatePaymentRow(row.id, { issueDate: e.target.value })} /></label>
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
              <div className="pay-summary">
                <div className="pay-summary-row"><span>إجمالي الفاتورة</span><strong>{fmt(invoiceTotal)} ₪</strong></div>
                <div className="pay-summary-row"><span>إجمالي المدفوع</span><strong className="pay-paid">{fmt(totalPaid)} ₪</strong></div>
                <div className="pay-summary-row pay-summary-last">
                  <span>المتبقي</span>
                  <strong className={remaining === 0 ? 'pay-ok' : remaining > 0 ? 'pay-due' : 'pay-over'}>{fmt(remaining)} ₪</strong>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handleDeliverySave}>تأكيد التسليم</button>
              <button className="btn btn-ghost" onClick={() => setDeliveryCar(null)}>إلغاء</button>
            </div>
          </div>
        </div>
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
