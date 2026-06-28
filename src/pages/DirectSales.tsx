import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type SaleItem = {
  id: number
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

type SaleRecord = {
  id: number
  customerName: string
  phone: string
  saleDate: string
  warranty: string
  notes: string
  total: number
  items: SaleItem[]
  payments: PaymentRow[]
}

type FormItem = {
  id: number
  name: string
  qty: number
  unitPrice: number
  notes: string
}

type FormItemErr = { nameErr: string; qtyErr: string }

/* ════════════════════════════════════════
   Initial data
════════════════════════════════════════ */
const INITIAL_INVOICES: SaleRecord[] = [
  {
    id: 1,
    customerName: 'محمد علي',
    phone: '0521234567',
    saleDate: '2026-06-26',
    warranty: '3 أشهر',
    notes: '',
    total: 350,
    items: [
      { id: 1, name: 'زيت محرك', quantity: 2, unitPrice: 150, notes: '' },
      { id: 2, name: 'فلتر زيت', quantity: 1, unitPrice: 50,  notes: '' },
    ],
    payments: [],
  },
]

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

let nextItemId = 3
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
  saleDate:     today(),
  warranty:     '',
  generalNotes: '',
})

const newFormItem = (): FormItem => ({
  id: nextItemId++,
  name: '', qty: 1, unitPrice: 0, notes: '',
})

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++,
  method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

/* ── Key-press filters ── */
const blockDigits = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault()
}
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

/* ── Validation ── */
const validateName = (v: string) => v.trim() ? '' : 'اسم الزبون مطلوب'

