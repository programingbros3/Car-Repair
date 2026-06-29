import { useMemo, useState } from 'react'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type Period = 'daily' | 'monthly' | 'yearly'
type Tab    = Period | 'debts'

type OpType = 'incoming' | 'outgoing'
type OpSource = 'maintenance' | 'direct_sale' | 'supplier' | 'expense' | 'salary'

type Operation = {
  id: number
  date: string
  type: OpType
  source: OpSource
  amount: number
  notes: string
}

/* A full report bundle for one period */
type PeriodReport = {
  totalIncoming:    number
  totalOutgoing:    number
  maintenanceCount: number
  directSaleCount:  number
  supplierTotal:    number
  expenseTotal:     number
  salaryTotal:      number
  operations:       Operation[]
}

type CustomerDebt = {
  id: number
  customerName: string
  carPlate: string
  source: 'maintenance' | 'direct_sale'
  total: number
  paid: number
}

type SupplierDebt = {
  id: number
  supplierName: string
  phone: string
  total: number
  paid: number
}

/* ════════════════════════════════════════
   Labels
════════════════════════════════════════ */
const TYPE_LABELS: Record<OpType, string> = {
  incoming: 'وارد',
  outgoing: 'صادر',
}

const SOURCE_LABELS: Record<OpSource, string> = {
  maintenance: 'صيانة',
  direct_sale: 'بيع مباشر',
  supplier:    'مورد',
  expense:     'مصروف',
  salary:      'راتب',
}

const SOURCE_LABELS_DEBT: Record<CustomerDebt['source'], string> = {
  maintenance: 'صيانة',
  direct_sale: 'بيع مباشر',
}

/* ════════════════════════════════════════
   Hardcoded data (temporary)
════════════════════════════════════════ */
const REPORTS: Record<Period, PeriodReport> = {
  daily: {
    totalIncoming:    2300,
    totalOutgoing:    720,
    maintenanceCount: 1,
    directSaleCount:  1,
    supplierTotal:    0,
    expenseTotal:     120,
    salaryTotal:      600,
    operations: [
      { id: 1, date: '2026-06-28', type: 'incoming', source: 'maintenance', amount: 1850, notes: 'صيانة تويوتا كامري — أحمد محمد' },
      { id: 2, date: '2026-06-28', type: 'incoming', source: 'direct_sale', amount: 450,  notes: 'بيع زيت محرك وفلاتر' },
      { id: 3, date: '2026-06-28', type: 'outgoing', source: 'expense',     amount: 120,  notes: 'فاتورة كهرباء الكراج' },
      { id: 4, date: '2026-06-28', type: 'outgoing', source: 'salary',      amount: 600,  notes: 'راتب الموظف سامي' },
    ],
  },
  monthly: {
    totalIncoming:    48200,
    totalOutgoing:    31550,
    maintenanceCount: 26,
    directSaleCount:  14,
    supplierTotal:    18900,
    expenseTotal:     4250,
    salaryTotal:      8400,
    operations: [
      { id: 1, date: '2026-06-02', type: 'incoming', source: 'maintenance', amount: 12500, notes: 'إجمالي فواتير الصيانة — الأسبوع الأول' },
      { id: 2, date: '2026-06-09', type: 'incoming', source: 'direct_sale', amount: 6200,  notes: 'إجمالي البيع المباشر — الأسبوع الثاني' },
      { id: 3, date: '2026-06-12', type: 'outgoing', source: 'supplier',    amount: 18900, notes: 'مشتريات قطع غيار من الموردين' },
      { id: 4, date: '2026-06-20', type: 'outgoing', source: 'salary',      amount: 8400,  notes: 'رواتب الموظفين' },
      { id: 5, date: '2026-06-25', type: 'outgoing', source: 'expense',     amount: 4250,  notes: 'مصاريف تشغيلية متنوعة' },
    ],
  },
  yearly: {
    totalIncoming:    562000,
    totalOutgoing:    389400,
    maintenanceCount: 312,
    directSaleCount:  168,
    supplierTotal:    214600,
    expenseTotal:     51800,
    salaryTotal:      100800,
    operations: [
      { id: 1, date: '2026-03-31', type: 'incoming', source: 'maintenance', amount: 168000, notes: 'إجمالي الصيانة — الربع الأول' },
      { id: 2, date: '2026-06-30', type: 'incoming', source: 'direct_sale', amount: 92000,  notes: 'إجمالي البيع المباشر — النصف الأول' },
      { id: 3, date: '2026-06-30', type: 'outgoing', source: 'supplier',    amount: 214600, notes: 'إجمالي مشتريات الموردين' },
      { id: 4, date: '2026-12-31', type: 'outgoing', source: 'salary',      amount: 100800, notes: 'إجمالي الرواتب السنوية' },
      { id: 5, date: '2026-12-31', type: 'outgoing', source: 'expense',     amount: 51800,  notes: 'إجمالي المصاريف التشغيلية' },
    ],
  },
}

