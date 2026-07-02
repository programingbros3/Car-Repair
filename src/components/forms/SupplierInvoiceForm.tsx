import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useGarage } from '../../store/GarageContext'
import type { SupplierRecord } from '../../store/GarageContext'
import { dbService } from '../../services/db'
import { showError } from '../../utils/notify'

/* ════════════════════════════════════════
   SupplierInvoiceForm — نموذج إضافة/تعديل فاتورة مورد (مشترك)
   يُستخدم داخل صفحة الموردين (إضافة inline + تعديل modal)
   وداخل صفحة فواتير الشراء (إضافة modal).
════════════════════════════════════════ */
type PayMethod = 'cash' | 'check' | 'visa' | 'debt'
type PaymentRow = {
  id: number; method: PayMethod; amount: number
  checkNumber: string; issueDate: string; clearDate: string
  bankName: string; transactionNum: string
}
type FormPart    = { id: number; name: string; qty: number; unitPrice: number; notes: string }
type FormPartErr = { nameErr: string; qtyErr: string }

export const SUPPLIER_DRAFT_KEY = 'garage-sup-draft'
const today = () => new Date().toISOString().slice(0, 10)
let nextPartId = 1
let nextPayId  = 1

export const hasSupplierDraft   = () => !!localStorage.getItem(SUPPLIER_DRAFT_KEY)
export const clearSupplierDraft = () => localStorage.removeItem(SUPPLIER_DRAFT_KEY)

const emptyForm   = () => ({ supplierName: '', phone: '', purchaseDate: today(), generalNotes: '' })
const newFormPart = (): FormPart   => ({ id: nextPartId++, name: '', qty: 1, unitPrice: 0, notes: '' })
const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++, method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const validatePhone = (v: string) => v.trim() ? '' : 'رقم الهاتف مطلوب'

const PAY_LABELS: Record<Exclude<PayMethod, 'debt'>, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }
const fmt = (n: number) => n.toLocaleString('en-US')

const formFromRecord = (sup: SupplierRecord) => ({ supplierName: sup.supplierName, phone: sup.phone, purchaseDate: sup.purchaseDate, generalNotes: sup.notes })
const partsFromRecord = (sup: SupplierRecord): FormPart[] =>
  sup.items.length > 0
    ? sup.items.map(item => ({ id: nextPartId++, name: item.name, qty: item.quantity, unitPrice: item.unitPrice, notes: item.notes }))
    : [newFormPart()]

export type SupplierInvoiceFormHandle = { save: () => void }

type Props = {
  editing: SupplierRecord | null
  useDraft?: boolean
  onSaved: () => void
}

