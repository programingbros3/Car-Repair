import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { DebtRecord, DebtType } from '../store/GarageContext'

/* ════════════════════════════════════════
   Local-only types (payment modal)
════════════════════════════════════════ */
type PayMethod = 'cash' | 'check' | 'visa'

type PaymentRow = {
  id: number; method: PayMethod; amount: number
  checkNumber: string; issueDate: string; clearDate: string
  bankName: string; transactionNum: string
}

/* ════════════════════════════════════════
   Helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)
let nextPayId = 1

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++, method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const PAY_LABELS: Record<PayMethod, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }
const fmt = (n: number) => n.toLocaleString('ar-EG')

/* ════════════════════════════════════════
   LinkedOpsSection
════════════════════════════════════════ */
function LinkedOpsSection({ phone, source, id }: { phone: string; source: string; id: number }) {
  const { getLinkedOps } = useGarage()
  const ops = useMemo(() => getLinkedOps(phone, source, id), [phone, source, id, getLinkedOps])
  if (!ops.length) return null
  return (
    <div className="linked-ops-section">
      <div className="linked-ops-title">عمليات سابقة لهذا الزبون</div>
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
   Component
════════════════════════════════════════ */
export default function PendingDebts() {
  const { debts, setDebts } = useGarage()

  /* filters */
  const [search,      setSearch]      = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [typeFilter,  setTypeFilter]  = useState<'all' | DebtType>('all')
  const [amtMin,      setAmtMin]      = useState('')
  const [amtMax,      setAmtMax]      = useState('')

  /* modals */
  const [detailsDebt, setDetailsDebt] = useState<DebtRecord | null>(null)

  /* payment modal */
  const [payDebt,      setPayDebt]      = useState<DebtRecord | null>(null)
  const [payDate,      setPayDate]      = useState(today())
  const [payNotes,     setPayNotes]     = useState('')
  const [paymentRows,  setPaymentRows]  = useState<PaymentRow[]>([])
  const [paySubmitted, setPaySubmitted] = useState(false)

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => debts.map((d, i) => ({ _idx: i, customerName: normalizeAr(d.customerName) })),
    [debts],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['customerName'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  /* ── Filtered debts ── */
  const filteredDebts = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => debts[r.item._idx])
      : [...debts]
    if (phoneSearch)          result = result.filter(d => d.phone.includes(phoneSearch))
    if (typeFilter !== 'all') result = result.filter(d => d.type === typeFilter)
    if (amtMin)               result = result.filter(d => d.amountRemaining >= Number(amtMin))
    if (amtMax)               result = result.filter(d => d.amountRemaining <= Number(amtMax))
    return result
  }, [debts, search, phoneSearch, typeFilter, amtMin, amtMax, fuse])

  const hasFilters   = !!search.trim() || !!phoneSearch || typeFilter !== 'all' || !!amtMin || !!amtMax
  const clearFilters = () => { setSearch(''); setPhoneSearch(''); setTypeFilter('all'); setAmtMin(''); setAmtMax('') }

  const totalRemaining = debts.reduce((s, d) => s + d.amountRemaining, 0)
  const debtCount      = debts.length

  /* ── Payment modal ── */
  const openPay = (debt: DebtRecord) => {
    setPayDebt(debt); setPayDate(today()); setPayNotes('')
    setPaymentRows([emptyPayRow()]); setPaySubmitted(false)
  }
  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  const thisPaymentTotal = paymentRows.reduce((s, r) => s + (r.amount || 0), 0)
  const remainingAfter   = (payDebt?.amountRemaining ?? 0) - thisPaymentTotal
  const payExceedsDebt   = thisPaymentTotal > (payDebt?.amountRemaining ?? 0)

  const handlePayConfirm = () => {
    setPaySubmitted(true)
    if (thisPaymentTotal <= 0 || payExceedsDebt) return
    setDebts(prev => {
      const updated = prev.map(d => {
        if (d.id !== payDebt!.id) return d
        return { ...d, amountPaid: d.amountPaid + thisPaymentTotal, amountRemaining: Math.max(0, d.amountRemaining - thisPaymentTotal) }
      })
      return updated.filter(d => d.amountRemaining > 0)
    })
    setPayDebt(null)
  }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">الديون المعلقة</h1>
      </div>

      {/* ── Stats ── */}
      <div className="stats-grid pd-stats">
        <div className="stat-card">
          <span className="stat-label">إجمالي الديون</span>
          <span className="stat-value outgoing">{fmt(totalRemaining)} ₪</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">عدد الديون المعلقة</span>
          <span className="stat-value cars">{debtCount}</span>
        </div>
      </div>

      {/* ════ Debts list ════ */}
      <div className="mi-card" style={{ marginTop: '1.5rem' }}>
        <h2 className="mi-section-title">قائمة الديون</h2>

        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap">
            <input type="text" className="mi-search-input" placeholder="🔍  بحث باسم الزبون..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="📞  بحث برقم الهاتف..."
              value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} />
          </div>
          <div className="pd-type-tabs">
            {([['all', 'الكل'], ['maintenance', 'صيانة'], ['direct_sale', 'بيع مباشر']] as const).map(([val, label]) => (
              <button key={val} className={`pd-tab${typeFilter === val ? ' pd-tab-active' : ''}`}
                onClick={() => setTypeFilter(val)}>{label}</button>
            ))}
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

        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>اسم الزبون</th><th>رقم الهاتف</th><th>النوع</th><th>التاريخ</th>
                <th>نمرة السيارة</th><th>الإجمالي ₪</th><th>المدفوع ₪</th><th>المتبقي ₪</th><th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredDebts.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد ديون تطابق البحث</td></tr>
              ) : filteredDebts.map((debt, i) => (
                <tr key={debt.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsDebt(debt)}>
                  <td>{debt.customerName}</td>
                  <td>
                    {debt.phone && debt.phone !== '0000'
                      ? <span className="mi-phone-highlight">{debt.phone}</span>
                      : <span className="mi-badge-gray">غير معروف</span>
                    }
                  </td>
                  <td>
                    {debt.type === 'maintenance'
                      ? <span className="mi-badge-orange">{debt.typeLabel}</span>
                      : <span className="mi-badge-blue">{debt.typeLabel}</span>}
                  </td>
                  <td>{debt.date}</td>
                  <td>{debt.carPlate || '—'}</td>
                  <td className="mi-amount">{fmt(debt.total)} ₪</td>
                  <td className="pd-paid">{fmt(debt.amountPaid)} ₪</td>
                  <td className="pd-remaining">{fmt(debt.amountRemaining)} ₪</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => setDetailsDebt(debt)}>تفاصيل</button>
                      <button className="btn btn-sm-green" onClick={() => openPay(debt)}>إضافة دفعة</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Details Modal ════ */}
      {detailsDebt && (
        <div className="mi-modal-overlay" onClick={() => setDetailsDebt(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الدين</h3>
              <button className="mi-modal-close" onClick={() => setDetailsDebt(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اسم الزبون</span>
                  <strong>{detailsDebt.customerName}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsDebt.phone && detailsDebt.phone !== '0000'
                    ? <span className="mi-phone-highlight">{detailsDebt.phone}</span>
                    : <span className="mi-badge-gray">غير معروف</span>
                  }
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">النوع</span>
                  <span className={detailsDebt.type === 'maintenance' ? 'mi-badge-orange' : 'mi-badge-blue'}>
                    {detailsDebt.typeLabel}
                  </span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsDebt.date}</span>
                </div>
                {detailsDebt.carPlate && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">نمرة السيارة</span>
                    <span className="mi-plate">{detailsDebt.carPlate}</span>
                  </div>
                )}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(detailsDebt.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع</span>
                  <span className="pd-paid">{fmt(detailsDebt.amountPaid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className="pd-remaining">{fmt(detailsDebt.amountRemaining)} ₪</span>
                </div>
              </div>
              <LinkedOpsSection phone={detailsDebt.phone} source="debt" id={detailsDebt.id} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => { console.log('=== طباعة دين ===', detailsDebt) }}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsDebt(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Payment Modal ════ */}
      {payDebt && (
        <div className="mi-modal-overlay" onClick={() => setPayDebt(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>إضافة دفعة — {payDebt.customerName}</h3>
              <button className="mi-modal-close" onClick={() => setPayDebt(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid pd-debt-summary">
                <div className="mi-detail-item"><span className="mi-detail-label">اسم الزبون</span><strong>{payDebt.customerName}</strong></div>
                <div className="mi-detail-item"><span className="mi-detail-label">إجمالي الفاتورة</span><span className="mi-amount">{fmt(payDebt.total)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المدفوع حتى الآن</span><span className="pd-paid">{fmt(payDebt.amountPaid)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المتبقي</span><span className="pd-remaining">{fmt(payDebt.amountRemaining)} ₪</span></div>
              </div>

              <div className="mi-form-grid mi-delivery-grid" style={{ marginBottom: '1.25rem' }}>
                <label className="mi-field">
                  <span>تاريخ الدفعة</span>
                  <input type="date" value={payDate} max={today()} onChange={e => setPayDate(e.target.value)} />
                </label>
                <label className="mi-field">
                  <span>ملاحظات</span>
                  <input type="text" value={payNotes} placeholder="ملاحظة اختيارية..."
                    onChange={e => setPayNotes(e.target.value)} />
                </label>
              </div>

              <div className="pay-section-title">طريقة الدفع</div>
              {paymentRows.map(row => (
                <div key={row.id} className="pay-row">
                  <div className="pay-row-main">
                    <select className="pay-select" value={row.method}
                      onChange={e => updatePaymentRow(row.id, { method: e.target.value as PayMethod })}>
                      {(Object.entries(PAY_LABELS) as [PayMethod, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount || ''}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePaymentRow(row.id, { amount: Math.max(0, Number(e.target.value)) })} />
                    <button className="btn btn-danger-sm" disabled={paymentRows.length === 1}
                      onClick={() => removePaymentRow(row.id)}>حذف</button>
                  </div>
                  {row.method === 'check' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>رقم الشيك</span>
                        <input type="text" className="mi-td-input" value={row.checkNumber}
                          onChange={e => updatePaymentRow(row.id, { checkNumber: e.target.value })} /></label>
                      <label className="mi-field"><span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الإصدار</span>
                        <input type="date" className="mi-td-input" value={row.issueDate} max={today()}
                          onChange={e => updatePaymentRow(row.id, { issueDate: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الصرف</span>
                        <input type="date" className="mi-td-input" value={row.clearDate}
                          onChange={e => updatePaymentRow(row.id, { clearDate: e.target.value })} /></label>
                    </div>
                  )}
                  {row.method === 'visa' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>رقم الحركة</span>
                        <input type="text" className="mi-td-input" value={row.transactionNum}
                          onChange={e => updatePaymentRow(row.id, { transactionNum: e.target.value })} /></label>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-secondary pay-add-btn" onClick={addPaymentRow}>+ إضافة طريقة دفع</button>

              {paySubmitted && thisPaymentTotal <= 0 && (
                <p className="pd-pay-error">يجب إدخال مبلغ الدفعة</p>
              )}
              {payExceedsDebt && (
                <p className="pd-pay-error">مجموع الدفعة ({fmt(thisPaymentTotal)} ₪) يتجاوز المتبقي ({fmt(payDebt.amountRemaining)} ₪)</p>
              )}

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
              <button className="btn btn-primary" onClick={handlePayConfirm} disabled={payExceedsDebt}>
                تأكيد الدفعة
              </button>
              <button className="btn btn-ghost" onClick={() => setPayDebt(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
