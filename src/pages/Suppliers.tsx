import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type SupplierItem = {
  name: string
  quantity: number
  unitPrice: number
  notes: string
}

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

type SupplierRecord = {
  id: number
  supplierName: string
  phone: string
  purchaseDate: string
  notes: string
  total: number
  amountPaid: number
  amountRemaining: number
  items: SupplierItem[]
  payments: PaymentRow[]
}

type FormPart = {
  id: number
  name: string
  qty: number
  unitPrice: number
  notes: string
}

type FormPartErr = { nameErr: string; qtyErr: string }

/* ════════════════════════════════════════
   Initial data
════════════════════════════════════════ */
const INITIAL_SUPPLIERS: SupplierRecord[] = [
  {
    id: 1,
    supplierName: 'شركة قطع غيار النور',
    phone: '0501112233',
    purchaseDate: '2026-06-24',
    notes: 'طلبية شهرية',
    total: 2400,
    amountPaid: 1400,
    amountRemaining: 1000,
    items: [
      { name: 'فلتر زيت', quantity: 20, unitPrice: 30, notes: '' },
      { name: 'فلتر هواء', quantity: 15, unitPrice: 40, notes: '' },
      { name: 'بواجي',     quantity: 30, unitPrice: 40, notes: 'نوع ممتاز' },
    ],
    payments: [],
  },
  {
    id: 2,
    supplierName: 'سمير الحداد',
    phone: '0599887766',
    purchaseDate: '2026-06-27',
    notes: '',
    total: 750,
    amountPaid: 750,
    amountRemaining: 0,
    items: [
      { name: 'طقم فحمات', quantity: 5, unitPrice: 150, notes: '' },
    ],
    payments: [],
  },
]

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const DRAFT_KEY = 'garage-sup-draft'
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
  supplierName: '',
  phone:        '',
  purchaseDate: today(),
  generalNotes: '',
})

const newFormPart = (): FormPart => ({
  id: nextPartId++,
  name: '', qty: 1, unitPrice: 0, notes: '',
})

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++,
  method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

/* ── Key-press filters ── */
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

/* ── Validation ── */
const validateSupplier = (v: string) => v.trim() ? '' : 'اسم المورد مطلوب'

