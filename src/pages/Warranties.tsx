import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { WarrantyRecord, WarrantyPeriodUnit } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import { calcEndDate, daysRemaining } from '../utils/warranty'

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const blockDigits     = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault() }
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault() }

const fmt = (n: number) => n.toLocaleString('en-US')

/* عرض الفترة بالعربي */
const UNIT_WORDS: Record<WarrantyPeriodUnit, [string, string]> = {
  week:  ['أسبوع', 'أسابيع'],
  month: ['شهر',   'أشهر'],
  year:  ['سنة',   'سنوات'],
}
function periodLabel(value: number, unit: WarrantyPeriodUnit): string {
  const [singular, plural] = UNIT_WORDS[unit]
  return `${fmt(value)} ${value === 1 ? singular : plural}`
}

const UNIT_OPTIONS: [WarrantyPeriodUnit, string][] = [
  ['week', 'أسبوع'], ['month', 'شهر'], ['year', 'سنة'],
]

const SOURCE_LABEL: Record<string, string> = { maintenance: 'صيانة', direct_sale: 'بيع مباشر' }
const SOURCE_CLS:   Record<string, string> = { maintenance: 'mi-badge-orange', direct_sale: 'mi-badge-blue' }

/* لون عداد الأيام المتبقية */
function remainingColor(days: number): string {
  if (days > 30) return '#27ae60'
  if (days >= 7) return '#F39C12'
  return '#E74C3C'
}

