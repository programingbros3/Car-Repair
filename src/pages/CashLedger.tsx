import { useMemo, useState } from 'react'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type TxType   = 'incoming' | 'outgoing'
type TxSource = 'maintenance' | 'direct_sale' | 'supplier' | 'expense' | 'salary'

type Transaction = {
  id: number
  date: string
  type: TxType
  source: TxSource
  amount: number
  notes: string
}

/* ════════════════════════════════════════
   Initial data (hardcoded — temporary)
   Ordered oldest → newest so the running
   balance can be computed sequentially.
════════════════════════════════════════ */
const INITIAL_TX: Transaction[] = [
  { id: 1, date: '2026-06-22', type: 'incoming', source: 'maintenance', amount: 1500, notes: 'صيانة تويوتا كامري — أحمد محمد' },
  { id: 2, date: '2026-06-23', type: 'outgoing', source: 'supplier',    amount: 900,  notes: 'دفعة لمورد قطع الغيار' },
  { id: 3, date: '2026-06-24', type: 'incoming', source: 'direct_sale', amount: 450,  notes: 'بيع زيت محرك وفلاتر' },
  { id: 4, date: '2026-06-25', type: 'outgoing', source: 'expense',     amount: 120,  notes: 'فاتورة كهرباء الكراج' },
  { id: 5, date: '2026-06-26', type: 'incoming', source: 'maintenance', amount: 800,  notes: 'صيانة هوندا سيفيك — خالد العمري' },
  { id: 6, date: '2026-06-27', type: 'outgoing', source: 'salary',      amount: 600,  notes: 'راتب الموظف سامي' },
]

/* ════════════════════════════════════════
   Labels
════════════════════════════════════════ */
const TYPE_LABELS: Record<TxType, string> = {
  incoming: 'وارد',
  outgoing: 'صادر',
}

const SOURCE_LABELS: Record<TxSource, string> = {
  maintenance: 'صيانة',
  direct_sale: 'بيع مباشر',
  supplier:    'مورد',
  expense:     'مصروف',
  salary:      'راتب',
}

const today = () => new Date().toISOString().slice(0, 10)

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function CashLedger() {
  const [transactions] = useState<Transaction[]>(INITIAL_TX)

  /* filters */
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')
  const [filterType, setFilterType] = useState<'all' | TxType>('all')

  /* ── Running balance computed over the full chronological list ── */
  const withBalance = useMemo(() => {
    let balance = 0
    return transactions.map(tx => {
      balance += tx.type === 'incoming' ? tx.amount : -tx.amount
      return { ...tx, balanceAfter: balance }
    })
  }, [transactions])

  /* ── Totals (over all transactions, not filtered) ── */
  const totalIncoming = useMemo(
    () => transactions.filter(t => t.type === 'incoming').reduce((s, t) => s + t.amount, 0),
    [transactions],
  )
  const totalOutgoing = useMemo(
    () => transactions.filter(t => t.type === 'outgoing').reduce((s, t) => s + t.amount, 0),
    [transactions],
  )
  const currentBalance = totalIncoming - totalOutgoing

  /* ── Filtered rows (newest first for display) ── */
  const filteredRows = useMemo(() => {
    let result = withBalance
    if (filterFrom)         result = result.filter(t => t.date >= filterFrom)
    if (filterTo)           result = result.filter(t => t.date <= filterTo)
    if (filterType !== 'all') result = result.filter(t => t.type === filterType)
    return [...result].reverse()
  }, [withBalance, filterFrom, filterTo, filterType])

  const hasFilters   = !!filterFrom || !!filterTo || filterType !== 'all'
  const clearFilters = () => { setFilterFrom(''); setFilterTo(''); setFilterType('all') }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header">
        <h1 className="page-title">الصندوق الرئيسي</h1>
      </div>

      {/* ── Stats cards ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">إجمالي الوارد</span>
          <span className="stat-value incoming">{totalIncoming.toLocaleString('ar-EG')} ₪</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">إجمالي الصادر</span>
          <span className="stat-value outgoing">{totalOutgoing.toLocaleString('ar-EG')} ₪</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">الرصيد الحالي</span>
          <span className="stat-value balance">{currentBalance.toLocaleString('ar-EG')} ₪</span>
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
              ['all', 'الكل'],
              ['incoming', 'وارد'],
              ['outgoing', 'صادر'],
            ] as ['all' | TxType, string][]).map(([val, label]) => (
              <button
                key={val}
                className={`pd-tab${filterType === val ? ' pd-tab-active' : ''}`}
                onClick={() => setFilterType(val)}
              >
                {label}
              </button>
            ))}
          </div>

          {hasFilters && (
            <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>
              مسح الفلتر
            </button>
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
              {filteredRows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="mi-empty-row">لا توجد عمليات تطابق الفلتر</td>
                </tr>
              ) : filteredRows.map((tx, i) => (
                <tr key={tx.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                  <td>{tx.date}</td>
                  <td>
                    <span className={tx.type === 'incoming' ? 'cl-badge-in' : 'cl-badge-out'}>
                      {TYPE_LABELS[tx.type]}
                    </span>
                  </td>
                  <td>{SOURCE_LABELS[tx.source]}</td>
                  <td className={tx.type === 'incoming' ? 'cl-amount-in' : 'cl-amount-out'}>
                    {tx.type === 'incoming' ? '+' : '−'}{tx.amount.toLocaleString('ar-EG')} ₪
                  </td>
                  <td className="mi-amount">{tx.balanceAfter.toLocaleString('ar-EG')} ₪</td>
                  <td>{tx.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
