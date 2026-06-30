import { useEffect, useMemo, useState } from 'react'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type {
  DailyReport, MonthlyReport, DebtReport, LedgerRow,
} from '../db/types'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type Tab = 'daily' | 'monthly' | 'yearly' | 'debts'

type YearlyReport = {
  year: number
  total_in: number
  total_out: number
  net: number
  months: { month: number; total_in: number; total_out: number; net: number }[]
}

/* ════════════════════════════════════════
   Labels & helpers
════════════════════════════════════════ */
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

const MONTH_NAMES = [
  'يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو',
  'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر',
]

const today     = () => new Date().toISOString().slice(0, 10)
const thisMonth = () => new Date().toISOString().slice(0, 7)
const thisYear  = () => new Date().getFullYear()
const fmt       = (n: number) => n.toLocaleString('ar-EG')

const YEARS = Array.from({ length: 6 }, (_, i) => thisYear() - i)

const PERIOD_LABELS: Record<Tab, string> = {
  daily:   'يومي',
  monthly: 'شهري',
  yearly:  'سنوي',
  debts:   'تقرير الديون',
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Reports() {
  const [tab, setTab] = useState<Tab>('daily')

  /* period filters */
  const [day, setDay]     = useState(today())
  const [month, setMonth] = useState(thisMonth())
  const [year, setYear]   = useState(thisYear())

  /* fetched reports */
  const [daily, setDaily]     = useState<DailyReport | null>(null)
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null)
  const [yearly, setYearly]   = useState<YearlyReport | null>(null)
  const [debts, setDebts]     = useState<DebtReport | null>(null)
  const [loading, setLoading] = useState(false)

  /* ── جلب التقرير المناسب عند تغيّر التبويب أو الفترة ── */
  useEffect(() => {
    let active = true
    setLoading(true)
    const run = async () => {
      if (tab === 'daily') {
        setDaily(await dbService.report.daily(day))
      } else if (tab === 'monthly') {
        const [y, m] = month.split('-').map(Number)
        setMonthly(await dbService.report.monthly(m, y))
      } else if (tab === 'yearly') {
        const reports = await Promise.all(
          Array.from({ length: 12 }, (_, i) => dbService.report.monthly(i + 1, year)),
        )
        const agg: YearlyReport = {
          year,
          total_in:  reports.reduce((s, r) => s + r.total_in, 0),
          total_out: reports.reduce((s, r) => s + r.total_out, 0),
          net:       reports.reduce((s, r) => s + r.net, 0),
          months: reports.map((r, i) => ({
            month: i + 1, total_in: r.total_in, total_out: r.total_out, net: r.net,
          })),
        }
        setYearly(agg)
      } else {
        setDebts(await dbService.report.debts())
      }
    }
    run()
      .catch(err => { if (active) showError('تعذّر تحميل التقرير', err) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tab, day, month, year])

  /* ── Print report ── */
  const periodFooter = `<div style="margin-top:8px;font-size:11px;color:#888;">التطبيق: كراج · الفترة: ${PERIOD_LABELS[tab]}</div>`

  const handlePrint = () => {
    if (tab === 'debts') {
      if (!debts) return
      const custRows = debts.customer_debts.map(d => `
        <tr>
          <td>${d.customer_name}</td>
          <td>${d.invoice_type === 'maintenance' ? 'صيانة' : 'بيع مباشر'}</td>
          <td>${fmt(d.total_amount)} ₪</td>
          <td class="amount-in">${fmt(d.amount_paid)} ₪</td>
          <td class="amount-out">${fmt(d.amount_remaining)} ₪</td>
        </tr>`).join('')
      const supRows = debts.supplier_debts.map(d => `
        <tr>
          <td>${d.supplier_name}</td>
          <td>${d.supplier_phone ?? '—'}</td>
          <td>${fmt(d.total_amount)} ₪</td>
          <td class="amount-in">${fmt(d.amount_paid)} ₪</td>
          <td class="amount-out">${fmt(d.amount_remaining)} ₪</td>
        </tr>`).join('')
      const body = `
        <h3 style="margin:16px 0 4px;color:#1E2A38;">ديون الزبائن</h3>
        <table>
          <thead><tr><th>اسم الزبون</th><th>المصدر</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
          <tbody>${custRows}</tbody>
        </table>
        <div style="margin-top:8px;font-weight:700;">إجمالي ديون الزبائن: ${fmt(debts.total_customer_debt)} ₪</div>
        <h3 style="margin:24px 0 4px;color:#1E2A38;">ديون الموردين</h3>
        <table>
          <thead><tr><th>اسم المورد</th><th>رقم الهاتف</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th></tr></thead>
          <tbody>${supRows}</tbody>
        </table>
        <div style="margin-top:8px;font-weight:700;">إجمالي ديون الموردين: ${fmt(debts.total_supplier_debt)} ₪</div>
        ${periodFooter}`
      printPdf('تقرير الديون', body)
      return
    }

    const totalIn  = tab === 'daily' ? daily?.total_in  : tab === 'monthly' ? monthly?.total_in  : yearly?.total_in
    const totalOut = tab === 'daily' ? daily?.total_out : tab === 'monthly' ? monthly?.total_out : yearly?.total_out
    const net      = tab === 'daily' ? daily?.net       : tab === 'monthly' ? monthly?.net       : yearly?.net
    if (totalIn === undefined || totalOut === undefined || net === undefined) return
    const profitColor = net >= 0 ? '#2563eb' : '#E74C3C'

    let breakdown = ''
    if (tab === 'daily' && daily) {
      breakdown = `
        <div class="detail-item"><label>دخل الصيانة</label><span class="amount-in">${fmt(daily.maintenance_income)} ₪</span></div>
        <div class="detail-item"><label>دخل البيع المباشر</label><span class="amount-in">${fmt(daily.direct_sale_income)} ₪</span></div>
        <div class="detail-item"><label>تحصيل الديون</label><span class="amount-in">${fmt(daily.debt_collected)} ₪</span></div>
        <div class="detail-item"><label>مشتريات الموردين</label><span class="amount-out">${fmt(daily.supplier_expenses)} ₪</span></div>
        <div class="detail-item"><label>المصاريف</label><span class="amount-out">${fmt(daily.daily_expenses)} ₪</span></div>
        <div class="detail-item"><label>الرواتب</label><span class="amount-out">${fmt(daily.salaries)} ₪</span></div>`
    }

    let rowsHtml = ''
    if (tab === 'daily' && daily) {
      rowsHtml = daily.entries.map(e => `
        <tr>
          <td>${e.transaction_date}</td>
          <td>${e.amount_in > 0 ? 'وارد' : 'صادر'}</td>
          <td>${refLabel(e.reference_type)}</td>
          <td class="${e.amount_in > 0 ? 'amount-in' : 'amount-out'}">${e.amount_in > 0 ? '+' : '−'}${fmt(e.amount_in > 0 ? e.amount_in : e.amount_out)} ₪</td>
          <td>${e.notes ?? '—'}</td>
        </tr>`).join('')
    } else if (tab === 'monthly' && monthly) {
      rowsHtml = monthly.days.map(d => `
        <tr><td>${d.date}</td><td class="amount-in">${fmt(d.total_in)} ₪</td><td class="amount-out">${fmt(d.total_out)} ₪</td><td>${fmt(d.net)} ₪</td></tr>`).join('')
    } else if (tab === 'yearly' && yearly) {
      rowsHtml = yearly.months.map(m => `
        <tr><td>${MONTH_NAMES[m.month - 1]}</td><td class="amount-in">${fmt(m.total_in)} ₪</td><td class="amount-out">${fmt(m.total_out)} ₪</td><td>${fmt(m.net)} ₪</td></tr>`).join('')
    }

    const tableHead = tab === 'daily'
      ? '<tr><th>التاريخ</th><th>النوع</th><th>المصدر</th><th>المبلغ</th><th>ملاحظات</th></tr>'
      : '<tr><th>الفترة</th><th>الوارد</th><th>الصادر</th><th>الصافي</th></tr>'

    const body = `
      <div class="detail-grid">
        <div class="detail-item"><label>إجمالي الوارد</label><span class="amount-in">${fmt(totalIn)} ₪</span></div>
        <div class="detail-item"><label>إجمالي الصادر</label><span class="amount-out">${fmt(totalOut)} ₪</span></div>
        <div class="detail-item"><label>صافي الربح</label><span style="color:${profitColor};font-weight:700">${fmt(net)} ₪</span></div>
        ${breakdown}
      </div>
      <h3 style="margin:16px 0 4px;color:#1E2A38;">ملخص العمليات في الفترة</h3>
      <table>
        <thead>${tableHead}</thead>
        <tbody>${rowsHtml}</tbody>
      </table>
      ${periodFooter}`
    printPdf(`تقرير ${PERIOD_LABELS[tab]}`, body)
  }

  /* القيم المعروضة في بطاقات الإحصائيات للفترة الحالية */
  const periodTotals = useMemo(() => {
    if (tab === 'daily')   return daily   ? { in: daily.total_in,   out: daily.total_out,   net: daily.net }   : null
    if (tab === 'monthly') return monthly ? { in: monthly.total_in, out: monthly.total_out, net: monthly.net } : null
    if (tab === 'yearly')  return yearly  ? { in: yearly.total_in,  out: yearly.total_out,  net: yearly.net }  : null
    return null
  }, [tab, daily, monthly, yearly])

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header mi-page-header">
        <h1 className="page-title">التقارير</h1>
        <button className="btn btn-secondary" onClick={handlePrint}>🖨️ طباعة التقرير</button>
      </div>

      {/* ── Main tabs ── */}
      <div className="pd-type-tabs rp-tabs">
        {([
          ['daily',   'يومي'],
          ['monthly', 'شهري'],
          ['yearly',  'سنوي'],
          ['debts',   'تقرير الديون'],
        ] as [Tab, string][]).map(([val, label]) => (
          <button
            key={val}
            className={`pd-tab${tab === val ? ' pd-tab-active' : ''}`}
            onClick={() => setTab(val)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ════════════════════════════════════════
          Period reports (daily / monthly / yearly)
      ════════════════════════════════════════ */}
      {tab !== 'debts' && (
        <>
          {/* ── Date filter ── */}
          <div className="mi-card">
            <div className="mi-filters" style={{ marginBottom: 0 }}>
              {tab === 'daily' && (
                <div className="mi-filter-field">
                  <span className="mi-filter-label">اختر اليوم</span>
                  <input type="date" className="mi-date-input" value={day} max={today()}
                    onChange={e => setDay(e.target.value)} />
                </div>
              )}

              {tab === 'monthly' && (
                <div className="mi-filter-field">
                  <span className="mi-filter-label">اختر الشهر والسنة</span>
                  <input type="month" className="mi-date-input" value={month} max={thisMonth()}
                    onChange={e => setMonth(e.target.value)} />
                </div>
              )}

              {tab === 'yearly' && (
                <div className="mi-filter-field">
                  <span className="mi-filter-label">اختر السنة</span>
                  <select className="pay-select" value={year}
                    onChange={e => setYear(Number(e.target.value))}>
                    {YEARS.map(y => (
                      <option key={y} value={y}>{y}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* ── Stat cards ── */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">إجمالي الوارد</span>
              <span className="stat-value incoming">{fmt(periodTotals?.in ?? 0)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي الصادر</span>
              <span className="stat-value outgoing">{fmt(periodTotals?.out ?? 0)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">صافي الربح</span>
              <span className={`stat-value ${(periodTotals?.net ?? 0) >= 0 ? 'balance' : 'outgoing'}`}>
                {fmt(periodTotals?.net ?? 0)} ₪
              </span>
            </div>

            {tab === 'daily' && daily && (
              <>
                <div className="stat-card">
                  <span className="stat-label">دخل الصيانة</span>
                  <span className="stat-value incoming">{fmt(daily.maintenance_income)} ₪</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">دخل البيع المباشر</span>
                  <span className="stat-value incoming">{fmt(daily.direct_sale_income)} ₪</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">تحصيل الديون</span>
                  <span className="stat-value incoming">{fmt(daily.debt_collected)} ₪</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">إجمالي مشتريات الموردين</span>
                  <span className="stat-value outgoing">{fmt(daily.supplier_expenses)} ₪</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">إجمالي المصاريف</span>
                  <span className="stat-value outgoing">{fmt(daily.daily_expenses)} ₪</span>
                </div>
                <div className="stat-card">
                  <span className="stat-label">إجمالي الرواتب</span>
                  <span className="stat-value outgoing">{fmt(daily.salaries)} ₪</span>
                </div>
              </>
            )}
          </div>

          {/* ── Operations / breakdown table ── */}
          <div className="mi-card" style={{ marginTop: '1.5rem' }}>
            <h2 className="mi-section-title">
              {tab === 'daily' ? 'ملخص العمليات في الفترة' : 'تفصيل الفترة'}
            </h2>
            <div className="mi-table-wrap">
              {tab === 'daily' ? (
                <table className="mi-table">
                  <thead>
                    <tr>
                      <th>التاريخ</th><th>النوع</th><th>المصدر</th><th>المبلغ</th><th>ملاحظات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={5} className="mi-empty-row">جارٍ التحميل...</td></tr>
                    ) : !daily || daily.entries.length === 0 ? (
                      <tr><td colSpan={5} className="mi-empty-row">لا توجد عمليات في هذه الفترة</td></tr>
                    ) : daily.entries.map((e: LedgerRow, i) => (
                      <tr key={e.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                        <td>{e.transaction_date}</td>
                        <td>
                          <span className={e.amount_in > 0 ? 'cl-badge-in' : 'cl-badge-out'}>
                            {e.amount_in > 0 ? 'وارد' : 'صادر'}
                          </span>
                        </td>
                        <td>{refLabel(e.reference_type)}</td>
                        <td className={e.amount_in > 0 ? 'cl-amount-in' : 'cl-amount-out'}>
                          {e.amount_in > 0 ? '+' : '−'}{fmt(e.amount_in > 0 ? e.amount_in : e.amount_out)} ₪
                        </td>
                        <td>{e.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <table className="mi-table">
                  <thead>
                    <tr><th>الفترة</th><th>الوارد ₪</th><th>الصادر ₪</th><th>الصافي ₪</th></tr>
                  </thead>
                  <tbody>
                    {loading ? (
                      <tr><td colSpan={4} className="mi-empty-row">جارٍ التحميل...</td></tr>
                    ) : tab === 'monthly' ? (
                      !monthly || monthly.days.length === 0 ? (
                        <tr><td colSpan={4} className="mi-empty-row">لا توجد عمليات في هذا الشهر</td></tr>
                      ) : monthly.days.map((d, i) => (
                        <tr key={d.date} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                          <td>{d.date}</td>
                          <td className="cl-amount-in">{fmt(d.total_in)} ₪</td>
                          <td className="cl-amount-out">{fmt(d.total_out)} ₪</td>
                          <td className="mi-amount">{fmt(d.net)} ₪</td>
                        </tr>
                      ))
                    ) : (
                      !yearly ? (
                        <tr><td colSpan={4} className="mi-empty-row">لا توجد بيانات لهذه السنة</td></tr>
                      ) : yearly.months.map((m, i) => (
                        <tr key={m.month} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                          <td>{MONTH_NAMES[m.month - 1]}</td>
                          <td className="cl-amount-in">{fmt(m.total_in)} ₪</td>
                          <td className="cl-amount-out">{fmt(m.total_out)} ₪</td>
                          <td className="mi-amount">{fmt(m.net)} ₪</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════════════════════════
          Debts report
      ════════════════════════════════════════ */}
      {tab === 'debts' && (
        <>
          {/* ── Debt totals cards ── */}
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-label">إجمالي ديون الزبائن</span>
              <span className="stat-value outgoing">{fmt(debts?.total_customer_debt ?? 0)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي ديون الموردين</span>
              <span className="stat-value outgoing">{fmt(debts?.total_supplier_debt ?? 0)} ₪</span>
            </div>
          </div>

          {/* ── Customer debts ── */}
          <div className="mi-card" style={{ marginTop: '1.5rem' }}>
            <h2 className="mi-section-title">ديون الزبائن</h2>
            <div className="mi-table-wrap">
              <table className="mi-table">
                <thead>
                  <tr>
                    <th>اسم الزبون</th>
                    <th>المصدر</th>
                    <th>الإجمالي</th>
                    <th>المدفوع</th>
                    <th>المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="mi-empty-row">جارٍ التحميل...</td></tr>
                  ) : !debts || debts.customer_debts.length === 0 ? (
                    <tr><td colSpan={5} className="mi-empty-row">لا توجد ديون على الزبائن</td></tr>
                  ) : debts.customer_debts.map((d, i) => (
                    <tr key={`${d.invoice_type}-${d.invoice_id}`} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                      <td>{d.customer_name}</td>
                      <td>
                        <span className={d.invoice_type === 'maintenance' ? 'mi-badge-orange' : 'mi-badge-blue'}>
                          {d.invoice_type === 'maintenance' ? 'صيانة' : 'بيع مباشر'}
                        </span>
                      </td>
                      <td className="mi-amount">{fmt(d.total_amount)} ₪</td>
                      <td className="pd-paid">{fmt(d.amount_paid)} ₪</td>
                      <td className="pd-remaining">{fmt(d.amount_remaining)} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mi-total-row">
              إجمالي ديون الزبائن: <strong>{fmt(debts?.total_customer_debt ?? 0)} ₪</strong>
            </div>
          </div>

          {/* ── Supplier debts ── */}
          <div className="mi-card">
            <h2 className="mi-section-title">ديون الموردين</h2>
            <div className="mi-table-wrap">
              <table className="mi-table">
                <thead>
                  <tr>
                    <th>اسم المورد</th>
                    <th>رقم الهاتف</th>
                    <th>الإجمالي</th>
                    <th>المدفوع</th>
                    <th>المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={5} className="mi-empty-row">جارٍ التحميل...</td></tr>
                  ) : !debts || debts.supplier_debts.length === 0 ? (
                    <tr><td colSpan={5} className="mi-empty-row">لا توجد ديون للموردين</td></tr>
                  ) : debts.supplier_debts.map((d, i) => (
                    <tr key={d.invoice_id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                      <td>{d.supplier_name}</td>
                      <td>{d.supplier_phone ?? '—'}</td>
                      <td className="mi-amount">{fmt(d.total_amount)} ₪</td>
                      <td className="pd-paid">{fmt(d.amount_paid)} ₪</td>
                      <td className="pd-remaining">{fmt(d.amount_remaining)} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mi-total-row">
              إجمالي ديون الموردين: <strong>{fmt(debts?.total_supplier_debt ?? 0)} ₪</strong>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