const emptyForm = () => ({
  customerName: '', phone: '', carPlate: '', itemName: '',
  startDate: today(), periodValue: '1', periodUnit: 'month' as WarrantyPeriodUnit, notes: '',
})
type FormState = ReturnType<typeof emptyForm>

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Warranties() {
  const { warranties, reload } = useGarage()

  /* form */
  const [editingWarranty, setEditingWarranty] = useState<WarrantyRecord | null>(null)
  const [form, setForm]                       = useState<FormState>(emptyForm)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* modals */
  const [detailsWarranty, setDetailsWarranty] = useState<WarrantyRecord | null>(null)
  const [deleteWarranty,  setDeleteWarranty]  = useState<WarrantyRecord | null>(null)
  const [warnWarranty,    setWarnWarranty]    = useState<WarrantyRecord | null>(null)

  /* filters */
  const [search,      setSearch]      = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [tab,         setTab]         = useState<'all' | 'active' | 'expired'>('all')
  const [filterFrom,  setFilterFrom]  = useState('')
  const [filterTo,    setFilterTo]    = useState('')

  /* ── Derived (end date + remaining) ── */
  type WithCalc = WarrantyRecord & { endDate: string; remaining: number }
  const withCalc = useMemo<WithCalc[]>(
    () => warranties.map(w => {
      const endDate = calcEndDate(w.startDate, w.periodValue, w.periodUnit)
      return { ...w, endDate, remaining: daysRemaining(endDate) }
    }),
    [warranties],
  )

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => withCalc.map((w, i) => ({ _idx: i, customerName: normalizeAr(w.customerName) })),
    [withCalc],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['customerName'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  /* ── Filtered list (search / phone / date) ── */
  const filtered = useMemo(() => {
    const q = search.trim()
    let result = q ? fuse.search(normalizeAr(q)).map(r => withCalc[r.item._idx]) : [...withCalc]
    if (phoneSearch) result = result.filter(w => w.phone.includes(phoneSearch))
    if (filterFrom)  result = result.filter(w => w.startDate >= filterFrom)
    if (filterTo)    result = result.filter(w => w.startDate <= filterTo)
    return result
  }, [withCalc, search, phoneSearch, filterFrom, filterTo, fuse])

  const activeWarranties  = useMemo(() => filtered.filter(w => w.remaining > 0),  [filtered])
  const expiredWarranties = useMemo(() => filtered.filter(w => w.remaining <= 0), [filtered])

  const hasFilters   = !!search.trim() || !!phoneSearch || tab !== 'all' || !!filterFrom || !!filterTo
  const clearFilters = () => { setSearch(''); setPhoneSearch(''); setTab('all'); setFilterFrom(''); setFilterTo('') }

  /* ── Form helpers ── */
  const setField = (f: keyof FormState, v: string) => setForm(prev => ({ ...prev, [f]: v }))

  const doOpenEdit = (w: WarrantyRecord) => {
    setEditingWarranty(w)
    setForm({
      customerName: w.customerName, phone: w.phone, carPlate: w.carPlate, itemName: w.itemName,
      startDate: w.startDate, periodValue: String(w.periodValue), periodUnit: w.periodUnit, notes: w.notes,
    })
    setSubmitAttempted(false)
  }

  const openEdit = (w: WarrantyRecord) => setWarnWarranty(w)

  const confirmEditWarranty = () => {
    if (!warnWarranty) return
    doOpenEdit(warnWarranty)
    setWarnWarranty(null)
  }

  /* ── Validation ── */
  const nameErr  = form.customerName.trim() ? '' : 'اسم الزبون مطلوب'
  const phoneErr = form.phone.trim() ? '' : 'رقم الهاتف مطلوب'
  const itemErr  = form.itemName.trim() ? '' : 'اسم القطعة / الخدمة مطلوب'
  const hasErrors = !!nameErr || !!phoneErr || !!itemErr

  const handleSave = async () => {
    setSubmitAttempted(true)
    if (hasErrors || !editingWarranty) return
    const periodValue = Math.max(1, Number(form.periodValue) || 1)
    const carPlate = form.carPlate.trim()
    const warrantyData: WarrantyRecord = {
      id: editingWarranty.id,
      source: editingWarranty.source,
      sourceId: editingWarranty.sourceId,
      customerName: form.customerName, phone: form.phone.trim(), carPlate,
      itemName: form.itemName, startDate: form.startDate, periodValue,
      periodUnit: form.periodUnit, notes: form.notes,
    }
    try {
      await dbService.warranty.update(warrantyData)
      await reload()
      clearForm()
    } catch (err) {
      showError('تعذّر حفظ الكفالة', err)
    }
  }

  const clearForm = () => {
    setSubmitAttempted(false); setForm(emptyForm()); setEditingWarranty(null)
  }

  const showErr = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls  = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ── Print ── */
  const handlePrint = (w: WithCalc) => {
    const expired = w.remaining <= 0
    const remainingHtml = expired
      ? `<div class="detail-item"><label>انتهت منذ</label><span class="amount-out">${fmt(Math.abs(w.remaining))} يوم</span></div>`
      : `<div class="detail-item"><label>الأيام المتبقية</label><span style="color:${remainingColor(w.remaining)};font-weight:700">${fmt(w.remaining)} يوم</span></div>`
    const body = `
      <div class="detail-grid">
        <div class="detail-item"><label>اسم الزبون</label><span>${w.customerName}</span></div>
        <div class="detail-item"><label>رقم الهاتف</label><span>${w.phone || '—'}</span></div>
        <div class="detail-item"><label>نمرة السيارة</label><span>${w.carPlate || '—'}</span></div>
        ${w.source === 'maintenance' && w.carType ? `<div class="detail-item"><label>نوع السيارة</label><span>${w.carType}</span></div>` : ''}
        ${w.source === 'maintenance' && w.carColor ? `<div class="detail-item"><label>لون السيارة</label><span>${w.carColor}</span></div>` : ''}
        <div class="detail-item"><label>القطعة / الخدمة</label><span>${w.itemName}</span></div>
        <div class="detail-item"><label>تاريخ البداية</label><span>${w.startDate}</span></div>
        <div class="detail-item"><label>المدة</label><span>${periodLabel(w.periodValue, w.periodUnit)}</span></div>
        <div class="detail-item"><label>تاريخ الانتهاء</label><span>${w.endDate}</span></div>
        ${remainingHtml}
        ${w.notes ? `<div class="detail-item"><label>ملاحظات</label><span>${w.notes}</span></div>` : ''}
      </div>`
    printPdf('بطاقة كفالة', body)
  }

  /* shared form body */
  const formBody = (
    <div className="mi-form-grid">
      <label className="mi-field">
        <span>اسم الزبون <span className="mi-required">*</span></span>
        <input type="text" value={form.customerName} onKeyDown={blockDigits}
          onChange={e => setField('customerName', e.target.value)} placeholder="اسم الزبون"
          className={errCls(submitAttempted && !!nameErr)} />
        {showErr(nameErr)}
      </label>
      <label className="mi-field">
        <span>رقم الهاتف <span className="mi-required">*</span></span>
        <input type="text" value={form.phone} onKeyDown={allowPhoneChars}
          onChange={e => setField('phone', e.target.value)} placeholder="05XXXXXXXX"
          className={errCls(submitAttempted && !!phoneErr)} />
        {showErr(phoneErr)}
      </label>
      <label className="mi-field">
        <span>نمرة السيارة</span>
        <input type="text" value={form.carPlate}
          onChange={e => setField('carPlate', e.target.value)} placeholder="أ ب ج 123" />
      </label>
      <label className="mi-field">
        <span>اسم القطعة / الخدمة <span className="mi-required">*</span></span>
        <input type="text" value={form.itemName}
          onChange={e => setField('itemName', e.target.value)} placeholder="مثال: بلياردو"
          className={errCls(submitAttempted && !!itemErr)} />
        {showErr(itemErr)}
      </label>
      <label className="mi-field">
        <span>تاريخ البداية</span>
        <input type="date" value={form.startDate} max={today()}
          onChange={e => setField('startDate', e.target.value > today() ? today() : e.target.value)} />
      </label>
      <label className="mi-field">
        <span>المدة</span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input type="number" min={1} value={form.periodValue} style={{ flex: '1 1 0' }}
            onChange={e => setField('periodValue', e.target.value)} />
          <select className="pay-select" value={form.periodUnit} style={{ flex: '1 1 0' }}
            onChange={e => setField('periodUnit', e.target.value)}>
            {UNIT_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
          </select>
        </div>
      </label>
      <label className="mi-field mi-field-full">
        <span>ملاحظات</span>
        <textarea rows={3} value={form.notes}
          onChange={e => setField('notes', e.target.value)} placeholder="أي ملاحظات إضافية..." />
      </label>
    </div>
  )

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">الكفالات</h1>
      </div>

      {/* ════ Edit Modal ════ */}
      {editingWarranty && (
        <div className="mi-modal-overlay" onClick={clearForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل كفالة — {editingWarranty.customerName}</h3>
              <button className="mi-modal-close" onClick={clearForm}>✕</button>
            </div>
            <div className="mi-modal-body">{formBody}</div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handleSave}>حفظ التعديلات</button>
              <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Filters ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">سجل الكفالات</h2>
        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap">
            <input type="text" className="mi-search-input" placeholder="🔍  بحث باسم الزبون..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="📞  بحث برقم الهاتف..."
              value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} />
          </div>
          <div className="pd-type-tabs">
            {([['all', 'الكل'], ['active', 'سارية'], ['expired', 'منتهية']] as const).map(([val, label]) => (
              <button key={val} className={`pd-tab${tab === val ? ' pd-tab-active' : ''}`}
                onClick={() => setTab(val)}>{label}</button>
            ))}
          </div>
          <div className="mi-date-range">
            <div className="mi-filter-field">
              <span className="mi-filter-label">من تاريخ</span>
              <input type="date" className="mi-date-input" value={filterFrom} max={today()}
                onChange={e => setFilterFrom(e.target.value > today() ? today() : e.target.value)} />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى تاريخ</span>
              <input type="date" className="mi-date-input" value={filterTo} max={today()}
                onChange={e => setFilterTo(e.target.value > today() ? today() : e.target.value)} />
            </div>
          </div>
          {hasFilters && (
            <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلاتر</button>
          )}
        </div>
      </div>

      {/* ════ Section: Active warranties ════ */}
      {tab !== 'expired' && (
        <div className="mi-card">
          <h2 className="mi-section-title">الكفالات السارية ({fmt(activeWarranties.length)})</h2>
          <div className="mi-table-wrap">
            <table className="mi-table">
              <thead>
                <tr>
                  <th>اسم الزبون</th><th>رقم الهاتف</th><th>نمرة السيارة</th><th>نوع العملية</th><th>القطعة / الخدمة</th>
                  <th>تاريخ البداية</th><th>المدة</th><th>تاريخ الانتهاء</th><th>الأيام المتبقية</th><th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {activeWarranties.length === 0 ? (
                  <tr><td colSpan={10} className="mi-empty-row">لا توجد كفالات سارية</td></tr>
                ) : activeWarranties.map((w, i) => (
                  <tr key={w.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                    onClick={() => setDetailsWarranty(w)}>
                    <td>{w.customerName}</td>
                    <td>{w.phone ? <span className="mi-phone-highlight">{w.phone}</span> : <span className="mi-badge-gray">غير معروف</span>}</td>
                    <td>{w.carPlate ? <span className="mi-plate">{w.carPlate}</span> : '—'}</td>
                    <td><span className={SOURCE_CLS[w.source] ?? 'mi-badge-gray'}>{SOURCE_LABEL[w.source] ?? w.source}</span></td>
                    <td>{w.itemName}</td>
                    <td>{w.startDate}</td>
                    <td>{periodLabel(w.periodValue, w.periodUnit)}</td>
                    <td>{w.endDate}</td>
                    <td><span style={{ color: remainingColor(w.remaining), fontWeight: 700 }}>{fmt(w.remaining)} يوم</span></td>
                    <td>
                      <div className="mi-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm-outline" onClick={() => openEdit(w)}>تعديل</button>
                        <button className="btn btn-danger-sm" onClick={() => setDeleteWarranty(w)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ════ Section: Expired warranties ════ */}
      {tab !== 'active' && (
        <div className="mi-card">
          <h2 className="mi-section-title">الكفالات المنتهية ({fmt(expiredWarranties.length)})</h2>
          <div className="mi-table-wrap">
            <table className="mi-table">
              <thead>
                <tr>
                  <th>اسم الزبون</th><th>رقم الهاتف</th><th>نمرة السيارة</th><th>نوع العملية</th><th>القطعة / الخدمة</th>
                  <th>تاريخ البداية</th><th>المدة</th><th>تاريخ الانتهاء</th><th>انتهت منذ</th><th>الإجراءات</th>
                </tr>
              </thead>
              <tbody>
                {expiredWarranties.length === 0 ? (
                  <tr><td colSpan={10} className="mi-empty-row">لا توجد كفالات منتهية</td></tr>
                ) : expiredWarranties.map((w, i) => (
                  <tr key={w.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                    onClick={() => setDetailsWarranty(w)}>
                    <td>{w.customerName}</td>
                    <td>{w.phone ? <span className="mi-phone-highlight">{w.phone}</span> : <span className="mi-badge-gray">غير معروف</span>}</td>
                    <td>{w.carPlate ? <span className="mi-plate">{w.carPlate}</span> : '—'}</td>
                    <td><span className={SOURCE_CLS[w.source] ?? 'mi-badge-gray'}>{SOURCE_LABEL[w.source] ?? w.source}</span></td>
                    <td>{w.itemName}</td>
                    <td>{w.startDate}</td>
                    <td>{periodLabel(w.periodValue, w.periodUnit)}</td>
                    <td>{w.endDate}</td>
                    <td><span className="pd-remaining">{fmt(Math.abs(w.remaining))} يوم</span></td>
                    <td>
                      <div className="mi-actions" onClick={e => e.stopPropagation()}>
                        <button className="btn btn-sm-outline" onClick={() => openEdit(w)}>تعديل</button>
                        <button className="btn btn-danger-sm" onClick={() => setDeleteWarranty(w)}>حذف</button>
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
      {detailsWarranty && (() => {
        const endDate = calcEndDate(detailsWarranty.startDate, detailsWarranty.periodValue, detailsWarranty.periodUnit)
        const remaining = daysRemaining(endDate)
        const expired = remaining <= 0
        const detail: WithCalc = { ...detailsWarranty, endDate, remaining }
        return (
          <div className="mi-modal-overlay" onClick={() => setDetailsWarranty(null)}>
            <div className="mi-modal" onClick={e => e.stopPropagation()}>
              <div className="mi-modal-header">
                <h3>تفاصيل الكفالة</h3>
                <button className="mi-modal-close" onClick={() => setDetailsWarranty(null)}>✕</button>
              </div>
              <div className="mi-modal-body">
                <div className="mi-detail-grid">
                  <div className="mi-detail-item"><span className="mi-detail-label">اسم الزبون</span><strong>{detailsWarranty.customerName}</strong></div>
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">رقم الهاتف</span>
                    {detailsWarranty.phone
                      ? <span className="mi-phone-highlight">{detailsWarranty.phone}</span>
                      : <span className="mi-badge-gray">غير معروف</span>}
                  </div>
                  <div className="mi-detail-item"><span className="mi-detail-label">نمرة السيارة</span>{detailsWarranty.carPlate ? <span className="mi-plate">{detailsWarranty.carPlate}</span> : <span>—</span>}</div>
                  {detailsWarranty.source === 'maintenance' && detailsWarranty.carType && (
                    <div className="mi-detail-item"><span className="mi-detail-label">نوع السيارة</span><span>{detailsWarranty.carType}</span></div>
                  )}
                  {detailsWarranty.source === 'maintenance' && detailsWarranty.carColor && (
                    <div className="mi-detail-item"><span className="mi-detail-label">لون السيارة</span><span>{detailsWarranty.carColor}</span></div>
                  )}
                  <div className="mi-detail-item"><span className="mi-detail-label">نوع العملية</span><span className={SOURCE_CLS[detailsWarranty.source] ?? 'mi-badge-gray'}>{SOURCE_LABEL[detailsWarranty.source] ?? detailsWarranty.source}</span></div>
                  <div className="mi-detail-item"><span className="mi-detail-label">القطعة / الخدمة</span><span>{detailsWarranty.itemName}</span></div>
                  <div className="mi-detail-item"><span className="mi-detail-label">تاريخ البداية</span><span>{detailsWarranty.startDate}</span></div>
                  <div className="mi-detail-item"><span className="mi-detail-label">المدة</span><span>{periodLabel(detailsWarranty.periodValue, detailsWarranty.periodUnit)}</span></div>
                  <div className="mi-detail-item"><span className="mi-detail-label">تاريخ الانتهاء</span><span>{endDate}</span></div>
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">{expired ? 'انتهت منذ' : 'الأيام المتبقية'}</span>
                    {expired
                      ? <span className="pd-remaining">{fmt(Math.abs(remaining))} يوم</span>
                      : <span style={{ color: remainingColor(remaining), fontWeight: 700 }}>{fmt(remaining)} يوم</span>}
                  </div>
                  {detailsWarranty.notes && (
                    <div className="mi-detail-item mi-detail-full"><span className="mi-detail-label">ملاحظات</span><span>{detailsWarranty.notes}</span></div>
                  )}
                </div>
              </div>
              <div className="mi-modal-footer">
                <button className="btn btn-secondary" onClick={() => handlePrint(detail)}>طباعة</button>
                <button className="btn btn-ghost" onClick={() => setDetailsWarranty(null)}>إغلاق</button>
              </div>
            </div>
          </div>
        )
      })()}

      {/* ════ Delete Confirm ════ */}
      {deleteWarranty && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف كفالة "${deleteWarranty.itemName}" للزبون "${deleteWarranty.customerName}"؟`}
          onConfirm={async () => {
            try { await dbService.warranty.delete(deleteWarranty.id); await reload(); setDeleteWarranty(null) }
            catch (err) { showError('تعذّر حذف الكفالة', err) }
          }}
          onCancel={() => setDeleteWarranty(null)}
        />
      )}

      {/* ════ Confirm before edit ════ */}
      {warnWarranty && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل كفالة "${warnWarranty.itemName}" للزبون "${warnWarranty.customerName}"؟`}
          onConfirm={confirmEditWarranty}
          onCancel={() => setWarnWarranty(null)}
        />
      )}
    </div>
  )
}
