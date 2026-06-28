import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type CarItem = {
  name: string
  quantity: number
  unitPrice: number
  warranty: string
  customerOwned: boolean
  notes: string
}

type CarRecord = {
  id: number
  customerName: string
  phone: string
  carPlate: string
  carType: string
  carColor: string
  dateReceived: string
  status: 'in_progress'
  notes: string
  total: number
  items: CarItem[]
}

type FormPart = {
  id: number
  name: string
  qty: number
  unitPrice: number
  isCustomerPart: boolean
  warranty: string
  notes: string
}

type FormPartErr = { nameErr: string; qtyErr: string }

type PayMethod = 'cash' | 'check' | 'visa' | 'debt'

type PaymentRow = {
  id: number
  method: PayMethod
  amount: number
  checkNumber: string
  issueDate: string
  clearDate: string
  bankName: string
  transactionNum: string
}

/* ════════════════════════════════════════
   Initial data
════════════════════════════════════════ */
const INITIAL_CARS: CarRecord[] = [
  {
    id: 1,
    customerName: 'أحمد محمد',
    phone: '0501234567',
    carPlate: 'أ ب ج 123',
    carType: 'تويوتا كامري',
    carColor: 'أبيض',
    dateReceived: '2026-06-25',
    status: 'in_progress',
    notes: 'تغيير زيت وفحص عام',
    total: 1500,
    items: [
      { name: 'زيت محرك',  quantity: 1, unitPrice: 200,  warranty: '3 أشهر', customerOwned: false, notes: '' },
      { name: 'فلتر هواء', quantity: 1, unitPrice: 150,  warranty: '',        customerOwned: false, notes: '' },
      { name: 'فحص عام',   quantity: 1, unitPrice: 1150, warranty: 'سنة',     customerOwned: false, notes: 'شامل كل شيء' },
    ],
  },
  {
    id: 2,
    customerName: 'خالد العمري',
    phone: '0559876543',
    carPlate: 'د هـ و 456',
    carType: 'هوندا سيفيك',
    carColor: 'رمادي',
    dateReceived: '2026-06-27',
    status: 'in_progress',
    notes: '',
    total: 800,
    items: [
      { name: 'تغيير تايمنج', quantity: 1, unitPrice: 800, warranty: '6 أشهر', customerOwned: false, notes: '' },
    ],
  },
]

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const DRAFT_KEY = 'garage-mi-draft'
const today     = () => new Date().toISOString().slice(0, 10)

let nextPartId = 1
let nextPayId  = 1

/* Normalize Arabic: unify alef forms, teh marbuta, alef maqsura, strip spaces */
const normalizeAr = (s: string) =>
  s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, '')
    .toLowerCase()

const emptyForm = () => ({
  customerName: '',
  phone:        '',
  carPlate:     '',
  carType:      '',
  carColor:     '',
  dateReceived: today(),
  generalNotes: '',
})

const newFormPart = (): FormPart => ({
  id: nextPartId++,
  name: '', qty: 1, unitPrice: 0,
  isCustomerPart: false, warranty: '', notes: '',
})

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++,
  method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const daysInShop = (dateReceived: string): number => {
  const ms = Date.now() - new Date(dateReceived).getTime()
  return Math.max(0, Math.floor(ms / 86_400_000))
}

/* ── Key-press filters ── */
const blockDigits = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault()
}
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

/* ── Validation ── */
const validateName  = (v: string) => v.trim() ? '' : 'اسم الزبون مطلوب'
const validatePlate = (v: string) => v.trim() ? '' : 'نمرة السيارة مطلوبة'

