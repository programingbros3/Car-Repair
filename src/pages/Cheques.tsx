import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ChequeRecord, UpcomingChequeSource, ChequeStatusUi } from '../store/GarageContext'
import type { ChequeFilters } from '../db/types'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import { printPdf, escapeHtml as esc } from '../utils/printPdf'
import Pagination from '../components/Pagination'

/* ════════════════════════════════════════
   صفحة الشيكات — عرض كل الشيكات التي دخلت البرنامج على الإطلاق
   (الماضية والمستقبلية) من جداول الشيكات الأربعة.
   M3: يمكن تغيير حالة الشيك (معلّق/مصروف/مرتدّ) من هنا؛ الشيك المعلّق لا يُسجَّل
   نقداً في الصندوق إلا عند تحويله إلى "مصروف"، والمرتدّ يعيد الدين على الفاتورة.
════════════════════════════════════════ */
const fmt = (n: number) => n.toLocaleString('en-US')

const SOURCE_LABELS: Record<UpcomingChequeSource, string> = {
  maintenance: 'صيانة', direct_sale: 'بيع مباشر', supplier: 'مورد', supplier_debt: 'دين مورد',
}
const SOURCE_CLS: Record<UpcomingChequeSource, string> = {
  maintenance: 'mi-badge-orange', direct_sale: 'mi-badge-blue', supplier: 'mi-badge-purple', supplier_debt: 'mi-badge-red',
}

/* M3: حالة الشيك */
const STATUS_LABELS: Record<ChequeStatusUi, string> = {
  pending: 'معلّق', cashed: 'مصروف', bounced: 'مرتدّ',
}
const STATUS_CLS: Record<ChequeStatusUi, string> = {
  pending: 'mi-badge-yellow', cashed: 'mi-badge-green', bounced: 'mi-badge-red',
}

/* حالة الاستحقاق حسب مقارنة تاريخ الصرف (cash_date) باليوم الحالي */
function dueStatus(days: number): { label: string; cls: string } {
  if (days < 0)  return { label: 'منتهي', cls: 'mi-badge-gray' }
  if (days === 0) return { label: 'اليوم', cls: 'mi-badge-yellow' }
  return { label: 'قادم', cls: 'mi-badge-green' }
}

/* تفاصيل الشيك + العملية المصدر — تُبنى مرة واحدة وتُعرض في المودال والطباعة بلا تكرار.
   كل حقل يُعرض فقط عند توفّره لمصدره (لا حقول وهمية). */
function chequeDetailRows(c: ChequeRecord): { label: string; value: string }[] {
  const phone = c.partyPhone && c.partyPhone !== '0000' ? c.partyPhone : 'غير معروف'
  const rows: { label: string; value: string }[] = []

  if (c.source === 'maintenance') {
    rows.push({ label: 'اسم الزبون', value: c.partyName })
    rows.push({ label: 'رقم الهاتف', value: phone })
    if (c.carPlate)     rows.push({ label: 'نمرة السيارة', value: c.carPlate })
    if (c.carType)      rows.push({ label: 'نوع السيارة', value: c.carType })
    if (c.carColor)     rows.push({ label: 'لون السيارة', value: c.carColor })
    if (c.invoiceDate)  rows.push({ label: 'تاريخ الاستلام', value: c.invoiceDate })
    if (c.dateReleased) rows.push({ label: 'تاريخ التسليم', value: c.dateReleased })
  } else if (c.source === 'direct_sale') {
    rows.push({ label: 'اسم الزبون', value: c.partyName })
    rows.push({ label: 'رقم الهاتف', value: phone })
    if (c.invoiceDate) rows.push({ label: 'تاريخ البيع', value: c.invoiceDate })
  } else {
    rows.push({ label: 'اسم المورد', value: c.partyName })
    rows.push({ label: 'رقم الهاتف', value: phone })
    if (c.invoiceDate) rows.push({ label: 'تاريخ الشراء', value: c.invoiceDate })
  }

  rows.push({ label: 'رقم الفاتورة', value: c.invoiceNumber || '—' })
  if (c.invoiceTotal != null) rows.push({ label: 'إجمالي الفاتورة', value: `${fmt(c.invoiceTotal)} ₪` })

  rows.push({ label: 'نوع العملية', value: SOURCE_LABELS[c.source] })
  rows.push({ label: 'رقم الشيك', value: c.chequeNumber || '—' })
  rows.push({ label: 'اسم البنك', value: c.bankName || '—' })
  rows.push({ label: 'تاريخ الإصدار', value: c.issueDate || '—' })
  rows.push({ label: 'تاريخ الصرف', value: c.cashDate })
  rows.push({ label: 'مبلغ الشيك', value: `${fmt(c.amount)} ₪` })
  rows.push({ label: 'حالة الشيك', value: STATUS_LABELS[c.status] })
  rows.push({ label: 'حالة الاستحقاق', value: dueStatus(c.daysRemaining).label })
  return rows
}

