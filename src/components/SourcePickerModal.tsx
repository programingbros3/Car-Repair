/* ════════════════════════════════════════
   SourcePickerModal — اختيار نوع العملية قبل فتح نموذج الإضافة
   يُستخدم في الصفحات المجمّعة (الديون/الكفالات/فواتير البيع/فواتير الشراء)
   لاختيار المصدر ثم فتح نفس نموذج الإضافة الأصلي داخل Modal.
════════════════════════════════════════ */
export type SourceOption<K extends string> = { key: K; label: string; desc?: string }

type Props<K extends string> = {
  title: string
  options: SourceOption<K>[]
  onPick: (key: K) => void
  onCancel: () => void
}

export default function SourcePickerModal<K extends string>({ title, options, onPick, onCancel }: Props<K>) {
  return (
    <div className="mi-modal-overlay" onClick={onCancel}>
      <div className="mi-modal mi-modal-sm" onClick={e => e.stopPropagation()}>
        <div className="mi-modal-header">
          <h3>{title}</h3>
          <button className="mi-modal-close" onClick={onCancel}>✕</button>
        </div>
        <div className="mi-modal-body">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {options.map(opt => (
              <button key={opt.key} className="btn btn-primary mi-option-btn"
                onClick={() => onPick(opt.key)}>
                <span className="mi-option-btn-title">{opt.label}</span>
                {opt.desc && <span className="mi-option-btn-desc">{opt.desc}</span>}
              </button>
            ))}
          </div>
        </div>
        <div className="mi-modal-footer">
          <button className="btn btn-ghost" onClick={onCancel}>إلغاء</button>
        </div>
      </div>
    </div>
  )
}
