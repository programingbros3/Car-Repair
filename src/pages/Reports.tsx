import { useEffect, useMemo, useState } from 'react'
import { printPdf } from '../utils/printPdf'
import { exportToCsv } from '../utils/exportCsv'
import { exportToXlsx } from '../utils/exportXlsx'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type {
  DailyReport, MonthlyReport, DebtReport, LedgerRow, TopCustomer,
  DebtAgingRow, DebtAgingBucket,
} from '../db/types'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type Tab = 'daily' | 'monthly' | 'yearly' | 'debts' | 'top_customers' | 'debts_aging'

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
const fmt       = (n: number) => n.toLocaleString('en-US')

const YEARS = Array.from({ length: 6 }, (_, i) => thisYear() - i)

const PERIOD_LABELS: Record<Tab, string> = {
  daily:         'يومي',
  monthly:       'شهري',
  yearly:        'سنوي',
  debts:         'تقرير الديون',
  top_customers: 'أفضل الزبائن',
  debts_aging:   'أعمار الديون',
}

const AGING_BUCKETS: DebtAgingBucket[] = ['0-30', '31-60', '61-90', '90+']

const AGING_BUCKET_LABELS: Record<DebtAgingBucket, string> = {
  '0-30':  '0-30 يوم',
  '31-60': '31-60 يوم',
  '61-90': '61-90 يوم',
  '90+':   'أكثر من 90 يوم',
}

const AGING_BUCKET_CLS: Record<DebtAgingBucket, string> = {
  '0-30':  'mi-badge-green',
  '31-60': 'mi-badge-yellow',
  '61-90': 'mi-badge-orange',
  '90+':   'mi-badge-red',
}

const AGING_KIND_LABELS: Record<DebtAgingRow['kind'], string> = {
  maintenance: 'صيانة',
  direct_sale: 'بيع مباشر',
  supplier:    'مورد',
}

