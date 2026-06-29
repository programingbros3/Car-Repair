import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { PurchaseInvoice, PurchaseType, PurchaseStatus, PaymentRow } from '../store/GarageContext'

/* ════════════════════════════════════════
   Helpers / Constants
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const TYPE_LABELS: Record<PurchaseType, string>   = { supplier: 'مورد', expense: 'مصروف يومي', salary: 'راتب' }
const TYPE_CLS:    Record<PurchaseType, string>   = { supplier: 'mi-badge-purple', expense: 'mi-badge-gray', salary: 'mi-badge-blue' }
const STATUS_LABELS: Record<PurchaseStatus, string> = { paid: 'مدفوع', partial_debt: 'دين جزئي', full_debt: 'دين كامل' }
const STATUS_CLS:    Record<PurchaseStatus, string> = { paid: 'mi-badge-green', partial_debt: 'mi-badge-yellow', full_debt: 'mi-badge-red' }

const fmt = (n: number) => n.toLocaleString('ar-EG')

const blankRow = (): PaymentRow => ({
  id: Date.now() + Math.random(), method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

/* ════════════════════════════════════════
   LinkedOpsSection
════════════════════════════════════════ */
function LinkedOpsSection({ phone, source, id }: { phone: string; source: string; id: number }) {
  const { getLinkedOps } = useGarage()
  const ops = useMemo(() => getLinkedOps(phone, source, id), [phone, source, id, getLinkedOps])
  if (!ops.length) return null
  return (
    <div className="linked-ops-section">
      <div className="linked-ops-title">عمليات سابقة لهذا المورد</div>
      <div className="mi-table-wrap">
        <table className="mi-table">
          <thead>
            <tr><th>التاريخ</th><th>النوع</th><th>الاسم</th><th>الإجمالي ₪</th><th>الحالة</th></tr>
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
   EditForm type
════════════════════════════════════════ */
type EditForm = {
  date: string; type: PurchaseType; description: string; phone: string
  total: string; paid: string; details: string
}

const invToForm = (inv: PurchaseInvoice): EditForm => ({
  date: inv.date, type: inv.type, description: inv.description, phone: inv.phone,
  total: String(inv.total), paid: String(inv.paid), details: inv.details,
})

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function PurchaseInvoices() {
  const { purchaseInvoices, setPurchaseInvoices } = useGarage()

  /* ── Search & Filter ── */
  const [search,       setSearch]       = useState('')
  const [phoneSearch,  setPhoneSearch]  = useState('')
  const [typeFilter,   setTypeFilter]   = useState<'all' | PurchaseType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | PurchaseStatus>('all')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [amtMin,       setAmtMin]       = useState('')
  const [amtMax,       setAmtMax]       = useState('')

  /* ── Modal states ── */
  const [detailsInv, setDetailsInv] = useState<PurchaseInvoice | null>(null)
  const [warnInv,    setWarnInv]    = useState<PurchaseInvoice | null>(null)
  const [editInv,    setEditInv]    = useState<PurchaseInvoice | null>(null)
  const [editForm,   setEditForm]   = useState<EditForm | null>(null)

  /* ── Payment modal ── */
  const [payInvoice,  setPayInvoice]  = useState<PurchaseInvoice | null>(null)
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([blankRow()])
  const [payDate,     setPayDate]     = useState(today())
  const [payNotes,    setPayNotes]    = useState('')

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => purchaseInvoices.map((inv, i) => ({ _idx: i, description: normalizeAr(inv.description) })),
    [purchaseInvoices],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['description'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => purchaseInvoices[r.item._idx])
      : [...purchaseInvoices]
    if (phoneSearch)            result = result.filter(i => i.phone.includes(phoneSearch))
    if (typeFilter !== 'all')   result = result.filter(i => i.type === typeFilter)
    if (statusFilter !== 'all') result = result.filter(i => i.status === statusFilter)
    if (filterFrom)             result = result.filter(i => i.date >= filterFrom)
    if (filterTo)               result = result.filter(i => i.date <= filterTo)
    if (amtMin)                 result = result.filter(i => i.total >= Number(amtMin))
    if (amtMax)                 result = result.filter(i => i.total <= Number(amtMax))
    return result
  }, [purchaseInvoices, search, phoneSearch, typeFilter, statusFilter, filterFrom, filterTo, amtMin, amtMax, fuse])

  const hasFilters = !!search.trim() || !!phoneSearch || typeFilter !== 'all' || statusFilter !== 'all'
    || !!filterFrom || !!filterTo || !!amtMin || !!amtMax

  const clearFilters = () => {
    setSearch(''); setPhoneSearch(''); setTypeFilter('all'); setStatusFilter('all')
    setFilterFrom(''); setFilterTo(''); setAmtMin(''); setAmtMax('')
  }

  /* ── Edit flow ── */
  const confirmEdit = () => {
    if (!warnInv) return
    setEditInv(warnInv)
    setEditForm(invToForm(warnInv))
    setWarnInv(null)
  }

  const saveEdit = () => {
    if (!editInv || !editForm) return
    const total     = Number(editForm.total) || 0
    const paid      = Math.min(Number(editForm.paid) || 0, total)
    const remaining = total - paid
    const status: PurchaseStatus = remaining <= 0 ? 'paid' : paid === 0 ? 'full_debt' : 'partial_debt'
    const phone = editForm.phone.trim() || '0000'
    setPurchaseInvoices(prev => prev.map(inv => inv.id !== editInv.id ? inv : {
      ...inv, date: editForm.date, type: editForm.type, description: editForm.description,
      phone, total, paid, remaining, status, details: editForm.details,
    }))
    setEditInv(null); setEditForm(null)
  }

  /* ── Payment flow ── */
  const openPay = (inv: PurchaseInvoice) => {
    setPayInvoice(inv)
    setPaymentRows([blankRow()])
    setPayDate(today())
    setPayNotes('')
  }

  const addPayRow    = () => setPaymentRows(r => [...r, blankRow()])
  const removePayRow = (id: number) => setPaymentRows(r => r.filter(row => row.id !== id))
  const updatePayRow = (id: number, field: keyof PaymentRow, val: string | number) =>
    setPaymentRows(r => r.map(row => row.id !== id ? row : { ...row, [field]: val }))

  const totalBeingPaid = paymentRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const submitPayment = () => {
    if (!payInvoice || totalBeingPaid <= 0) return
    const newPaid      = Math.min(payInvoice.paid + totalBeingPaid, payInvoice.total)
    const newRemaining = payInvoice.total - newPaid
    const newStatus: PurchaseStatus = newRemaining <= 0 ? 'paid' : newPaid === 0 ? 'full_debt' : 'partial_debt'
    setPurchaseInvoices(prev => prev.map(inv => inv.id !== payInvoice.id ? inv : {
      ...inv, paid: newPaid, remaining: newRemaining, status: newStatus,
      payments: [...inv.payments, ...paymentRows.map(r => ({ ...r, id: Date.now() + Math.random() }))],
    }))
    setPayInvoice(null)
  }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">فواتير الشراء</h1>
      </div>

      <div className="mi-card">
        <h2 className="mi-section-title">جميع فواتير الشراء</h2>

        {/* ── Filter bar ── */}
        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap">
            <input type="text" className="mi-search-input" placeholder="🔍  بحث باسم المورد أو الوصف..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="📞  بحث برقم الهاتف..."
              value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} />
          </div>

          <div className="pd-type-tabs">
            {([['all', 'الكل'], ['supplier', 'مورد'], ['expense', 'مصروف يومي'], ['salary', 'راتب']] as const).map(([val, label]) => (
              <button key={val} className={`pd-tab${typeFilter === val ? ' pd-tab-active' : ''}`}
                onClick={() => setTypeFilter(val)}>{label}</button>
            ))}
          </div>

          <div className="pd-type-tabs">
            {([['all', 'الكل'], ['paid', 'مدفوع'], ['partial_debt', 'دين جزئي'], ['full_debt', 'دين كامل']] as const).map(([val, label]) => (
              <button key={val} className={`pd-tab${statusFilter === val ? ' pd-tab-active' : ''}`}
                onClick={() => setStatusFilter(val)}>{label}</button>
            ))}
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
          </div>

          <div className="mi-date-range">
            <div className="mi-filter-field">
              <span className="mi-filter-label">من مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input"
                value={amtMin} onChange={e => setAmtMin(e.target.value)} placeholder="0" />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input"
                value={amtMax} onChange={e => setAmtMax(e.target.value)} placeholder="∞" />
            </div>
          </div>

          {hasFilters && (
            <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلاتر</button>
          )}
        </div>

        {/* ── Table ── */}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>الوصف / المورد</th>
                <th>رقم الهاتف</th>
                <th>الإجمالي ₪</th>
                <th>المدفوع ₪</th>
                <th>المتبقي ₪</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد فواتير تطابق البحث</td></tr>
              ) : filtered.map((inv, i) => (
                <tr key={inv.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsInv(inv)}>
                  <td>{inv.date}</td>
                  <td><span className={TYPE_CLS[inv.type]}>{TYPE_LABELS[inv.type]}</span></td>
                  <td>{inv.description}</td>
                  <td>
                    {inv.phone && inv.phone !== '0000'
                      ? <span className="mi-phone-highlight">{inv.phone}</span>
                      : inv.phone === '0000'
                        ? <span className="mi-badge-gray">غير معروف</span>
                        : <span style={{ color: '#9ca3af' }}>—</span>
                    }
                  </td>
                  <td className="mi-amount">{fmt(inv.total)} ₪</td>
                  <td className="pd-paid">{fmt(inv.paid)} ₪</td>
                  <td className={inv.remaining > 0 ? 'pd-remaining' : 'mi-amount'}>{fmt(inv.remaining)} ₪</td>
                  <td><span className={STATUS_CLS[inv.status]}>{STATUS_LABELS[inv.status]}</span></td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => setDetailsInv(inv)}>تفاصيل</button>
                      <button className="btn btn-sm-outline" onClick={() => setWarnInv(inv)}>تعديل</button>
                      {inv.remaining > 0 && (
                        <button className="btn btn-sm-green" onClick={() => openPay(inv)}>إضافة دفعة</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Details Modal ════ */}
      {detailsInv && (
        <div className="mi-modal-overlay" onClick={() => setDetailsInv(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل فاتورة الشراء #{detailsInv.id}</h3>
              <button className="mi-modal-close" onClick={() => setDetailsInv(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsInv.date}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">النوع</span>
                  <span className={TYPE_CLS[detailsInv.type]}>{TYPE_LABELS[detailsInv.type]}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الحالة</span>
                  <span className={STATUS_CLS[detailsInv.status]}>{STATUS_LABELS[detailsInv.status]}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الوصف / المورد</span>
                  <strong>{detailsInv.description}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsInv.phone && detailsInv.phone !== '0000'
                    ? <span className="mi-phone-highlight">{detailsInv.phone}</span>
                    : detailsInv.phone === '0000'
                      ? <span className="mi-badge-gray">غير معروف</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>
                  }
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(detailsInv.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع</span>
                  <span className="pd-paid">{fmt(detailsInv.paid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className={detailsInv.remaining > 0 ? 'pd-remaining' : 'mi-amount'}>
                    {fmt(detailsInv.remaining)} ₪
                  </span>
                </div>
                {detailsInv.details && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">التفاصيل</span>
                    <span>{detailsInv.details}</span>
                  </div>
                )}
              </div>
              {detailsInv.phone && detailsInv.phone !== '' && (
                <LinkedOpsSection phone={detailsInv.phone} source="purchase_invoice" id={detailsInv.id} />
              )}
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => { console.log('=== طباعة فاتورة شراء ===', detailsInv) }}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsInv(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Warning Modal (before edit) ════ */}
      {warnInv && (
        <div className="mi-modal-overlay" onClick={() => setWarnInv(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header mi-modal-warn-header">
              <h3>⚠️ تعديل فاتورة مغلقة</h3>
              <button className="mi-modal-close" onClick={() => setWarnInv(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-warn-banner">
                هذه الفاتورة مغلقة. هل أنت متأكد من رغبتك في التعديل؟
              </div>
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{warnInv.date}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">النوع</span>
                  <span className={TYPE_CLS[warnInv.type]}>{TYPE_LABELS[warnInv.type]}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الوصف / المورد</span>
                  <strong>{warnInv.description}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(warnInv.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الحالة</span>
                  <span className={STATUS_CLS[warnInv.status]}>{STATUS_LABELS[warnInv.status]}</span>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-danger" onClick={confirmEdit}>تأكيد التعديل</button>
              <button className="btn btn-ghost" onClick={() => setWarnInv(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Edit Form Modal ════ */}
      {editInv && editForm && (
        <div className="mi-modal-overlay" onClick={() => { setEditInv(null); setEditForm(null) }}>
          <div className="mi-modal mi-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل الفاتورة #{editInv.id}</h3>
              <button className="mi-modal-close" onClick={() => { setEditInv(null); setEditForm(null) }}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-form-grid">
                <div className="mi-form-field">
                  <label className="mi-form-label">التاريخ</label>
                  <input type="date" className="mi-form-input" value={editForm.date} max={today()}
                    onChange={e => setEditForm(f => f && { ...f, date: e.target.value })} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">النوع</label>
                  <select className="mi-form-input" value={editForm.type}
                    onChange={e => setEditForm(f => f && { ...f, type: e.target.value as PurchaseType })}>
                    <option value="supplier">مورد</option>
                    <option value="expense">مصروف يومي</option>
                    <option value="salary">راتب</option>
                  </select>
                </div>
                <div className="mi-form-field mi-form-field-full">
                  <label className="mi-form-label">الوصف / المورد</label>
                  <input type="text" className="mi-form-input" value={editForm.description}
                    onChange={e => setEditForm(f => f && { ...f, description: e.target.value })} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">رقم الهاتف</label>
                  <input type="text" className="mi-form-input" value={editForm.phone}
                    placeholder="اتركه فارغاً إذا غير معروف"
                    onChange={e => setEditForm(f => f && { ...f, phone: e.target.value })} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">الإجمالي ₪</label>
                  <input type="number" min={0} className="mi-form-input" value={editForm.total}
                    onChange={e => setEditForm(f => f && { ...f, total: e.target.value })} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">المدفوع ₪</label>
                  <input type="number" min={0} className="mi-form-input" value={editForm.paid}
                    onChange={e => setEditForm(f => f && { ...f, paid: e.target.value })} />
                </div>
                <div className="mi-form-field mi-form-field-full">
                  <label className="mi-form-label">التفاصيل</label>
                  <textarea className="mi-form-input mi-form-textarea" value={editForm.details}
                    onChange={e => setEditForm(f => f && { ...f, details: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={saveEdit}>حفظ التعديلات</button>
              <button className="btn btn-ghost" onClick={() => { setEditInv(null); setEditForm(null) }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Payment Modal ════ */}
      {payInvoice && (
        <div className="mi-modal-overlay" onClick={() => setPayInvoice(null)}>
          <div className="mi-modal mi-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>إضافة دفعة — {payInvoice.description}</h3>
              <button className="mi-modal-close" onClick={() => setPayInvoice(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              {/* Summary */}
              <div className="pay-summary-row">
                <div className="pay-summary-item">
                  <span className="pay-summary-label">الإجمالي</span>
                  <span className="pay-summary-val mi-amount">{fmt(payInvoice.total)} ₪</span>
                </div>
                <div className="pay-summary-item">
                  <span className="pay-summary-label">المدفوع</span>
                  <span className="pay-summary-val pd-paid">{fmt(payInvoice.paid)} ₪</span>
                </div>
                <div className="pay-summary-item">
                  <span className="pay-summary-label">المتبقي</span>
                  <span className="pay-summary-val pd-remaining">{fmt(payInvoice.remaining)} ₪</span>
                </div>
              </div>

              {/* Payment rows */}
              <div className="pay-rows-section">
                {paymentRows.map((row, idx) => (
                  <div key={row.id} className="pay-row-block">
                    <div className="pay-row-header">
                      <span className="pay-row-num">دفعة {idx + 1}</span>
                      {paymentRows.length > 1 && (
                        <button className="btn btn-ghost-sm" onClick={() => removePayRow(row.id)}>حذف</button>
                      )}
                    </div>
                    <div className="pay-row-fields">
                      <div className="mi-form-field">
                        <label className="mi-form-label">طريقة الدفع</label>
                        <select className="mi-form-input" value={row.method}
                          onChange={e => updatePayRow(row.id, 'method', e.target.value)}>
                          <option value="cash">كاش</option>
                          <option value="check">شيك</option>
                          <option value="visa">فيزا</option>
                        </select>
                      </div>
                      <div className="mi-form-field">
                        <label className="mi-form-label">المبلغ ₪</label>
                        <input type="number" min={0} className="mi-form-input" value={row.amount || ''}
                          onChange={e => updatePayRow(row.id, 'amount', Number(e.target.value))} />
                      </div>
                      {row.method === 'check' && (<>
                        <div className="mi-form-field">
                          <label className="mi-form-label">رقم الشيك</label>
                          <input type="text" className="mi-form-input" value={row.checkNumber}
                            onChange={e => updatePayRow(row.id, 'checkNumber', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">تاريخ الإصدار</label>
                          <input type="date" className="mi-form-input" value={row.issueDate}
                            onChange={e => updatePayRow(row.id, 'issueDate', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">تاريخ الصرف</label>
                          <input type="date" className="mi-form-input" value={row.clearDate} max={today()}
                            onChange={e => updatePayRow(row.id, 'clearDate', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">اسم البنك</label>
                          <input type="text" className="mi-form-input" value={row.bankName}
                            onChange={e => updatePayRow(row.id, 'bankName', e.target.value)} />
                        </div>
                      </>)}
                      {row.method === 'visa' && (<>
                        <div className="mi-form-field">
                          <label className="mi-form-label">اسم البنك</label>
                          <input type="text" className="mi-form-input" value={row.bankName}
                            onChange={e => updatePayRow(row.id, 'bankName', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">رقم الحركة</label>
                          <input type="text" className="mi-form-input" value={row.transactionNum}
                            onChange={e => updatePayRow(row.id, 'transactionNum', e.target.value)} />
                        </div>
                      </>)}
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={addPayRow}>
                  + إضافة طريقة دفع أخرى
                </button>
              </div>

              {/* Payment date & notes */}
              <div className="mi-form-grid" style={{ marginTop: '1rem' }}>
                <div className="mi-form-field">
                  <label className="mi-form-label">تاريخ الدفع</label>
                  <input type="date" className="mi-form-input" value={payDate} max={today()}
                    onChange={e => setPayDate(e.target.value)} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">ملاحظات</label>
                  <input type="text" className="mi-form-input" value={payNotes}
                    onChange={e => setPayNotes(e.target.value)} />
                </div>
              </div>

              {totalBeingPaid > 0 && (
                <div className="pay-total-row">
                  <span>إجمالي هذه الدفعة:</span>
                  <span className="mi-amount">{fmt(totalBeingPaid)} ₪</span>
                </div>
              )}
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={submitPayment}
                disabled={totalBeingPaid <= 0}>تأكيد الدفع</button>
              <button className="btn btn-ghost" onClick={() => setPayInvoice(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
