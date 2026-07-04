import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useGarage, SaleRecord, SaleItem, SaleStatus, PayMethod, PaymentRow, WarrantyPeriodUnit, DiscountType } from '../../store/GarageContext'
import { dbService } from '../../services/db'
import { showError } from '../../utils/notify'

/* ════════════════════════════════════════
   DirectSaleForm — نموذج إضافة/تعديل فاتورة بيع مباشر (مشترك)
   يُستخدم داخل صفحة البيع المباشر (إضافة inline + تعديل modal)
   وداخل صفحات الديون/الكفالات/فواتير البيع (إضافة modal).
   نفس الحقول ونفس الـ validation ونفس قنوات IPC ونفس reload بالضبط.
════════════════════════════════════════ */
type FormItem    = { id: number; name: string; qty: number | string; unitPrice: number | string; notes: string }
type FormItemErr = { nameErr: string; qtyErr: string }

export const DIRECT_SALE_DRAFT_KEY = 'garage-ds-draft-v2'
const today = () => new Date().toISOString().slice(0, 10)
let nextItemId = 100
let nextPayId  = 100

export const hasDirectSaleDraft   = () => !!localStorage.getItem(DIRECT_SALE_DRAFT_KEY)
export const clearDirectSaleDraft = () => localStorage.removeItem(DIRECT_SALE_DRAFT_KEY)

const UNIT_OPTIONS_DS: [WarrantyPeriodUnit, string][] = [['week', 'أسبوع'], ['month', 'شهر'], ['year', 'سنة']]

function parseWarrantyJsonDS(raw: string | null | undefined): { value: number; unit: WarrantyPeriodUnit } | null {
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
  customerName: '', phone: '', saleDate: today(), warrantyValue: '', warrantyUnit: '' as WarrantyPeriodUnit | '', generalNotes: '',
  discountType: '' as '' | DiscountType, discountValue: '',
})

const newFormItem = (): FormItem   => ({ id: nextItemId++, name: '', qty: '', unitPrice: '', notes: '' })
const emptyPayRow = (): PaymentRow => ({ id: nextPayId++, method: 'cash', amount: '' as unknown as number, checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '' })

const blockDigits     = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault() }
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault() }
const validateName    = (v: string) => v.trim() ? '' : 'اسم الزبون مطلوب'

const PAY_LABELS: Record<Exclude<PayMethod, 'debt'>, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }

const formFromRecord = (record: SaleRecord) => {
  const wParsed = parseWarrantyJsonDS(record.warranty)
  return {
    customerName: record.customerName, phone: record.phone === '0000' ? '' : record.phone,
    saleDate: record.saleDate,
    warrantyValue: wParsed ? String(wParsed.value) : '',
    warrantyUnit: (wParsed ? wParsed.unit : '') as WarrantyPeriodUnit | '',
    generalNotes: record.notes,
    discountType: (record.discountType ?? '') as '' | DiscountType,
    discountValue: record.discountType ? String(record.discountValue ?? 0) : '',
  }
}

const itemsFromRecord = (record: SaleRecord): FormItem[] =>
  record.items.length > 0
    ? record.items.map(it => ({ id: nextItemId++, name: it.name, qty: it.quantity, unitPrice: it.unitPrice !== 0 ? it.unitPrice : '', notes: it.notes }))
    : [newFormItem()]

export type DirectSaleFormHandle = { save: () => void }

type Props = {
  editingInvoice: SaleRecord | null
  useDraft?: boolean
  onSaved: () => void
}

