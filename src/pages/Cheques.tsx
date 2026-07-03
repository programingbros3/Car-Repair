import { useEffect, useMemo, useState } from 'react'
import type { ChequeRecord, UpcomingChequeSource } from '../store/GarageContext'
import type { ChequeFilters } from '../db/types'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   صفحة الشيكات — عرض كل الشيكات التي دخلت البرنامج على الإطلاق
   (الماضية والمستقبلية) من جداول الشيكات الأربعة. قراءة فقط بالكامل:
   أي تعديل على شيك يبقى من صفحته الأصلية (نفس فلسفة الشيكات المستحقة قريباً).
════════════════════════════════════════ */
const fmt = (n: number) => n.toLocaleString('en-US')

const SOURCE_LABELS: Record<UpcomingChequeSource, string> = {
  maintenance: 'صيانة', direct_sale: 'بيع مباشر', supplier: 'مورد', supplier_debt: 'دين مورد',
}
const SOURCE_CLS: Record<UpcomingChequeSource, string> = {
  maintenance: 'mi-badge-orange', direct_sale: 'mi-badge-blue', supplier: 'mi-badge-purple', supplier_debt: 'mi-badge-red',
}

/* حالة الاستحقاق حسب مقارنة تاريخ الصرف (cash_date) باليوم الحالي */
function dueStatus(days: number): { label: string; cls: string } {
  if (days < 0)  return { label: 'منتهي', cls: 'mi-badge-gray' }
  if (days === 0) return { label: 'اليوم', cls: 'mi-badge-yellow' }
  return { label: 'قادم', cls: 'mi-badge-green' }
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

  /* ── جلب الشيكات من الـ backend مع الفلاتر (SQL) ── */
  useEffect(() => {
    const filters: ChequeFilters = {}
    if (chequeNumber.trim()) filters.chequeNumber = chequeNumber.trim()
    if (bankName.trim())     filters.bankName     = bankName.trim()
    if (filterFrom)          filters.dateFrom     = filterFrom
    if (filterTo)            filters.dateTo       = filterTo
    if (amtMin !== '' && !Number.isNaN(Number(amtMin))) filters.amountMin = Number(amtMin)
    if (amtMax !== '' && !Number.isNaN(Number(amtMax))) filters.amountMax = Number(amtMax)

    let cancelled = false
    dbService.cheques.getAll(filters)
      .then(res => { if (!cancelled) setRows(res) })
      .catch(err => showError(err instanceof Error ? err.message : 'تعذّر تحميل الشيكات'))
    return () => { cancelled = true }
  }, [chequeNumber, bankName, filterFrom, filterTo, amtMin, amtMax])

  const hasFilters = useMemo(
    () => !!(chequeNumber || bankName || filterFrom || filterTo || amtMin || amtMax),
    [chequeNumber, bankName, filterFrom, filterTo, amtMin, amtMax],
  )
  const clearFilters = () => {
    setChequeNumber(''); setBankName(''); setFilterFrom(''); setFilterTo(''); setAmtMin(''); setAmtMax('')
  }

  const total = useMemo(() => rows.reduce((s, r) => s + r.amount, 0), [rows])

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
                <th>حالة الاستحقاق</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr><td colSpan={8} className="mi-empty-row">لا توجد شيكات تطابق البحث</td></tr>
              ) : rows.map((c, i) => {
                const due = dueStatus(c.daysRemaining)
                return (
                  <tr key={`${c.source}-${c.chequeNumber}-${c.cashDate}-${i}`}
                    className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                    <td>{c.chequeNumber || '—'}</td>
                    <td>{c.bankName || '—'}</td>
                    <td>{c.issueDate || '—'}</td>
                    <td>{c.cashDate}</td>
                    <td className="mi-amount">{fmt(c.amount)} ₪</td>
                    <td>{c.partyName}</td>
                    <td><span className={SOURCE_CLS[c.source]}>{SOURCE_LABELS[c.source]}</span></td>
                    <td><span className={due.cls}>{due.label}</span></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