const PAY_LABELS: Record<PayMethod, string> = {
  cash: 'كاش', check: 'شيك', visa: 'فيزا', debt: 'دين',
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function DirectSales() {
  /* invoices */
  const [invoices, setInvoices] = useState<SaleRecord[]>(INITIAL_INVOICES)

  /* form */
  const [showForm, setShowForm]               = useState(false)
  const [editingInvoice, setEditingInvoice]   = useState<SaleRecord | null>(null)
  const [form, setForm]                       = useState(emptyForm)
  const [items, setItems]                     = useState<FormItem[]>([newFormItem()])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* filters */
  const [search, setSearch]         = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')

  /* modals */
  const [detailsInvoice, setDetailsInvoice] = useState<SaleRecord | null>(null)
  const [payInvoice, setPayInvoice]         = useState<SaleRecord | null>(null)
  const [paymentRows, setPaymentRows]       = useState<PaymentRow[]>([])

  /* ── Fuse.js fuzzy search on customerName ── */
  const fuseItems = useMemo(
    () => invoices.map((inv, i) => ({
      _idx:         i,
      customerName: normalizeAr(inv.customerName),
    })),
    [invoices],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, {
      keys: ['customerName'],
      threshold: 0.4,
      ignoreLocation: true,
    }),
    [fuseItems],
  )

  /* ── Filtered invoices ── */
  const filteredInvoices = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => invoices[r.item._idx])
      : [...invoices]
    if (filterFrom) result = result.filter(inv => inv.saleDate >= filterFrom)
    if (filterTo)   result = result.filter(inv => inv.saleDate <= filterTo)
    return result
  }, [invoices, search, filterFrom, filterTo, fuse])

  const hasFilters   = !!search.trim() || !!filterFrom || !!filterTo
  const clearFilters = () => { setSearch(''); setFilterFrom(''); setFilterTo('') }

  /* ── Form helpers ── */
  const setField   = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))
  const addItem    = () => setItems(prev => [...prev, newFormItem()])
  const removeItem = (id: number) => setItems(prev => prev.filter(it => it.id !== id))
  const updateItem = (id: number, field: keyof FormItem, value: string | number) =>
    setItems(prev => prev.map(it => it.id !== id ? it : { ...it, [field]: value }))

  /* ── Open edit form by clicking a row ── */
  const openEdit = (inv: SaleRecord) => {
    setEditingInvoice(inv)
    setForm({
      customerName: inv.customerName,
      phone:        inv.phone,
      saleDate:     inv.saleDate,
      warranty:     inv.warranty,
      generalNotes: inv.notes,
    })
    const editItems: FormItem[] = inv.items.length > 0
      ? inv.items.map(it => ({
          id:        nextItemId++,
          name:      it.name,
          qty:       it.quantity,
          unitPrice: it.unitPrice,
          notes:     it.notes,
        }))
      : [newFormItem()]
    setItems(editItems)
    setSubmitAttempted(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ── Validation ── */
  const formTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const nameErr   = validateName(form.customerName)

  const itemsErrMap: Record<number, FormItemErr> = {}
  for (const it of items) {
    itemsErrMap[it.id] = {
      nameErr: it.name.trim() ? '' : 'اسم الصنف مطلوب',
      qtyErr:  it.qty >= 1   ? '' : 'العدد يجب أن يكون 1 على الأقل',
    }
  }
  const hasErrors = !!nameErr || Object.values(itemsErrMap).some(e => e.nameErr || e.qtyErr)

  /* ── Save (add or update) ── */
  const handleSave = () => {
    setSubmitAttempted(true)
    if (hasErrors) return

    const newItems: SaleItem[] = items.map((it, i) => ({
      id:        i + 1,
      name:      it.name,
      quantity:  it.qty,
      unitPrice: it.unitPrice,
      notes:     it.notes,
    }))

    if (editingInvoice) {
      setInvoices(prev => prev.map(inv => inv.id !== editingInvoice.id ? inv : {
        ...inv,
        customerName: form.customerName,
        phone:        form.phone,
        saleDate:     form.saleDate,
        warranty:     form.warranty,
        notes:        form.generalNotes,
        total:        formTotal,
        items:        newItems,
      }))
    } else {
      setInvoices(prev => [{
        id:           Date.now(),
        customerName: form.customerName,
        phone:        form.phone,
        saleDate:     form.saleDate,
        warranty:     form.warranty,
        notes:        form.generalNotes,
        total:        formTotal,
        items:        newItems,
        payments:     [],
      }, ...prev])
    }
    clearForm()
  }

  const clearForm = () => {
    setShowForm(false)
    setSubmitAttempted(false)
    setForm(emptyForm())
    setItems([newFormItem()])
    setEditingInvoice(null)
  }

  /* ── Payment modal ── */
  const openPay = (inv: SaleRecord) => {
    setPayInvoice(inv)
    setPaymentRows([emptyPayRow()])
  }
  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  const invoiceTotal = payInvoice?.total ?? 0
  const totalPaid    = paymentRows.reduce((s, r) => s + (r.amount || 0), 0)
  const remaining    = invoiceTotal - totalPaid

  const handlePaySave = () => {
    console.log('=== تأكيد الدفع ===', { invoice: payInvoice, paymentRows, totalPaid, remaining })
    setPayInvoice(null)
  }

  /* ── UI helpers ── */
  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showItemErr = (id: number, f: keyof FormItemErr) =>
    submitAttempted && itemsErrMap[id]?.[f] ? <span className="mi-err">{itemsErrMap[id][f]}</span> : null
  const errCls = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header mi-page-header">
        <h1 className="page-title">البيع المباشر</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingInvoice(null); setShowForm(true) }}>
            + إضافة فاتورة جديدة
          </button>
        )}
      </div>

      {/* ════ Form (add / edit) ════ */}
      {showForm && (
        <div className={`mi-card mi-form-card${editingInvoice ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editingInvoice
              ? `تعديل الفاتورة — ${editingInvoice.customerName}`
              : 'فاتورة بيع جديدة'}
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
              <span>التاريخ</span>
              <input type="date" value={form.saleDate} max={today()}
                onChange={e => setField('saleDate', e.target.value)} />
            </label>

            <label className="mi-field">
              <span>الكفالة</span>
              <input type="text" value={form.warranty}
                onChange={e => setField('warranty', e.target.value)} placeholder="مثال: 3 أشهر" />
            </label>

            <label className="mi-field mi-field-full">
              <span>ملاحظات عامة</span>
              <textarea rows={3} value={form.generalNotes}
                onChange={e => setField('generalNotes', e.target.value)}
                placeholder="أي ملاحظات إضافية..." />
            </label>
          </div>

          <div className="mi-parts-header">
            <h2 className="mi-section-title">البنود</h2>
            <button className="btn btn-secondary" onClick={addItem}>+ إضافة صنف</button>
          </div>

          <div className="mi-parts-table-wrap">
            <table className="mi-parts-table">
              <thead>
                <tr>
                  <th>اسم الصنف</th>
                  <th>العدد</th>
                  <th>سعر الوحدة (₪)</th>
                  <th>ملاحظات</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id}>
                    <td>
                      <input type="text" placeholder="اسم الصنف" value={item.name}
                        className={'mi-td-input' + errCls(submitAttempted && !!itemsErrMap[item.id]?.nameErr)}
                        onChange={e => updateItem(item.id, 'name', e.target.value)} />
                      {showItemErr(item.id, 'nameErr')}
                    </td>
                    <td>
                      <input type="number" min={1} value={item.qty}
                        className={'mi-td-input mi-td-num' + errCls(submitAttempted && !!itemsErrMap[item.id]?.qtyErr)}
                        onChange={e => updateItem(item.id, 'qty', Math.max(1, Number(e.target.value)))} />
                      {showItemErr(item.id, 'qtyErr')}
                    </td>
                    <td>
                      <input type="number" min={0} value={item.unitPrice} className="mi-td-input mi-td-num"
                        onChange={e => updateItem(item.id, 'unitPrice', Math.max(0, Number(e.target.value)))} />
                    </td>
                    <td>
                      <input type="text" placeholder="ملاحظة..." value={item.notes} className="mi-td-input"
                        onChange={e => updateItem(item.id, 'notes', e.target.value)} />
                    </td>
                    <td className="mi-td-center">
                      <button className="btn btn-danger-sm" disabled={items.length === 1}
                        onClick={() => removeItem(item.id)}>حذف</button>
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
              {editingInvoice ? 'حفظ التعديلات' : 'حفظ الفاتورة'}
            </button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Invoices list ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">الفواتير</h2>

        {/* Filter bar */}
        <div className="mi-filters">
          <div className="mi-search-wrap">
            <input
              type="text"
              className="mi-search-input"
              placeholder="🔍  بحث باسم الزبون..."
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
                <th>رقم الهاتف</th>
                <th>التاريخ</th>
                <th>الإجمالي</th>
                <th>الكفالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr>
                  <td colSpan={6} className="mi-empty-row">لا توجد فواتير تطابق البحث</td>
                </tr>
              ) : filteredInvoices.map((inv, i) => (
                <tr
                  key={inv.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => {
                    if ((e.target as HTMLElement).closest('.mi-actions')) return
                    openEdit(inv)
                  }}
                >
                  <td>{inv.customerName}</td>
                  <td>{inv.phone || '—'}</td>
                  <td>{inv.saleDate}</td>
                  <td className="mi-amount">{inv.total.toLocaleString('ar-EG')} ₪</td>
                  <td>{inv.warranty || '—'}</td>
                  <td>
                    <div className="mi-actions">
                      <button className="btn btn-sm-outline" onClick={() => setDetailsInvoice(inv)}>تفاصيل</button>
                      <button className="btn btn-sm-green"  onClick={() => openPay(inv)}>دفع</button>
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
      {detailsInvoice && (
        <div className="mi-modal-overlay" onClick={() => setDetailsInvoice(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الفاتورة</h3>
              <button className="mi-modal-close" onClick={() => setDetailsInvoice(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                {([
                  ['اسم الزبون', detailsInvoice.customerName],
                  ['رقم الهاتف', detailsInvoice.phone || '—'],
                  ['التاريخ',    detailsInvoice.saleDate],
                  ['الكفالة',    detailsInvoice.warranty || '—'],
                ] as [string, string][]).map(([label, value]) => (
                  <div key={label} className="mi-detail-item">
                    <span className="mi-detail-label">{label}</span>
                    <span>{value}</span>
                  </div>
                ))}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{detailsInvoice.total.toLocaleString('ar-EG')} ₪</span>
                </div>
                {detailsInvoice.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsInvoice.notes}</span>
                  </div>
                )}
              </div>

              <h4 className="mi-modal-subtitle">البنود</h4>
              <div className="mi-parts-table-wrap">
                <table className="mi-parts-table">
                  <thead>
                    <tr>
                      <th>الصنف</th>
                      <th>العدد</th>
                      <th>سعر الوحدة</th>
                      <th>الإجمالي</th>
                      <th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailsInvoice.items.map(item => (
                      <tr key={item.id}>
                        <td>{item.name}</td>
                        <td className="mi-td-center">{item.quantity}</td>
                        <td className="mi-td-center">{item.unitPrice.toLocaleString('ar-EG')} ₪</td>
                        <td className="mi-td-center">{(item.quantity * item.unitPrice).toLocaleString('ar-EG')} ₪</td>
                        <td>{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                الإجمالي الكلي: <strong>{detailsInvoice.total.toLocaleString('ar-EG')} ₪</strong>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetailsInvoice(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Payment Modal ════ */}
      {payInvoice && (
        <div className="mi-modal-overlay" onClick={() => setPayInvoice(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تسجيل الدفع</h3>
              <button className="mi-modal-close" onClick={() => setPayInvoice(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-delivery-info">
                <span className="mi-detail-label">الزبون:</span>
                <strong>{payInvoice.customerName}</strong>
                <span className="mi-detail-label" style={{ marginRight: '0.5rem' }}>الإجمالي:</span>
                <strong className="mi-amount">{payInvoice.total.toLocaleString('ar-EG')} ₪</strong>
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
              <button className="btn btn-primary" onClick={handlePaySave}>تأكيد الدفع</button>
              <button className="btn btn-ghost"   onClick={() => setPayInvoice(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
