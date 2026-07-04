/* L10: أيقونات SVG خطّية موحّدة للسايدبار (بدل الإيموجي الذي يختلف شكله بين
   أنظمة التشغيل). كلها 20×20، تأخذ لون النص الحالي (currentColor) فتتبع حالة
   الرابط النشط تلقائياً. */
type IconName =
  | 'ledger' | 'sales' | 'directSale' | 'maintenance' | 'purchase'
  | 'suppliers' | 'expenses' | 'employees' | 'debts' | 'cheques'
  | 'warranties' | 'reports' | 'settings'

const PATHS: Record<IconName, React.ReactNode> = {
  ledger: <><rect x="2" y="6" width="20" height="14" rx="2" /><path d="M2 10h20" /><path d="M6 15h4" /></>,
  sales: <><path d="M6 2h9l3 3v17l-2-1.2L14 22l-2-1.2L10 22l-2-1.2L6 22z" /><path d="M9 8h6M9 12h6" /></>,
  directSale: <><circle cx="9" cy="20" r="1.4" /><circle cx="18" cy="20" r="1.4" /><path d="M2 3h3l2.5 12.5A2 2 0 0 0 9.4 17H18a2 2 0 0 0 2-1.6L21.5 8H6" /></>,
  maintenance: <><path d="M14.5 5.5a4 4 0 0 0-5.3 5.3L3 17.2 6.8 21l6.4-6.2a4 4 0 0 0 5.3-5.3l-2.7 2.7-2.3-.4-.4-2.3z" /></>,
  purchase: <><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M12 3v11m0 0l-4-4m4 4l4-4" /></>,
  suppliers: <><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9v10a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1V9" /><path d="M3 9a2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 5 0 2.5 2.5 0 0 0 3 0" /></>,
  expenses: <><circle cx="12" cy="12" r="9" /><path d="M12 7v10M15 9.5c0-1.4-1.3-2-3-2s-3 .8-3 2 1.5 1.8 3 2.5 3 1.1 3 2.5-1.3 2-3 2-3-.6-3-2" /></>,
  employees: <><circle cx="9" cy="8" r="3" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 6a3 3 0 0 1 0 6M21 20a6 6 0 0 0-4-5.6" /></>,
  debts: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  cheques: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 9h20" /><path d="M6 14h6M15 14h3" /></>,
  warranties: <><path d="M12 2l8 3v6c0 5-3.4 8.5-8 11-4.6-2.5-8-6-8-11V5z" /><path d="M9 12l2 2 4-4" /></>,
  reports: <><path d="M3 3v18h18" /><path d="M7 15l3-4 3 2 4-6" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0-1.1-2.7H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z" /></>,
}

export type { IconName }

export default function NavIcon({ name }: { name: IconName }) {
  return (
    <svg
      className="nav-icon" width="20" height="20" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
    >
      {PATHS[name]}
    </svg>
  )
}