const CUSTOMER_DEBTS: CustomerDebt[] = [
  { id: 1, customerName: 'أحمد محمد',   carPlate: 'أ ب ج 123', source: 'maintenance', total: 1850, paid: 1000 },
  { id: 2, customerName: 'خالد العمري', carPlate: 'د هـ و 456', source: 'maintenance', total: 800,  paid: 0    },
  { id: 3, customerName: 'سعيد الحربي', carPlate: '—',          source: 'direct_sale', total: 450,  paid: 200  },
  { id: 4, customerName: 'ماجد القحطاني', carPlate: 'ز ح ط 789', source: 'maintenance', total: 2400, paid: 1500 },
]

const SUPPLIER_DEBTS: SupplierDebt[] = [
  { id: 1, supplierName: 'شركة قطع الغيار المتحدة', phone: '0551112233', total: 18900, paid: 12000 },
  { id: 2, supplierName: 'مؤسسة الزيوت الحديثة',     phone: '0554445566', total: 6200,  paid: 6200  },
  { id: 3, supplierName: 'معرض الإطارات الذهبية',    phone: '0557778899', total: 9400,  paid: 3000  },
]

/* ════════════════════════════════════════
   Helpers
════════════════════════════════════════ */
const today      = () => new Date().toISOString().slice(0, 10)
const thisMonth  = () => new Date().toISOString().slice(0, 7)
const thisYear   = () => new Date().getFullYear()
const fmt        = (n: number) => n.toLocaleString('ar-EG')

