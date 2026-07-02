import { NavLink } from 'react-router-dom'

const navItems = [
  { to: '/cash-ledger',        icon: '🏦', label: 'الصندوق الرئيسي'   },
  { to: '/sales-invoices',     icon: '🧾', label: 'فواتير البيع'       },
  { to: '/direct-sales',       icon: '🛒', label: 'البيع المباشر'     },
  { to: '/maintenance',        icon: '🔧', label: 'سيارات الصيانة'    },
  { to: '/purchase-invoices',  icon: '📥', label: 'فواتير الشراء'      },
  { to: '/suppliers',          icon: '🏪', label: 'الموردون'          },
  { to: '/expenses',           icon: '💸', label: 'المصاريف اليومية'  },
  { to: '/employees',          icon: '👷', label: 'الموظفون والرواتب' },
  { to: '/pending-debts',      icon: '💰', label: 'الديون المعلقة'    },
  { to: '/warranties',         icon: '🛡️', label: 'الكفالات'           },
  { to: '/reports',            icon: '📊', label: 'التقارير'           },
  { to: '/settings',           icon: '⚙', label: 'الإعدادات'          },
]

function getArabicDate(): string {
  return new Date().toLocaleDateString('ar-EG-u-nu-latn', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">كراج الخط الأخضر</div>

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