const PAY_LABELS: Record<PayMethod, string> = {
  cash: 'كاش', check: 'شيك', visa: 'فيزا', debt: 'دين',
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Suppliers() {
  /* suppliers */
  const [suppliers, setSuppliers] = useState<SupplierRecord[]>(INITIAL_SUPPLIERS)

  /* form */
  const [showForm, setShowForm]               = useState(false)
  const [editing, setEditing]                 = useState<SupplierRecord | null>(null)
  const [form, setForm]                       = useState(emptyForm)
  const [parts, setParts]                     = useState<FormPart[]>([newFormPart()])
  const [paymentRows, setPaymentRows]         = useState<PaymentRow[]>([emptyPayRow()])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* filters */
  const [search, setSearch]         = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')

  /* modals */
  const [detailsSup, setDetailsSup] = useState<SupplierRecord | null>(null)

  /* payment (debt) modal — same logic as PendingDebts */
  const [paySup, setPaySup]               = useState<SupplierRecord | null>(null)
  const [payDate, setPayDate]             = useState(today())
  const [payNotes, setPayNotes]           = useState('')
  const [payRows, setPayRows]             = useState<PaymentRow[]>([])
  const [paySubmitted, setPaySubmitted]   = useState(false)

  /* ── Fuse.js fuzzy search over normalized data ── */
  const fuseItems = useMemo(
    () => suppliers.map((sup, i) => ({
      _idx:         i,
      supplierName: normalizeAr(sup.supplierName),
    })),
    [suppliers],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, {
      keys: ['supplierName'],
      threshold: 0.4,
      ignoreLocation: true,
    }),
    [fuseItems],
  )

  /* ── Filtered suppliers ── */
  const filteredSuppliers = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => suppliers[r.item._idx])
      : [...suppliers]
    if (filterFrom) result = result.filter(s => s.purchaseDate >= filterFrom)
    if (filterTo)   result = result.filter(s => s.purchaseDate <= filterTo)
    return result
  }, [suppliers, search, filterFrom, filterTo, fuse])

  const hasFilters   = !!search.trim() || !!filterFrom || !!filterTo
  const clearFilters = () => { setSearch(''); setFilterFrom(''); setFilterTo('') }

  /* ── Draft restore / persist (new invoices only, not edits) ── */
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
    if (showForm && !editing) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, parts }))
    }
  }, [showForm, editing, form, parts])

  /* ── Form helpers ── */
  const setField   = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))
  const addPart    = () => setParts(prev => [...prev, newFormPart()])
  const removePart = (id: number) => setParts(prev => prev.filter(p => p.id !== id))
  const updatePart = (id: number, field: keyof FormPart, value: string | number) =>
    setParts(prev => prev.map(p => p.id !== id ? p : { ...p, [field]: value }))

  /* ── Payment rows (in the form) ── */
  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  /* ── Open edit form by clicking a row ── */
  const openEdit = (sup: SupplierRecord) => {
    localStorage.removeItem(DRAFT_KEY)
    setEditing(sup)
    setForm({
      supplierName: sup.supplierName,
      phone:        sup.phone,
      purchaseDate: sup.purchaseDate,
      generalNotes: sup.notes,
    })
    const editParts: FormPart[] = sup.items.length > 0
      ? sup.items.map(item => ({
          id:        nextPartId++,
          name:      item.name,
          qty:       item.quantity,
          unitPrice: item.unitPrice,
          notes:     item.notes,
        }))
      : [newFormPart()]
    setParts(editParts)
    setPaymentRows([emptyPayRow()])
    setSubmitAttempted(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ── Validation ── */
  const formTotal      = parts.reduce((s, p) => s + p.qty * p.unitPrice, 0)
  const formPaid       = paymentRows.reduce((s, r) => s + (r.method === 'debt' ? 0 : r.amount || 0), 0)
  const formDebt       = paymentRows.reduce((s, r) => s + (r.method === 'debt' ? r.amount || 0 : 0), 0)
  const supplierErr    = validateSupplier(form.supplierName)

  const partsErrMap: Record<number, FormPartErr> = {}
  for (const p of parts) {
    partsErrMap[p.id] = {
      nameErr: p.name.trim() ? '' : 'اسم القطعة مطلوب',
      qtyErr:  p.qty >= 1   ? '' : 'العدد يجب أن يكون 1 على الأقل',
    }
  }
  const hasErrors = !!supplierErr || Object.values(partsErrMap).some(e => e.nameErr || e.qtyErr)

  /* ── Save (add or update) ── */
  const handleSave = () => {
    setSubmitAttempted(true)
    if (hasErrors) return

    const newItems: SupplierItem[] = parts.map(p => ({
      name:      p.name,
      quantity:  p.qty,
      unitPrice: p.unitPrice,
      notes:     p.notes,
    }))

    const remaining = Math.max(0, formTotal - formPaid)

    if (editing) {
      setSuppliers(prev => prev.map(s => s.id !== editing.id ? s : {
        ...s,
        supplierName:    form.supplierName,
        phone:           form.phone,
        purchaseDate:    form.purchaseDate,
        notes:           form.generalNotes,
        total:           formTotal,
        amountPaid:      formPaid,
        amountRemaining: remaining,
        items:           newItems,
      }))
    } else {
      setSuppliers(prev => [{
        id:              Date.now(),
        supplierName:    form.supplierName,
        phone:           form.phone,
        purchaseDate:    form.purchaseDate,
        notes:           form.generalNotes,
        total:           formTotal,
        amountPaid:      formPaid,
        amountRemaining: remaining,
        items:           newItems,
        payments:        paymentRows,
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
    setPaymentRows([emptyPayRow()])
    setEditing(null)
  }

  /* ── Debt payment modal (same logic as PendingDebts) ── */
  const openPay = (sup: SupplierRecord) => {
    setPaySup(sup)
    setPayDate(today())
    setPayNotes('')
    setPayRows([emptyPayRow()])
    setPaySubmitted(false)
  }
  const addPayRow    = () => setPayRows(prev => [...prev, emptyPayRow()])
  const removePayRow = (id: number) => setPayRows(prev => prev.filter(r => r.id !== id))
  const updatePayRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPayRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  const thisPaymentTotal = payRows.reduce((s, r) => s + (r.amount || 0), 0)
  const remainingAfter   = (paySup?.amountRemaining ?? 0) - thisPaymentTotal
  const payExceedsDebt   = thisPaymentTotal > (paySup?.amountRemaining ?? 0)

  const handlePayConfirm = () => {
    setPaySubmitted(true)
    if (thisPaymentTotal <= 0 || payExceedsDebt) return

    setSuppliers(prev => prev.map(s => {
      if (s.id !== paySup!.id) return s
      const newPaid      = s.amountPaid + thisPaymentTotal
      const newRemaining = Math.max(0, s.amountRemaining - thisPaymentTotal)
      return { ...s, amountPaid: newPaid, amountRemaining: newRemaining }
    }))
    setPaySup(null)
  }

  /* ── UI helpers ── */
  const fmt         = (n: number) => n.toLocaleString('ar-EG')
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
        <h1 className="page-title">الموردون</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
            + إضافة فاتورة شراء
          </button>
        )}
      </div>

      {/* ════ Form (add / edit) ════ */}
      {showForm && (
        <div className={`mi-card mi-form-card${editing ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editing
              ? `تعديل فاتورة الشراء — ${editing.supplierName}`
              : 'بيانات الفاتورة'}
          </h2>
          <div className="mi-form-grid">
            <label className="mi-field">
              <span>اسم المورد <span className="mi-required">*</span></span>
              <input type="text" value={form.supplierName}
                onChange={e => setField('supplierName', e.target.value)} placeholder="شركة أو شخص"
                className={errCls(submitAttempted && !!supplierErr)} />
              {showErr(supplierErr)}
            </label>

            <label className="mi-field">
              <span>رقم هاتف المورد</span>
              <input type="text" value={form.phone} onKeyDown={allowPhoneChars}
                onChange={e => setField('phone', e.target.value)} placeholder="05XXXXXXXX" />
            </label>

            <label className="mi-field">
              <span>تاريخ الشراء</span>
              <input type="date" value={form.purchaseDate} max={today()}
                onChange={e => setField('purchaseDate', e.target.value)} />
            </label>

            <label className="mi-field mi-field-full">
              <span>ملاحظات</span>
              <textarea rows={3} value={form.generalNotes}
                onChange={e => setField('generalNotes', e.target.value)}
                placeholder="أي ملاحظات إضافية..." />
            </label>
          </div>

          <div className="mi-parts-header">
            <h2 className="mi-section-title">بنود الشراء</h2>
            <button className="btn btn-secondary" onClick={addPart}>+ إضافة قطعة</button>
          </div>

          <div className="mi-parts-table-wrap">
            <table className="mi-parts-table">
              <thead>
                <tr>
                  <th>اسم القطعة</th>
                  <th>العدد</th>
                  <th>سعر الوحدة (₪)</th>
                  <th>ملاحظات</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {parts.map(part => (
                  <tr key={part.id}>
                    <td>
                      <input type="text" placeholder="اسم القطعة" value={part.name}
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
                        onChange={e => updatePart(part.id, 'unitPrice', Math.max(0, Number(e.target.value)))} />
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
            الإجمالي: <strong>{fmt(formTotal)} ₪</strong>
          </div>

          {/* ── Payment methods ── */}
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
              <strong>{fmt(formTotal)} ₪</strong>
            </div>
            <div className="pay-summary-row">
              <span>إجمالي المدفوع</span>
              <strong className="pay-paid">{fmt(formPaid)} ₪</strong>
            </div>
            <div className="pay-summary-row pay-summary-last">
              <span>المتبقي (دين)</span>
              <strong className={formDebt === 0 ? 'pay-ok' : 'pay-due'}>
                {fmt(Math.max(0, formTotal - formPaid))} ₪
              </strong>
            </div>
          </div>

          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSave}>
              {editing ? 'حفظ التعديلات' : 'حفظ الفاتورة'}
            </button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Suppliers list ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">فواتير الموردين</h2>

        {/* Filter bar */}
        <div className="mi-filters">
          <div className="mi-search-wrap">
            <input
              type="text"
              className="mi-search-input"
              placeholder="🔍  بحث باسم المورد..."
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
                <th>اسم المورد</th>
                <th>رقم الهاتف</th>
                <th>تاريخ الشراء</th>
                <th>عدد البنود</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="mi-empty-row">لا توجد فواتير تطابق البحث</td>
                </tr>
              ) : filteredSuppliers.map((sup, i) => (
                <tr
                  key={sup.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('.mi-actions')) return
                    openEdit(sup)
                  }}
                >
                  <td>{sup.supplierName}</td>
                  <td>{sup.phone || '—'}</td>
                  <td>{sup.purchaseDate}</td>
                  <td className="mi-td-center">{sup.items.length}</td>
                  <td className="mi-amount">{fmt(sup.total)} ₪</td>
                  <td className="pd-paid">{fmt(sup.amountPaid)} ₪</td>
                  <td className="pd-remaining">{fmt(sup.amountRemaining)} ₪</td>
                  <td>
                    <div className="mi-actions">
                      <button className="btn btn-sm-outline" onClick={() => setDetailsSup(sup)}>تفاصيل</button>
                      <button className="btn btn-sm-green" disabled={sup.amountRemaining <= 0}
                        onClick={() => openPay(sup)}>دفعة</button>
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
      {detailsSup && (
        <div className="mi-modal-overlay" onClick={() => setDetailsSup(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الفاتورة</h3>
              <button className="mi-modal-close" onClick={() => setDetailsSup(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                {([
                  ['اسم المورد',   detailsSup.supplierName],
                  ['رقم الهاتف',   detailsSup.phone || '—'],
                  ['تاريخ الشراء', detailsSup.purchaseDate],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="mi-detail-item">
                    <span className="mi-detail-label">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(detailsSup.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع</span>
                  <span className="pd-paid">{fmt(detailsSup.amountPaid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className="pd-remaining">{fmt(detailsSup.amountRemaining)} ₪</span>
                </div>
                {detailsSup.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsSup.notes}</span>
                  </div>
                )}
              </div>

              <h4 className="mi-modal-subtitle">بنود الشراء</h4>
              <div className="mi-parts-table-wrap">
                <table className="mi-parts-table">
                  <thead>
                    <tr>
                      <th>القطعة</th>
                      <th>العدد</th>
                      <th>سعر الوحدة</th>
                      <th>الإجمالي</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsSup.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td className="mi-td-center">{item.quantity}</td>
                        <td className="mi-td-center">{fmt(item.unitPrice)} ₪</td>
                        <td className="mi-td-center">{fmt(item.quantity * item.unitPrice)} ₪</td>
                        <td>{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                الإجمالي الكلي: <strong>{fmt(detailsSup.total)} ₪</strong>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetailsSup(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Debt Payment Modal ════ */}
      {paySup && (
        <div className="mi-modal-overlay" onClick={() => setPaySup(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تسجيل دفعة</h3>
              <button className="mi-modal-close" onClick={() => setPaySup(null)}>✕</button>
            </div>

            <div className="mi-modal-body">
              {/* Debt summary */}
              <div className="mi-detail-grid pd-debt-summary">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اسم المورد</span>
                  <strong>{paySup.supplierName}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">إجمالي الفاتورة</span>
                  <span className="mi-amount">{fmt(paySup.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع حتى الآن</span>
                  <span className="pd-paid">{fmt(paySup.amountPaid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className="pd-remaining">{fmt(paySup.amountRemaining)} ₪</span>
                </div>
              </div>

              {/* Payment date + notes */}
              <div className="mi-form-grid mi-delivery-grid" style={{ marginBottom: '1.25rem' }}>
                <label className="mi-field">
                  <span>تاريخ الدفعة</span>
                  <input type="date" value={payDate} max={today()}
                    onChange={e => setPayDate(e.target.value)} />
                </label>
                <label className="mi-field">
                  <span>ملاحظات</span>
                  <input type="text" value={payNotes} placeholder="ملاحظة اختيارية..."
                    onChange={e => setPayNotes(e.target.value)} />
                </label>
              </div>

              {/* Payment rows */}
              <div className="pay-section-title">طريقة الدفع</div>

              {payRows.map(row => (
                <div key={row.id} className="pay-row">
                  <div className="pay-row-main">
                    <select
                      className="pay-select"
                      value={row.method}
                      onChange={e => updatePayRow(row.id, { method: e.target.value as PayMethod })}
                    >
                      {(['cash', 'check', 'visa'] as PayMethod[]).map(val => (
                        <option key={val} value={val}>{PAY_LABELS[val]}</option>
                      ))}
                    </select>
                    <input
                      type="number" min={0} placeholder="المبلغ ₪"
                      value={row.amount || ''}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePayRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                    />
                    <button
                      className="btn btn-danger-sm"
                      disabled={payRows.length === 1}
                      onClick={() => removePayRow(row.id)}
                    >حذف</button>
                  </div>

                  {row.method === 'check' && (
                    <div className="pay-row-extra">
                      <label className="mi-field">
                        <span>رقم الشيك</span>
                        <input type="text" className="mi-td-input" value={row.checkNumber}
                          onChange={e => updatePayRow(row.id, { checkNumber: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePayRow(row.id, { bankName: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>تاريخ الإصدار</span>
                        <input type="date" className="mi-td-input" value={row.issueDate} max={today()}
                          onChange={e => updatePayRow(row.id, { issueDate: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>تاريخ الصرف</span>
                        <input type="date" className="mi-td-input" value={row.clearDate}
                          onChange={e => updatePayRow(row.id, { clearDate: e.target.value })} />
                      </label>
                    </div>
                  )}

                  {row.method === 'visa' && (
                    <div className="pay-row-extra">
                      <label className="mi-field">
                        <span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePayRow(row.id, { bankName: e.target.value })} />
                      </label>
                      <label className="mi-field">
                        <span>رقم الحركة</span>
                        <input type="text" className="mi-td-input" value={row.transactionNum}
                          onChange={e => updatePayRow(row.id, { transactionNum: e.target.value })} />
                      </label>
                    </div>
                  )}
                </div>
              ))}

              <button className="btn btn-secondary pay-add-btn" onClick={addPayRow}>
                + إضافة طريقة دفع
              </button>

              {/* Validation error */}
              {paySubmitted && thisPaymentTotal <= 0 && (
                <p className="pd-pay-error">يجب إدخال مبلغ الدفعة</p>
              )}
              {payExceedsDebt && (
                <p className="pd-pay-error">مجموع الدفعة ({fmt(thisPaymentTotal)} ₪) يتجاوز المتبقي ({fmt(paySup.amountRemaining)} ₪)</p>
              )}

              {/* This payment summary */}
              <div className="pay-summary">
                <div className="pay-summary-row">
                  <span>إجمالي هذه الدفعة</span>
                  <strong className="pay-paid">{fmt(thisPaymentTotal)} ₪</strong>
                </div>
                <div className="pay-summary-row pay-summary-last">
                  <span>المتبقي بعدها</span>
                  <strong className={remainingAfter <= 0 ? 'pay-ok' : payExceedsDebt ? 'pay-over' : 'pay-due'}>
                    {fmt(Math.max(0, remainingAfter))} ₪
                  </strong>
                </div>
              </div>
            </div>

            <div className="mi-modal-footer">
              <button
                className="btn btn-primary"
                onClick={handlePayConfirm}
                disabled={payExceedsDebt}
              >تأكيد الدفعة</button>
              <button className="btn btn-ghost" onClick={() => setPaySup(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
