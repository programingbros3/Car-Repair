import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { Supplier, SupplierRecord } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   Local-only types (form state)
════════════════════════════════════════ */
type PayMethod = 'cash' | 'check' | 'visa' | 'debt'

type PaymentRow = {
  id: number; method: PayMethod; amount: number
  checkNumber: string; issueDate: string; clearDate: string
  bankName: string; transactionNum: string
}

type FormPart    = { id: number; name: string; qty: number; unitPrice: number; notes: string }
type FormPartErr = { nameErr: string; qtyErr: string }

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const DRAFT_KEY = 'garage-sup-draft'
const today     = () => new Date().toISOString().slice(0, 10)
let nextPartId  = 1
let nextPayId   = 1

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const emptyForm    = () => ({ supplierName: '', phone: '', purchaseDate: today(), generalNotes: '' })
const emptySupForm = () => ({ name: '', phone: '', notes: '' })
const newFormPart  = (): FormPart    => ({ id: nextPartId++, name: '', qty: 1, unitPrice: 0, notes: '' })
const emptyPayRow  = (): PaymentRow  => ({
  id: nextPayId++, method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}
const validatePhone = (v: string) => v.trim() ? '' : 'رقم الهاتف مطلوب'

const PAY_LABELS: Record<Exclude<PayMethod, 'debt'>, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }

const fmt = (n: number) => n.toLocaleString('en-US')