const AGING_KIND_CLS: Record<DebtAgingRow['kind'], string> = {
  maintenance: 'mi-badge-orange',
  direct_sale: 'mi-badge-blue',
  supplier:    'mi-badge-purple',
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
  const [daily, setDaily]             = useState<DailyReport | null>(null)
  const [monthly, setMonthly]         = useState<MonthlyReport | null>(null)
  const [yearly, setYearly]           = useState<YearlyReport | null>(null)
  const [debts, setDebts]             = useState<DebtReport | null>(null)
  const [topCustomers, setTopCustomers] = useState<TopCustomer[]>([])
  const [debtsAging, setDebtsAging]   = useState<DebtAgingRow[]>([])
  const [agingSort, setAgingSort]     = useState<'asc' | 'desc'>('desc')
  const [loading, setLoading]         = useState(false)

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
      } else if (tab === 'debts') {
        setDebts(await dbService.report.debts())
      } else if (tab === 'debts_aging') {
        setDebtsAging(await dbService.report.debtsAging())
      } else {
        setTopCustomers(await dbService.report.topCustomers(20))
      }
    }
    run()
      .catch(err => { if (active) showError('تعذّر تحميل التقرير', err) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [tab, day, month, year])

  /* ── ترتيب أعمار الديون حسب عدد الأيام ── */
  const sortedAging = useMemo(() => {
    const arr = [...debtsAging]
    arr.sort((a, b) => agingSort === 'desc' ? b.days_old - a.days_old : a.days_old - b.days_old)
    return arr
  }, [debtsAging, agingSort])

  /* ── Print report ── */
  const periodFooter = `<div style="margin-top:8px;font-size:11px;color:#888;">التطبيق: كراج التل الأخضر · الفترة: ${PERIOD_LABELS[tab]}</div>`

  const handlePrint = () => {
    if (tab === 'top_customers') {
      if (!topCustomers.length) return
      const rows = topCustomers.map((c, i) => `
        <tr>
          <td style="text-align:center;font-weight:700;">${i + 1}</td>
          <td>${c.customer_name}</td>
          <td>${c.customer_phone ?? '—'}</td>
          <td style="text-align:center;">${c.visit_count}</td>
          <td class="amount-in">${fmt(c.total_spent)} ₪</td>
        </tr>`).join('')
      const body = `
        <table>
          <thead><tr><th>#</th><th>اسم الزبون</th><th>رقم الهاتف</th><th>عدد الفواتير</th><th>إجمالي الإنفاق</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        <div style="margin-top:8px;font-size:11px;color:#888;">التطبيق: كراج التل الأخضر · أفضل ${topCustomers.length} زبون</div>`
      printPdf('تقرير أفضل الزبائن', body)
      return
    }

    if (tab === 'debts_aging') {
      if (!sortedAging.length) return
      const rows = sortedAging.map(d => `
        <tr>
          <td><span class="${AGING_BUCKET_CLS[d.bucket]}">${AGING_BUCKET_LABELS[d.bucket]}</span></td>
          <td>${d.party_name}</td>
          <td>${AGING_KIND_LABELS[d.kind]}</td>
          <td>${d.invoice_date}</td>
          <td>${fmt(d.total_amount)} ₪</td>
          <td class="amount-out">${fmt(d.amount_remaining)} ₪</td>
          <td style="text-align:center;">${d.days_old}</td>
        </tr>`).join('')
      const totalsRow = AGING_BUCKETS.map(b => {
        const inBucket = sortedAging.filter(d => d.bucket === b)
        const total = inBucket.reduce((s, d) => s + d.amount_remaining, 0)
        return `<div class="detail-item"><label>${AGING_BUCKET_LABELS[b]}</label><span>${inBucket.length} فاتورة · ${fmt(total)} ₪</span></div>`
      }).join('')
      const body = `
        <div class="detail-grid">${totalsRow}</div>
        <h3 style="margin:16px 0 4px;color:#1E2A38;">تفصيل الديون</h3>
        <table>
          <thead><tr><th>الشريحة العمرية</th><th>الطرف</th><th>النوع</th><th>التاريخ</th><th>الإجمالي</th><th>المتبقي</th><th>الأيام</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${periodFooter}`
      printPdf('تقرير أعمار الديون', body)
      return
    }

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

  /* ── Export CSV ── */
  const handleExportCsv = () => {
    if (tab === 'daily') {
      if (!daily || daily.entries.length === 0) return
      exportToCsv(
        `تقرير-يومي-${day}.csv`,
        ['التاريخ', 'النوع', 'المصدر', 'المبلغ', 'ملاحظات'],
        daily.entries.map(e => [
          e.transaction_date,
          e.amount_in > 0 ? 'وارد' : 'صادر',
          refLabel(e.reference_type),
          e.amount_in > 0 ? e.amount_in : e.amount_out,
          e.notes ?? '',
        ]),
      )
    } else if (tab === 'monthly') {
      if (!monthly || monthly.days.length === 0) return
      exportToCsv(
        `تقرير-شهري-${month}.csv`,
        ['التاريخ', 'الوارد', 'الصادر', 'الصافي'],
        monthly.days.map(d => [d.date, d.total_in, d.total_out, d.net]),
      )
    } else if (tab === 'yearly') {
      if (!yearly) return
      exportToCsv(
        `تقرير-سنوي-${year}.csv`,
        ['الشهر', 'الوارد', 'الصادر', 'الصافي'],
        yearly.months.map(m => [MONTH_NAMES[m.month - 1], m.total_in, m.total_out, m.net]),
      )
    } else if (tab === 'debts_aging') {
      if (!sortedAging.length) return
      exportToCsv(
        `أعمار-الديون-${today()}.csv`,
        ['الطرف', 'النوع', 'التاريخ', 'الإجمالي', 'المتبقي', 'عدد الأيام', 'الشريحة العمرية'],
        sortedAging.map(d => [
          d.party_name,
          AGING_KIND_LABELS[d.kind],
          d.invoice_date,
          d.total_amount,
          d.amount_remaining,
          d.days_old,
          AGING_BUCKET_LABELS[d.bucket],
        ]),
      )
    } else if (tab === 'debts') {
      if (!debts) return
      exportToCsv(
        `ديون-الزبائن-${today()}.csv`,
        ['اسم الزبون', 'المصدر', 'الإجمالي', 'المدفوع', 'المتبقي'],
        debts.customer_debts.map(d => [
          d.customer_name,
          d.invoice_type === 'maintenance' ? 'صيانة' : 'بيع مباشر',
          d.total_amount,
          d.amount_paid,
          d.amount_remaining,
        ]),
      )
      exportToCsv(
        `ديون-الموردين-${today()}.csv`,
        ['اسم المورد', 'رقم الهاتف', 'الإجمالي', 'المدفوع', 'المتبقي'],
        debts.supplier_debts.map(d => [
          d.supplier_name,
          d.supplier_phone ?? '',
          d.total_amount,
          d.amount_paid,
          d.amount_remaining,
        ]),
      )
    }
  }

  /* ── Export Excel (.xlsx) — إضافة موازية لتصدير CSV بنفس البيانات ── */
  const handleExportXlsx = () => {
    if (tab === 'daily') {
      if (!daily || daily.entries.length === 0) return
      exportToXlsx(
        `تقرير-يومي-${day}.xlsx`,
        ['التاريخ', 'النوع', 'المصدر', 'المبلغ', 'ملاحظات'],
        daily.entries.map(e => [
          e.transaction_date,
          e.amount_in > 0 ? 'وارد' : 'صادر',
          refLabel(e.reference_type),
          e.amount_in > 0 ? e.amount_in : e.amount_out,
          e.notes ?? '',
        ]),
        'تقرير يومي',
      )
    } else if (tab === 'monthly') {
      if (!monthly || monthly.days.length === 0) return
      exportToXlsx(
        `تقرير-شهري-${month}.xlsx`,
        ['التاريخ', 'الوارد', 'الصادر', 'الصافي'],
        monthly.days.map(d => [d.date, d.total_in, d.total_out, d.net]),
        'تقرير شهري',
      )
    } else if (tab === 'yearly') {
      if (!yearly) return
      exportToXlsx(
        `تقرير-سنوي-${year}.xlsx`,
        ['الشهر', 'الوارد', 'الصادر', 'الصافي'],
        yearly.months.map(m => [MONTH_NAMES[m.month - 1], m.total_in, m.total_out, m.net]),
        'تقرير سنوي',
      )
    } else if (tab === 'debts_aging') {
      if (!sortedAging.length) return
      exportToXlsx(
        `أعمار-الديون-${today()}.xlsx`,
        ['الطرف', 'النوع', 'التاريخ', 'الإجمالي', 'المتبقي', 'عدد الأيام', 'الشريحة العمرية'],
        sortedAging.map(d => [
          d.party_name,
          AGING_KIND_LABELS[d.kind],
          d.invoice_date,
          d.total_amount,
          d.amount_remaining,
          d.days_old,
          AGING_BUCKET_LABELS[d.bucket],
        ]),
        'أعمار الديون',
      )
    } else if (tab === 'debts') {
      if (!debts) return
      exportToXlsx(
        `ديون-الزبائن-${today()}.xlsx`,
        ['اسم الزبون', 'المصدر', 'الإجمالي', 'المدفوع', 'المتبقي'],
        debts.customer_debts.map(d => [
          d.customer_name,
          d.invoice_type === 'maintenance' ? 'صيانة' : 'بيع مباشر',
          d.total_amount,
          d.amount_paid,
          d.amount_remaining,
        ]),
        'ديون الزبائن',
      )
      exportToXlsx(
        `ديون-الموردين-${today()}.xlsx`,
        ['اسم المورد', 'رقم الهاتف', 'الإجمالي', 'المدفوع', 'المتبقي'],
        debts.supplier_debts.map(d => [
          d.supplier_name,
          d.supplier_phone ?? '',
          d.total_amount,
          d.amount_paid,
          d.amount_remaining,
        ]),
        'ديون الموردين',
      )
    }
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
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {tab !== 'top_customers' && (
            <>
              <button className="btn btn-secondary" onClick={handleExportCsv}>⬇ تصدير CSV</button>
              <button className="btn btn-secondary" onClick={handleExportXlsx}>⬇ تصدير Excel</button>
            </>
          )}
          <button className="btn btn-secondary" onClick={handlePrint}>🖨️ طباعة التقرير</button>
        </div>
      </div>

      {/* ── Main tabs ── */}
      <div className="pd-type-tabs rp-tabs">
        {([
          ['daily',         'يومي'],
          ['monthly',       'شهري'],
          ['yearly',        'سنوي'],
          ['debts',         'تقرير الديون'],
          ['debts_aging',   'أعمار الديون'],
          ['top_customers', 'أفضل الزبائن'],
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
      {tab !== 'debts' && tab !== 'top_customers' && tab !== 'debts_aging' && (
        <>
          {/* ── Date filter ── */}
          <div className="mi-card">
            <div className="mi-filters" style={{ marginBottom: 0 }}>
              {tab === 'daily' && (
                <div className="mi-filter-field">
                  <span className="mi-filter-label">اختر اليوم</span>
                  <input type="date" className="mi-date-input" value={day} max={today()}
                    onChange={e => setDay(e.target.value > today() ? today() : e.target.value)} />
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
      {tab === 'top_customers' && (
        <div className="mi-card" style={{ marginTop: '1.5rem' }}>
          <h2 className="mi-section-title">أفضل الزبائن حسب الإنفاق</h2>
          <div className="mi-table-wrap">
            <table className="mi-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>اسم الزبون</th>
                  <th>رقم الهاتف</th>
                  <th>عدد الفواتير</th>
                  <th>إجمالي الإنفاق</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="mi-empty-row">جارٍ التحميل...</td></tr>
                ) : topCustomers.length === 0 ? (
                  <tr><td colSpan={5} className="mi-empty-row">لا توجد بيانات</td></tr>
                ) : topCustomers.map((c, i) => (
                  <tr key={`${c.customer_name}-${i}`} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                    <td style={{ textAlign: 'center', fontWeight: 700 }}>{i + 1}</td>
                    <td>{c.customer_name}</td>
                    <td>
                      {c.customer_phone
                        ? <span className="mi-phone-highlight">{c.customer_phone}</span>
                        : <span className="mi-badge-gray">غير معروف</span>}
                    </td>
                    <td style={{ textAlign: 'center' }}>{c.visit_count}</td>
                    <td className="cl-amount-in">{fmt(c.total_spent)} ₪</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════════════════════════════════════════
          Debts aging report
      ════════════════════════════════════════ */}
      {tab === 'debts_aging' && (
        <>
          {/* ── Bucket stat cards ── */}
          <div className="stats-grid">
            {AGING_BUCKETS.map(bucket => {
              const inBucket = debtsAging.filter(d => d.bucket === bucket)
              const total = inBucket.reduce((s, d) => s + d.amount_remaining, 0)
              return (
                <div className="stat-card" key={bucket}>
                  <span className="stat-label">{AGING_BUCKET_LABELS[bucket]}</span>
                  <span className="stat-value outgoing">{inBucket.length} فاتورة · {fmt(total)} ₪</span>
                </div>
              )
            })}
          </div>

          {/* ── All aging debts table ── */}
          <div className="mi-card" style={{ marginTop: '1.5rem' }}>
            <h2 className="mi-section-title">تفصيل الديون حسب العمر</h2>
            <div className="mi-table-wrap">
              <table className="mi-table">
                <thead>
                  <tr>
                    <th>الشريحة العمرية</th>
                    <th>الطرف</th>
                    <th>النوع</th>
                    <th>التاريخ</th>
                    <th>الإجمالي</th>
                    <th>المتبقي</th>
                    <th
                      style={{ cursor: 'pointer', userSelect: 'none' }}
                      onClick={() => setAgingSort(s => s === 'desc' ? 'asc' : 'desc')}
                      title="اضغط للترتيب"
                    >
                      عدد الأيام {agingSort === 'desc' ? '▼' : '▲'}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={7} className="mi-empty-row">جارٍ التحميل...</td></tr>
                  ) : sortedAging.length === 0 ? (
                    <tr><td colSpan={7} className="mi-empty-row">لا توجد ديون معلقة</td></tr>
                  ) : sortedAging.map((d, i) => (
                    <tr key={`${d.kind}-${d.invoice_id}`} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                      <td><span className={AGING_BUCKET_CLS[d.bucket]}>{AGING_BUCKET_LABELS[d.bucket]}</span></td>
                      <td>{d.party_name}</td>
                      <td><span className={AGING_KIND_CLS[d.kind]}>{AGING_KIND_LABELS[d.kind]}</span></td>
                      <td>{d.invoice_date}</td>
                      <td className="mi-amount">{fmt(d.total_amount)} ₪</td>
                      <td className="pd-remaining">{fmt(d.amount_remaining)} ₪</td>
                      <td style={{ textAlign: 'center' }}>{d.days_old}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

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
