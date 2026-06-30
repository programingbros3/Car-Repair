/* ════════════════════════════════════════
   Home / Dashboard
════════════════════════════════════════ */

import { useEffect, useState } from 'react'
import { useGarage } from '../store/GarageContext'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type { MonthlyReport, LedgerSummary } from '../db/types'

const today = () => new Date().toISOString().slice(0, 10)
const fmt   = (n: number) => n.toLocaleString('ar-EG')

/* تاريخ قبل n يوماً بصيغة YYYY-MM-DD */
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

type OpRow = {
  date: string
  type: string
  typeCls: string
  desc: string
  amount: number
}

type Period = 'day' | 'week' | 'month'

export default function Home() {
  const { maintenanceCars, directSales, expenses, salaries, employees, debts, salesInvoices, purchaseInvoices } = useGarage()
  const [period, setPeriod] = useState<Period>('week')

  /* ── إحصائيات الشهر الحالي + رصيد الصندوق من قاعدة البيانات ── */
  const [monthly, setMonthly] = useState<MonthlyReport | null>(null)
  const [summary, setSummary] = useState<LedgerSummary | null>(null)

  useEffect(() => {
    let active = true
    const now = new Date()
    Promise.all([
      dbService.report.monthly(now.getMonth() + 1, now.getFullYear()),
      dbService.ledger.getSummary(),
    ])
      .then(([m, s]) => { if (active) { setMonthly(m); setSummary(s) } })
      .catch(err => showError('تعذّر تحميل إحصائيات لوحة التحكم', err))
    return () => { active = false }
  }, [])

  /* ── بطاقة مصاريف اليوم ── */
  const todayStr = today()
  const todayExpenses = expenses
    .filter(e => e.date === todayStr)
    .reduce((sum, e) => sum + e.amount, 0)

  /* ── حساب البطاقات من البيانات الفعلية ── */
  const carsInProgress = maintenanceCars.filter(c => c.status === 'in_progress').length
  const pendingDebtCount = debts.length
  const pendingDebtTotal = debts.reduce((s, d) => s + d.amountRemaining, 0)
  const salesToday    = salesInvoices.filter(inv => inv.date === todayStr).length
  const purchasesToday = purchaseInvoices.filter(inv => inv.date === todayStr).length

  const stats = [
    { label: 'إجمالي الوارد هذا الشهر',  value: `${fmt(monthly?.total_in ?? 0)} ₪`,  cls: 'incoming'    },
    { label: 'إجمالي الصادر هذا الشهر',  value: `${fmt(monthly?.total_out ?? 0)} ₪`, cls: 'outgoing'    },
    { label: 'الرصيد الحالي',             value: `${fmt(summary?.balance ?? 0)} ₪`,   cls: 'balance'     },
    { label: 'سيارات قيد الصيانة',        value: fmt(carsInProgress),                  cls: 'cars-orange' },
    { label: 'عدد الديون المعلقة',        value: fmt(pendingDebtCount),                cls: 'debt-red'    },
    { label: 'إجمالي الديون المعلقة',     value: `${fmt(pendingDebtTotal)} ₪`,        cls: 'debt-red'    },
    { label: 'فواتير البيع اليوم',        value: fmt(salesToday),                      cls: 'incoming'    },
    { label: 'فواتير الشراء اليوم',       value: fmt(purchasesToday),                  cls: 'outgoing'    },
  ]

  /* ── تجميع العمليات من الـ Context ── */
  const empName = (id: number) => employees.find(e => e.id === id)?.name ?? '—'

  const ops: OpRow[] = [
    ...maintenanceCars.map(c => ({
      date: c.dateReceived, type: 'صيانة', typeCls: 'mi-badge-orange',
      desc: c.customerName, amount: c.total,
    })),
    ...directSales.map(s => ({
      date: s.saleDate, type: 'بيع مباشر', typeCls: 'mi-badge-blue',
      desc: s.customerName, amount: s.total,
    })),
    ...expenses.map(e => ({
      date: e.date, type: 'مصروف', typeCls: 'mi-badge-gray',
      desc: e.description, amount: -e.amount,
    })),
    ...salaries.map(s => ({
      date: s.date, type: 'راتب', typeCls: 'mi-badge-blue',
      desc: empName(s.employeeId), amount: -s.amount,
    })),
  ]

  /* ── فلترة حسب الفترة المختارة ── */
  const cutoff: Record<Period, string> = {
    day:   todayStr,
    week:  daysAgo(6),
    month: daysAgo(29),
  }
  const filteredOps = ops
    .filter(o => o.date >= cutoff[period] && o.date <= todayStr)
    .sort((a, b) => b.date.localeCompare(a.date))

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">لوحة التحكم</h1>
      </div>

      {/* ── Stats ── */}
      <div className="home-stats-grid">
        {stats.map(({ label, value, cls }) => (
          <div key={label} className="stat-card">
            <span className="stat-label">{label}</span>
            <span className={`stat-value ${cls}`}>{value}</span>
          </div>
        ))}
        <div className="stat-card">
          <span className="stat-label">مصاريف اليوم</span>
          <span className="stat-value outgoing">{fmt(todayExpenses)} ₪</span>
        </div>
      </div>

      {/* ── Latest ops table ── */}
      <div className="mi-card" style={{ marginTop: '1.75rem' }}>
        <h2 className="mi-section-title">آخر العمليات</h2>

        <div className="pd-type-tabs">
          {([['day', 'اليوم'], ['week', 'الأسبوع'], ['month', 'الشهر']] as const).map(([val, label]) => (
            <button key={val} className={`pd-tab${period === val ? ' pd-tab-active' : ''}`}
              onClick={() => setPeriod(val)}>{label}</button>
          ))}
        </div>

        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>نوع العملية</th>
                <th>الاسم</th>
                <th>المبلغ ₪</th>
              </tr>
            </thead>
            <tbody>
              {filteredOps.map((op, i) => (
                <tr key={i} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                  <td>{op.date}</td>
                  <td><span className={op.typeCls}>{op.type}</span></td>
                  <td>{op.desc}</td>
                  <td className={op.amount >= 0 ? 'cl-amount-in' : 'cl-amount-out'}>
                    {op.amount >= 0 ? '+' : '−'}{fmt(Math.abs(op.amount))} ₪
                  </td>
                </tr>
              ))}
              {filteredOps.length === 0 && (
                <tr><td colSpan={4} style={{ textAlign: 'center' }}>لا توجد عمليات في هذه الفترة</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
