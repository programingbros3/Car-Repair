import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage, SaleRecord, SaleItem, SaleStatus, PayMethod, PaymentRow, WarrantyPeriodUnit, DiscountType } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   Local Types
════════════════════════════════════════ */
type FormItem    = { id: number; name: string; qty: number; unitPrice: number; notes: string }
type FormItemErr = { nameErr: string; qtyErr: string }

/* ════════════════════════════════════════
   Helpers
════════════════════════════════════════ */
const DRAFT_KEY = 'garage-ds-draft-v2'
const today     = () => new Date().toISOString().slice(0, 10)
let nextItemId  = 100
let nextPayId   = 100

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const UNIT_OPTIONS_DS: [WarrantyPeriodUnit, string][] = [['week', 'أسبوع'], ['month', 'شهر'], ['year', 'سنة']]
const UNIT_AR_DS: Record<string, string> = { week: 'أسبوع', month: 'شهر', year: 'سنة' }

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

function warrantyLabelDS(raw: string | null | undefined): string {
  if (!raw) return '—'
  const w = parseWarrantyJsonDS(raw)
  if (w) return `${w.value} ${UNIT_AR_DS[w.unit] ?? w.unit}`
  return raw || '—'
}

/* تفكيك خصم الفاتورة للعرض (مودال التفاصيل/الإيصال): total مخزَّن بعد الخصم.
   itemsSubtotal يُمرَّر عند توفّر البنود (getOne)، وإلا يُشتق المجموع قبل الخصم
   من total والخصم (صفوف الجدول من GarageContext لا تحمل البنود). */
type DiscountBreakdown = { subtotal: number | null; label: string }
function discountBreakdownDS(
  total: number, type: DiscountType | null | undefined, value: number | undefined,
  itemsSubtotal: number | null,
): DiscountBreakdown | null {
  const v = value ?? 0
  if (!type || v <= 0) return null
  const round2 = (n: number) => Math.round(n * 100) / 100
  const fmtN = (n: number) => n.toLocaleString('en-US')
  if (type === 'fixed') {
    return { subtotal: round2(itemsSubtotal ?? total + v), label: `${fmtN(v)} ₪` }
  }
  const subtotal = itemsSubtotal ?? (v < 100 ? (total * 100) / (100 - v) : null)
  const amount = subtotal != null ? round2(subtotal - total) : null
  return {
    subtotal: subtotal != null ? round2(subtotal) : null,
    label: `${v}%${amount != null ? ` (${fmtN(amount)} ₪)` : ''}`,
  }
}

const emptyForm = () => ({
  customerName: '', phone: '', saleDate: today(), warrantyValue: '1', warrantyUnit: '' as WarrantyPeriodUnit | '', generalNotes: '',
  discountType: '' as '' | DiscountType, discountValue: '',
})

const newFormItem  = (): FormItem    => ({ id: nextItemId++, name: '', qty: 1, unitPrice: 0, notes: '' })
const emptyPayRow  = (): PaymentRow  => ({ id: nextPayId++, method: 'cash', amount: 0, checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '' })

const blockDigits     = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault() }
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault() }
const validateName    = (v: string) => v.trim() ? '' : 'اسم الزبون مطلوب'

const PAY_LABELS:     Record<Exclude<PayMethod, 'debt'>, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }
const ALL_PAY_LABELS: Record<PayMethod, string>                  = { cash: 'كاش', check: 'شيك', visa: 'فيزا', debt: 'دين' }
const STATUS_LABELS: Record<SaleStatus, string> = { paid: 'مدفوع', partial_debt: 'دين جزئي', full_debt: 'دين كامل' }
const STATUS_CLS:    Record<SaleStatus, string> = { paid: 'mi-badge-green', partial_debt: 'mi-badge-yellow', full_debt: 'mi-badge-red' }

