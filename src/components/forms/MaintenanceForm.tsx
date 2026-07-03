import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useGarage, CarRecord, CarItem, WarrantyPeriodUnit, DiscountType } from '../../store/GarageContext'
import { dbService } from '../../services/db'
import { showError } from '../../utils/notify'

/* ════════════════════════════════════════
   MaintenanceForm — نموذج إضافة/تعديل فاتورة صيانة (مشترك)
   يُستخدم داخل صفحة الصيانة (إضافة inline + تعديل modal)
   وداخل صفحات الديون/الكفالات/فواتير البيع (إضافة modal).
   نفس الحقول ونفس الـ validation ونفس قنوات IPC ونفس reload بالضبط.
════════════════════════════════════════ */
type FormPartType = 'part' | 'service'
type FormPart    = { id: number; partType: FormPartType; name: string; qty: number | string; unitPrice: number | string; warrantyValue: string; warrantyUnit: WarrantyPeriodUnit | ''; notes: string }
type FormPartErr = { nameErr: string; qtyErr: string }

const UNIT_OPTIONS: [WarrantyPeriodUnit, string][] = [['week', 'أسبوع'], ['month', 'شهر'], ['year', 'سنة']]

export const MAINTENANCE_DRAFT_KEY = 'garage-mi-draft-v2'
const today = () => new Date().toISOString().slice(0, 10)
let nextPartId = 100

export const hasMaintenanceDraft   = () => !!localStorage.getItem(MAINTENANCE_DRAFT_KEY)
export const clearMaintenanceDraft = () => localStorage.removeItem(MAINTENANCE_DRAFT_KEY)

function parseWarrantyJson(raw: string): { value: number; unit: WarrantyPeriodUnit } | null {
  if (!raw) return null
  try {
    const w = JSON.parse(raw)
    if (w.value && w.unit) return { value: Number(w.value), unit: w.unit as WarrantyPeriodUnit }
  } catch {
    // ignore malformed warranty JSON
  }
  return null
}

const emptyForm = () => ({
  customerName: '', phone: '', carPlate: '', carType: '', carColor: '',
  dateReceived: today(), generalNotes: '',
  discountType: '' as '' | DiscountType, discountValue: '',
})

const newFormPart = (): FormPart => ({
  id: nextPartId++, partType: 'part', name: '', qty: '' as unknown as number, unitPrice: '' as unknown as number, warrantyValue: '', warrantyUnit: '', notes: '',
})
const newFormService = (): FormPart => ({
  id: nextPartId++, partType: 'service', name: '', qty: 1, unitPrice: '' as unknown as number, warrantyValue: '', warrantyUnit: '', notes: '',
})

const blockDigits     = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault() }
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault() }
const validateName    = (v: string) => v.trim() ? '' : 'اسم الزبون مطلوب'
const validatePlate   = (v: string) => v.trim() ? '' : 'نمرة السيارة مطلوبة'
const validatePhone   = (v: string) => v.trim() ? '' : 'رقم الهاتف مطلوب'

const partsFromRecord = (record: CarRecord): FormPart[] =>
  record.items.length > 0
    ? record.items.map(item => {
        const w = parseWarrantyJson(item.warranty)
        return { id: nextPartId++, partType: item.partType, name: item.name, qty: item.quantity,
          unitPrice: item.unitPrice, warrantyValue: w ? String(w.value) : '', warrantyUnit: w ? w.unit : '' as WarrantyPeriodUnit | '', notes: item.notes }
      })
    : []

const formFromRecord = (record: CarRecord) => ({
  customerName: record.customerName, phone: record.phone === '0000' ? '' : record.phone,
  carPlate: record.carPlate, carType: record.carType, carColor: record.carColor,
  dateReceived: record.dateReceived, generalNotes: record.notes,
  discountType: (record.discountType ?? '') as '' | DiscountType,
  discountValue: record.discountType ? String(record.discountValue ?? 0) : '',
})