const DirectSaleForm = forwardRef<DirectSaleFormHandle, Props>(function DirectSaleForm(
  { editingInvoice, useDraft = false, onSaved }, ref,
) {
  const { reload } = useGarage()

  const [form, setForm] = useState(() => editingInvoice ? formFromRecord(editingInvoice) : emptyForm())
  const [items, setItems] = useState<FormItem[]>(() => editingInvoice ? itemsFromRecord(editingInvoice) : [newFormItem()])
  const [formPayRows, setFormPayRows] = useState<PaymentRow[]>([emptyPayRow()])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* Draft (add-mode only) */
  useEffect(() => {
    if (editingInvoice || !useDraft) return
    try {
      const raw = localStorage.getItem(DIRECT_SALE_DRAFT_KEY)
      if (!raw) return
      const { form: f, items: it } = JSON.parse(raw) as { form: typeof form; items: FormItem[] }
      setForm(f); setItems(it)
      nextItemId = Math.max(100, ...it.map(x => x.id)) + 1
    } catch { localStorage.removeItem(DIRECT_SALE_DRAFT_KEY) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (useDraft && !editingInvoice) localStorage.setItem(DIRECT_SALE_DRAFT_KEY, JSON.stringify({ form, items }))
  }, [useDraft, editingInvoice, form, items])

  const setField   = (f: string, v: string) => setForm(prev => ({ ...prev, [f]: v }))
  const addItem    = () => setItems(prev => [...prev, newFormItem()])
  const removeItem = (id: number) => setItems(prev => prev.filter(it => it.id !== id))
  const updateItem = (id: number, field: keyof FormItem, value: string | number) =>
    setItems(prev => prev.map(it => it.id !== id ? it : { ...it, [field]: value }))

  const addFormPayRow    = () => setFormPayRows(prev => [...prev, emptyPayRow()])
  const removeFormPayRow = (id: number) => setFormPayRows(prev => prev.filter(r => r.id !== id))
  const updateFormPayRow = (id: number, u: Partial<Omit<PaymentRow, 'id'>>) =>
    setFormPayRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...u }))

  /* Validation */
  const formTotal = items.reduce((s, it) => s + Number(it.qty || 0) * Number(it.unitPrice || 0), 0)
  const nameErr   = validateName(form.customerName)
  const itemsErrMap: Record<number, FormItemErr> = {}
  for (const it of items) itemsErrMap[it.id] = { nameErr: it.name.trim() ? '' : 'اسم الصنف مطلوب', qtyErr: Number(it.qty) >= 1 ? '' : 'العدد يجب أن يكون 1 على الأقل' }

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

  const formPayTotal   = !editingInvoice ? formPayRows.reduce((s, r) => s + Number(r.amount || 0), 0) : 0
  const formPayExceedsErr = !editingInvoice && formPayTotal > formTotalAfterDiscount + 0.001
    ? `المبلغ المُدفع (${formPayTotal.toLocaleString('en-US')} ₪) يتجاوز إجمالي الفاتورة (${formTotalAfterDiscount.toLocaleString('en-US')} ₪)` : ''

  const hasErrors = !!nameErr || !!discountErr || Object.values(itemsErrMap).some(e => e.nameErr || e.qtyErr) || !!formPayExceedsErr

  const handleSave = async () => {
    setSubmitAttempted(true)
    if (hasErrors) return
    const newItems: SaleItem[] = items.map((it, i) => ({ id: i + 1, name: it.name, quantity: Number(it.qty || 1), unitPrice: Number(it.unitPrice || 0), notes: it.notes }))
    const phone = form.phone.trim() || '0000'
    const isNew = !editingInvoice
    const actualPayRows = isNew ? formPayRows.filter(r => r.method !== 'debt' && Number(r.amount) > 0) : []
    const amountPaid    = isNew ? actualPayRows.reduce((s, r) => s + Number(r.amount), 0) : (editingInvoice?.amountPaid ?? 0)
    const amountRemaining = formTotalAfterDiscount - amountPaid
    const status: SaleStatus = amountPaid >= formTotalAfterDiscount - 0.001 ? 'paid' : amountPaid <= 0.001 ? 'full_debt' : 'partial_debt'
    const warrantyJson = form.warrantyUnit
      ? JSON.stringify({ value: Math.max(1, parseInt(form.warrantyValue) || 1), unit: form.warrantyUnit })
      : ''
    const saleData: SaleRecord = {
      id: editingInvoice?.id ?? 0,
      customerName: form.customerName, phone, saleDate: form.saleDate,
      warranty: warrantyJson, notes: form.generalNotes,
      discountType: form.discountType || null,
      discountValue: form.discountType ? discountValueNum : 0,
      total: formTotalAfterDiscount,
      amountPaid, amountRemaining, status,
      items: newItems, payments: editingInvoice?.payments ?? [],
    }
    try {
      if (editingInvoice) {
        // الخصم يُمرَّر مع البنود الجديدة في updateItems (يُطبَّقان ذرّياً معاً)؛
        // undefined هنا = لا تلمس الخصم في قناة update كي لا يُقيَّم مقابل البنود القديمة
        await dbService.directSale.update({ ...saleData, discountType: undefined, discountValue: undefined })
        await dbService.directSale.updateItems(editingInvoice.id, newItems,
          { type: form.discountType || null, value: form.discountType ? discountValueNum : 0 })
      } else {
        await dbService.directSale.add(saleData, actualPayRows)
      }
      // M10: البيع المباشر يؤثّر على قائمته + فواتير البيع المجمّعة + الديون + الكفالات
      await reload(['directSale', 'salesInvoices', 'debts', 'warranties'])
      if (useDraft && !editingInvoice) localStorage.removeItem(DIRECT_SALE_DRAFT_KEY)
      onSaved()
    } catch (err) {
      showError('تعذّر حفظ فاتورة البيع', err)
    }
  }

  useImperativeHandle(ref, () => ({ save: handleSave }))

  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showItemErr = (id: number, f: keyof FormItemErr) => submitAttempted && itemsErrMap[id]?.[f] ? <span className="mi-err">{itemsErrMap[id][f]}</span> : null
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
          <span>رقم الهاتف</span>
          <input type="text" value={form.phone} onKeyDown={allowPhoneChars}
            onChange={e => setField('phone', e.target.value)} placeholder="اتركه فارغاً إذا غير معروف" />
        </label>
        <label className="mi-field">
          <span>التاريخ</span>
          <input type="date" value={form.saleDate} max={today()} onChange={e => setField('saleDate', e.target.value > today() ? today() : e.target.value)} />
        </label>
        <label className="mi-field">
          <span>الكفالة</span>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <select className="pay-select" value={form.warrantyUnit}
              onChange={e => setField('warrantyUnit', e.target.value)}>
              <option value="">لا كفالة</option>
              {UNIT_OPTIONS_DS.map(([val, label]) => <option key={val} value={val}>{label}</option>)}
            </select>
            {form.warrantyUnit && (
              <input type="number" max={99} value={form.warrantyValue}
                placeholder="1"
                className="mi-td-input mi-td-num" style={{ width: 70 }}
                onChange={e => setField('warrantyValue', e.target.value)} />
            )}
          </div>
        </label>
        <label className="mi-field mi-field-full">
          <span>ملاحظات عامة</span>
          <textarea rows={3} value={form.generalNotes} onChange={e => setField('generalNotes', e.target.value)} placeholder="أي ملاحظات إضافية..." />
        </label>
      </div>

      <div className="mi-parts-header">
        <h2 className="mi-section-title">البنود</h2>
        <button className="btn btn-secondary" onClick={addItem}>+ إضافة صنف</button>
      </div>
      <div className="mi-parts-table-wrap">
        <table className="mi-parts-table">
          <thead><tr><th>اسم الصنف</th><th>العدد</th><th>سعر الوحدة (₪)</th><th>الإجمالي (₪)</th><th>ملاحظات</th><th></th></tr></thead>
          <tbody>
            {items.map(item => (
              <tr key={item.id}>
                <td>
                  <input type="text" placeholder="اسم الصنف" value={item.name}
                    className={'mi-td-input' + errCls(submitAttempted && !!itemsErrMap[item.id]?.nameErr)}
                    onChange={e => updateItem(item.id, 'name', e.target.value)} />
                  {showItemErr(item.id, 'nameErr')}
                </td>
                <td>
                  <input type="number" min={1} value={item.qty === '' || item.qty === 0 ? '' : item.qty}
                    className={'mi-td-input mi-td-num' + errCls(submitAttempted && !!itemsErrMap[item.id]?.qtyErr)}
                    onChange={e => updateItem(item.id, 'qty', e.target.value === '' ? '' : Math.max(1, parseFloat(e.target.value) || 1))} />
                  {showItemErr(item.id, 'qtyErr')}
                </td>
                <td><input type="number" min={0} value={item.unitPrice === '' || item.unitPrice === 0 ? '' : item.unitPrice} className="mi-td-input mi-td-num" onChange={e => updateItem(item.id, 'unitPrice', e.target.value === '' ? '' : Math.max(0, parseFloat(e.target.value) || 0))} onBlur={(e) => { if (!e.target.value) updateItem(item.id, 'unitPrice', 0) }} /></td>
                <td className="mi-td-center">{fmt(Number(item.qty || 0) * Number(item.unitPrice || 0))} ₪</td>
                <td><input type="text" placeholder="ملاحظة..." value={item.notes} className="mi-td-input" onChange={e => updateItem(item.id, 'notes', e.target.value)} /></td>
                <td className="mi-td-center"><button className="btn btn-danger-sm" disabled={items.length === 1} onClick={() => removeItem(item.id)}>حذف</button></td>
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

      {!editingInvoice && (
        <>
          <div className="pay-section-title" style={{ marginTop: '1.25rem' }}>
            طريقة الدفع <span style={{ fontSize: '0.8rem', color: '#888', fontWeight: 400 }}>(اختياري — المتبقي يُسجَّل ديناً تلقائياً)</span>
          </div>
          {formPayRows.map(row => (
            <div key={row.id} className="pay-row">
              <div className="pay-row-main">
                <select className="pay-select" value={row.method}
                  onChange={e => updateFormPayRow(row.id, { method: e.target.value as PayMethod })}>
                  {(Object.entries(PAY_LABELS) as [Exclude<PayMethod, 'debt'>, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount === 0 || row.amount === ('' as unknown as number) ? '' : row.amount}
                  className="mi-td-input pay-amount"
                  onChange={e => updateFormPayRow(row.id, { amount: e.target.value === '' ? ('' as unknown as number) : Math.max(0, Number(e.target.value)) })}
                  onBlur={e => { if (!e.target.value) updateFormPayRow(row.id, { amount: 0 }) }} />
                <button className="btn btn-danger-sm" disabled={formPayRows.length === 1}
                  onClick={() => removeFormPayRow(row.id)}>حذف</button>
              </div>
              {row.method === 'check' && (
                <div className="pay-row-extra">
                  <label className="mi-field"><span>رقم الشيك</span><input type="text" className="mi-td-input" value={row.checkNumber} onChange={e => updateFormPayRow(row.id, { checkNumber: e.target.value })} /></label>
                  <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updateFormPayRow(row.id, { bankName: e.target.value })} /></label>
                  <label className="mi-field"><span>تاريخ الإصدار</span><input type="date" className="mi-td-input" value={row.issueDate} max={today()} onChange={e => updateFormPayRow(row.id, { issueDate: e.target.value > today() ? today() : e.target.value })} /></label>
                  <label className="mi-field"><span>تاريخ الصرف</span><input type="date" className="mi-td-input" value={row.clearDate} onChange={e => updateFormPayRow(row.id, { clearDate: e.target.value })} /></label>
                </div>
              )}
              {row.method === 'visa' && (
                <div className="pay-row-extra">
                  <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updateFormPayRow(row.id, { bankName: e.target.value })} /></label>
                  <label className="mi-field"><span>رقم الحركة</span><input type="text" className="mi-td-input" value={row.transactionNum} onChange={e => updateFormPayRow(row.id, { transactionNum: e.target.value })} /></label>
                </div>
              )}
            </div>
          ))}
          <button className="btn btn-secondary pay-add-btn" onClick={addFormPayRow}>+ إضافة طريقة دفع</button>
          {submitAttempted && formPayExceedsErr && (
            <div className="mi-err" style={{ marginTop: '0.5rem', fontWeight: 600 }}>{formPayExceedsErr}</div>
          )}
          <div className="pay-summary" style={{ marginTop: '0.75rem' }}>
            <div className="pay-summary-row">
              <span>إجمالي الفاتورة {discountAmount > 0 ? '(بعد الخصم)' : ''}</span>
              <strong>{fmt(formTotalAfterDiscount)} ₪</strong>
            </div>
            <div className="pay-summary-row">
              <span>إجمالي المدفوع</span>
              <strong className="pay-paid">
                {fmt(formPayRows.reduce((s, r) => s + Number(r.amount || 0), 0))} ₪
              </strong>
            </div>
            <div className="pay-summary-row pay-summary-last">
              <span>المتبقي (يُسجَّل ديناً تلقائياً)</span>
              <strong className="pay-due">
                {fmt(Math.max(0, formTotalAfterDiscount - formPayRows.reduce((s, r) => s + Number(r.amount || 0), 0)))} ₪
              </strong>
            </div>
          </div>
        </>
      )}
    </>
  )
})

export default DirectSaleForm