const PAY_LABELS: Record<PayMethod, string> = {
  cash: 'كاش', check: 'شيك', visa: 'فيزا', debt: 'دين',
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function MaintenanceInvoices() {
  /* cars */
  const [cars, setCars] = useState<CarRecord[]>(INITIAL_CARS)

  /* form */
  const [showForm, setShowForm]               = useState(false)
  const [editingCar, setEditingCar]           = useState<CarRecord | null>(null)
  const [form, setForm]                       = useState(emptyForm)
  const [parts, setParts]                     = useState<FormPart[]>([newFormPart()])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* filters */
  const [search, setSearch]         = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')

  /* modals */
  const [detailsCar, setDetailsCar]     = useState<CarRecord | null>(null)
  const [deliveryCar, setDeliveryCar]   = useState<CarRecord | null>(null)
  const [deliveryDate, setDeliveryDate] = useState(today())
  const [paymentRows, setPaymentRows]   = useState<PaymentRow[]>([])

  /* ── Fuse.js fuzzy search over normalized data ── */
  const fuseItems = useMemo(
    () => cars.map((car, i) => ({
      _idx:         i,
      customerName: normalizeAr(car.customerName),
      carPlate:     normalizeAr(car.carPlate),
    })),
    [cars],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, {
      keys: ['customerName', 'carPlate'],
      threshold: 0.4,
      ignoreLocation: true,
    }),
    [fuseItems],
  )

  /* ── Filtered cars ── */
  const filteredCars = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => cars[r.item._idx])
      : [...cars]
    if (filterFrom) result = result.filter(c => c.dateReceived >= filterFrom)
    if (filterTo)   result = result.filter(c => c.dateReceived <= filterTo)
    return result
  }, [cars, search, filterFrom, filterTo, fuse])

  const hasFilters   = !!search.trim() || !!filterFrom || !!filterTo
  const clearFilters = () => { setSearch(''); setFilterFrom(''); setFilterTo('') }

  /* ── Draft restore / persist (new cars only, not edits) ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const { form: f, parts: p } = JSON.parse(raw) as { form: typeof form; parts: FormPart[] }
      setShowForm(true)
      setForm(f)
      setParts(p)
      nextPartId = Math.max(0, ...p.map(x => x.id)) + 1
    } catch { localStorage.removeItem(DRAFT_KEY) }
  }, [])

  useEffect(() => {
    if (showForm && !editingCar) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, parts }))
    }
  }, [showForm, editingCar, form, parts])

  /* ── Form helpers ── */
  const setField   = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))
  const addPart    = () => setParts(prev => [...prev, newFormPart()])
  const removePart = (id: number) => setParts(prev => prev.filter(p => p.id !== id))
  const updatePart = (id: number, field: keyof FormPart, value: string | number | boolean) =>
    setParts(prev => prev.map(p => {
      if (p.id !== id) return p
      const u = { ...p, [field]: value }
      if (field === 'isCustomerPart' && value === true) u.unitPrice = 0
      return u
    }))

  /* ── Open edit form by clicking a row ── */
  const openEdit = (car: CarRecord) => {
    localStorage.removeItem(DRAFT_KEY)
    setEditingCar(car)
    setForm({
      customerName: car.customerName,
      phone:        car.phone,
      carPlate:     car.carPlate,
      carType:      car.carType,
      carColor:     car.carColor,
      dateReceived: car.dateReceived,
      generalNotes: car.notes,
    })
    const editParts: FormPart[] = car.items.length > 0
      ? car.items.map(item => ({
          id:             nextPartId++,
          name:           item.name,
          qty:            item.quantity,
          unitPrice:      item.unitPrice,
          isCustomerPart: item.customerOwned,
          warranty:       item.warranty,
          notes:          item.notes,
        }))
      : [newFormPart()]
    setParts(editParts)
    setSubmitAttempted(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ── Validation ── */
  const formTotal = parts.reduce((s, p) => s + p.qty * (p.isCustomerPart ? 0 : p.unitPrice), 0)
  const nameErr   = validateName(form.customerName)
  const plateErr  = validatePlate(form.carPlate)

  const partsErrMap: Record<number, FormPartErr> = {}
  for (const p of parts) {
    partsErrMap[p.id] = {
      nameErr: p.name.trim() ? '' : 'اسم القطعة مطلوب',
      qtyErr:  p.qty >= 1   ? '' : 'العدد يجب أن يكون 1 على الأقل',
    }
  }
  const hasErrors = !!nameErr || !!plateErr || Object.values(partsErrMap).some(e => e.nameErr || e.qtyErr)

  /* ── Save (add or update) ── */
  const handleSave = () => {
    setSubmitAttempted(true)
    if (hasErrors) return

    const newItems: CarItem[] = parts.map(p => ({
      name:          p.name,
      quantity:      p.qty,
      unitPrice:     p.isCustomerPart ? 0 : p.unitPrice,
      warranty:      p.warranty,
      customerOwned: p.isCustomerPart,
      notes:         p.notes,
    }))

    if (editingCar) {
      setCars(prev => prev.map(c => c.id !== editingCar.id ? c : {
        ...c,
        customerName: form.customerName,
        phone:        form.phone,
        carPlate:     form.carPlate,
        carType:      form.carType,
        carColor:     form.carColor,
        dateReceived: form.dateReceived,
        notes:        form.generalNotes,
        total:        formTotal,
        items:        newItems,
      }))
    } else {
      setCars(prev => [{
        id:           Date.now(),
        customerName: form.customerName,
        phone:        form.phone,
        carPlate:     form.carPlate,
        carType:      form.carType,
        carColor:     form.carColor,
        dateReceived: form.dateReceived,
        status:       'in_progress',
        notes:        form.generalNotes,
        total:        formTotal,
        items:        newItems,
      }, ...prev])
    }
    clearForm()
  }

  const clearForm = () => {
    localStorage.removeItem(DRAFT_KEY)
    setShowForm(false)
    setSubmitAttempted(false)
    setForm(emptyForm())
    setParts([newFormPart()])
    setEditingCar(null)
  }

  /* ── Delivery modal ── */
  const openDelivery = (car: CarRecord) => {
    setDeliveryCar(car)
    setDeliveryDate(today())
    setPaymentRows([emptyPayRow()])
  }
  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  const invoiceTotal = deliveryCar?.total ?? 0
  const totalPaid    = paymentRows.reduce((s, r) => s + (r.amount || 0), 0)
  const remaining    = invoiceTotal - totalPaid

  const handleDeliverySave = () => {
    console.log('=== تسليم سيارة ===', { car: deliveryCar, deliveryDate, paymentRows, totalPaid, remaining })
    setDeliveryCar(null)
  }

  /* ── UI helpers ── */
  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showPartErr = (id: number, f: keyof FormPartErr) =>
    submitAttempted && partsErrMap[id]?.[f] ? <span className="mi-err">{partsErrMap[id][f]}</span> : null
  const errCls = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header mi-page-header">
        <h1 className="page-title">سيارات الصيانة</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingCar(null); setShowForm(true) }}>
            + إضافة سيارة جديدة
          </button>
        )}
      </div>

      {/* ════ Form (add / edit) ════ */}
      {showForm && (
        <div className={`mi-card mi-form-card${editingCar ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editingCar
              ? `تعديل بيانات السيارة — ${editingCar.carPlate}`
              : 'بيانات السيارة'}
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
              <span>رقم الهاتف</span>
              <input type="text" value={form.phone} onKeyDown={allowPhoneChars}
                onChange={e => setField('phone', e.target.value)} placeholder="05XXXXXXXX" />
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
              <input type="text" value={form.carType}
                onChange={e => setField('carType', e.target.value)} placeholder="تويوتا كامري" />
            </label>

            <label className="mi-field">
              <span>لون السيارة</span>
              <input type="text" value={form.carColor}
                onChange={e => setField('carColor', e.target.value)} placeholder="أبيض" />
            </label>

            <label className="mi-field">
              <span>تاريخ الاستلام</span>
              <input type="date" value={form.dateReceived} max={today()}
                onChange={e => setField('dateReceived', e.target.value)} />
            </label>

            <label className="mi-field mi-field-full">
              <span>ملاحظات عامة</span>
              <textarea rows={3} value={form.generalNotes}
                onChange={e => setField('generalNotes', e.target.value)}
                placeholder="أي ملاحظات إضافية..." />
            </label>
          </div>

          <div className="mi-parts-header">
            <h2 className="mi-section-title">القطع والخدمات</h2>
            <button className="btn btn-secondary" onClick={addPart}>+ إضافة قطعة</button>
          </div>

          <div className="mi-parts-table-wrap">
            <table className="mi-parts-table">
              <thead>
                <tr>
                  <th>اسم القطعة / الخدمة</th>
                  <th>العدد</th>
                  <th>سعر الوحدة (₪)</th>
                  <th>من عند الزبون</th>
                  <th>الكفالة</th>
                  <th>ملاحظات</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parts.map(part => (
                  <tr key={part.id}>
                    <td>
                      <input type="text" placeholder="اسم القطعة أو الخدمة" value={part.name}
                        className={'mi-td-input' + errCls(submitAttempted && !!partsErrMap[part.id]?.nameErr)}
                        onChange={e => updatePart(part.id, 'name', e.target.value)} />
                      {showPartErr(part.id, 'nameErr')}
                    </td>
                    <td>
                      <input type="number" min={1} value={part.qty}
                        className={'mi-td-input mi-td-num' + errCls(submitAttempted && !!partsErrMap[part.id]?.qtyErr)}
                        onChange={e => updatePart(part.id, 'qty', Math.max(1, Number(e.target.value)))} />
                      {showPartErr(part.id, 'qtyErr')}
                    </td>
                    <td>
                      <input type="number" min={0} value={part.unitPrice}
                        className="mi-td-input mi-td-num"
                        disabled={part.isCustomerPart}
                        onChange={e => updatePart(part.id, 'unitPrice', Math.max(0, Number(e.target.value)))} />
                    </td>
                    <td className="mi-td-center">
                      <input type="checkbox" className="mi-checkbox" checked={part.isCustomerPart}
                        onChange={e => updatePart(part.id, 'isCustomerPart', e.target.checked)} />
                    </td>
                    <td>
                      <input type="text" placeholder="مثال: 3 أشهر" value={part.warranty} className="mi-td-input"
                        onChange={e => updatePart(part.id, 'warranty', e.target.value)} />
                    </td>
                    <td>
                      <input type="text" placeholder="ملاحظة..." value={part.notes} className="mi-td-input"
                        onChange={e => updatePart(part.id, 'notes', e.target.value)} />
                    </td>
                    <td className="mi-td-center">
                      <button className="btn btn-danger-sm" disabled={parts.length === 1}
                        onClick={() => removePart(part.id)}>حذف</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mi-total-row">
            الإجمالي: <strong>{formTotal.toLocaleString('ar-EG')} ₪</strong>
          </div>

          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSave}>
              {editingCar ? 'حفظ التعديلات' : 'حفظ الفاتورة'}
            </button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Cars list ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">السيارات الموجودة</h2>

        {/* Filter bar */}
        <div className="mi-filters">
          <div className="mi-search-wrap">
            <input
              type="text"
              className="mi-search-input"
              placeholder="🔍  بحث بالاسم أو النمرة..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="mi-date-range">
            <div className="mi-filter-field">
              <span className="mi-filter-label">من تاريخ</span>
              <input type="date" className="mi-date-input" value={filterFrom} max={today()}
                onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى تاريخ</span>
              <input type="date" className="mi-date-input" value={filterTo} max={today()}
                onChange={e => setFilterTo(e.target.value)} />
            </div>
            {hasFilters && (
              <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>
                مسح الفلتر
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>اسم الزبون</th>
                <th>نمرة السيارة</th>
                <th>النوع</th>
                <th>اللون</th>
                <th>تاريخ الاستلام</th>
                <th>أيام في الكراج</th>
                <th>الإجمالي</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredCars.length === 0 ? (
                <tr>
                  <td colSpan={9} className="mi-empty-row">لا توجد سيارات تطابق البحث</td>
                </tr>
              ) : filteredCars.map((car, i) => (
                <tr
                  key={car.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('.mi-actions')) return
                    openEdit(car)
                  }}
                >
                  <td>{car.customerName}</td>
                  <td><span className="mi-plate">{car.carPlate}</span></td>
                  <td>{car.carType}</td>
                  <td>{car.carColor}</td>
                  <td>{car.dateReceived}</td>
                  <td><span className="mi-days">{daysInShop(car.dateReceived)} أيام</span></td>
                  <td className="mi-amount">{car.total.toLocaleString('ar-EG')} ₪</td>
                  <td><span className="mi-badge-orange">قيد الصيانة</span></td>
                  <td>
                    <div className="mi-actions">
                      <button className="btn btn-sm-outline" onClick={() => setDetailsCar(car)}>تفاصيل</button>
                      <button className="btn btn-sm-green"  onClick={() => openDelivery(car)}>تسليم</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showForm && (
          <p className="mi-row-hint">اضغط على أي صف لتعديل بياناته</p>
        )}
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
                {([
                  ['اسم الزبون',     detailsCar.customerName],
                  ['رقم الهاتف',     detailsCar.phone],
                  ['نمرة السيارة',   detailsCar.carPlate],
                  ['نوع السيارة',    detailsCar.carType],
                  ['اللون',          detailsCar.carColor],
                  ['تاريخ الاستلام', detailsCar.dateReceived],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="mi-detail-item">
                    <span className="mi-detail-label">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الحالة</span>
                  <span className="mi-badge-orange">قيد الصيانة</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{detailsCar.total.toLocaleString('ar-EG')} ₪</span>
                </div>
                {detailsCar.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsCar.notes}</span>
                  </div>
                )}
              </div>

              <h4 className="mi-modal-subtitle">القطع والخدمات</h4>
              <div className="mi-parts-table-wrap">
                <table className="mi-parts-table">
                  <thead>
                    <tr>
                      <th>القطعة / الخدمة</th>
                      <th>العدد</th>
                      <th>سعر الوحدة</th>
                      <th>الإجمالي</th>
                      <th>الكفالة</th>
                      <th>من عند الزبون</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsCar.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td className="mi-td-center">{item.quantity}</td>
                        <td className="mi-td-center">{item.unitPrice.toLocaleString('ar-EG')} ₪</td>
                        <td className="mi-td-center">{(item.quantity * item.unitPrice).toLocaleString('ar-EG')} ₪</td>
                        <td>{item.warranty || '—'}</td>
                        <td className="mi-td-center">{item.customerOwned ? '✓' : '—'}</td>
                        <td>{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                الإجمالي الكلي: <strong>{detailsCar.total.toLocaleString('ar-EG')} ₪</strong>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetailsCar(null)}>إغلاق</button>
            </div>
          </div>
        </div>
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
                  <input type="date" value={deliveryDate} max={today()}
                    onChange={e => setDeliveryDate(e.target.value)} />
                </label>
              </div>

              <div className="pay-section-title">طريقة الدفع</div>

              {paymentRows.map(row => (
                <div key={row.id} className="pay-row">
                  <div className="pay-row-main">
                    <select
                      className="pay-select"
                      value={row.method}
                      onChange={e => updatePaymentRow(row.id, { method: e.target.value as PayMethod })}
                    >
                      {(Object.entries(PAY_LABELS) as [PayMethod, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <input
                      type="number" min={0} placeholder="المبلغ ₪"
                      value={row.amount || ''}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePaymentRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                    />
                    <button
                      className="btn btn-danger-sm"
                      disabled={paymentRows.length === 1}
                      onClick={() => removePaymentRow(row.id)}
                    >حذف</button>
                  </div>

                  {row.method === 'check' && (
                    <div className="pay-row-extra">
                      <label className="mi-field">
                        <span>رقم الشيك</span>
                        <input type="text" className="mi-td-input" value={row.checkNumber}
                          onChange={e => updatePaymentRow(row.id, { checkNumber: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>تاريخ الإصدار</span>
                        <input type="date" className="mi-td-input" value={row.issueDate} max={today()}
                          onChange={e => updatePaymentRow(row.id, { issueDate: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>تاريخ الصرف</span>
                        <input type="date" className="mi-td-input" value={row.clearDate}
                          onChange={e => updatePaymentRow(row.id, { clearDate: e.target.value })} />
                      </label>
                    </div>
                  )}

                  {row.method === 'visa' && (
                    <div className="pay-row-extra">
                      <label className="mi-field">
                        <span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>رقم الحركة</span>
                        <input type="text" className="mi-td-input" value={row.transactionNum}
                          onChange={e => updatePaymentRow(row.id, { transactionNum: e.target.value })} />
                      </label>
                    </div>
                  )}
                </div>
              ))}

              <button className="btn btn-secondary pay-add-btn" onClick={addPaymentRow}>
                + إضافة طريقة دفع
              </button>

              <div className="pay-summary">
                <div className="pay-summary-row">
                  <span>إجمالي الفاتورة</span>
                  <strong>{invoiceTotal.toLocaleString('ar-EG')} ₪</strong>
                </div>
                <div className="pay-summary-row">
                  <span>إجمالي المدفوع</span>
                  <strong className="pay-paid">{totalPaid.toLocaleString('ar-EG')} ₪</strong>
                </div>
                <div className="pay-summary-row pay-summary-last">
                  <span>المتبقي</span>
                  <strong className={remaining === 0 ? 'pay-ok' : remaining > 0 ? 'pay-due' : 'pay-over'}>
                    {remaining.toLocaleString('ar-EG')} ₪
                  </strong>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handleDeliverySave}>تأكيد التسليم</button>
              <button className="btn btn-ghost"   onClick={() => setDeliveryCar(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