const YEARS = Array.from({ length: 6 }, (_, i) => thisYear() - i)

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Reports() {
  const [tab, setTab] = useState<Tab>('daily')

  /* period filters */
  const [day, setDay]     = useState(today())
  const [month, setMonth] = useState(thisMonth())
  const [year, setYear]   = useState(thisYear())

  const period: Period = tab === 'debts' ? 'daily' : tab
  const report = REPORTS[period]

  const netProfit = report.totalIncoming - report.totalOutgoing

  /* ── Debt totals ── */
  const customerDebtTotal = useMemo(
    () => CUSTOMER_DEBTS.reduce((s, d) => s + (d.total - d.paid), 0),
    [],
  )
  const supplierDebtTotal = useMemo(
    () => SUPPLIER_DEBTS.reduce((s, d) => s + (d.total - d.paid), 0),
    [],
  )

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header">
        <h1 className="page-title">التقارير</h1>
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
              <span className="stat-value incoming">{fmt(report.totalIncoming)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي الصادر</span>
              <span className="stat-value outgoing">{fmt(report.totalOutgoing)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">صافي الربح</span>
              <span className={`stat-value ${netProfit >= 0 ? 'balance' : 'outgoing'}`}>
                {fmt(netProfit)} ₪
              </span>
            </div>
            <div className="stat-card">
              <span className="stat-label">عدد فواتير الصيانة</span>
              <span className="stat-value cars">{fmt(report.maintenanceCount)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">عدد فواتير البيع</span>
              <span className="stat-value cars">{fmt(report.directSaleCount)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي مشتريات الموردين</span>
              <span className="stat-value outgoing">{fmt(report.supplierTotal)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي المصاريف</span>
              <span className="stat-value outgoing">{fmt(report.expenseTotal)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي الرواتب</span>
              <span className="stat-value outgoing">{fmt(report.salaryTotal)} ₪</span>
            </div>
          </div>

          {/* ── Operations summary table ── */}
          <div className="mi-card" style={{ marginTop: '1.5rem' }}>
            <h2 className="mi-section-title">ملخص العمليات في الفترة</h2>
            <div className="mi-table-wrap">
              <table className="mi-table">
                <thead>
                  <tr>
                    <th>التاريخ</th>
                    <th>النوع</th>
                    <th>المصدر</th>
                    <th>المبلغ</th>
                    <th>ملاحظات</th>
                  </tr>
                </thead>
                <tbody>
                  {report.operations.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="mi-empty-row">لا توجد عمليات في هذه الفترة</td>
                    </tr>
                  ) : report.operations.map((op, i) => (
                    <tr key={op.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                      <td>{op.date}</td>
                      <td>
                        <span className={op.type === 'incoming' ? 'cl-badge-in' : 'cl-badge-out'}>
                          {TYPE_LABELS[op.type]}
                        </span>
                      </td>
                      <td>{SOURCE_LABELS[op.source]}</td>
                      <td className={op.type === 'incoming' ? 'cl-amount-in' : 'cl-amount-out'}>
                        {op.type === 'incoming' ? '+' : '−'}{fmt(op.amount)} ₪
                      </td>
                      <td>{op.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
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
              <span className="stat-value outgoing">{fmt(customerDebtTotal)} ₪</span>
            </div>
            <div className="stat-card">
              <span className="stat-label">إجمالي ديون الموردين</span>
              <span className="stat-value outgoing">{fmt(supplierDebtTotal)} ₪</span>
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
                    <th>نمرة السيارة</th>
                    <th>المصدر</th>
                    <th>الإجمالي</th>
                    <th>المدفوع</th>
                    <th>المتبقي</th>
                  </tr>
                </thead>
                <tbody>
                  {CUSTOMER_DEBTS.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="mi-empty-row">لا توجد ديون على الزبائن</td>
                    </tr>
                  ) : CUSTOMER_DEBTS.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                      <td>{d.customerName}</td>
                      <td>{d.carPlate === '—' ? '—' : <span className="mi-plate">{d.carPlate}</span>}</td>
                      <td>
                        <span className={d.source === 'maintenance' ? 'mi-badge' : 'mi-badge-blue'}>
                          {SOURCE_LABELS_DEBT[d.source]}
                        </span>
                      </td>
                      <td className="mi-amount">{fmt(d.total)} ₪</td>
                      <td className="pd-paid">{fmt(d.paid)} ₪</td>
                      <td className="pd-remaining">{fmt(d.total - d.paid)} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mi-total-row">
              إجمالي ديون الزبائن: <strong>{fmt(customerDebtTotal)} ₪</strong>
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
                  {SUPPLIER_DEBTS.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="mi-empty-row">لا توجد ديون للموردين</td>
                    </tr>
                  ) : SUPPLIER_DEBTS.map((d, i) => (
                    <tr key={d.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                      <td>{d.supplierName}</td>
                      <td>{d.phone}</td>
                      <td className="mi-amount">{fmt(d.total)} ₪</td>
                      <td className="pd-paid">{fmt(d.paid)} ₪</td>
                      <td className="pd-remaining">{fmt(d.total - d.paid)} ₪</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mi-total-row">
              إجمالي ديون الموردين: <strong>{fmt(supplierDebtTotal)} ₪</strong>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
