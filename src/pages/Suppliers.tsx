import { useState, useMemo, useRef, useEffect } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { Supplier, SupplierRecord, SupplierItem } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import CollapsibleCard from '../components/CollapsibleCard'
import NameAutocomplete from '../components/NameAutocomplete'
import SupplierInvoiceForm, { hasSupplierDraft, clearSupplierDraft, type SupplierInvoiceFormHandle } from '../components/forms/SupplierInvoiceForm'
import Pagination from '../components/Pagination'
import { printPdf, escapeHtml as esc } from '../utils/printPdf'
import { applyDiscount } from '../db/discount'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import { useSettlementTotal } from '../utils/useSettlementTotal'

/* ════════════════════════════════════════
   Local-only types (payment modal state)
════════════════════════════════════════ */
type PayMethod = 'cash' | 'check' | 'visa' | 'debt'

type PaymentRow = {
  id: number; method: PayMethod; amount: number
  checkNumber: string; issueDate: string; clearDate: string
  bankName: string; transactionNum: string
}

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today   = () => new Date().toISOString().slice(0, 10)
let nextPayId = 1

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const emptySupForm = () => ({ name: '', phone: '', notes: '' })
const emptyPayRow  = (): PaymentRow  => ({
  id: nextPayId++, method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

const PAY_LABELS: Record<Exclude<PayMethod, 'debt'>, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }

const fmt = (n: number) => n.toLocaleString('en-US')

// خصم على مستوى البند الفردي — وصف للعرض + الإجمالي بعد الخصم
const itemDiscountLabel = (item: SupplierItem): string =>
  !item.discountType ? '—'
    : item.discountType === 'percentage'
      ? `${fmt(item.discountValue ?? 0)}%`
      : `−${fmt(item.discountValue ?? 0)} ₪`
const itemNetTotal = (item: SupplierItem): number =>
  applyDiscount(item.quantity * item.unitPrice, item.discountType ?? null, item.discountValue ?? 0)

function printSupplierInvoice(
  sup: SupplierRecord,
  payments: Array<{ method: string; amount: number; settlement_discount?: number }> = [],
): void {
  const PAY_AR: Record<string, string> = { cash: 'نقداً', cheque: 'شيك', check: 'شيك', visa: 'فيزا', debt: 'دين' }
  const settlementTotal = payments.reduce((s, p) => s + Number(p.settlement_discount || 0), 0)
  const rows = sup.items.map(item => `
    <tr>
      <td>${esc(item.name)}</td>
      <td>${item.quantity}</td>
      <td>${fmt(item.unitPrice)} ₪</td>
      <td>${fmt(item.quantity * item.unitPrice)} ₪</td>
      <td>${esc(itemDiscountLabel(item))}</td>
      <td>${fmt(itemNetTotal(item))} ₪</td>
      <td>${item.notes ? esc(item.notes) : '—'}</td>
    </tr>`).join('')
  const payRows = payments.filter(p => Number(p.amount) > 0).map(p => `
    <tr>
      <td>${PAY_AR[p.method] || esc(p.method)}</td>
      <td class="amount-in">${fmt(p.amount)} ₪</td>
    </tr>`).join('')
    + (settlementTotal > 0 ? `
    <tr>
      <td>خصم تسوية</td>
      <td class="amount-out">−${fmt(settlementTotal)} ₪</td>
    </tr>` : '')
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><label>رقم الفاتورة</label><span>${sup.invoiceNumber ? esc(sup.invoiceNumber) : '—'}</span></div>
      <div class="detail-item"><label>اسم المورد</label><span>${esc(sup.supplierName)}</span></div>
      <div class="detail-item"><label>رقم الهاتف</label><span>${sup.phone && sup.phone !== '0000' ? esc(sup.phone) : 'غير معروف'}</span></div>
      <div class="detail-item"><label>تاريخ الشراء</label><span>${esc(sup.purchaseDate)}</span></div>
      ${sup.notes ? `<div class="detail-item"><label>ملاحظات</label><span>${esc(sup.notes)}</span></div>` : ''}
    </div>
    <table>
      <thead><tr><th>القطعة</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الخصم</th><th>بعد الخصم</th><th>ملاحظات</th></tr></thead>
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
  printPdf(`فاتورة مورد ${sup.invoiceNumber || ''}`.trim(), body)
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
  const { suppliers, supplierInvoices, reload, ensureDomains } = useGarage()
  useEffect(() => { void ensureDomains(['suppliers', 'supplierInvoices']) }, [ensureDomains])

  /* ── Suppliers list form ── */
  const [showSupForm,  setShowSupForm]  = useState(false)
  const [editingSup,   setEditingSup]   = useState<Supplier | null>(null)
  const [supForm,      setSupForm]      = useState(emptySupForm)
  const [supSubmitted, setSupSubmitted] = useState(false)
  const [deleteSupplier, setDeleteSupplier] = useState<Supplier | null>(null)
  const [warnSupplier,   setWarnSupplier]   = useState<Supplier | null>(null)

  /* invoice form (add inline + edit modal via shared SupplierInvoiceForm) */
  const [showInvForm, setShowInvForm] = useState(hasSupplierDraft())
  const [editing,     setEditing]     = useState<SupplierRecord | null>(null)
  const invFormRef = useRef<SupplierInvoiceFormHandle>(null)
  const showForm = showInvForm || !!editing

  /* filters */
  const [search,      setSearch]      = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [filterFrom,  setFilterFrom]  = useState('')
  const [filterTo,    setFilterTo]    = useState('')
  const [amtMin,      setAmtMin]      = useState('')
  const [amtMax,      setAmtMax]      = useState('')
  const [debtFilter,  setDebtFilter]  = useState<'all' | 'debt' | 'paid'>('all')

  /* modals */
  const [detailsSup, setDetailsSup] = useState<SupplierRecord | null>(null)
  const detailsSettlement = useSettlementTotal(detailsSup ? 'supplier' : null, detailsSup?.id ?? null)
  const [warnSup,    setWarnSup]    = useState<SupplierRecord | null>(null)
  const [deleteSup,  setDeleteSup]  = useState<SupplierRecord | null>(null)

  /* payment modal */
  const [paySup,       setPaySup]       = useState<SupplierRecord | null>(null)
  const [payDate,      setPayDate]      = useState(today())
  const [payNotes,     setPayNotes]     = useState('')
  const [payRows,      setPayRows]      = useState<PaymentRow[]>([])
  const [settleDiscount, setSettleDiscount] = useState('')
  const [paySubmitted, setPaySubmitted] = useState(false)

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => supplierInvoices.map((sup, i) => ({ _idx: i, supplierName: normalizeAr(sup.supplierName), invoiceNumber: normalizeAr(sup.invoiceNumber ?? '') })),
    [supplierInvoices],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['supplierName', 'invoiceNumber'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  /* ── Filtered invoice list ── */
  const filteredSuppliers = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => supplierInvoices[r.item._idx])
      : [...supplierInvoices]
    if (phoneSearch) result = result.filter(s => s.phone.includes(phoneSearch))
    if (filterFrom)  result = result.filter(s => s.purchaseDate >= filterFrom)
    if (filterTo)    result = result.filter(s => s.purchaseDate <= filterTo)
    if (amtMin)      result = result.filter(s => s.total >= Number(amtMin))
    if (amtMax)      result = result.filter(s => s.total <= Number(amtMax))
    if (debtFilter === 'debt') result = result.filter(s => s.amountRemaining > 0.001)
    if (debtFilter === 'paid') result = result.filter(s => s.amountRemaining <= 0.001)
    return result
  }, [supplierInvoices, search, phoneSearch, filterFrom, filterTo, amtMin, amtMax, debtFilter, fuse])

  const hasFilters   = !!search.trim() || !!phoneSearch || !!filterFrom || !!filterTo || !!amtMin || !!amtMax || debtFilter !== 'all'
  const clearFilters = () => { setSearch(''); setPhoneSearch(''); setFilterFrom(''); setFilterTo(''); setAmtMin(''); setAmtMax(''); setDebtFilter('all') }

  /* ── Pagination: Supplier Directory ── */
  const [supDirPage, setSupDirPage] = useState(1)
  const [supDirPageSize, setSupDirPageSize] = useState(10)

  const paginatedSupplierDir = useMemo(() => {
    const start = (supDirPage - 1) * supDirPageSize
    return suppliers.slice(start, start + supDirPageSize)
  }, [suppliers, supDirPage, supDirPageSize])

  /* ── Pagination: Supplier Invoices ── */
  const [invPage, setInvPage] = useState(1)
  const [invPageSize, setInvPageSize] = useState(10)

  useEffect(() => {
    setInvPage(1)
  }, [search, phoneSearch, filterFrom, filterTo, amtMin, amtMax, debtFilter])

  const paginatedInvoices = useMemo(() => {
    const start = (invPage - 1) * invPageSize
    return filteredSuppliers.slice(start, start + invPageSize)
  }, [filteredSuppliers, invPage, invPageSize])

  /* أسماء دليل الموردين للـ autocomplete (كل الموردين المسجّلين، لا من ظهر بفاتورة فقط) */
  const supplierNames = useMemo(() => suppliers.map(s => s.name), [suppliers])

  /* ════════════════════════════════════════
     Suppliers list helpers
  ════════════════════════════════════════ */
  const setSupField = (field: string, value: string) => setSupForm(prev => ({ ...prev, [field]: value }))

  const doOpenSupEdit = (sup: Supplier) => {
    setEditingSup(sup)
    setSupForm({ name: sup.name, phone: sup.phone, notes: sup.notes })
    setSupSubmitted(false)
    setShowSupForm(true)
  }

  const openSupEdit = (sup: Supplier) => setWarnSupplier(sup)

  const confirmSupEdit = () => {
    if (!warnSupplier) return
    doOpenSupEdit(warnSupplier)
    setWarnSupplier(null)
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
      await reload(['suppliers'])   // M10: دليل الموردين فقط
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
     Invoice form open/close (shared SupplierInvoiceForm)
  ════════════════════════════════════════ */
  const handleEditClick = (sup: SupplierRecord, e: React.MouseEvent) => {
    e.stopPropagation()
    setWarnSup(sup)
  }

  const confirmEditSup = () => {
    if (!warnSup) return
    clearSupplierDraft()
    setEditing(warnSup)
    setShowInvForm(false)
    setWarnSup(null)
  }

  const openInvForm  = () => { setEditing(null); setShowInvForm(true) }
  const closeInvForm = () => { clearSupplierDraft(); setShowInvForm(false) }
  const closeEditForm = () => setEditing(null)
  const onInvAddSaved  = () => setShowInvForm(false)
  const onInvEditSaved = () => setEditing(null)

  const errCls = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ── Payment modal ── */
  const openPay = (sup: SupplierRecord) => {
    setPaySup(sup); setPayDate(today()); setPayNotes('')
    setPayRows([emptyPayRow()]); setSettleDiscount(''); setPaySubmitted(false)
  }
  const addPayRow    = () => setPayRows(prev => [...prev, emptyPayRow()])
  const removePayRow = (id: number) => setPayRows(prev => prev.filter(r => r.id !== id))
  const updatePayRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPayRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  const thisPaymentTotal = payRows.reduce((s, r) => s + (r.amount || 0), 0)
  const settleNum        = Math.max(0, Number(settleDiscount || 0))
  const remainingAfter   = (paySup?.amountRemaining ?? 0) - thisPaymentTotal - settleNum
  const payExceedsDebt   = thisPaymentTotal + settleNum > (paySup?.amountRemaining ?? 0) + 0.001

  const handlePayConfirm = async () => {
    setPaySubmitted(true)
    if ((thisPaymentTotal <= 0 && settleNum <= 0) || payExceedsDebt || !paySup) return
    const rows = payRows.filter(r => r.amount > 0)
    try {
      await dbService.supplierInvoice.addDebtPayment(paySup.id, rows, payDate, settleNum)
      await reload(['supplierInvoices', 'purchaseInvoices'])   // M10
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
      <CollapsibleCard
        title="قائمة الموردين"
        headerRight={!showSupForm && (
          <button className="btn btn-primary" onClick={() => { setEditingSup(null); setShowSupForm(true) }}>
            + إضافة مورد جديد
          </button>
        )}
      >
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr><th>الاسم</th><th>رقم الهاتف</th><th>ملاحظات</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              {paginatedSupplierDir.length === 0 ? (
                <tr><td colSpan={4} className="mi-empty-row">لا يوجد موردون</td></tr>
              ) : paginatedSupplierDir.map((sup, i) => (
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
        <Pagination
          currentPage={supDirPage}
          totalItems={suppliers.length}
          pageSize={supDirPageSize}
          onPageChange={setSupDirPage}
          onPageSizeChange={(size) => { setSupDirPageSize(size); setSupDirPage(1) }}
        />
      </CollapsibleCard>

      {/* ════ Add Invoice Form (inline — نموذج الإضافة المشترك) ════ */}
      {showInvForm && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">بيانات الفاتورة</h2>
          <SupplierInvoiceForm ref={invFormRef} key="new" editing={null} useDraft onSaved={onInvAddSaved} />
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={() => invFormRef.current?.save()}>حفظ الفاتورة</button>
            <button className="btn btn-ghost" onClick={closeInvForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Edit Invoice Modal ════ */}
      {editing && (
        <div className="mi-modal-overlay" onClick={closeEditForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editing.supplierName}</h3>
              <button className="mi-modal-close" onClick={closeEditForm}>✕</button>
            </div>
            <div className="mi-modal-body">
              <SupplierInvoiceForm ref={invFormRef} key={editing.id} editing={editing} onSaved={onInvEditSaved} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => invFormRef.current?.save()}>حفظ التعديلات</button>
              <button className="btn btn-ghost" onClick={closeEditForm}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Supplier invoices list ════ */}
      <CollapsibleCard
        title="فواتير الموردين"
        headerRight={!showForm && (
          <button className="btn btn-primary" onClick={openInvForm}>
            + إضافة فاتورة شراء
          </button>
        )}
      >
        {/* فلتر دين / مدفوع */}
        <div className="pd-type-tabs" style={{ marginBottom: '0.75rem' }}>
          {([['all', 'الكل'], ['debt', 'دين'], ['paid', 'مدفوع']] as [typeof debtFilter, string][]).map(([val, label]) => (
            <button key={val}
              className={`pd-tab${debtFilter === val ? ' pd-tab-active' : ''}`}
              onClick={() => setDebtFilter(val)}>
              {label}
            </button>
          ))}
        </div>

        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap">
            <NameAutocomplete value={search} onChange={setSearch} options={supplierNames}
              placeholder="🔍  بحث باسم المورد..." />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="📞  بحث برقم الهاتف..."
              value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} />
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
                <th>رقم الفاتورة</th>
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
              {paginatedInvoices.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد فواتير تطابق البحث</td></tr>
              ) : paginatedInvoices.map((sup, i) => (
                <tr key={sup.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsSup(sup)}>
                  <td>{sup.invoiceNumber || '—'}</td>
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
        <Pagination
          currentPage={invPage}
          totalItems={filteredSuppliers.length}
          pageSize={invPageSize}
          onPageChange={setInvPage}
          onPageSizeChange={(size) => { setInvPageSize(size); setInvPage(1) }}
        />
      </CollapsibleCard>

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
                  <span className="mi-detail-label">رقم الفاتورة</span>
                  <strong>{detailsSup.invoiceNumber || '—'}</strong>
                </div>
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
                    <tr><th>القطعة</th><th>العدد</th><th>سعر الوحدة</th><th>الإجمالي</th><th>الخصم</th><th>بعد الخصم</th><th>ملاحظات</th></tr>
                  </thead>
                  <tbody>
                    {detailsSup.items.map((item, idx) => (
                      <tr key={idx}>
                        <td>{item.name}</td>
                        <td className="mi-td-center">{item.quantity}</td>
                        <td className="mi-td-center">{fmt(item.unitPrice)} ₪</td>
                        <td className="mi-td-center">{fmt(item.quantity * item.unitPrice)} ₪</td>
                        <td className="mi-td-center">{itemDiscountLabel(item)}</td>
                        <td className="mi-td-center"><strong>{fmt(itemNetTotal(item))} ₪</strong></td>
                        <td>{item.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="mi-total-row" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                الإجمالي الكلي: <strong>{fmt(detailsSup.total)} ₪</strong>
              </div>
              {detailsSettlement > 0 && (
                <div className="mi-total-row" style={{ marginBottom: 0, color: '#E67E22' }}>
                  خصم تسوية (إسقاط — ليس نقداً): <strong>−{fmt(detailsSettlement)} ₪</strong>
                </div>
              )}

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

      {/* ════ Confirm before invoice edit ════ */}
      {warnSup && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={
            warnSup.amountRemaining === 0
              ? `هذه الفاتورة مدفوعة بالكامل — المورد "${warnSup.supplierName}" - تاريخ الشراء ${warnSup.purchaseDate} - الإجمالي ${fmt(warnSup.total)} ₪. هل أنت متأكد من رغبتك في التعديل؟`
              : `هل أنت متأكد من رغبتك في تعديل فاتورة المورد "${warnSup.supplierName}"؟`
          }
          onConfirm={confirmEditSup}
          onCancel={() => setWarnSup(null)}
        />
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
                  <input type="date" value={payDate} max={today()} onChange={e => setPayDate(e.target.value > today() ? today() : e.target.value)} />
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
                          onChange={e => updatePayRow(row.id, { issueDate: e.target.value > today() ? today() : e.target.value })} /></label>
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

              <label className="mi-field" style={{ marginTop: '1rem', maxWidth: 260 }}>
                <span>خصم / إسقاط مبلغ (تسوية) ₪</span>
                <input type="number" min={0} placeholder="0" value={settleDiscount}
                  className="mi-td-input"
                  onChange={e => setSettleDiscount(e.target.value)} />
                <span style={{ fontSize: '0.72rem', color: '#888' }}>يُسقَط من المتبقي دون تسجيله كنقدية في الصندوق</span>
              </label>

              {paySubmitted && thisPaymentTotal <= 0 && settleNum <= 0 && (
                <p className="pd-pay-error">يجب إدخال مبلغ الدفعة أو خصم التسوية</p>
              )}
              {payExceedsDebt && (
                <p className="pd-pay-error">مجموع الدفعة والخصم ({fmt(thisPaymentTotal + settleNum)} ₪) يتجاوز المتبقي ({fmt(paySup.amountRemaining)} ₪)</p>
              )}

              <div className="pay-summary">
                <div className="pay-summary-row">
                  <span>إجمالي هذه الدفعة</span>
                  <strong className="pay-paid">{fmt(thisPaymentTotal)} ₪</strong>
                </div>
                {settleNum > 0 && (
                  <div className="pay-summary-row">
                    <span>خصم تسوية</span>
                    <strong className="pay-over">−{fmt(settleNum)} ₪</strong>
                  </div>
                )}
                <div className="pay-summary-row pay-summary-last">
                  <span>المتبقي بعد الدفعة والخصم</span>
                  <strong className={remainingAfter <= 0.001 ? 'pay-ok' : payExceedsDebt ? 'pay-over' : 'pay-due'}>
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
            try { await dbService.suppliers.delete(deleteSupplier.id); await reload(['suppliers']); setDeleteSupplier(null) }
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
            try { await dbService.supplierInvoice.delete(deleteSup.id); await reload(['supplierInvoices', 'purchaseInvoices']); setDeleteSup(null) }
            catch (err) { showError('تعذّر حذف فاتورة المورد', err) }
          }}
          onCancel={() => setDeleteSup(null)}
        />
      )}

      {/* ════ Confirm before supplier edit ════ */}
      {warnSupplier && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل بيانات المورد "${warnSupplier.name}"؟`}
          onConfirm={confirmSupEdit}
          onCancel={() => setWarnSupplier(null)}
        />
      )}
    </div>
  )
}
