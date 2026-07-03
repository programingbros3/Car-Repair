import { useState, useRef, useMemo, useEffect } from 'react'

/* ════════════════════════════════════════
   NameAutocomplete — حقل نص عادي مع قائمة منسدلة للأسماء المحفوظة
   (موردون/موظفون). عند الكتابة تظهر الأسماء المطابقة (بعد normalizeAr)،
   وعند التركيز على حقل فارغ تظهر كل الأسماء لتصفّحها. اختيار اسم يملأ الحقل
   ويغلق القائمة. تحسين تجربة إدخال بحت — القيمة النهائية تبقى نصّاً كما كانت.
════════════════════════════════════════ */
const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

type Props = {
  value: string
  onChange: (v: string) => void
  options: string[]
  placeholder?: string
  /** صنف الحقل النصّي (افتراضي mi-search-input؛ مرّر '' لوراثة تنسيق النموذج) */
  inputClassName?: string
  /** يُطبَّق على غلاف المكوّن (مثلاً mi-input-err) */
  wrapClassName?: string
  readOnlyPhoneHint?: never
}

export default function NameAutocomplete({
  value, onChange, options, placeholder, inputClassName = 'mi-search-input', wrapClassName = '',
}: Props) {
  const [open, setOpen] = useState(false)
  const wrapRef = useRef<HTMLDivElement>(null)

  const filtered = useMemo(() => {
    const uniq = Array.from(new Set(options.filter(o => o && o.trim())))
    const q = normalizeAr(value)
    if (!q) return uniq
    return uniq.filter(o => normalizeAr(o).includes(q))
  }, [value, options])

  /* إغلاق القائمة عند الضغط خارج المكوّن */
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const pick = (name: string) => { onChange(name); setOpen(false) }

  return (
    <div className={`name-ac-wrap ${wrapClassName}`} ref={wrapRef}>
      <input
        type="text"
        className={inputClassName}
        placeholder={placeholder}
        value={value}
        onChange={e => { onChange(e.target.value); setOpen(true) }}
        onFocus={() => setOpen(true)}
      />
      {open && filtered.length > 0 && (
        <ul className="name-ac-list">
          {filtered.map(o => (
            <li key={o} className="name-ac-item" onMouseDown={e => { e.preventDefault(); pick(o) }}>
              {o}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