function printSupplierInvoice(
  sup: SupplierRecord,
  payments: Array<{ method: string; amount: number }> = [],
): void {
  const PAY_AR: Record<string, string> = { cash: 'نقداً', cheque: 'شيك', check: 'شيك', visa: 'فيزا', debt: 'دين' }
  const rows = sup.items.map(item => `
    <tr>
      <td>${item.name}</td>
      <td>${item.quantity}</td>
      <td>${fmt(item.unitPrice)} ₪</td>
      <td>${fmt(item.quantity * item.unitPrice)} ₪</td>
      <td>${item.notes || '—'}</td>
    </tr>`).join('')
  const payRows = payments.map(p => `
    <tr>
      <td>${PAY_AR[p.method] || p.method}</td>
      <td class="amount-in">${fmt(p.amount)} ₪</td>
    </tr>`).join('')
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><label>اسم المورد</label><span>${sup.supplierName}</span></div>
      <div class="detail-item"><label>رقم الهاتف</label><span>${sup.phone && sup.phone !== '0000' ? sup.phone : 'غير معروف'}</span></div>
      <div class="detail-item"><label>تاريخ الشراء</label><span>${sup.purchaseDate}</span></div>
      ${sup.notes ? `<div class="detail-item"><label>ملاحظات</label><span>${sup.notes}</span></div>` : ''}
    </div>
    <table>
      <thead><tr><th>القطعة</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>ملاحظات</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="detail-grid" style="margin-top:16px;">
      <div class="detail-item"><label>الإجمالي</label><span>${fmt(sup.total)} ₪</span></div>
      <div class="detail-item"><label>المدفوع</label><span class="amount-in">${fmt(sup.amountPaid)} ₪</span></div>
      <div class="detail-item"><label>المتبقي</label><span class="amount-out">${fmt(sup.amountRemaining)} ₪</span></div>
    </div>
    ${payRows ? `
    <table style="margin-top:12px;">
      <thead><tr><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
      <tbody>${payRows}</tbody>
    </table>` : ''}`
  printPdf('فاتورة مورد', body)
}

/* ════════════════════════════════════════
   LinkedOpsSection
════════════════════════════════════════ */
function LinkedOpsSection({ phone, source, id }: { phone: string; source: string; id: number }) {
  const { getLinkedOps } = useGarage()
  const ops = useMemo(() => getLinkedOps(phone, source, id), [phone, source, id, getLinkedOps])
  if (!ops.length) return null
  return (
    <div className="linked-ops-section">
      <div className="linked-ops-title">عمليات سابقة لهذا المورد</div>
      <div className="mi-table-wrap">
        <table className="mi-table">
          <thead>
            <tr><th>التاريخ</th><th>النوع</th><th>الاسم</th><th>الإجمالي ₪</th><th>الحالة</th></tr>
          </thead>
          <tbody>
            {ops.map(op => (
              <tr key={`${op.source}-${op.id}`}>
                <td>{op.date}</td>
                <td><span className={op.sourceCls}>{op.sourceLabel}</span></td>
                <td>{op.name}</td>
                <td className="mi-amount">{fmt(op.total)} ₪</td>
                <td>{op.statusLabel && <span className={op.statusCls}>{op.statusLabel}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Suppliers() {
  const { suppliers, supplierInvoices, reload } = useGarage()

  /* ── Suppliers list form ── */
  const [showSupForm,  setShowSupForm]  = useState(false)
  const [editingSup,   setEditingSup]   = useState<Supplier | null>(null)
  const [supForm,      setSupForm]      = useState(emptySupForm)
  const [supSubmitted, setSupSubmitted] = useState(false)
  const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null)

  /* invoice form */
  const [showForm, setShowForm]               = useState(false)
  const [editing,  setEditing]                = useState<SupplierRecord | null>(null)
  const [form,     setForm]                   = useState(emptyForm)
  const [parts,    setParts]                  = useState<FormPart[]>([newFormPart()])
  const [paymentRows, setPaymentRows]         = useState<PaymentRow[]>([emptyPayRow()])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* filters */
  const [search,      setSearch]      = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [amtMin,      setAmtMin]      = useState('')
  const [amtMax,      setAmtMax]      = useState('')

  /* modals */
  const [detailsSup, setDetailsSup] = useState<SupplierRecord | null>(null)
  const [warnSup,    setWarnSup]    = useState<SupplierRecord | null>(null)
  const [deleteSup,  setDeleteSup]  = useState<SupplierRecord | null>(null)

  /* payment modal */
  const [paySup,       setPaySup]       = useState<SupplierRecord | null>(null)
  const [payDate,      setPayDate]      = useState(today())
  const [payNotes,     setPayNotes]     = useState('')
  const [payRows,      setPayRows]      = useState<PaymentRow[]>([])
  const [paySubmitted, setPaySubmitted] = useState(false)

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => supplierInvoices.map((sup, i) => ({ _idx: i, supplierName: normalizeAr(sup.supplierName) })),
    [supplierInvoices],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['supplierName'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  /* ── Filtered invoice list ── */
  const filteredSuppliers = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => supplierInvoices[r.item._idx])
      : [...supplierInvoices]
    if (phoneSearch) result = result.filter(s => s.phone.includes(phoneSearch))
    if (amtMin)      result = result.filter(s => s.total >= Number(amtMin))
    if (amtMax)      result = result.filter(s => s.total <= Number(amtMax))
    return result
  }, [supplierInvoices, search, phoneSearch, amtMin, amtMax, fuse])

  const hasFilters   = !!search.trim() || !!phoneSearch || !!amtMin || !!amtMax
  const clearFilters = () => { setSearch(''); setPhoneSearch(''); setAmtMin(''); setAmtMax('') }

  /* ── Draft restore / persist ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const { form: f, parts: p } = JSON.parse(raw) as { form: typeof form; parts: FormPart[] }
      setShowForm(true); setForm(f); setParts(p)
      nextPartId = Math.max(0, ...p.map(x => x.id)) + 1
    } catch { localStorage.removeItem(DRAFT_KEY) }
  }, [])

  useEffect(() => {
    if (showForm && !editing) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, parts }))
    }
  }, [showForm, editing, form, parts])

  /* ════════════════════════════════════════
     Suppliers list helpers
  ════════════════════════════════════════ */
  const setSupField = (field: string, value: string) => setSupForm(prev => ({ ...prev, [field]: value }))

  const openSupEdit = (sup: Supplier) => {
    setEditingSup(sup)
    setSupForm({ name: sup.name, phone: sup.phone, notes: sup.notes })
    setSupSubmitted(false)
    setShowSupForm(true)
  }

  const supNameErr  = supForm.name.trim() ? '' : 'اسم المورد مطلوب'
  const supPhoneErr = supForm.phone.trim() ? '' : 'رقم الهاتف مطلوب'
  const supHasError = !!supNameErr || !!supPhoneErr

  const handleSupSave = async () => {
    setSupSubmitted(true)
    if (supHasError) return
    const supData: Supplier = {
      id: editingSup?.id ?? 0, name: supForm.name, phone: supForm.phone, notes: supForm.notes,
    }
    try {
      if (editingSup) await dbService.suppliers.update(supData)
      else            await dbService.suppliers.add(supData)
      await reload()
      clearSupForm()
    } catch (err) {
      showError('تعذّر حفظ المورد', err)
    }
  }

  const clearSupForm = () => {
    setShowSupForm(false); setSupSubmitted(false); setSupForm(emptySupForm()); setEditingSup(null)
  }

  const showSupErr = (msg: string) => supSubmitted && msg ? <span className="mi-err">{msg}</span> : null

  /* ════════════════════════════════════════
     Invoice form helpers
  ════════════════════════════════════════ */
  const setField   = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))
  const addPart    = () => setParts(prev => [...prev, newFormPart()])
  const removePart = (id: number) => setParts(prev => prev.filter(p => p.id !== id))
  const updatePart = (id: number, field: keyof FormPart, value: string | number) =>
    setParts(prev => prev.map(p => p.id !== id ? p : { ...p, [field]: value }))

  /* ── Select supplier (auto-fill phone) ── */
  const selectSupplier = (name: string) => {
    const found = suppliers.find(s => s.name === name)
    setForm(prev => ({ ...prev, supplierName: name, phone: found?.phone ?? '' }))
  }

  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  /* ── Open edit form ── */
  const doOpenEdit = (sup: SupplierRecord) => {
    localStorage.removeItem(DRAFT_KEY)
    setEditing(sup)
    setForm({ supplierName: sup.supplierName, phone: sup.phone, purchaseDate: sup.purchaseDate, generalNotes: sup.notes })
    const editParts: FormPart[] = sup.items.length > 0
      ? sup.items.map(item => ({ id: nextPartId++, name: item.name, qty: item.quantity, unitPrice: item.unitPrice, notes: item.notes }))
      : [newFormPart()]
    setParts(editParts)
    setPaymentRows([emptyPayRow()])
    setSubmitAttempted(false)
    setShowForm(true)
  }

  /* ── Edit button click: warn if paid (amountRemaining === 0) ── */
  const handleEditClick = (sup: SupplierRecord, e: React.MouseEvent) => {
    e.stopPropagation()
    if (sup.amountRemaining === 0) {
      setWarnSup(sup)
    } else {
      doOpenEdit(sup)
    }
  }

  /* ── Validation ── */
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

  /* ── Save ── */
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
      clearForm()
    } catch (err) {
      showError('تعذّر حفظ فاتورة المورد', err)
    }
  }

  const clearForm = () => {
    localStorage.removeItem(DRAFT_KEY)
    setShowForm(false); setSubmitAttempted(false)
    setForm(emptyForm()); setParts([newFormPart()]); setPaymentRows([emptyPayRow()]); setEditing(null)
  }

  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showPartErr = (id: number, f: keyof FormPartErr) =>
    submitAttempted && partsErrMap[id]?.[f] ? <span className="mi-err">{partsErrMap[id][f]}</span> : null
  const errCls = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ── Payment modal ── */
  const openPay = (sup: SupplierRecord) => {
    setPaySup(sup); setPayDate(today()); setPayNotes('')
    setPayRows([emptyPayRow()]); setPaySubmitted(false)
  }
  const addPayRow    = () => setPayRows(prev => [...prev, emptyPayRow()])
  const removePayRow = (id: number) => setPayRows(prev => prev.filter(r => r.id !== id))
  const updatePayRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPayRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  const thisPaymentTotal = payRows.reduce((s, r) => s + (r.amount || 0), 0)
  const remainingAfter   = (paySup?.amountRemaining ?? 0) - thisPaymentTotal
  const payExceedsDebt   = thisPaymentTotal > (paySup?.amountRemaining ?? 0)

  const handlePayConfirm = async () => {
    setPaySubmitted(true)
    if (thisPaymentTotal <= 0 || payExceedsDebt || !paySup) return
    const rows = payRows.filter(r => r.amount > 0)
    try {
      await dbService.supplierInvoice.addDebtPayment(paySup.id, rows, payDate)
      await reload()
      setPaySup(null)
    } catch (err) {
      showError('تعذّر تسجيل دفعة المورد', err)
    }
  }

  const handlePrintSup = async (sup: SupplierRecord) => {
    try {
      const [detail, payments] = await Promise.all([
        dbService.supplierInvoice.getOne(sup.id),
        dbService.invoicePayments.getSupplier(sup.id),
      ])
      printSupplierInvoice(detail || sup, payments)
    } catch (err) {
      showError('تعذّر طباعة الفاتورة', err)
    }
  }

  /* Shared supplier-list form body (inline for add, modal for edit) */
  const supFormBody = (
    <div className="mi-form-grid">
      <label className="mi-field">
        <span>اسم المورد <span className="mi-required">*</span></span>
        <input type="text" value={supForm.name}
          onChange={e => setSupField('name', e.target.value)} placeholder="شركة أو شخص"
          className={errCls(supSubmitted && !!supNameErr)} />
        {showSupErr(supNameErr)}
      </label>
      <label className="mi-field">
        <span>رقم الهاتف <span className="mi-required">*</span></span>
        <input type="text" value={supForm.phone} onKeyDown={allowPhoneChars}
          onChange={e => setSupField('phone', e.target.value)} placeholder="05XXXXXXXX"
          className={errCls(supSubmitted && !!supPhoneErr)} />
        {showSupErr(supPhoneErr)}
      </label>
      <label className="mi-field mi-field-full">
        <span>ملاحظات</span>
        <textarea rows={3} value={supForm.notes}
          onChange={e => setSupField('notes', e.target.value)}
          placeholder="أي ملاحظات إضافية..." />
      </label>
    </div>
  )

  /* Shared invoice form body (used inline for add, inside modal for edit) */
  const formBody = (
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
            onChange={e => setField('purchaseDate', e.target.value)} />
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

      {/* Payment methods */}
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
                  onChange={e => updatePaymentRow(row.id, { issueDate: e.target.value })} /></label>
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

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">الموردون</h1>
      </div>

      {/* ════ Supplier Add Form (inline) ════ */}
      {showSupForm && !editingSup && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">بيانات المورد</h2>
          {supFormBody}
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSupSave}>حفظ المورد</button>
            <button className="btn btn-ghost" onClick={clearSupForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Supplier Edit Modal ════ */}
      {showSupForm && editingSup && (
        <div className="mi-modal-overlay" onClick={clearSupForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editingSup.name}</h3>
              <button className="mi-modal-close" onClick={clearSupForm}>✕</button>
            </div>
            <div className="mi-modal-body">{supFormBody}</div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handleSupSave}>حفظ التعديلات</button>
              <button className="btn btn-ghost" onClick={clearSupForm}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Suppliers List ════ */}
      <div className="mi-card">
        <div className="mi-parts-header">
          <h2 className="mi-section-title">قائمة الموردين</h2>
          {!showSupForm && (
            <button className="btn btn-primary" onClick={() => { setEditingSup(null); setShowSupForm(true) }}>
              + إضافة مورد جديد
            </button>
          )}
        </div>
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr><th>الاسم</th><th>رقم الهاتف</th><th>ملاحظات</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              {suppliers.length === 0 ? (
                <tr><td colSpan={4} className="mi-empty-row">لا يوجد موردون</td></tr>
              ) : suppliers.map((sup, i) => (
                <tr key={sup.id} className={i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'}>
                  <td>{sup.name}</td>
                  <td>
                    {sup.phone
                      ? <span className="mi-phone-highlight">{sup.phone}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>
                    }
                  </td>
                  <td>{sup.notes || '—'}</td>
                  <td>
                    <div className="mi-actions">
                      <button className="btn btn-sm-outline" onClick={() => openSupEdit(sup)}>تعديل</button>
                      <button className="btn btn-danger-sm" onClick={() => setDeleteSupplier(sup)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Add Invoice Form (inline) ════ */}
      {showForm && !editing && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">بيانات الفاتورة</h2>
          {formBody}
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSave}>حفظ الفاتورة</button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Edit Invoice Modal ════ */}
      {showForm && editing && (
        <div className="mi-modal-overlay" onClick={clearForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editing.supplierName}</h3>
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

      {/* ════ Supplier invoices list ════ */}
      <div className="mi-card">
        <div className="mi-parts-header">
          <h2 className="mi-section-title">فواتير الموردين</h2>
          {!showForm && (
            <button className="btn btn-primary" onClick={() => { setEditing(null); setShowForm(true) }}>
              + إضافة فاتورة شراء
            </button>
          )}
        </div>

        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap">
            <input type="text" className="mi-search-input" placeholder="🔍  بحث باسم المورد..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="📞  بحث برقم الهاتف..."
              value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} />
          </div>
          <div className="mi-date-range">
            <div className="mi-filter-field">
              <span className="mi-filter-label">من مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input"
                value={amtMin} onChange={e => setAmtMin(e.target.value)} placeholder="0" />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input"
                value={amtMax} onChange={e => setAmtMax(e.target.value)} placeholder="∞" />
            </div>
          </div>
          {hasFilters && (
            <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلاتر</button>
          )}
        </div>

        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>اسم المورد</th>
                <th>رقم الهاتف</th>
                <th>تاريخ الشراء</th>
                <th>عدد البنود</th>
                <th>الإجمالي ₪</th>
                <th>المدفوع ₪</th>
                <th>المتبقي ₪</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr><td colSpan={8} className="mi-empty-row">لا توجد فواتير تطابق البحث</td></tr>
              ) : filteredSuppliers.map((sup, i) => (
                <tr key={sup.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsSup(sup)}>
                  <td>{sup.supplierName}</td>
                  <td>
                    {sup.phone && sup.phone !== '0000'
                      ? <span className="mi-phone-highlight">{sup.phone}</span>
                      : sup.phone === '0000'
                        ? <span className="mi-badge-gray">غير معروف</span>
                        : <span style={{ color: '#9ca3af' }}>—</span>
                    }
                  </td>
                  <td>{sup.purchaseDate}</td>
                  <td className="mi-td-center">{sup.items.length}</td>
                  <td className="mi-amount">{fmt(sup.total)} ₪</td>
                  <td className="pd-paid">{fmt(sup.amountPaid)} ₪</td>
                  <td className={sup.amountRemaining > 0 ? 'pd-remaining' : 'mi-amount'}>{fmt(sup.amountRemaining)} ₪</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={e => handleEditClick(sup, e)}>تعديل</button>
                      {sup.amountRemaining > 0 && (
                        <button className="btn btn-sm-green" onClick={() => openPay(sup)}>إضافة دفعة</button>
                      )}
                      <button className="btn btn-danger-sm" onClick={() => setDeleteSup(sup)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Invoice Details Modal ════ */}
      {detailsSup && (
        <div className="mi-modal-overlay" onClick={() => setDetailsSup(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل فاتورة المورد</h3>
              <button className="mi-modal-close" onClick={() => setDetailsSup(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اسم المورد</span>
                  <strong>{detailsSup.supplierName}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsSup.phone && detailsSup.phone !== '0000'
                    ? <span className="mi-phone-highlight">{detailsSup.phone}</span>
                    : detailsSup.phone === '0000'
                      ? <span className="mi-badge-gray">غير معروف</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>
                  }
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">تاريخ الشراء</span>
                  <span>{detailsSup.purchaseDate}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(detailsSup.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع</span>
                  <span className="pd-paid">{fmt(detailsSup.amountPaid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className={detailsSup.amountRemaining > 0 ? 'pd-remaining' : 'mi-amount'}>
                    {fmt(detailsSup.amountRemaining)} ₪
                  </span>
                </div>
                {detailsSup.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsSup.notes}</span>
                  </div>
                )}
              </div>

              <h4 className="mi-modal-subtitle">بنود الشراء</h4>
              <div className="mi-parts-table-wrap">
                <table className="mi-parts-table">
                  <thead>
                    <tr><th>القطعة</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>ملاحظات</th></tr>
                  </thead>
                  <tbody>
                    {detailsSup.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td className="mi-td-center">{item.quantity}</td>
                        <td className="mi-td-center">{fmt(item.unitPrice)} ₪</td>
                        <td className="mi-td-center">{fmt(item.quantity * item.unitPrice)} ₪</td>
                        <td>{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                الإجمالي الكلي: <strong>{fmt(detailsSup.total)} ₪</strong>
              </div>

              {detailsSup.phone && detailsSup.phone !== '' && (
                <LinkedOpsSection phone={detailsSup.phone} source="supplier" id={detailsSup.id} />
              )}
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => handlePrintSup(detailsSup)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsSup(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Warning Modal (before editing paid invoice) ════ */}
      {warnSup && (
        <div className="mi-modal-overlay" onClick={() => setWarnSup(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header mi-modal-warn-header">
              <h3>⚠️ تعديل فاتورة مدفوعة</h3>
              <button className="mi-modal-close" onClick={() => setWarnSup(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-warn-banner">
                هذه الفاتورة مدفوعة بالكامل. هل أنت متأكد من رغبتك في التعديل؟
              </div>
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اسم المورد</span>
                  <strong>{warnSup.supplierName}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">تاريخ الشراء</span>
                  <span>{warnSup.purchaseDate}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(warnSup.total)} ₪</span>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-danger" onClick={() => { doOpenEdit(warnSup); setWarnSup(null) }}>تأكيد التعديل</button>
              <button className="btn btn-ghost" onClick={() => setWarnSup(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Debt Payment Modal ════ */}
      {paySup && (
        <div className="mi-modal-overlay" onClick={() => setPaySup(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>إضافة دفعة — {paySup.supplierName}</h3>
              <button className="mi-modal-close" onClick={() => setPaySup(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid pd-debt-summary">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">إجمالي الفاتورة</span>
                  <span className="mi-amount">{fmt(paySup.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع حتى الآن</span>
                  <span className="pd-paid">{fmt(paySup.amountPaid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className="pd-remaining">{fmt(paySup.amountRemaining)} ₪</span>
                </div>
              </div>

              <div className="mi-form-grid mi-delivery-grid" style={{ marginBottom: '1.25rem' }}>
                <label className="mi-field">
                  <span>تاريخ الدفعة</span>
                  <input type="date" value={payDate} max={today()} onChange={e => setPayDate(e.target.value)} />
                </label>
                <label className="mi-field">
                  <span>ملاحظات</span>
                  <input type="text" value={payNotes} placeholder="ملاحظة اختيارية..."
                    onChange={e => setPayNotes(e.target.value)} />
                </label>
              </div>

              <div className="pay-section-title">طريقة الدفع</div>
              {payRows.map(row => (
                <div key={row.id} className="pay-row">
                  <div className="pay-row-main">
                    <select className="pay-select" value={row.method}
                      onChange={e => updatePayRow(row.id, { method: e.target.value as PayMethod })}>
                      {(['cash', 'check', 'visa'] as Exclude<PayMethod, 'debt'>[]).map(val => (
                        <option key={val} value={val}>{PAY_LABELS[val]}</option>
                      ))}
                    </select>
                    <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount || ''}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePayRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                      onBlur={(e) => { if (!e.target.value) updatePayRow(row.id, { amount: 0 }) }} />
                    <button className="btn btn-danger-sm" disabled={payRows.length === 1}
                      onClick={() => removePayRow(row.id)}>حذف</button>
                  </div>
                  {row.method === 'check' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>رقم الشيك</span>
                        <input type="text" className="mi-td-input" value={row.checkNumber}
                          onChange={e => updatePayRow(row.id, { checkNumber: e.target.value })} /></label>
                      <label className="mi-field"><span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePayRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الإصدار</span>
                        <input type="date" className="mi-td-input" value={row.issueDate} max={today()}
                          onChange={e => updatePayRow(row.id, { issueDate: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الصرف</span>
                        <input type="date" className="mi-td-input" value={row.clearDate}
                          onChange={e => updatePayRow(row.id, { clearDate: e.target.value })} /></label>
                    </div>
                  )}
                  {row.method === 'visa' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>اسم البنك</span>
                        <input type="text" className="mi-td-input" value={row.bankName}
                          onChange={e => updatePayRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>رقم الحركة</span>
                        <input type="text" className="mi-td-input" value={row.transactionNum}
                          onChange={e => updatePayRow(row.id, { transactionNum: e.target.value })} /></label>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-secondary pay-add-btn" onClick={addPayRow}>+ إضافة طريقة دفع</button>

              {paySubmitted && thisPaymentTotal <= 0 && (
                <p className="pd-pay-error">يجب إدخال مبلغ الدفعة</p>
              )}
              {payExceedsDebt && (
                <p className="pd-pay-error">مجموع الدفعة ({fmt(thisPaymentTotal)} ₪) يتجاوز المتبقي ({fmt(paySup.amountRemaining)} ₪)</p>
              )}

              <div className="pay-summary">
                <div className="pay-summary-row">
                  <span>إجمالي هذه الدفعة</span>
                  <strong className="pay-paid">{fmt(thisPaymentTotal)} ₪</strong>
                </div>
                <div className="pay-summary-row pay-summary-last">
                  <span>المتبقي بعدها</span>
                  <strong className={remainingAfter <= 0 ? 'pay-ok' : payExceedsDebt ? 'pay-over' : 'pay-due'}>
                    {fmt(Math.max(0, remainingAfter))} ₪
                  </strong>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handlePayConfirm} disabled={payExceedsDebt}>
                تأكيد الدفعة
              </button>
              <button className="btn btn-ghost" onClick={() => setPaySup(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Delete Supplier Confirm ════ */}
      {deleteSupplier && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف المورد "${deleteSupplier.name}"؟`}
          onConfirm={async () => {
            try { await dbService.suppliers.delete(deleteSupplier.id); await reload(); setDeleteSupplier(null) }
            catch (err) { showError('تعذّر حذف المورد', err) }
          }}
          onCancel={() => setDeleteSupplier(null)}
        />
      )}

      {/* ════ Delete Invoice Confirm ════ */}
      {deleteSup && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف فاتورة المورد "${deleteSup.supplierName}"؟`}
          onConfirm={async () => {
            try { await dbService.supplierInvoice.delete(deleteSup.id); await reload(); setDeleteSup(null) }
            catch (err) { showError('تعذّر حذف فاتورة المورد', err) }
          }}
          onCancel={() => setDeleteSup(null)}
        />
      )}
    </div>
  )
}