const SupplierInvoiceForm = forwardRef<SupplierInvoiceFormHandle, Props>(function SupplierInvoiceForm(
  { editing, useDraft = false, onSaved }, ref,
) {
  const { suppliers, reload } = useGarage()

  const [form, setForm] = useState(() => editing ? formFromRecord(editing) : emptyForm())
  const [parts, setParts] = useState<FormPart[]>(() => editing ? partsFromRecord(editing) : [newFormPart()])
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([emptyPayRow()])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* Draft (add-mode only) */
  useEffect(() => {
    if (editing || !useDraft) return
    try {
      const raw = localStorage.getItem(SUPPLIER_DRAFT_KEY)
      if (!raw) return
      const { form: f, parts: p } = JSON.parse(raw) as { form: typeof form; parts: FormPart[] }
      setForm(f); setParts(p)
      nextPartId = Math.max(0, ...p.map(x => x.id)) + 1
    } catch { localStorage.removeItem(SUPPLIER_DRAFT_KEY) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (useDraft && !editing) localStorage.setItem(SUPPLIER_DRAFT_KEY, JSON.stringify({ form, parts }))
  }, [useDraft, editing, form, parts])

  const setField   = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))
  const addPart    = () => setParts(prev => [...prev, newFormPart()])
  const removePart = (id: number) => setParts(prev => prev.filter(p => p.id !== id))
  const updatePart = (id: number, field: keyof FormPart, value: string | number) =>
    setParts(prev => prev.map(p => p.id !== id ? p : { ...p, [field]: value }))

  const selectSupplier = (name: string) => {
    const found = suppliers.find(s => s.name === name)
    setForm(prev => ({ ...prev, supplierName: name, phone: found?.phone ?? '' }))
  }

  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  /* Validation */
  const formTotal   = parts.reduce((s, p) => s + p.qty * p.unitPrice, 0)
  const formPaid    = paymentRows.reduce((s, r) => s + (r.amount || 0), 0)
  const supplierErr = form.supplierName.trim() ? '' : 'يجب اختيار المورد'
  const phoneErr    = validatePhone(form.phone)

  const partsErrMap: Record<number, FormPartErr> = {}
  for (const p of parts) {
    partsErrMap[p.id] = {
      nameErr: p.name.trim() ? '' : 'اسم القطعة مطلوب',
      qtyErr:  p.qty >= 1   ? '' : 'العدد يجب أن يكون 1 على الأقل',
    }
  }
  const hasErrors = !!supplierErr || !!phoneErr || Object.values(partsErrMap).some(e => e.nameErr || e.qtyErr)

  const handleSave = async () => {
    setSubmitAttempted(true)
    if (hasErrors) return
    const newItems = parts.map(p => ({ name: p.name, quantity: p.qty, unitPrice: p.unitPrice, notes: p.notes }))
    const remaining = Math.max(0, formTotal - formPaid)
    const phone = form.phone.trim()
    const supData: SupplierRecord = {
      id: editing?.id ?? 0, supplierName: form.supplierName, phone, purchaseDate: form.purchaseDate,
      notes: form.generalNotes, total: formTotal, amountPaid: formPaid, amountRemaining: remaining,
      items: newItems, payments: editing ? editing.payments : paymentRows,
    }
    try {
      if (editing) {
        await dbService.supplierInvoice.update(supData)
      } else {
        await dbService.supplierInvoice.add(supData, paymentRows.filter(r => r.amount > 0))
      }
      await reload()
      if (useDraft && !editing) localStorage.removeItem(SUPPLIER_DRAFT_KEY)
      onSaved()
    } catch (err) {
      showError('تعذّر حفظ فاتورة المورد', err)
    }
  }

  useImperativeHandle(ref, () => ({ save: handleSave }))

  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showPartErr = (id: number, f: keyof FormPartErr) =>
    submitAttempted && partsErrMap[id]?.[f] ? <span className="mi-err">{partsErrMap[id][f]}</span> : null
  const errCls = (bad: boolean) => bad ? ' mi-input-err' : ''

  return (
    <>
      <div className="mi-form-grid">
        <label className="mi-field">
          <span>اسم المورد <span className="mi-required">*</span></span>
          <select value={form.supplierName}
            onChange={e => selectSupplier(e.target.value)}
            className={'pay-select' + errCls(submitAttempted && !!supplierErr)}>
            <option value="">— اختر المورد —</option>
            {suppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
          </select>
          {showErr(supplierErr)}
        </label>
        <label className="mi-field">
          <span>رقم هاتف المورد <span className="mi-required">*</span></span>
          <input type="text" value={form.phone} readOnly
            placeholder="يُملأ تلقائياً عند اختيار المورد"
            className={errCls(submitAttempted && !!phoneErr)} />
          {showErr(phoneErr)}
        </label>
        <label className="mi-field">
          <span>تاريخ الشراء</span>
          <input type="date" value={form.purchaseDate} max={today()}
            onChange={e => setField('purchaseDate', e.target.value > today() ? today() : e.target.value)} />
        </label>
        <label className="mi-field mi-field-full">
          <span>ملاحظات</span>
          <textarea rows={3} value={form.generalNotes}
            onChange={e => setField('generalNotes', e.target.value)}
            placeholder="أي ملاحظات إضافية..." />
        </label>
      </div>

      <div className="mi-parts-header">
        <h2 className="mi-section-title">بنود الشراء</h2>
        <button className="btn btn-secondary" onClick={addPart}>+ إضافة قطعة</button>
      </div>
      <div className="mi-parts-table-wrap">
        <table className="mi-parts-table">
          <thead>
            <tr><th>اسم القطعة</th><th>العدد</th><th>سعر الوحدة (₪)</th><th>ملاحظات</th><th></th></tr>
          </thead>
          <tbody>
            {parts.map(part => (
              <tr key={part.id}>
                <td>
                  <input type="text" placeholder="اسم القطعة" value={part.name}
                    className={'mi-td-input' + errCls(submitAttempted && !!partsErrMap[part.id]?.nameErr)}
                    onChange={e => updatePart(part.id, 'name', e.target.value)} />
                  {showPartErr(part.id, 'nameErr')}
                </td>
                <td>
                  <input type="number" min={1} value={part.qty}
                    className={'mi-td-input mi-td-num' + errCls(submitAttempted && !!partsErrMap[part.id]?.qtyErr)}
                    onChange={e => updatePart(part.id, 'qty', Math.max(1, Number(e.target.value)))} />
                  {showPartErr(part.id, 'qtyErr')}
                </td>
                <td>
                  <input type="number" min={0} value={part.unitPrice || ''}
                    className="mi-td-input mi-td-num"
                    onChange={e => updatePart(part.id, 'unitPrice', Math.max(0, Number(e.target.value)))}
                    onBlur={(e) => { if (!e.target.value) updatePart(part.id, 'unitPrice', 0) }} />
                </td>
                <td>
                  <input type="text" placeholder="ملاحظة..." value={part.notes} className="mi-td-input"
                    onChange={e => updatePart(part.id, 'notes', e.target.value)} />
                </td>
                <td className="mi-td-center">
                  <button className="btn btn-danger-sm" disabled={parts.length === 1}
                    onClick={() => removePart(part.id)}>حذف</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mi-total-row">الإجمالي: <strong>{fmt(formTotal)} ₪</strong></div>

      <div className="pay-section-title">طريقة الدفع</div>
      {paymentRows.map(row => (
        <div key={row.id} className="pay-row">
          <div className="pay-row-main">
            <select className="pay-select" value={row.method}
              onChange={e => updatePaymentRow(row.id, { method: e.target.value as PayMethod })}>
              {(['cash', 'check', 'visa'] as Exclude<PayMethod, 'debt'>[]).map(val => (
                <option key={val} value={val}>{PAY_LABELS[val]}</option>
              ))}
            </select>
            <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount || ''}
              className="mi-td-input pay-amount"
              onChange={e => updatePaymentRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
              onBlur={(e) => { if (!e.target.value) updatePaymentRow(row.id, { amount: 0 }) }} />
            <button className="btn btn-danger-sm" disabled={paymentRows.length === 1}
              onClick={() => removePaymentRow(row.id)}>حذف</button>
          </div>
          {row.method === 'check' && (
            <div className="pay-row-extra">
              <label className="mi-field"><span>رقم الشيك</span>
                <input type="text" className="mi-td-input" value={row.checkNumber}
                  onChange={e => updatePaymentRow(row.id, { checkNumber: e.target.value })} /></label>
              <label className="mi-field"><span>اسم البنك</span>
                <input type="text" className="mi-td-input" value={row.bankName}
                  onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
              <label className="mi-field"><span>تاريخ الإصدار</span>
                <input type="date" className="mi-td-input" value={row.issueDate} max={today()}
                  onChange={e => updatePaymentRow(row.id, { issueDate: e.target.value > today() ? today() : e.target.value })} /></label>
              <label className="mi-field"><span>تاريخ الصرف</span>
                <input type="date" className="mi-td-input" value={row.clearDate}
                  onChange={e => updatePaymentRow(row.id, { clearDate: e.target.value })} /></label>
            </div>
          )}
          {row.method === 'visa' && (
            <div className="pay-row-extra">
              <label className="mi-field"><span>اسم البنك</span>
                <input type="text" className="mi-td-input" value={row.bankName}
                  onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
              <label className="mi-field"><span>رقم الحركة</span>
                <input type="text" className="mi-td-input" value={row.transactionNum}
                  onChange={e => updatePaymentRow(row.id, { transactionNum: e.target.value })} /></label>
            </div>
          )}
        </div>
      ))}
      <button className="btn btn-secondary pay-add-btn" onClick={addPaymentRow}>+ إضافة طريقة دفع</button>

      <div className="pay-summary">
        <div className="pay-summary-row">
          <span>إجمالي الفاتورة</span><strong>{fmt(formTotal)} ₪</strong>
        </div>
        <div className="pay-summary-row">
          <span>إجمالي المدفوع</span><strong className="pay-paid">{fmt(formPaid)} ₪</strong>
        </div>
        <div className="pay-summary-row pay-summary-last">
          <span>المتبقي (دين)</span>
          <strong className={formTotal - formPaid <= 0 ? 'pay-ok' : 'pay-due'}>
            {fmt(Math.max(0, formTotal - formPaid))} ₪
          </strong>
        </div>
      </div>
    </>
  )
})

export default SupplierInvoiceForm
