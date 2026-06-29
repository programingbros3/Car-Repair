/* ════════════════════════════════════════
   Home / Dashboard
════════════════════════════════════════ */

const stats = [
  { label: 'إجمالي الوارد هذا الشهر',  value: '28,500 ₪', cls: 'incoming'   },
  { label: 'إجمالي الصادر هذا الشهر',  value: '12,320 ₪', cls: 'outgoing'   },
  { label: 'الرصيد الحالي',             value: '16,180 ₪', cls: 'balance'    },
  { label: 'سيارات قيد الصيانة',        value: '3',         cls: 'cars-orange'},
  { label: 'عدد الديون المعلقة',        value: '2',         cls: 'debt-red'   },
  { label: 'إجمالي الديون المعلقة',     value: '1,350 ₪',  cls: 'debt-red'   },
  { label: 'فواتير البيع اليوم',        value: '2',         cls: 'incoming'   },
  { label: 'فواتير الشراء اليوم',       value: '1',         cls: 'outgoing'   },
]

type OpRow = {
  date: string
  type: string
  typeCls: string
  desc: string
  amount: number
  status: string
  statusCls: string
}

const WEEKLY_OPS: OpRow[] = [
  { date: '2026-06-23', type: 'صيانة سيارة', typeCls: 'mi-badge-orange',    desc: 'أحمد محمد — تويوتا كامري',    amount:  1500, status: 'مدفوع',    statusCls: 'mi-badge-green'  },
  { date: '2026-06-23', type: 'شراء مورد',   typeCls: 'mi-badge-purple',    desc: 'شركة قطع غيار النور',          amount: -900,  status: 'دين جزئي', statusCls: 'mi-badge-yellow' },
  { date: '2026-06-24', type: 'بيع مباشر',   typeCls: 'mi-badge-blue',      desc: 'محمد علي — زيت محرك وفلاتر', amount:  450,  status: 'مدفوع',    statusCls: 'mi-badge-green'  },
  { date: '2026-06-25', type: 'مصروف يومي',  typeCls: 'mi-badge-gray',      desc: 'فاتورة كهرباء الكراج',        amount: -120,  status: 'مدفوع',    statusCls: 'mi-badge-green'  },
  { date: '2026-06-26', type: 'صيانة سيارة', typeCls: 'mi-badge-orange',    desc: 'خالد العمري — هوندا سيفيك', amount:  800,  status: 'دين كامل', statusCls: 'mi-badge-red'    },
  { date: '2026-06-27', type: 'راتب موظف',   typeCls: 'mi-badge-blue',      desc: 'سامي الأحمد',                 amount: -600,  status: 'مدفوع',    statusCls: 'mi-badge-green'  },
  { date: '2026-06-27', type: 'بيع مباشر',   typeCls: 'mi-badge-blue',      desc: 'سامي الخالد — بطارية سيارة', amount:  350,  status: 'دين كامل', statusCls: 'mi-badge-red'    },
]

export default function Home() {
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
      </div>

      {/* ── Weekly ops table ── */}
      <div className="mi-card" style={{ marginTop: '1.75rem' }}>
        <h2 className="mi-section-title">آخر عمليات الأسبوع</h2>
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>نوع العملية</th>
                <th>الوصف</th>
                <th>المبلغ ₪</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              {WEEKLY_OPS.map((op, i) => (
                <tr key={i} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                  <td>{op.date}</td>
                  <td><span className={op.typeCls}>{op.type}</span></td>
                  <td>{op.desc}</td>
                  <td className={op.amount >= 0 ? 'cl-amount-in' : 'cl-amount-out'}>
                    {op.amount >= 0 ? '+' : '−'}{Math.abs(op.amount).toLocaleString('ar-EG')} ₪
                  </td>
                  <td><span className={op.statusCls}>{op.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
