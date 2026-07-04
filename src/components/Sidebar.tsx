import { NavLink } from 'react-router-dom'
import NavIcon, { type IconName } from './NavIcon'

const navItems: { to: string; icon: IconName; label: string }[] = [
  { to: '/cash-ledger',        icon: 'ledger',      label: 'الصندوق الرئيسي'   },
  { to: '/sales-invoices',     icon: 'sales',       label: 'فواتير البيع'       },
  { to: '/direct-sales',       icon: 'directSale',  label: 'البيع المباشر'     },
  { to: '/maintenance',        icon: 'maintenance', label: 'سيارات الصيانة'    },
  { to: '/purchase-invoices',  icon: 'purchase',    label: 'فواتير الشراء'      },
  { to: '/suppliers',          icon: 'suppliers',   label: 'الموردون'          },
  { to: '/expenses',           icon: 'expenses',    label: 'المصاريف اليومية'  },
  { to: '/employees',          icon: 'employees',   label: 'الموظفون والرواتب' },
  { to: '/pending-debts',      icon: 'debts',       label: 'الديون المعلقة'    },
  { to: '/cheques',            icon: 'cheques',     label: 'الشيكات'           },
  { to: '/warranties',         icon: 'warranties',  label: 'الكفالات'           },
  { to: '/reports',            icon: 'reports',     label: 'التقارير'           },
  { to: '/settings',           icon: 'settings',    label: 'الإعدادات'          },
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
              <NavIcon name={icon} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>

      <div className="sidebar-date">{getArabicDate()}</div>
    </aside>
  )
}
