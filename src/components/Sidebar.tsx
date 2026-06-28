import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/',                  icon: '🏠', label: 'الرئيسية'        },
  { to: '/maintenance',       icon: '🔧', label: 'سيارات الصيانة'  },
  { to: '/direct-sales',      icon: '🛒', label: 'البيع المباشر'   },
  { to: '/pending-debts',     icon: '💰', label: 'الديون المعلقة'  },
]

function getArabicDate(): string {
  return new Date().toLocaleDateString('ar-EG', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  })
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">كراج</div>

      <ul className="sidebar-nav">
        {navItems.map(({ to, icon, label }) => (
          <li key={to}>
            <NavLink
              to={to}
              end={to === '/'}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <span className="nav-icon">{icon}</span>
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-date">{getArabicDate()}</div>
    </aside>
  )
}
