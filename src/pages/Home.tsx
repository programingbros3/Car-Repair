const stats = [
  { label: 'إجمالي الوارد',       value: '15,000 ₪', cls: 'incoming' },
  { label: 'إجمالي الصادر',       value: '8,500 ₪',  cls: 'outgoing' },
  { label: 'الرصيد الحالي',       value: '6,500 ₪',  cls: 'balance'  },
  { label: 'سيارات قيد الصيانة', value: '3',          cls: 'cars'     },
]

export default function Home() {
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">لوحة التحكم</h1>
      </div>

      <div className="stats-grid">
        {stats.map(({ label, value, cls }) => (
          <div key={label} className="stat-card">
            <span className="stat-label">{label}</span>
            <span className={`stat-value ${cls}`}>{value}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
