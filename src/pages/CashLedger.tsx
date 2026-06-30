import { useEffect, useMemo, useState } from 'react'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type { LedgerRow, LedgerSummary } from '../db/types'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type TxType = 'incoming' | 'outgoing'

type DisplayRow = {
  id: number
  date: string
  type: TxType
  sourceLabel: string
  amount: number
  balanceAfter: number
  notes: string
}

/* ════════════════════════════════════════
   Labels
════════════════════════════════════════ */
const TYPE_LABELS: Record<TxType, string> = { incoming: 'وارد', outgoing: 'صادر' }

/** يحوّل reference_type (من src/db/ledger REF) إلى تسمية عربية للمصدر */
const REF_LABELS: Record<string, string> = {
  maintenance_payment: 'صيانة',
  maintenance_release: 'صيانة',
  direct_sale_payment: 'بيع مباشر',
  debt_customer:       'تحصيل دين',
  supplier_payment:    'مورد',
  supplier_debt:       'مورد',
  daily_expense:       'مصروف',
  salary:              'راتب',
}
const refLabel = (t: string) => REF_LABELS[t] ?? t

const today = () => new Date().toISOString().slice(0, 10)
const fmt   = (n: number) => n.toLocaleString('ar-EG')

const toDisplay = (r: LedgerRow): DisplayRow => ({
  id: r.id,
  date: r.transaction_date,
  type: r.amount_in > 0 ? 'incoming' : 'outgoing',
  sourceLabel: refLabel(r.reference_type),
  amount: r.amount_in > 0 ? r.amount_in : r.amount_out,
  balanceAfter: r.balance_after,
  notes: r.notes ?? '',
})

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function CashLedger() {
  const [rows, setRows]       = useState<DisplayRow[]>([])
  const [summary, setSummary] = useState<LedgerSummary>({ total_in: 0, total_out: 0, balance: 0 })
  const [loading, setLoading] = useState(true)

  /* filters */
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')
  const [filterType, setFilterType] = useState<'all' | TxType>('all')

  /* details modal */
  const [detailsTx, setDetailsTx] = useState<DisplayRow | null>(null)

  /* ── تحميل كل حركات الصندوق + الملخّص من قاعدة البيانات ── */
  useEffect(() => {
    let active = true
    Promise.all([
      dbService.ledger.getByDateRange('0000-01-01', '9999-12-31'),
      dbService.ledger.getSummary(),
    ])
      .then(([entries, sum]) => {
        if (!active) return
        setRows(entries.map(toDisplay))
        setSummary(sum)
      })
      .catch(err => showError('تعذّر تحميل حركات الصندوق', err))
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  /* ── Filtered rows (الأحدث أولاً) ── */
  const filteredRows = useMemo(() => {
    let result = rows
    if (filterFrom)           result = result.filter(t => t.date >= filterFrom)
    if (filterTo)             result = result.filter(t => t.date <= filterTo)
    if (filterType !== 'all') result = result.filter(t => t.type === filterType)
    return [...result].reverse()
  }, [rows, filterFrom, filterTo, filterType])

  const hasFilters   = !!filterFrom || !!filterTo || filterType !== 'all'
  const clearFilters = () => { setFilterFrom(''); setFilterTo(''); setFilterType('all') }

  /* ── Print receipt (shared printPdf) ── */
  const handlePrint = (tx: DisplayRow) => {
    const sign      = tx.type === 'incoming' ? '+' : '−'
    const amountCls = tx.type === 'incoming' ? 'amount-in' : 'amount-out'
    const body = `
      <div class="detail-grid">
        <div class="detail-item"><label>رقم العملية</label><span>${tx.id}</span></div>
        <div class="detail-item"><label>التاريخ</label><span>${tx.date}</span></div>
        <div class="detail-item"><label>النوع</label><span class="${amountCls}">${TYPE_LABELS[tx.type]}</span></div>
        <div class="detail-item"><label>المصدر</label><span>${tx.sourceLabel}</span></div>
        <div class="detail-item"><label>المبلغ</label><span class="${amountCls}">${sign}${fmt(tx.amount)} ₪</span></div>
        <div class="detail-item"><label>الرصيد بعد العملية</label><span>${fmt(tx.balanceAfter)} ₪</span></div>
        ${tx.notes ? `<div class="detail-item"><label>الملاحظات</label><span>${tx.notes}</span></div>` : ''}
      </div>`
    printPdf('إيصال عملية صندوق', body)
  }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">الصندوق الرئيسي</h1>
      </div>

      {/* ── Stats ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">إجمالي الوارد</span>
          <span className="stat-value incoming">{fmt(summary.total_in)} ₪</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">إجمالي الصادر</span>
          <span className="stat-value outgoing">{fmt(summary.total_out)} ₪</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">الرصيد الحالي</span>
          <span className="stat-value balance">{fmt(summary.balance)} ₪</span>
        </div>
      </div>

      {/* ── Ledger card ── */}
      <div className="mi-card" style={{ marginTop: '1.5rem' }}>
        <h2 className="mi-section-title">سجل العمليات</h2>

        {/* Filter bar */}
        <div className="mi-filters">
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

          {/* Type tabs */}
          <div className="pd-type-tabs">
            {([
              ['all',      'الكل'],
              ['incoming', 'وارد'],
              ['outgoing', 'صادر'],
            ] as ['all' | TxType, string][]).map(([val, label]) => (
              <button key={val}
                className={`pd-tab${filterType === val ? ' pd-tab-active' : ''}`}
                onClick={() => setFilterType(val)}>{label}</button>
            ))}
          </div>

          {hasFilters && (
            <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلتر</button>
          )}
        </div>

        {/* Table */}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>المصدر</th>
                <th>المبلغ</th>
                <th>الرصيد بعد العملية</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="mi-empty-row">جارٍ تحميل الحركات...</td></tr>
              ) : filteredRows.length === 0 ? (
                <tr><td colSpan={6} className="mi-empty-row">لا توجد عمليات تطابق الفلتر</td></tr>
              ) : filteredRows.map((tx, i) => (
                <tr key={tx.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={() => setDetailsTx(tx)}
                >
                  <td>{tx.date}</td>
                  <td>
                    <span className={tx.type === 'incoming' ? 'cl-badge-in' : 'cl-badge-out'}>
                      {TYPE_LABELS[tx.type]}
                    </span>
                  </td>
                  <td>{tx.sourceLabel}</td>
                  <td className={tx.type === 'incoming' ? 'cl-amount-in' : 'cl-amount-out'}>
                    {tx.type === 'incoming' ? '+' : '−'}{fmt(tx.amount)} ₪
                  </td>
                  <td className="mi-amount">{fmt(tx.balanceAfter)} ₪</td>
                  <td>{tx.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mi-row-hint">اضغط على أي صف لعرض التفاصيل</p>
      </div>

      {/* ════ Details Modal ════ */}
      {detailsTx && (
        <div className="mi-modal-overlay" onClick={() => setDetailsTx(null)}>
          <div className="mi-modal mi-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل العملية</h3>
              <button className="mi-modal-close" onClick={() => setDetailsTx(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsTx.date}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">النوع</span>
                  <span className={detailsTx.type === 'incoming' ? 'cl-badge-in' : 'cl-badge-out'}>
                    {TYPE_LABELS[detailsTx.type]}
                  </span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المصدر</span>
                  <span>{detailsTx.sourceLabel}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المبلغ</span>
                  <span className={detailsTx.type === 'incoming' ? 'cl-amount-in' : 'cl-amount-out'}>
                    {detailsTx.type === 'incoming' ? '+' : '−'}{fmt(detailsTx.amount)} ₪
                  </span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الرصيد بعد العملية</span>
                  <span className="mi-amount">{fmt(detailsTx.balanceAfter)} ₪</span>
                </div>
                {detailsTx.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsTx.notes}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => handlePrint(detailsTx)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsTx(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
