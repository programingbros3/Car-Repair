import { useState, type ReactNode } from 'react'

/* ════════════════════════════════════════
   CollapsibleCard — بطاقة قسم (mi-card) قابلة للطي/الفرد بالضغط على عنوانها.
   تُستخدم في الصفحات التي تعرض عدة أقسام (جداول) معاً لتقصير التمرير.
   مبدئياً مفتوحة (نفس السلوك السابق). سهم ▾/▸ بجانب العنوان.
   headerRight: عنصر اختياري يبقى في ترويسة القسم (مثل زر "+ إضافة").
════════════════════════════════════════ */
type Props = {
  title: ReactNode
  children: ReactNode
  defaultOpen?: boolean
  headerRight?: ReactNode
}

export default function CollapsibleCard({ title, children, defaultOpen = true, headerRight }: Props) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className="mi-card">
      <div className="mi-collapse-header">
        <button type="button" className="mi-collapse-toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
          <span className="mi-collapse-arrow">{open ? '▾' : '▸'}</span>
          <span className="mi-section-title" style={{ margin: 0 }}>{title}</span>
        </button>
        {headerRight}
      </div>
      {open && <div className="mi-collapse-body">{children}</div>}
    </div>
  )
}