export type MaintenanceFormHandle = { save: () => void }

type Props = {
  editingCar: CarRecord | null
  useDraft?: boolean
  onSaved: () => void
}

const MaintenanceForm = forwardRef<MaintenanceFormHandle, Props>(function MaintenanceForm(
  { editingCar, useDraft = false, onSaved }, ref,
) {
  const { reload } = useGarage()

  const [form, setForm] = useState(() => editingCar ? formFromRecord(editingCar) : emptyForm())
  const [parts, setParts] = useState<FormPart[]>(() => editingCar ? partsFromRecord(editingCar) : [])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* Draft (add-mode only) */
  useEffect(() => {
    if (editingCar || !useDraft) return
    try {
      const raw = localStorage.getItem(MAINTENANCE_DRAFT_KEY)
      if (!raw) return
      const { form: f, parts: p } = JSON.parse(raw) as { form: typeof form; parts: FormPart[] }
      setForm(f); setParts(p)
      nextPartId = Math.max(100, ...p.map(x => x.id)) + 1
    } catch { localStorage.removeItem(MAINTENANCE_DRAFT_KEY) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (useDraft && !editingCar) localStorage.setItem(MAINTENANCE_DRAFT_KEY, JSON.stringify({ form, parts }))
  }, [useDraft, editingCar, form, parts])

  const setField   = (f: string, v: string) => setForm(prev => ({ ...prev, [f]: v }))
  const addPart    = () => setParts(prev => [...prev, newFormPart()])
  const addService = () => setParts(prev => [...prev, newFormService()])
  const removePart = (id: number) => setParts(prev => prev.filter(p => p.id !== id))
  const updatePart = (id: number, field: keyof FormPart, value: string | number) =>
    setParts(prev => prev.map(p => p.id !== id ? p : { ...p, [field]: value }))

  /* Validation */
  const formTotal = parts.reduce((s, p) => s + Number(p.qty || 0) * Number(p.unitPrice || 0), 0)
  const nameErr   = validateName(form.customerName)
  const plateErr  = validatePlate(form.carPlate)
  const phoneErr  = validatePhone(form.phone)
  const partsErrMap: Record<number, FormPartErr> = {}
  for (const p of parts) partsErrMap[p.id] = { nameErr: p.name.trim() ? '' : 'اسم القطعة مطلوب', qtyErr: Number(p.qty) >= 1 ? '' : 'العدد يجب أن يكون 1 على الأقل' }

  const discountValueNum = Number(form.discountValue || 0)
  const discountErr = !form.discountType ? ''
    : discountValueNum < 0 ? 'قيمة الخصم لا يمكن أن تكون سالبة'
    : form.discountType === 'percentage' && discountValueNum > 100 ? 'نسبة الخصم يجب أن تكون بين 0 و 100'
    : form.discountType === 'fixed' && discountValueNum > formTotal ? 'قيمة الخصم لا يمكن أن تتجاوز مجموع البنود'
    : ''
  const discountAmount = form.discountType && !discountErr
    ? (form.discountType === 'percentage' ? formTotal * discountValueNum / 100 : discountValueNum)
    : 0
  const formTotalAfterDiscount = formTotal - discountAmount

  const hasErrors = !!nameErr || !!plateErr || !!phoneErr || !!discountErr || Object.values(partsErrMap).some(e => e.nameErr || e.qtyErr)

  const handleSave = async () => {
    setSubmitAttempted(true)
    if (hasErrors) return
    const newItems: CarItem[] = parts.map(p => ({
      name: p.name, quantity: p.partType === 'service' ? 1 : Number(p.qty || 1), unitPrice: Number(p.unitPrice || 0),
      warranty: p.warrantyUnit ? JSON.stringify({ value: Math.max(1, parseInt(p.warrantyValue || '1') || 1), unit: p.warrantyUnit }) : '',
      partType: p.partType, notes: p.notes,
    }))
    const phone = form.phone.trim()
    const carData: CarRecord = {
      id: editingCar?.id ?? 0,
      customerName: form.customerName, phone, carPlate: form.carPlate,
      carType: form.carType, carColor: form.carColor, dateReceived: form.dateReceived,
      status: editingCar?.status ?? 'in_progress', deliveredDate: editingCar?.deliveredDate,
      notes: form.generalNotes,
      discountType: form.discountType || null,
      discountValue: form.discountType ? discountValueNum : 0,
      total: formTotalAfterDiscount, items: newItems,
    }
    try {
      if (editingCar) await dbService.maintenance.update(carData)
      else            await dbService.maintenance.add(carData)
      await reload()
      if (useDraft && !editingCar) localStorage.removeItem(MAINTENANCE_DRAFT_KEY)
      onSaved()
    } catch (err) {
      showError('تعذّر حفظ فاتورة الصيانة', err)
    }
  }

  useImperativeHandle(ref, () => ({ save: handleSave }))

  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showPartErr = (id: number, f: keyof FormPartErr) => submitAttempted && partsErrMap[id]?.[f] ? <span className="mi-err">{partsErrMap[id][f]}</span> : null
  const errCls      = (bad: boolean) => bad ? ' mi-input-err' : ''
  const fmt         = (n: number) => n.toLocaleString('en-US')

  return (
    <>
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
          <span>نمرة السيارة <span className="mi-required">*</span></span>
          <input type="text" value={form.carPlate}
            onChange={e => setField('carPlate', e.target.value)} placeholder="أ ب ج 123"
            className={errCls(submitAttempted && !!plateErr)} />
          {showErr(plateErr)}
        </label>
        <label className="mi-field">
          <span>نوع السيارة</span>
          <input type="text" value={form.carType} onChange={e => setField('carType', e.target.value)} placeholder="تويوتا كامري" />
        </label>
        <label className="mi-field">
          <span>لون السيارة</span>
          <input type="text" value={form.carColor} onChange={e => setField('carColor', e.target.value)} placeholder="أبيض" />
        </label>
        <label className="mi-field">
          <span>تاريخ الاستلام</span>
          <input type="date" value={form.dateReceived} max={today()} onChange={e => setField('dateReceived', e.target.value > today() ? today() : e.target.value)} />
        </label>
        <label className="mi-field mi-field-full">
          <span>ملاحظات عامة</span>
          <textarea rows={3} value={form.generalNotes} onChange={e => setField('generalNotes', e.target.value)} placeholder="أي ملاحظات إضافية..." />
        </label>
      </div>

      <div className="mi-parts-header">
        <h2 className="mi-section-title">القطع والخدمات</h2>
        <div className="mi-actions">
          <button className="btn btn-secondary" onClick={addPart}>+ إضافة قطعة</button>
          <button className="btn btn-sm-green" onClick={addService}>+ إضافة خدمة</button>
        </div>
      </div>
      <div className="mi-parts-table-wrap">
        <table className="mi-parts-table">
          <thead>
            <tr><th>النوع</th><th>اسم القطعة / الخدمة</th><th>العدد</th><th>سعر الوحدة (₪)</th><th>الإجمالي (₪)</th><th>الكفالة</th><th>ملاحظات</th><th></th></tr>
          </thead>
          <tbody>
            {parts.map(part => (
              <tr key={part.id}>
                <td className="mi-td-center">
                  {part.partType === 'service'
                    ? <span className="mi-badge-blue">خدمة</span>
                    : <span className="mi-badge-orange">قطعة</span>}
                </td>
                <td>
                  <input type="text" placeholder="اسم القطعة أو الخدمة" value={part.name}
                    className={'mi-td-input' + errCls(submitAttempted && !!partsErrMap[part.id]?.nameErr)}
                    onChange={e => updatePart(part.id, 'name', e.target.value)} />
                  {showPartErr(part.id, 'nameErr')}
                </td>
                <td>
                  <input type="number" min={1} value={part.partType === 'service' ? 1 : (part.qty === '' || part.qty === 0 ? '' : part.qty)}
                    disabled={part.partType === 'service'}
                    className={'mi-td-input mi-td-num' + errCls(submitAttempted && !!partsErrMap[part.id]?.qtyErr)}
                    onChange={e => updatePart(part.id, 'qty', e.target.value === '' ? '' : Math.max(1, parseFloat(e.target.value) || 1))} />
                  {showPartErr(part.id, 'qtyErr')}
                </td>
                <td>
                  <input type="number" min={0} value={part.unitPrice || ''} className="mi-td-input mi-td-num"
                    onChange={e => updatePart(part.id, 'unitPrice', Math.max(0, Number(e.target.value)))}
                    onBlur={(e) => { if (!e.target.value) updatePart(part.id, 'unitPrice', 0) }} />
                </td>
                <td className="mi-td-center">
                  {fmt(Number(part.partType === 'service' ? 1 : (part.qty || 0)) * Number(part.unitPrice || 0))} ₪
                </td>
                <td>
                  <div style={{ display: 'flex', gap: '0.3rem', alignItems: 'center' }}>
                    <select className="pay-select" style={{ flex: '1 1 0', minWidth: 70 }}
                      value={part.warrantyUnit}
                      onChange={e => updatePart(part.id, 'warrantyUnit', e.target.value)}>
                      <option value="">لا كفالة</option>
                      {UNIT_OPTIONS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
                    </select>
                    {part.warrantyUnit && (
                      <input type="number" max={99} value={part.warrantyValue}
                        placeholder="1"
                        className="mi-td-input mi-td-num" style={{ width: 55 }}
                        onChange={e => updatePart(part.id, 'warrantyValue', e.target.value)} />
                    )}
                  </div>
                </td>
                <td><input type="text" placeholder="ملاحظة..." value={part.notes} className="mi-td-input" onChange={e => updatePart(part.id, 'notes', e.target.value)} /></td>
                <td className="mi-td-center">
                  <button className="btn btn-danger-sm" onClick={() => removePart(part.id)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mi-total-row">المجموع قبل الخصم: <strong>{fmt(formTotal)} ₪</strong></div>
      <div className="mi-form-grid" style={{ marginTop: '0.5rem' }}>
        <label className="mi-field">
          <span>الخصم</span>
          <select className="pay-select" value={form.discountType || ''}
            onChange={e => setForm(prev => ({ ...prev, discountType: e.target.value as '' | DiscountType, discountValue: e.target.value ? prev.discountValue : '' }))}>
            <option value="">بدون خصم</option>
            <option value="fixed">مبلغ ثابت (₪)</option>
            <option value="percentage">نسبة مئوية (%)</option>
          </select>
        </label>
        {form.discountType && (
          <label className="mi-field">
            <span>{form.discountType === 'percentage' ? 'نسبة الخصم (%)' : 'قيمة الخصم (₪)'}</span>
            <input type="number" min={0} max={form.discountType === 'percentage' ? 100 : undefined}
              value={form.discountValue} placeholder="0"
              className={errCls(submitAttempted && !!discountErr)}
              onChange={e => setField('discountValue', e.target.value)} />
            {showErr(discountErr)}
          </label>
        )}
        <div className="mi-field">
          <span>الإجمالي بعد الخصم</span>
          <div style={{
            padding: '8px 12px', background: '#f0fdf4', border: '1px solid #27ae60',
            borderRadius: '6px', fontWeight: 700, fontSize: '16px', color: '#27ae60',
          }}>
            {fmt(formTotalAfterDiscount)} ₪
            {discountAmount > 0 && (
              <span style={{ fontSize: '11px', fontWeight: 400, color: '#888', marginRight: '8px' }}>
                (الخصم: −{fmt(discountAmount)} ₪)
              </span>
            )}
          </div>
        </div>
      </div>
    </>
  )
})

export default MaintenanceForm
