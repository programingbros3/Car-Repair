import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { UnknownEntry, UnknownSource } from '../store/GarageContext'

/* ════════════════════════════════════════
   Helpers
════════════════════════════════════════ */
const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const fmt = (n: number) => n.toLocaleString('ar-EG')

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function UnknownPhones() {
  const { getUnknownEntries, updatePhone } = useGarage()

  /* get current list */
  const entries: UnknownEntry[] = useMemo(() => getUnknownEntries(), [getUnknownEntries])

  /* search */
  const [search, setSearch] = useState('')

  /* edit phone modal */
  const [editEntry,    setEditEntry]    = useState<UnknownEntry | null>(null)
  const [newPhone,     setNewPhone]     = useState('')
  const [phoneErr,     setPhoneErr]     = useState('')

  /* details modal */
  const [detailsEntry, setDetailsEntry] = useState<UnknownEntry | null>(null)

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => entries.map((e, i) => ({ _idx: i, name: normalizeAr(e.name) })),
    [entries],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['name'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  const filtered = useMemo(() => {
    const q = search.trim()
    return q
      ? fuse.search(normalizeAr(q)).map(r => entries[r.item._idx])
      : [...entries]
  }, [entries, search, fuse])

  /* ── Edit phone ── */
  const openEditPhone = (entry: UnknownEntry) => {
    setEditEntry(entry)
    setNewPhone('')
    setPhoneErr('')
  }

  const savePhone = () => {
    const phone = newPhone.trim()
    if (!phone) {
      setPhoneErr('أدخل رقم الهاتف')
      return
    }
    if (!editEntry) return
    updatePhone(editEntry.source as UnknownSource, editEntry.id, phone)
    setEditEntry(null)
  }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">أرقام غير معروفة</h1>
      </div>

      {entries.length === 0 ? (
        <div className="mi-card">
          <div className="mi-empty-row" style={{ padding: '3rem', textAlign: 'center', fontSize: '1.1rem' }}>
            ✅ لا توجد عمليات بأرقام غير معروفة
          </div>
        </div>
      ) : (
        <div className="mi-card">
          <h2 className="mi-section-title">
            العمليات بأرقام غير معروفة
            <span className="mi-badge-red" style={{ marginRight: '0.75rem', fontSize: '0.85rem' }}>
              {entries.length}
            </span>
          </h2>

          <div className="mi-filters">
            <div className="mi-search-wrap">
              <input type="text" className="mi-search-input" placeholder="🔍  بحث بالاسم..."
                value={search} onChange={e => setSearch(e.target.value)} />
            </div>
          </div>

          <div className="mi-table-wrap">
            <table className="mi-table">
              <thead>
                <tr>
                  <th>التاريخ</th>
                  <th>نوع العملية</th>
                  <th>الاسم</th>
                  <th>الإجمالي ₪</th>
                  <th>الحالة</th>
                  <th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} className="mi-empty-row">لا توجد نتائج تطابق البحث</td></tr>
                ) : filtered.map((entry, i) => (
                  <tr key={`${entry.source}-${entry.id}`}
                    className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                    onClick={() => setDetailsEntry(entry)}>
                    <td>{entry.date}</td>
                    <td><span className={entry.sourceCls}>{entry.sourceLabel}</span></td>
                    <td>{entry.name}</td>
                    <td className="mi-amount">{fmt(entry.total)} ₪</td>
                    <td><span className={entry.statusCls}>{entry.statusLabel}</span></td>
                    <td>
                      <div className="mi-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm-outline" onClick={() => setDetailsEntry(entry)}>تفاصيل</button>
                        <button className="btn btn-sm-green" onClick={() => openEditPhone(entry)}>تعديل الرقم</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ Details Modal ════ */}
      {detailsEntry && (
        <div className="mi-modal-overlay" onClick={() => setDetailsEntry(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل العملية</h3>
              <button className="mi-modal-close" onClick={() => setDetailsEntry(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsEntry.date}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">نوع العملية</span>
                  <span className={detailsEntry.sourceCls}>{detailsEntry.sourceLabel}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الاسم</span>
                  <strong>{detailsEntry.name}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  <span className="mi-badge-gray">غير معروف</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(detailsEntry.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الحالة</span>
                  <span className={detailsEntry.statusCls}>{detailsEntry.statusLabel}</span>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => { setDetailsEntry(null); openEditPhone(detailsEntry) }}>
                تعديل الرقم
              </button>
              <button className="btn btn-ghost" onClick={() => setDetailsEntry(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Edit Phone Modal ════ */}
      {editEntry && (
        <div className="mi-modal-overlay" onClick={() => setEditEntry(null)}>
          <div className="mi-modal mi-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل رقم الهاتف</h3>
              <button className="mi-modal-close" onClick={() => setEditEntry(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <p style={{ marginBottom: '0.75rem', color: '#374151' }}>
                تعديل رقم الهاتف للعملية: <strong>{editEntry.name}</strong>
              </p>
              <div className="mi-form-field">
                <label className="mi-form-label">رقم الهاتف الجديد</label>
                <input type="text" className="mi-form-input" value={newPhone}
                  placeholder="أدخل رقم الهاتف"
                  onChange={e => { setNewPhone(e.target.value); setPhoneErr('') }}
                  onKeyDown={e => { if (e.key === 'Enter') savePhone() }}
                  autoFocus />
                {phoneErr && <span className="mi-err" style={{ marginTop: '0.25rem', display: 'block' }}>{phoneErr}</span>}
              </div>
              <p style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: '#9ca3af' }}>
                بعد الحفظ ستختفي هذه العملية من هذه الصفحة وتُحدَّث في الصفحة الأصلية
              </p>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={savePhone}>حفظ الرقم</button>
              <button className="btn btn-ghost" onClick={() => setEditEntry(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
