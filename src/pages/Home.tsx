/* ════════════════════════════════════════
   Home / Dashboard
════════════════════════════════════════ */

import { useEffect, useMemo, useState } from 'react'
import { useGarage } from '../store/GarageContext'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type { MonthlyReport, LedgerSummary } from '../db/types'
import { calcEndDate, daysRemaining } from '../utils/warranty'

const today = () => new Date().toISOString().slice(0, 10)
const fmt   = (n: number) => n.toLocaleString('en-US')

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
  const { maintenanceCars, directSales, expenses, salaries, employees, debts, salesInvoices, purchaseInvoices, warranties } = useGarage()
  const [period, setPeriod] = useState<Period>('week')
  const [showExpiringModal, setShowExpiringModal] = useState(false)

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

  /* ── كفالات تنتهي خلال 7 أيام ── */
  const expiringWarranties = useMemo(() => {
    return warranties
      .map(w => {
        const endDate  = calcEndDate(w.startDate, w.periodValue, w.periodUnit)
        const remaining = daysRemaining(endDate)
        return { ...w, endDate, remaining }
      })
      .filter(w => w.remaining > 0 && w.remaining <= 7)
      .sort((a, b) => a.remaining - b.remaining)
  }, [warranties])

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
        <div
          className="stat-card"
          style={expiringWarranties.length > 0 ? { cursor: 'pointer', borderRight: '4px solid #E67E22' } : undefined}
          onClick={expiringWarranties.length > 0 ? () => setShowExpiringModal(true) : undefined}
        >
          <span className="stat-label">كفالات تنتهي قريباً</span>
          <span className={`stat-value ${expiringWarranties.length > 0 ? 'cars-orange' : 'incoming'}`}>
            {fmt(expiringWarranties.length)}
          </span>
          {expiringWarranties.length > 0 && (
            <span style={{ fontSize: '0.7rem', color: '#E67E22', marginTop: '0.25rem' }}>خلال 7 أيام — اضغط للتفاصيل</span>
          )}
        </div>
      </div>

      {/* ── Expiring warranties modal ── */}
      {showExpiringModal && (
        <div className="mi-modal-overlay" onClick={() => setShowExpiringModal(false)}>
          <div className="mi-modal mi-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>كفالات تنتهي خلال 7 أيام ({expiringWarranties.length})</h3>
              <button className="mi-modal-close" onClick={() => setShowExpiringModal(false)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-table-wrap">
                <table className="mi-table">
                  <thead>
                    <tr>
                      <th>اسم الزبون</th>
                      <th>رقم الهاتف</th>
                      <th>القطعة / الخدمة</th>
                      <th>تاريخ الانتهاء</th>
                      <th>الأيام المتبقية</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringWarranties.map((w, i) => (
                      <tr key={w.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                        <td>{w.customerName}</td>
                        <td>{w.phone ? <span className="mi-phone-highlight">{w.phone}</span> : <span className="mi-badge-gray">غير معروف</span>}</td>
                        <td>{w.itemName}</td>
                        <td>{w.endDate}</td>
                        <td>
                          <span style={{ color: w.remaining <= 3 ? '#E74C3C' : '#E67E22', fontWeight: 700 }}>
                            {fmt(w.remaining)} يوم
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowExpiringModal(false)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

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
