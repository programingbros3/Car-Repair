import { useEffect, useState, useCallback } from 'react'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type { LedgerRow, CashAuditRow } from '../db/types'

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

const todayStr = () => new Date().toISOString().slice(0, 10)
const fmt      = (n: number) => Math.abs(n).toLocaleString('en-US')

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
  /* ── Date filter ── */
  const [selectedDate, setSelectedDate] = useState(todayStr)

  /* ── Operations ── */
  const [rows, setRows]       = useState<DisplayRow[]>([])
  const [loading, setLoading] = useState(true)

  /* ── Overall summary (removed — no longer used) ── */

  /* ── End-of-day audit ── */
  const [dailyNet, setDailyNet]         = useState(0)
  const [actualAmount, setActualAmount] = useState('')
  const [matchOk, setMatchOk]           = useState(false)
  const [diffModal, setDiffModal]       = useState<{ diff: number; systemTotal: number; actual: number } | null>(null)
  const [saving, setSaving]             = useState(false)

  /* ── Audit records ── */
  const [auditRecords, setAuditRecords]     = useState<CashAuditRow[]>([])
  const [auditsLoading, setAuditsLoading]   = useState(true)

  /* ── Details modal ── */
  const [detailsTx, setDetailsTx] = useState<DisplayRow | null>(null)

  /* ─── Load audit records ─── */
  const loadAudits = useCallback(() => {
    setAuditsLoading(true)
    dbService.cashAudit.getAll()
      .then(setAuditRecords)
      .catch(err => showError('تعذّر تحميل سجل الإحصاءات', err))
      .finally(() => setAuditsLoading(false))
  }, [])

  useEffect(() => { loadAudits() }, [loadAudits])

  /* ─── Load day operations + daily net ─── */
  const loadDayData = useCallback((date: string) => {
    setLoading(true)
    Promise.all([
      dbService.ledger.getByDateRange(date, date),
      dbService.report.daily(date),
    ])
      .then(([entries, report]) => {
        setRows([...entries.map(toDisplay)].reverse())
        setDailyNet(report.net)
      })
      .catch(err => showError('تعذّر تحميل بيانات اليوم', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadDayData(selectedDate)
    setActualAmount('')
    setMatchOk(false)
    setDiffModal(null)
  }, [selectedDate, loadDayData])

  /* ─── احسب الفرق ─── */
  const handleCalcDiff = () => {
    const actual = parseFloat(actualAmount)
    if (isNaN(actual) || actualAmount.trim() === '') return
    const diff = actual - dailyNet
    if (Math.abs(diff) < 0.001) {
      setMatchOk(true)
      setDiffModal(null)
    } else {
      setMatchOk(false)
      setDiffModal({ diff, systemTotal: dailyNet, actual })
    }
  }

  /* ─── تثبيت الرقم (من modal) ─── */
  const handleSaveAudit = async (systemTotal: number, actual: number, diff: number) => {
    setSaving(true)
    try {
      await dbService.cashAudit.save({
        audit_date: selectedDate,
        system_total: systemTotal,
        actual_amount: actual,
        difference: diff,
      })
      const records = await dbService.cashAudit.getAll()
      setAuditRecords(records)
      setDiffModal(null)
    } catch (err) {
      showError('تعذّر حفظ السجل', err)
    } finally {
      setSaving(false)
    }
  }

  /* ─── تثبيت في السجل (حالة مطابق) ─── */
  const handleSaveMatch = async () => {
    const actual = parseFloat(actualAmount)
    if (isNaN(actual)) return
    await handleSaveAudit(dailyNet, actual, 0)
    setMatchOk(false)
  }

  /* ─── Print audit row ─── */
  const handlePrintAudit = (rec: CashAuditRow) => {
    const diffSign = rec.difference > 0 ? '+' : rec.difference < 0 ? '−' : ''
    const diffCls  = Math.abs(rec.difference) < 0.001 ? 'amount-in' : rec.difference > 0 ? 'amount-in' : 'amount-out'
    const statusTxt = Math.abs(rec.difference) < 0.001 ? 'مطابق' : rec.difference > 0 ? 'زيادة' : 'نقص'
    const body = `
      <div class="detail-grid">
        <div class="detail-item"><label>التاريخ</label><span>${rec.audit_date}</span></div>
        <div class="detail-item"><label>إجمالي النظام</label><span class="mi-amount">${fmt(rec.system_total)} ₪</span></div>
        <div class="detail-item"><label>المبلغ الفعلي</label><span class="mi-amount">${fmt(rec.actual_amount)} ₪</span></div>
        <div class="detail-item"><label>الفرق</label><span class="${diffCls}">${diffSign}${fmt(rec.difference)} ₪</span></div>
        <div class="detail-item"><label>الحالة</label><span>${statusTxt}</span></div>
      </div>`
    printPdf('إحصاء يومي', body)
  }

  /* ─── Print receipt ─── */
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

  /* ─── Audit status badge ─── */
  const auditBadge = (diff: number) => {
    if (Math.abs(diff) < 0.001) return <span className="mi-badge-green">مطابق</span>
    if (diff > 0)                return <span className="cl-badge-in">زيادة</span>
    return                              <span className="cl-badge-out">نقص</span>
  }

  const diffColor = (diff: number) =>
    Math.abs(diff) < 0.001 ? '#2ECC71' : diff > 0 ? '#2ECC71' : '#E74C3C'

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">الصندوق الرئيسي</h1>
      </div>

      {/* ── Daily Stats ── */}
      {(() => {
        const dailyCash    = rows.filter(r => r.type === 'incoming').reduce((s, r) => s + r.amount, 0)
        const opCount      = rows.length
        const lastAuditRec = auditRecords.length > 0 ? auditRecords[0] : null
        const lastDiff     = lastAuditRec?.difference ?? 0
        return (
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">كاش اليوم ₪</span>
              <span className="stat-value incoming">{fmt(dailyCash)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إحصاء العمليات</span>
              <span className="stat-value balance">{opCount}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">الفرق ₪</span>
              <span className="stat-value" style={{ color: diffColor(lastDiff) }}>
                {lastDiff > 0 ? '+' : lastDiff < 0 ? '−' : ''}{fmt(lastDiff)} ₪
              </span>
            </div>
          </div>
        )
      })()}

      {/* ════ إحصاء نهاية اليوم ════ */}
      <div className="mi-card" style={{ marginTop: '1.5rem' }}>
        <h2 className="mi-section-title">إحصاء نهاية اليوم</h2>

        {/* Date picker */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div className="mi-filter-field">
            <span className="mi-filter-label">تاريخ الحساب</span>
            <input
              type="date"
              className="mi-date-input"
              value={selectedDate}
              max={todayStr()}
              onChange={e => setSelectedDate(e.target.value)}
            />
          </div>
          {selectedDate !== todayStr() && (
            <button className="btn btn-ghost" onClick={() => setSelectedDate(todayStr())}>
              العودة لليوم
            </button>
          )}
        </div>

        {/* System total for selected day */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.85rem 1.1rem', background: '#f8fafc',
          borderRadius: '8px', border: '1px solid #e8edf2', marginBottom: '1.25rem',
        }}>
          <span style={{ fontSize: '0.92rem', color: '#555', fontWeight: 500 }}>إجمالي عمليات اليوم:</span>
          <span style={{ fontWeight: 700, fontSize: '1.2rem', color: dailyNet >= 0 ? '#2ECC71' : '#E74C3C' }}>
            {dailyNet >= 0 ? '+' : '−'}{fmt(dailyNet)} ₪
          </span>
        </div>

        {/* Actual amount input + calculate button */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', flexWrap: 'wrap' }}>
          <div className="mi-filter-field">
            <span className="mi-filter-label">المبلغ الفعلي في الصندوق ₪</span>
            <input
              type="number"
              min="0"
              step="0.01"
              className="mi-date-input"
              style={{ width: '185px' }}
              placeholder="0.00"
              value={actualAmount}
              onChange={e => { setActualAmount(e.target.value); setMatchOk(false) }}
              onFocus={e => { if (e.target.value === '0') setActualAmount('') }}
              onBlur={e => { if (!e.target.value) setActualAmount('0') }}
              onKeyDown={e => e.key === 'Enter' && handleCalcDiff()}
            />
          </div>
          <button
            className="btn btn-primary"
            disabled={!actualAmount.trim()}
            onClick={handleCalcDiff}
          >
            احسب الفرق
          </button>
        </div>

        {/* Match result */}
        {matchOk && (
          <div style={{
            marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.75rem 1rem', background: '#d4f5e3', borderRadius: '8px',
            border: '1px solid #a8e6c0',
          }}>
            <span style={{ color: '#1a7a45', fontWeight: 700, flex: 1 }}>✓ كل شيء مطابق</span>
            <button className="btn btn-sm-green" onClick={handleSaveMatch} disabled={saving}>
              {saving ? '...' : 'تثبيت في السجل'}
            </button>
          </div>
        )}
      </div>

      {/* ════ سجل العمليات ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">
          سجل العمليات
          <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#888', marginRight: '0.5rem' }}>
            {selectedDate}
          </span>
        </h2>

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
              ) : rows.length === 0 ? (
                <tr><td colSpan={6} className="mi-empty-row">لا توجد عمليات في هذا اليوم</td></tr>
              ) : rows.map((tx, i) => (
                <tr
                  key={tx.id}
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

      {/* ════ سجل الإحصاءات اليومية ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">سجل الإحصاءات اليومية</h2>

        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>إجمالي النظام ₪</th>
                <th>المبلغ الفعلي ₪</th>
                <th>الفرق ₪</th>
                <th>الحالة</th>
                <th>طباعة</th>
              </tr>
            </thead>
            <tbody>
              {auditsLoading ? (
                <tr><td colSpan={6} className="mi-empty-row">جارٍ التحميل...</td></tr>
              ) : auditRecords.length === 0 ? (
                <tr><td colSpan={6} className="mi-empty-row">لا توجد إحصاءات مسجّلة بعد</td></tr>
              ) : auditRecords.map((rec, i) => (
                <tr key={rec.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                  <td>{rec.audit_date}</td>
                  <td className="mi-amount">{fmt(rec.system_total)} ₪</td>
                  <td className="mi-amount">{fmt(rec.actual_amount)} ₪</td>
                  <td style={{ fontWeight: 700, color: diffColor(rec.difference) }}>
                    {rec.difference > 0 ? '+' : rec.difference < 0 ? '−' : ''}{fmt(rec.difference)} ₪
                  </td>
                  <td>{auditBadge(rec.difference)}</td>
                  <td><button className="btn btn-secondary btn-sm-outline" onClick={() => handlePrintAudit(rec)}>طباعة</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
              <button className="btn btn-secondary" onClick={() => handlePrint(detailsTx)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsTx(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Difference Modal ════ */}
      {diffModal && (
        <div className="mi-modal-overlay" onClick={() => setDiffModal(null)}>
          <div className="mi-modal mi-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>فرق في الصندوق</h3>
              <button className="mi-modal-close" onClick={() => setDiffModal(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المبلغ الفعلي</span>
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{fmt(diffModal.actual)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">إجمالي النظام</span>
                  <span style={{ fontWeight: 700, fontSize: '1.05rem' }}>{fmt(diffModal.systemTotal)} ₪</span>
                </div>
                <div className="mi-detail-item mi-detail-full">
                  <span className="mi-detail-label">الفرق</span>
                  <span style={{ fontWeight: 700, fontSize: '1.35rem', color: diffColor(diffModal.diff) }}>
                    {diffModal.diff > 0 ? '+' : '−'}{fmt(diffModal.diff)} ₪
                  </span>
                </div>
              </div>
              <div style={{
                marginTop: '1rem', padding: '0.75rem 1rem',
                background: '#FEF3C7', borderRadius: '8px',
                color: '#B45309', fontSize: '0.92rem', fontWeight: 600, textAlign: 'center',
              }}>
                ⚠ يوجد فرق في المبلغ، يرجى مراجعة عمليات اليوم
              </div>
            </div>
            <div className="mi-modal-footer">
              <button
                className="btn btn-primary"
                disabled={saving}
                onClick={() => handleSaveAudit(diffModal.systemTotal, diffModal.actual, diffModal.diff)}
              >
                {saving ? 'جارٍ الحفظ...' : 'تثبيت الرقم'}
              </button>
              <button className="btn btn-ghost" onClick={() => setDiffModal(null)}>
                مراجعة العمليات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
