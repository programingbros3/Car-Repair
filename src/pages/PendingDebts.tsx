import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type DebtType = 'maintenance' | 'direct_sale'

type PayMethod = 'cash' | 'check' | 'visa'

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

type DebtRecord = {
  id: number
  type: DebtType
  typeLabel: string
  customerName: string
  phone: string
  date: string
  carPlate: string
  total: number
  amountPaid: number
  amountRemaining: number
  payments: PaymentRow[]
}

/* ════════════════════════════════════════
   Initial data
════════════════════════════════════════ */
const INITIAL_DEBTS: DebtRecord[] = [
  {
    id: 1,
    type: 'maintenance',
    typeLabel: 'صيانة',
    customerName: 'أحمد محمد',
    phone: '0501234567',
    date: '2026-06-25',
    carPlate: 'أ ب ج 123',
    total: 1500,
    amountPaid: 500,
    amountRemaining: 1000,
    payments: [],
  },
  {
    id: 2,
    type: 'direct_sale',
    typeLabel: 'بيع مباشر',
    customerName: 'سامي الخالد',
    phone: '0531234567',
    date: '2026-06-27',
    carPlate: '',
    total: 350,
    amountPaid: 0,
    amountRemaining: 350,
    payments: [],
  },
]

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

let nextPayId = 1

/* Normalize Arabic: unify alef forms, teh marbuta, alef maqsura, strip spaces */
const normalizeAr = (s: string) =>
  s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, '')
    .toLowerCase()

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++,
  method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const PAY_LABELS: Record<PayMethod, string> = {
  cash: 'كاش', check: 'شيك', visa: 'فيزا',
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function PendingDebts() {
  /* debts */
  const [debts, setDebts] = useState<DebtRecord[]>(INITIAL_DEBTS)

  /* filters */
  const [search, setSearch]         = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | DebtType>('all')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')

  /* payment modal */
  const [payDebt, setPayDebt]       = useState<DebtRecord | null>(null)
  const [payDate, setPayDate]       = useState(today())
  const [payNotes, setPayNotes]     = useState('')
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([])
  const [paySubmitted, setPaySubmitted] = useState(false)

  /* ── Fuse.js fuzzy search on customerName ── */
  const fuseItems = useMemo(
    () => debts.map((d, i) => ({
      _idx:         i,
      customerName: normalizeAr(d.customerName),
    })),
    [debts],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, {
      keys: ['customerName'],
      threshold: 0.4,
      ignoreLocation: true,
    }),
    [fuseItems],
  )

  /* ── Filtered debts ── */
  const filteredDebts = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => debts[r.item._idx])
      : [...debts]
    if (typeFilter !== 'all') result = result.filter(d => d.type === typeFilter)
    if (filterFrom) result = result.filter(d => d.date >= filterFrom)
    if (filterTo)   result = result.filter(d => d.date <= filterTo)
    return result
  }, [debts, search, typeFilter, filterFrom, filterTo, fuse])

  const hasFilters   = !!search.trim() || typeFilter !== 'all' || !!filterFrom || !!filterTo
  const clearFilters = () => { setSearch(''); setTypeFilter('all'); setFilterFrom(''); setFilterTo('') }

  /* ── Stats ── */
  const totalRemaining = debts.reduce((s, d) => s + d.amountRemaining, 0)
  const debtCount      = debts.length

  /* ── Payment modal ── */
  const openPay = (debt: DebtRecord) => {
    setPayDebt(debt)
    setPayDate(today())
    setPayNotes('')
    setPaymentRows([emptyPayRow()])
    setPaySubmitted(false)
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
        const newPaid      = d.amountPaid + thisPaymentTotal
        const newRemaining = d.amountRemaining - thisPaymentTotal
        return { ...d, amountPaid: newPaid, amountRemaining: Math.max(0, newRemaining) }
      })
      return updated.filter(d => d.amountRemaining > 0)
    })
    setPayDebt(null)
  }

  /* ── UI helpers ── */
  const fmt = (n: number) => n.toLocaleString('ar-EG')

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header">
        <h1 className="page-title">الديون المعلقة</h1>
      </div>

      {/* ── Stat cards ── */}
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

        {/* ── Filter bar ── */}
        <div className="mi-filters pd-filter-bar">
          {/* Search */}
          <div className="mi-search-wrap">
            <input
              type="text"
              className="mi-search-input"
              placeholder="🔍  بحث باسم الزبون..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          {/* Type tabs */}
          <div className="pd-type-tabs">
            {([['all', 'الكل'], ['maintenance', 'صيانة'], ['direct_sale', 'بيع مباشر']] as const).map(([val, label]) => (
              <button
                key={val}
                className={`pd-tab${typeFilter === val ? ' pd-tab-active' : ''}`}
                onClick={() => setTypeFilter(val)}
              >{label}</button>
            ))}
          </div>

          {/* Date range */}
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
                مسح الفلاتر
              </button>
            )}
          </div>
        </div>

        {/* ── Table ── */}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>اسم الزبون</th>
                <th>رقم الهاتف</th>
                <th>النوع</th>
                <th>التاريخ</th>
                <th>نمرة السيارة</th>
                <th>الإجمالي</th>
                <th>المدفوع</th>
                <th>المتبقي</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredDebts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="mi-empty-row">لا توجد ديون تطابق البحث</td>
                </tr>
              ) : filteredDebts.map((debt, i) => (
                <tr key={debt.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                  <td>{debt.customerName}</td>
                  <td>{debt.phone || '—'}</td>
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
                    <div className="mi-actions">
                      <button className="btn btn-sm-green" onClick={() => openPay(debt)}>
                        تسجيل دفعة
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Payment Modal ════ */}
      {payDebt && (
        <div className="mi-modal-overlay" onClick={() => setPayDebt(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تسجيل دفعة</h3>
              <button className="mi-modal-close" onClick={() => setPayDebt(null)}>✕</button>
            </div>

            <div className="mi-modal-body">
              {/* Debt summary */}
              <div className="mi-detail-grid pd-debt-summary">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اسم الزبون</span>
                  <strong>{payDebt.customerName}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">إجمالي الفاتورة</span>
                  <span className="mi-amount">{fmt(payDebt.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع حتى الآن</span>
                  <span className="pd-paid">{fmt(payDebt.amountPaid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className="pd-remaining">{fmt(payDebt.amountRemaining)} ₪</span>
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

              {/* Validation error */}
              {paySubmitted && thisPaymentTotal <= 0 && (
                <p className="pd-pay-error">يجب إدخال مبلغ الدفعة</p>
              )}
              {payExceedsDebt && (
                <p className="pd-pay-error">مجموع الدفعة ({fmt(thisPaymentTotal)} ₪) يتجاوز المتبقي ({fmt(payDebt.amountRemaining)} ₪)</p>
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
              <button className="btn btn-ghost" onClick={() => setPayDebt(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