/* ════════════════════════════════════════
   Linked Ops Mini Table
════════════════════════════════════════ */
function LinkedOpsSection({ phone, id }: { phone: string; id: number }) {
  const { getLinkedOps } = useGarage()
  const ops = useMemo(() => getLinkedOps(phone, 'direct_sale', id), [phone, id, getLinkedOps])
  if (!ops.length) return null
  const fmt = (n: number) => n.toLocaleString('en-US')
  return (
    <div className="linked-ops-section">
      <h4 className="linked-ops-title">عمليات سابقة لهذا الزبون ({ops.length})</h4>
      <div className="mi-parts-table-wrap">
        <table className="mi-parts-table">
          <thead><tr><th>التاريخ</th><th>نوع العملية</th><th>الاسم / الوصف</th><th>الإجمالي</th><th>الحالة</th></tr></thead>
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
export default function DirectSales() {
  const { directSales: invoices, reload } = useGarage()

  /* form */
  const [showForm, setShowForm]               = useState(false)
  const [editingInvoice, setEditingInvoice]   = useState<SaleRecord | null>(null)
  const [form, setForm]                       = useState(emptyForm)
  const [items, setItems]                     = useState<FormItem[]>([newFormItem()])
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* filters */
  const [search,      setSearch]      = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [amtMin,      setAmtMin]      = useState('')
  const [amtMax,      setAmtMax]      = useState('')

  /* modals */
  const [detailsInvoice, setDetailsInvoice] = useState<SaleRecord | null>(null)
  const [payInvoice,     setPayInvoice]     = useState<SaleRecord | null>(null)
  const [paymentRows,    setPaymentRows]    = useState<PaymentRow[]>([])
  const [payDate,        setPayDate]        = useState(today())
  const [payNotes,       setPayNotes]       = useState('')
  const [deleteInvoice,  setDeleteInvoice]  = useState<SaleRecord | null>(null)
  const [warnInv,        setWarnInv]        = useState<SaleRecord | null>(null)
  const [formPayRows,    setFormPayRows]    = useState<PaymentRow[]>([emptyPayRow()])

  /* Draft */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const { form: f, items: it } = JSON.parse(raw) as { form: typeof form; items: FormItem[] }
      setShowForm(true); setForm(f); setItems(it)
      nextItemId = Math.max(100, ...it.map(x => x.id)) + 1
    } catch { localStorage.removeItem(DRAFT_KEY) }
  }, [])

  useEffect(() => {
    if (showForm && !editingInvoice) localStorage.setItem(DRAFT_KEY, JSON.stringify({ form, items }))
  }, [showForm, editingInvoice, form, items])

  /* Fuse */
  const fuseItems = useMemo(() => invoices.map((inv, i) => ({ _idx: i, customerName: normalizeAr(inv.customerName), invoiceNumber: normalizeAr(inv.invoiceNumber ?? '') })), [invoices])
  const fuse      = useMemo(() => new Fuse(fuseItems, { keys: ['customerName', 'invoiceNumber'], threshold: 0.4, ignoreLocation: true }), [fuseItems])

  const filteredInvoices = useMemo(() => {
    const q = search.trim()
    let r = q ? fuse.search(normalizeAr(q)).map(x => invoices[x.item._idx]) : [...invoices]
    if (phoneSearch) r = r.filter(inv => inv.phone.includes(phoneSearch))
    if (amtMin)      r = r.filter(inv => inv.total >= Number(amtMin))
    if (amtMax)      r = r.filter(inv => inv.total <= Number(amtMax))
    return r
  }, [invoices, search, phoneSearch, amtMin, amtMax, fuse])

  const hasFilters   = !!(search.trim() || phoneSearch || amtMin || amtMax)
  const clearFilters = () => { setSearch(''); setPhoneSearch(''); setAmtMin(''); setAmtMax('') }

  /* Form helpers */
  const setField   = (f: string, v: string) => setForm(prev => ({ ...prev, [f]: v }))
  const addItem    = () => setItems(prev => [...prev, newFormItem()])
  const removeItem = (id: number) => setItems(prev => prev.filter(it => it.id !== id))
  const updateItem = (id: number, field: keyof FormItem, value: string | number) =>
    setItems(prev => prev.map(it => it.id !== id ? it : { ...it, [field]: value }))

  const doOpenEdit = async (inv: SaleRecord) => {
    localStorage.removeItem(DRAFT_KEY)
    try {
      const full = await dbService.directSale.getOne(inv.id)
      const record = full ?? inv
      setEditingInvoice(record)
      const wParsed = parseWarrantyJsonDS(record.warranty)
      setForm({ customerName: record.customerName, phone: record.phone === '0000' ? '' : record.phone,
        saleDate: record.saleDate,
        warrantyValue: wParsed ? String(wParsed.value) : '1',
        warrantyUnit: wParsed ? wParsed.unit : '' as WarrantyPeriodUnit | '',
        generalNotes: record.notes,
        discountType: record.discountType ?? '',
        discountValue: record.discountType ? String(record.discountValue ?? 0) : '' })
      const editItems: FormItem[] = record.items.length > 0
        ? record.items.map(it => ({ id: nextItemId++, name: it.name, qty: it.quantity, unitPrice: it.unitPrice, notes: it.notes }))
        : [newFormItem()]
      setItems(editItems); setSubmitAttempted(false); setShowForm(true)
    } catch (err) {
      showError('تعذّر تحميل بيانات الفاتورة', err)
    }
  }

  const openEdit = (inv: SaleRecord) => setWarnInv(inv)

  const confirmEditInv = async () => {
    if (!warnInv) return
    const inv = warnInv
    setWarnInv(null)
    await doOpenEdit(inv)
  }

  /* Validation */
  const formTotal = items.reduce((s, it) => s + it.qty * it.unitPrice, 0)
  const nameErr   = validateName(form.customerName)
  const itemsErrMap: Record<number, FormItemErr> = {}
  for (const it of items) itemsErrMap[it.id] = { nameErr: it.name.trim() ? '' : 'اسم الصنف مطلوب', qtyErr: it.qty >= 1 ? '' : 'العدد يجب أن يكون 1 على الأقل' }
  const formPayErr = !editingInvoice && !formPayRows.some(r => r.amount > 0 || r.method === 'debt')
    ? 'يجب تحديد طريقة دفع وإدخال مبلغ'
    : ''

  /* ── خصم الفاتورة + العرض الحي للإجمالي بعد الخصم ── */
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

  const hasErrors = !!nameErr || !!discountErr || Object.values(itemsErrMap).some(e => e.nameErr || e.qtyErr) || !!formPayErr

  const handleSave = async () => {
    setSubmitAttempted(true)
    if (hasErrors) return
    const newItems: SaleItem[] = items.map((it, i) => ({ id: i + 1, name: it.name, quantity: it.qty, unitPrice: it.unitPrice, notes: it.notes }))
    const phone = form.phone.trim() || '0000'
    const isNew = !editingInvoice
    const actualPayRows = isNew ? formPayRows.filter(r => r.method !== 'debt' && r.amount > 0) : []
    const amountPaid    = isNew ? actualPayRows.reduce((s, r) => s + r.amount, 0) : (editingInvoice?.amountPaid ?? 0)
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
      await reload()
      clearForm()
    } catch (err) {
      showError('تعذّر حفظ فاتورة البيع', err)
    }
  }

  const clearForm = () => {
    localStorage.removeItem(DRAFT_KEY); setShowForm(false); setSubmitAttempted(false)
    setForm(emptyForm()); setItems([newFormItem()]); setEditingInvoice(null)
    setFormPayRows([emptyPayRow()])
  }

  /* Payment modal */
  const openPay          = (inv: SaleRecord) => { setPayInvoice(inv); setPaymentRows([emptyPayRow()]); setPayDate(today()); setPayNotes('') }
  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, u: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...u }))

  const addFormPayRow    = () => setFormPayRows(prev => [...prev, emptyPayRow()])
  const removeFormPayRow = (id: number) => setFormPayRows(prev => prev.filter(r => r.id !== id))
  const updateFormPayRow = (id: number, u: Partial<Omit<PaymentRow, 'id'>>) =>
    setFormPayRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...u }))

  const invTotal      = payInvoice?.total ?? 0
  const invPaid       = payInvoice?.amountPaid ?? 0
  const invRemaining  = payInvoice?.amountRemaining ?? 0
  const thisPayTotal  = paymentRows.reduce((s, r) => s + (r.amount || 0), 0)
  const afterRemaining = invRemaining - thisPayTotal
  const payExceeds    = thisPayTotal > invRemaining

  const handlePaySave = async () => {
    if (thisPayTotal <= 0 || payExceeds || !payInvoice) return
    const rows = paymentRows.filter(r => r.amount > 0)
    try {
      await dbService.directSale.addPayment(payInvoice.id, rows, payDate)
      await reload()
      setPayInvoice(null)
    } catch (err) {
      showError('تعذّر تسجيل الدفعة', err)
    }
  }

  /* UI helpers */
  const showErr     = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const showItemErr = (id: number, f: keyof FormItemErr) => submitAttempted && itemsErrMap[id]?.[f] ? <span className="mi-err">{itemsErrMap[id][f]}</span> : null
  const errCls      = (bad: boolean) => bad ? ' mi-input-err' : ''
  const fmt         = (n: number) => n.toLocaleString('en-US')

  const handlePrint = async (inv: SaleRecord) => {
    try {
      const PAY_AR: Record<string, string> = { cash: 'نقداً', cheque: 'شيك', check: 'شيك', visa: 'فيزا', debt: 'دين' }
      const [detail, payments] = await Promise.all([
        dbService.directSale.getOne(inv.id),
        dbService.invoicePayments.get(inv.id, 'direct_sale'),
      ])
      const full = detail || inv
      const rows = full.items.map(item => `
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
          <div class="detail-item"><label>رقم الفاتورة</label><span>${full.invoiceNumber || '—'}</span></div>
          <div class="detail-item"><label>اسم الزبون</label><span>${full.customerName}</span></div>
          <div class="detail-item"><label>رقم الهاتف</label><span>${full.phone && full.phone !== '0000' ? full.phone : 'غير معروف'}</span></div>
          <div class="detail-item"><label>التاريخ</label><span>${full.saleDate}</span></div>
          <div class="detail-item"><label>الكفالة</label><span>${warrantyLabelDS(full.warranty)}</span></div>
          ${full.notes ? `<div class="detail-item"><label>ملاحظات</label><span>${full.notes}</span></div>` : ''}
        </div>
        ${full.items.length > 0 ? `
        <table>
          <thead><tr><th>الصنف</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>ملاحظات</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : ''}
        <div class="detail-grid" style="margin-top:16px;">
          ${(() => {
            const itemsSubtotal = full.items.length
              ? full.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0) : null
            const bd = discountBreakdownDS(full.total, full.discountType, full.discountValue, itemsSubtotal)
            return bd ? `
          <div class="detail-item"><label>المجموع قبل الخصم</label><span>${bd.subtotal != null ? `${fmt(bd.subtotal)} ₪` : '—'}</span></div>
          <div class="detail-item"><label>الخصم</label><span class="amount-out">−${bd.label}</span></div>
          <div class="detail-item"><label>الإجمالي بعد الخصم</label><span>${fmt(full.total)} ₪</span></div>`
            : `
          <div class="detail-item"><label>الإجمالي</label><span>${fmt(full.total)} ₪</span></div>`
          })()}
          <div class="detail-item"><label>المدفوع</label><span class="amount-in">${fmt(full.amountPaid)} ₪</span></div>
          <div class="detail-item"><label>المتبقي</label><span class="amount-out">${fmt(full.amountRemaining)} ₪</span></div>
          <div class="detail-item"><label>الحالة</label><span>${STATUS_LABELS[full.status]}</span></div>
        </div>
        ${payRows ? `
        <table style="margin-top:12px;">
          <thead><tr><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
          <tbody>${payRows}</tbody>
        </table>` : ''}`
      printPdf(`فاتورة بيع مباشر ${full.invoiceNumber || ''}`.trim(), body)
    } catch (err) {
      showError('تعذّر طباعة الفاتورة', err)
    }
  }

  /* Shared form body (used inline for add, inside modal for edit) */
  const formBody = (
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
          <input type="date" value={form.saleDate} max={today()} onChange={e => setField('saleDate', e.target.value)} />
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
              <input type="number" min={1} max={99} value={form.warrantyValue}
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
          <thead><tr><th>اسم الصنف</th><th>العدد</th><th>سعر الوحدة (₪)</th><th>ملاحظات</th><th></th></tr></thead>
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
                  <input type="number" min={1} value={item.qty}
                    className={'mi-td-input mi-td-num' + errCls(submitAttempted && !!itemsErrMap[item.id]?.qtyErr)}
                    onChange={e => updateItem(item.id, 'qty', Math.max(1, Number(e.target.value)))} />
                  {showItemErr(item.id, 'qtyErr')}
                </td>
                <td><input type="number" min={0} value={item.unitPrice || ''} className="mi-td-input mi-td-num" onChange={e => updateItem(item.id, 'unitPrice', Math.max(0, Number(e.target.value)))} onBlur={(e) => { if (!e.target.value) updateItem(item.id, 'unitPrice', 0) }} /></td>
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
            طريقة الدفع <span className="mi-required">*</span>
          </div>
          {formPayRows.map(row => (
            <div key={row.id} className="pay-row">
              <div className="pay-row-main">
                <select className="pay-select" value={row.method}
                  onChange={e => updateFormPayRow(row.id, { method: e.target.value as PayMethod })}>
                  {(Object.entries(ALL_PAY_LABELS) as [PayMethod, string][]).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                {row.method !== 'debt' && (
                  <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount || ''}
                    className="mi-td-input pay-amount"
                    onChange={e => updateFormPayRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                    onBlur={e => { if (!e.target.value) updateFormPayRow(row.id, { amount: 0 }) }} />
                )}
                <button className="btn btn-danger-sm" disabled={formPayRows.length === 1}
                  onClick={() => removeFormPayRow(row.id)}>حذف</button>
              </div>
              {row.method === 'check' && (
                <div className="pay-row-extra">
                  <label className="mi-field"><span>رقم الشيك</span><input type="text" className="mi-td-input" value={row.checkNumber} onChange={e => updateFormPayRow(row.id, { checkNumber: e.target.value })} /></label>
                  <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updateFormPayRow(row.id, { bankName: e.target.value })} /></label>
                  <label className="mi-field"><span>تاريخ الإصدار</span><input type="date" className="mi-td-input" value={row.issueDate} max={today()} onChange={e => updateFormPayRow(row.id, { issueDate: e.target.value })} /></label>
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
          <div className="pay-summary" style={{ marginTop: '0.75rem' }}>
            <div className="pay-summary-row">
              <span>إجمالي الفاتورة {discountAmount > 0 ? '(بعد الخصم)' : ''}</span>
              <strong>{fmt(formTotalAfterDiscount)} ₪</strong>
            </div>
            <div className="pay-summary-row">
              <span>إجمالي المدفوع</span>
              <strong className="pay-paid">
                {fmt(formPayRows.filter(r => r.method !== 'debt').reduce((s, r) => s + (r.amount || 0), 0))} ₪
              </strong>
            </div>
            <div className="pay-summary-row pay-summary-last">
              <span>المتبقي</span>
              <strong className="pay-due">
                {fmt(Math.max(0, formTotalAfterDiscount - formPayRows.filter(r => r.method !== 'debt').reduce((s, r) => s + (r.amount || 0), 0)))} ₪
              </strong>
            </div>
          </div>
          {submitAttempted && formPayErr && <p className="mi-err" style={{ marginTop: '0.5rem' }}>{formPayErr}</p>}
        </>
      )}
    </>
  )

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">البيع المباشر</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingInvoice(null); setShowForm(true) }}>
            + إضافة فاتورة جديدة
          </button>
        )}
      </div>

      {/* ════ Form ════ */}
      {showForm && !editingInvoice && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">فاتورة بيع جديدة</h2>
          {formBody}
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSave}>حفظ الفاتورة</button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Edit Modal ════ */}
      {showForm && editingInvoice && (
        <div className="mi-modal-overlay" onClick={clearForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editingInvoice.customerName}</h3>
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

      {/* ════ List ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">الفواتير</h2>
        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap">
            <input type="text" className="mi-search-input" placeholder="🔍  بحث باسم الزبون..." value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="📞  بحث برقم الهاتف..." value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} />
          </div>
          <div className="mi-date-range">
            <div className="mi-filter-field"><span className="mi-filter-label">من مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input" value={amtMin} onChange={e => setAmtMin(e.target.value)} placeholder="0" /></div>
            <div className="mi-filter-field"><span className="mi-filter-label">إلى مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input" value={amtMax} onChange={e => setAmtMax(e.target.value)} placeholder="∞" /></div>
          </div>
          {hasFilters && <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلاتر</button>}
        </div>

        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr><th>رقم الفاتورة</th><th>اسم الزبون</th><th>رقم الهاتف</th><th>التاريخ</th><th>الإجمالي</th><th>المدفوع</th><th>المتبقي</th><th>الحالة</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              {filteredInvoices.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد فواتير تطابق البحث</td></tr>
              ) : filteredInvoices.map((inv, i) => (
                <tr key={inv.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={e => { if ((e.target as HTMLElement).closest('.mi-actions')) return; setDetailsInvoice(inv) }}>
                  <td>{inv.invoiceNumber || '—'}</td>
                  <td>{inv.customerName}</td>
                  <td>{inv.phone && inv.phone !== '0000' ? <span className="mi-phone-highlight">{inv.phone}</span> : <span className="mi-badge-gray">غير معروف</span>}</td>
                  <td>{inv.saleDate}</td>
                  <td className="mi-amount">{fmt(inv.total)} ₪</td>
                  <td className="pd-paid">{fmt(inv.amountPaid)} ₪</td>
                  <td className={inv.amountRemaining > 0 ? 'pd-remaining' : 'mi-amount'}>{fmt(inv.amountRemaining)} ₪</td>
                  <td><span className={STATUS_CLS[inv.status]}>{STATUS_LABELS[inv.status]}</span></td>
                  <td>
                    <div className="mi-actions">
                      <button className="btn btn-sm-outline" style={{ color: '#E67E22', borderColor: '#E67E22' }} onClick={() => openEdit(inv)}>تعديل</button>
                      {inv.amountRemaining > 0 && (
                        <button className="btn btn-sm-green" onClick={() => openPay(inv)}>إضافة دفعة</button>
                      )}
                      <button className="btn btn-danger-sm" onClick={() => setDeleteInvoice(inv)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showForm && <p className="mi-row-hint">اضغط على أي صف لعرض التفاصيل</p>}
      </div>

      {/* ════ Details Modal ════ */}
      {detailsInvoice && (
        <div className="mi-modal-overlay" onClick={() => setDetailsInvoice(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الفاتورة</h3>
              <button className="mi-modal-close" onClick={() => setDetailsInvoice(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item"><span className="mi-detail-label">رقم الفاتورة</span><strong>{detailsInvoice.invoiceNumber || '—'}</strong></div>
                <div className="mi-detail-item"><span className="mi-detail-label">اسم الزبون</span><strong>{detailsInvoice.customerName}</strong></div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsInvoice.phone && detailsInvoice.phone !== '0000'
                    ? <span className="mi-phone-highlight">{detailsInvoice.phone}</span>
                    : <span className="mi-badge-gray">غير معروف</span>}
                </div>
                <div className="mi-detail-item"><span className="mi-detail-label">التاريخ</span><span>{detailsInvoice.saleDate}</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">الكفالة</span><span>{warrantyLabelDS(detailsInvoice.warranty)}</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">الحالة</span><span className={STATUS_CLS[detailsInvoice.status]}>{STATUS_LABELS[detailsInvoice.status]}</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">الإجمالي</span><span className="mi-amount">{fmt(detailsInvoice.total)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المدفوع</span><span className="pd-paid">{fmt(detailsInvoice.amountPaid)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المتبقي</span><span className={detailsInvoice.amountRemaining > 0 ? 'pd-remaining' : 'mi-amount'}>{fmt(detailsInvoice.amountRemaining)} ₪</span></div>
                {detailsInvoice.notes && <div className="mi-detail-item mi-detail-full"><span className="mi-detail-label">ملاحظات</span><span>{detailsInvoice.notes}</span></div>}
              </div>
              <h4 className="mi-modal-subtitle">البنود</h4>
              <div className="mi-parts-table-wrap">
                <table className="mi-parts-table">
                  <thead><tr><th>الصنف</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>ملاحظات</th></tr></thead>
                  <tbody>
                    {detailsInvoice.items.map(item => (
                      <tr key={item.id}>
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
              {(() => {
                const itemsSubtotal = detailsInvoice.items.length
                  ? detailsInvoice.items.reduce((s, it) => s + it.quantity * it.unitPrice, 0) : null
                const bd = discountBreakdownDS(detailsInvoice.total, detailsInvoice.discountType, detailsInvoice.discountValue, itemsSubtotal)
                return bd ? (
                  <>
                    <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                      المجموع قبل الخصم: <strong>{bd.subtotal != null ? `${fmt(bd.subtotal)} ₪` : '—'}</strong>
                    </div>
                    <div className="mi-total-row" style={{ marginBottom: 0 }}>
                      الخصم: <strong>−{bd.label}</strong>
                    </div>
                    <div className="mi-total-row" style={{ marginBottom: 0 }}>
                      الإجمالي بعد الخصم: <strong>{fmt(detailsInvoice.total)} ₪</strong>
                    </div>
                  </>
                ) : (
                  <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>الإجمالي الكلي: <strong>{fmt(detailsInvoice.total)} ₪</strong></div>
                )
              })()}
              <LinkedOpsSection phone={detailsInvoice.phone} id={detailsInvoice.id} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary" onClick={() => handlePrint(detailsInvoice)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsInvoice(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Payment Modal ════ */}
      {payInvoice && (
        <div className="mi-modal-overlay" onClick={() => setPayInvoice(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>إضافة دفعة</h3>
              <button className="mi-modal-close" onClick={() => setPayInvoice(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid pd-debt-summary">
                <div className="mi-detail-item"><span className="mi-detail-label">الزبون</span><strong>{payInvoice.customerName}</strong></div>
                <div className="mi-detail-item"><span className="mi-detail-label">إجمالي الفاتورة</span><span className="mi-amount">{fmt(invTotal)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المدفوع حتى الآن</span><span className="pd-paid">{fmt(invPaid)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المتبقي</span><span className="pd-remaining">{fmt(invRemaining)} ₪</span></div>
              </div>
              <div className="mi-form-grid mi-delivery-grid" style={{ marginBottom: '1.25rem' }}>
                <label className="mi-field">
                  <span>تاريخ الدفعة</span>
                  <input type="date" value={payDate} max={today()} onChange={e => setPayDate(e.target.value)} />
                </label>
                <label className="mi-field">
                  <span>ملاحظات</span>
                  <input type="text" value={payNotes} placeholder="ملاحظة اختيارية..." onChange={e => setPayNotes(e.target.value)} />
                </label>
              </div>
              <div className="pay-section-title">طريقة الدفع</div>
              {paymentRows.map(row => (
                <div key={row.id} className="pay-row">
                  <div className="pay-row-main">
                    <select className="pay-select" value={row.method} onChange={e => updatePaymentRow(row.id, { method: e.target.value as PayMethod })}>
                      {(['cash', 'check', 'visa'] as Exclude<PayMethod, 'debt'>[]).map(val => (
                        <option key={val} value={val}>{PAY_LABELS[val]}</option>
                      ))}
                    </select>
                    <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount || ''}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePaymentRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                      onBlur={(e) => { if (!e.target.value) updatePaymentRow(row.id, { amount: 0 }) }} />
                    <button className="btn btn-danger-sm" disabled={paymentRows.length === 1} onClick={() => removePaymentRow(row.id)}>حذف</button>
                  </div>
                  {row.method === 'check' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>رقم الشيك</span><input type="text" className="mi-td-input" value={row.checkNumber} onChange={e => updatePaymentRow(row.id, { checkNumber: e.target.value })} /></label>
                      <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الإصدار</span><input type="date" className="mi-td-input" value={row.issueDate} max={today()} onChange={e => updatePaymentRow(row.id, { issueDate: e.target.value })} /></label>
                      <label className="mi-field"><span>تاريخ الصرف</span><input type="date" className="mi-td-input" value={row.clearDate} onChange={e => updatePaymentRow(row.id, { clearDate: e.target.value })} /></label>
                    </div>
                  )}
                  {row.method === 'visa' && (
                    <div className="pay-row-extra">
                      <label className="mi-field"><span>اسم البنك</span><input type="text" className="mi-td-input" value={row.bankName} onChange={e => updatePaymentRow(row.id, { bankName: e.target.value })} /></label>
                      <label className="mi-field"><span>رقم الحركة</span><input type="text" className="mi-td-input" value={row.transactionNum} onChange={e => updatePaymentRow(row.id, { transactionNum: e.target.value })} /></label>
                    </div>
                  )}
                </div>
              ))}
              <button className="btn btn-secondary pay-add-btn" onClick={addPaymentRow}>+ إضافة طريقة دفع</button>
              {payExceeds && <p className="pd-pay-error">مجموع الدفعة ({fmt(thisPayTotal)} ₪) يتجاوز المتبقي ({fmt(invRemaining)} ₪)</p>}
              <div className="pay-summary">
                <div className="pay-summary-row"><span>إجمالي هذه الدفعة</span><strong className="pay-paid">{fmt(thisPayTotal)} ₪</strong></div>
                <div className="pay-summary-row pay-summary-last">
                  <span>المتبقي بعدها</span>
                  <strong className={afterRemaining <= 0 ? 'pay-ok' : payExceeds ? 'pay-over' : 'pay-due'}>{fmt(Math.max(0, afterRemaining))} ₪</strong>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handlePaySave} disabled={payExceeds || thisPayTotal <= 0}>تأكيد الدفعة</button>
              <button className="btn btn-ghost" onClick={() => setPayInvoice(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Delete Confirm ════ */}
      {deleteInvoice && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف فاتورة الزبون "${deleteInvoice.customerName}"؟`}
          onConfirm={async () => {
            try { await dbService.directSale.delete(deleteInvoice.id); await reload(); setDeleteInvoice(null) }
            catch (err) { showError('تعذّر حذف الفاتورة', err) }
          }}
          onCancel={() => setDeleteInvoice(null)}
        />
      )}

      {/* ════ Confirm before edit ════ */}
      {warnInv && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل فاتورة الزبون "${warnInv.customerName}"؟`}
          onConfirm={confirmEditInv}
          onCancel={() => setWarnInv(null)}
        />
      )}
    </div>
  )
}