function printCheque(c: ChequeRecord): void {
  const body = `
    <div class="detail-grid">
      ${chequeDetailRows(c).map(r => `<div class="detail-item"><label>${esc(r.label)}</label><span>${esc(r.value)}</span></div>`).join('')}
    </div>`
  printPdf('إيصال شيك', body)
}

export default function Cheques() {
  /* ── Filters ── */
  const [chequeNumber, setChequeNumber] = useState('')
  const [bankName,     setBankName]     = useState('')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [amtMin,       setAmtMin]       = useState('')
  const [amtMax,       setAmtMax]       = useState('')

  const [rows, setRows] = useState<ChequeRecord[]>([])
  const [detailsCheque, setDetailsCheque] = useState<ChequeRecord | null>(null)
  const [updatingStatus, setUpdatingStatus] = useState(false)

  /* ── جلب الشيكات من الـ backend مع الفلاتر (SQL) ── */
  const loadCheques = useCallback(async () => {
    const filters: ChequeFilters = {}
    if (chequeNumber.trim()) filters.chequeNumber = chequeNumber.trim()
    if (bankName.trim())     filters.bankName     = bankName.trim()
    if (filterFrom)          filters.dateFrom     = filterFrom
    if (filterTo)            filters.dateTo       = filterTo
    if (amtMin !== '' && !Number.isNaN(Number(amtMin))) filters.amountMin = Number(amtMin)
    if (amtMax !== '' && !Number.isNaN(Number(amtMax))) filters.amountMax = Number(amtMax)
    return dbService.cheques.getAll(filters)
  }, [chequeNumber, bankName, filterFrom, filterTo, amtMin, amtMax])

  useEffect(() => {
    let cancelled = false
    loadCheques()
      .then(res => { if (!cancelled) setRows(res) })
      .catch(err => showError(err instanceof Error ? err.message : 'تعذّر تحميل الشيكات'))
    return () => { cancelled = true }
  }, [loadCheques])

  /* M3: تغيير حالة الشيك (يُعدّل الصندوق ومدفوع الفاتورة في الـ backend) */
  const changeStatus = async (c: ChequeRecord, status: ChequeStatusUi) => {
    if (updatingStatus || c.status === status) return
    setUpdatingStatus(true)
    try {
      await dbService.cheques.updateStatus(c.chequeKind, c.paymentId, status)
      const fresh = await loadCheques()
      setRows(fresh)
      setDetailsCheque(prev => prev && prev.paymentId === c.paymentId && prev.chequeKind === c.chequeKind
        ? (fresh.find(x => x.paymentId === c.paymentId && x.chequeKind === c.chequeKind) ?? null)
        : prev)
    } catch (err) {
      showError('تعذّر تغيير حالة الشيك', err)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const hasFilters = useMemo(
    () => !!(chequeNumber || bankName || filterFrom || filterTo || amtMin || amtMax),
    [chequeNumber, bankName, filterFrom, filterTo, amtMin, amtMax],
  )
  const clearFilters = () => {
    setChequeNumber(''); setBankName(''); setFilterFrom(''); setFilterTo(''); setAmtMin(''); setAmtMax('')
  }

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows])

  /* ── Pagination ── */
  const [chequePage, setChequePage] = useState(1)
  const [chequePageSize, setChequePageSize] = useState(10)

  useEffect(() => {
    setChequePage(1)
  }, [chequeNumber, bankName, filterFrom, filterTo, amtMin, amtMax])

  const paginatedRows = useMemo(() => {
    const start = (chequePage - 1) * chequePageSize
    return rows.slice(start, start + chequePageSize)
  }, [rows, chequePage, chequePageSize])

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">الشيكات</h1>
      </div>

      <div className="mi-card">
        <h2 className="mi-section-title">جميع الشيكات ({rows.length}) — الإجمالي {fmt(total)} ₪</h2>

        {/* ── Filter bar ── */}
        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap" style={{ minWidth: 180, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="🔢  بحث برقم الشيك..."
              value={chequeNumber} onChange={e => setChequeNumber(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 180, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="🏦  بحث باسم البنك..."
              value={bankName} onChange={e => setBankName(e.target.value)} />
          </div>

          <div className="mi-date-range">
            <div className="mi-filter-field">
              <span className="mi-filter-label">من تاريخ الصرف</span>
              <input type="date" className="mi-date-input" value={filterFrom}
                onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى تاريخ الصرف</span>
              <input type="date" className="mi-date-input" value={filterTo}
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
                <th>رقم الشيك</th>
                <th>اسم البنك</th>
                <th>تاريخ الإصدار</th>
                <th>تاريخ الصرف</th>
                <th>المبلغ ₪</th>
                <th>الطرف</th>
                <th>نوع العملية</th>
                <th>الحالة</th>
                <th>حالة الاستحقاق</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedRows.length === 0 ? (
                <tr><td colSpan={10} className="mi-empty-row">لا توجد شيكات تطابق البحث</td></tr>
              ) : paginatedRows.map((c, i) => {
                const due = dueStatus(c.daysRemaining)
                return (
                  <tr key={`${c.chequeKind}-${c.paymentId}-${i}`}
                    className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                    onClick={() => setDetailsCheque(c)}>
                    <td>{c.chequeNumber || '—'}</td>
                    <td>{c.bankName || '—'}</td>
                    <td>{c.issueDate || '—'}</td>
                    <td>{c.cashDate}</td>
                    <td className="mi-amount">{fmt(c.amount)} ₪</td>
                    <td>{c.partyName}</td>
                    <td><span className={SOURCE_CLS[c.source]}>{SOURCE_LABELS[c.source]}</span></td>
                    <td><span className={STATUS_CLS[c.status]}>{STATUS_LABELS[c.status]}</span></td>
                    <td><span className={due.cls}>{due.label}</span></td>
                    <td>
                      <div className="mi-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm-outline" onClick={() => setDetailsCheque(c)}>تفاصيل</button>
                        <button className="btn btn-secondary btn-sm-outline" onClick={() => printCheque(c)}>طباعة</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={chequePage}
          totalItems={rows.length}
          pageSize={chequePageSize}
          onPageChange={setChequePage}
          onPageSizeChange={(size) => { setChequePageSize(size); setChequePage(1) }}
        />
        <p className="mi-row-hint">اضغط على أي صف لعرض تفاصيل الشيك والعملية المصدر</p>
      </div>

      {/* ════ Details Modal ════ */}
      {detailsCheque && (
        <div className="mi-modal-overlay" onClick={() => setDetailsCheque(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الشيك</h3>
              <button className="mi-modal-close" onClick={() => setDetailsCheque(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                {chequeDetailRows(detailsCheque).map((r, idx) => (
                  <div className="mi-detail-item" key={idx}>
                    <span className="mi-detail-label">{r.label}</span>
                    <span>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
            {/* M3: تغيير حالة الشيك */}
            <div style={{ padding: '0 1.25rem 0.5rem' }}>
              <div style={{ fontSize: '0.85rem', color: '#555', marginBottom: '0.5rem', fontWeight: 600 }}>
                حالة الشيك: <span className={STATUS_CLS[detailsCheque.status]}>{STATUS_LABELS[detailsCheque.status]}</span>
              </div>
              <div className="mi-actions">
                {(['pending', 'cashed', 'bounced'] as ChequeStatusUi[]).map(st => (
                  <button
                    key={st}
                    className={`btn btn-sm-outline${detailsCheque.status === st ? ' pd-tab-active' : ''}`}
                    disabled={updatingStatus || detailsCheque.status === st}
                    onClick={() => changeStatus(detailsCheque, st)}
                  >
                    {st === 'pending' ? 'تعليق' : st === 'cashed' ? 'تسجيل كمصروف' : 'تسجيل كمرتدّ'}
                  </button>
                ))}
              </div>
              <div className="mi-field-hint" style={{ marginTop: '0.4rem' }}>
                الشيك المعلّق لا يُسجَّل في الصندوق حتى صرفه. المرتدّ يعيد المبلغ ديناً على الفاتورة.
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary" onClick={() => printCheque(detailsCheque)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsCheque(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
