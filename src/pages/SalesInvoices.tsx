import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { SaleInvoice, SaleInvoiceType, SaleInvoiceStatus, PaymentRow, CarRecord, SaleRecord } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   Helpers / Constants
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const TYPE_LABELS: Record<SaleInvoiceType, string>   = { maintenance: 'صيانة', direct_sale: 'بيع مباشر' }
const TYPE_CLS:    Record<SaleInvoiceType, string>   = { maintenance: 'mi-badge-orange', direct_sale: 'mi-badge-blue' }
const STATUS_LABELS: Record<SaleInvoiceStatus, string> = { paid: 'مدفوع', partial_debt: 'دين جزئي', full_debt: 'دين كامل' }
const STATUS_CLS:    Record<SaleInvoiceStatus, string> = { paid: 'mi-badge-green', partial_debt: 'mi-badge-yellow', full_debt: 'mi-badge-red' }

const fmt = (n: number) => n.toLocaleString('ar-EG')

const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

const blankRow = (): PaymentRow => ({
  id: Date.now() + Math.random(), method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

function printInvoice(inv: SaleInvoice): void {
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><label>رقم الفاتورة</label><span>${inv.id}</span></div>
      <div class="detail-item"><label>التاريخ</label><span>${inv.date}</span></div>
      <div class="detail-item"><label>نوع الفاتورة</label><span>${TYPE_LABELS[inv.type]}</span></div>
      <div class="detail-item"><label>الحالة</label><span>${STATUS_LABELS[inv.status]}</span></div>
      <div class="detail-item"><label>اسم الزبون</label><span>${inv.customerName}</span></div>
      <div class="detail-item"><label>رقم الهاتف</label><span>${inv.phone && inv.phone !== '0000' ? inv.phone : 'غير معروف'}</span></div>
      ${inv.carPlate ? `<div class="detail-item"><label>نمرة السيارة</label><span>${inv.carPlate}</span></div>` : ''}
      ${inv.carType ? `<div class="detail-item"><label>نوع السيارة</label><span>${inv.carType}</span></div>` : ''}
      ${inv.details ? `<div class="detail-item"><label>التفاصيل</label><span>${inv.details}</span></div>` : ''}
    </div>
    <div class="detail-grid">
      <div class="detail-item"><label>الإجمالي</label><span>${fmt(inv.total)} ₪</span></div>
      <div class="detail-item"><label>المدفوع</label><span class="amount-in">${fmt(inv.paid)} ₪</span></div>
      <div class="detail-item"><label>المتبقي</label><span class="amount-out">${fmt(inv.remaining)} ₪</span></div>
    </div>`
  printPdf('فاتورة بيع', body)
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
      <div className="linked-ops-title">عمليات سابقة لهذا الزبون</div>
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
   EditForm type
════════════════════════════════════════ */
type EditForm = {
  date: string; type: SaleInvoiceType; customerName: string; phone: string
  total: string; paid: string; carPlate: string; carType: string; details: string
}

const invToForm = (inv: SaleInvoice): EditForm => ({
  date: inv.date, type: inv.type, customerName: inv.customerName, phone: inv.phone,
  total: String(inv.total), paid: String(inv.paid),
  carPlate: inv.carPlate, carType: inv.carType, details: inv.details,
})

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function SalesInvoices() {
  const { salesInvoices, reload } = useGarage()

  /* ── Search & Filter ── */
  const [search,       setSearch]       = useState('')
  const [phoneSearch,  setPhoneSearch]  = useState('')
  const [typeFilter,   setTypeFilter]   = useState<'all' | SaleInvoiceType>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | SaleInvoiceStatus>('all')
  const [filterFrom,   setFilterFrom]   = useState('')
  const [filterTo,     setFilterTo]     = useState('')
  const [amtMin,       setAmtMin]       = useState('')
  const [amtMax,       setAmtMax]       = useState('')

  /* ── Modal states ── */
  const [detailsInv, setDetailsInv] = useState<SaleInvoice | null>(null)
  const [warnInv,    setWarnInv]    = useState<SaleInvoice | null>(null)
  const [editInv,    setEditInv]    = useState<SaleInvoice | null>(null)
  const [editForm,   setEditForm]   = useState<EditForm | null>(null)
  const [editSubmitted, setEditSubmitted] = useState(false)

  /* ── Payment modal ── */
  const [payInvoice,  setPayInvoice]  = useState<SaleInvoice | null>(null)
  const [paymentRows, setPaymentRows] = useState<PaymentRow[]>([blankRow()])
  const [payDate,     setPayDate]     = useState(today())
  const [payNotes,    setPayNotes]    = useState('')

  /* ── Delete ── */
  const [deleteInv, setDeleteInv] = useState<SaleInvoice | null>(null)

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => salesInvoices.map((inv, i) => ({ _idx: i, customerName: normalizeAr(inv.customerName) })),
    [salesInvoices],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['customerName'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  /* ── Filtered list ── */
  const filtered = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => salesInvoices[r.item._idx])
      : [...salesInvoices]
    if (phoneSearch)            result = result.filter(i => i.phone.includes(phoneSearch))
    if (typeFilter !== 'all')   result = result.filter(i => i.type === typeFilter)
    if (statusFilter !== 'all') result = result.filter(i => i.status === statusFilter)
    if (filterFrom)             result = result.filter(i => i.date >= filterFrom)
    if (filterTo)               result = result.filter(i => i.date <= filterTo)
    if (amtMin)                 result = result.filter(i => i.total >= Number(amtMin))
    if (amtMax)                 result = result.filter(i => i.total <= Number(amtMax))
    return result
  }, [salesInvoices, search, phoneSearch, typeFilter, statusFilter, filterFrom, filterTo, amtMin, amtMax, fuse])

  const hasFilters = !!search.trim() || !!phoneSearch || typeFilter !== 'all' || statusFilter !== 'all'
    || !!filterFrom || !!filterTo || !!amtMin || !!amtMax

  const clearFilters = () => {
    setSearch(''); setPhoneSearch(''); setTypeFilter('all'); setStatusFilter('all')
    setFilterFrom(''); setFilterTo(''); setAmtMin(''); setAmtMax('')
  }

  /* ── Edit flow ── */
  const confirmEdit = () => {
    if (!warnInv) return
    setEditInv(warnInv)
    setEditForm(invToForm(warnInv))
    setEditSubmitted(false)
    setWarnInv(null)
  }

  const editNameErr  = editForm && !editForm.customerName.trim() ? 'اسم الزبون مطلوب' : ''
  const editPhoneErr = editForm && !editForm.phone.trim() ? 'رقم الهاتف مطلوب' : ''
  const editPlateErr = editForm && editForm.type === 'maintenance' && !editForm.carPlate.trim() ? 'نمرة السيارة مطلوبة' : ''

  const closeEdit = () => { setEditInv(null); setEditForm(null); setEditSubmitted(false) }

  const saveEdit = async () => {
    if (!editInv || !editForm) return
    setEditSubmitted(true)
    if (editNameErr || editPhoneErr || editPlateErr) return
    const total = Number(editForm.total) || 0
    const paid  = Math.min(Number(editForm.paid) || 0, total)
    const phone = editForm.phone.trim()
    /* فاتورة البيع عرض مجمّع؛ التعديل يوجَّه للفاتورة الأصلية حسب نوعها.
       (الإجمالي/المدفوع مشتقّان في DB من البنود والدفعات.) */
    try {
      if (editInv.type === 'maintenance') {
        const car: CarRecord = {
          id: editInv.id, customerName: editForm.customerName, phone,
          carPlate: editForm.carPlate, carType: editForm.carType, carColor: '',
          dateReceived: editForm.date, status: 'delivered',
          notes: editForm.details, total, items: [],
        }
        await dbService.maintenance.update(car)
      } else {
        const sale: SaleRecord = {
          id: editInv.id, customerName: editForm.customerName, phone,
          saleDate: editForm.date, warranty: '', notes: editForm.details,
          total, amountPaid: paid, amountRemaining: total - paid,
          status: 'partial_debt', items: [], payments: [],
        }
        await dbService.directSale.update(sale)
      }
      await reload()
      closeEdit()
    } catch (err) {
      showError('تعذّر حفظ تعديلات الفاتورة', err)
    }
  }

  /* ── Payment flow ── */
  const openPay = (inv: SaleInvoice) => {
    setPayInvoice(inv)
    setPaymentRows([blankRow()])
    setPayDate(today())
    setPayNotes('')
  }

  const addPayRow    = () => setPaymentRows(r => [...r, blankRow()])
  const removePayRow = (id: number) => setPaymentRows(r => r.filter(row => row.id !== id))
  const updatePayRow = (id: number, field: keyof PaymentRow, val: string | number) =>
    setPaymentRows(r => r.map(row => row.id !== id ? row : { ...row, [field]: val }))

  const totalBeingPaid = paymentRows.reduce((s, r) => s + (Number(r.amount) || 0), 0)

  const submitPayment = async () => {
    if (!payInvoice || totalBeingPaid <= 0) return
    const rows = paymentRows.filter(r => Number(r.amount) > 0)
    try {
      // دفعة على دين فاتورة بيع (صيانة/بيع مباشر) عبر قناة الديون الموحّدة
      await dbService.debt.addPayment(payInvoice.id, payInvoice.type, rows, payDate)
      await reload()
      setPayInvoice(null)
    } catch (err) {
      showError('تعذّر تسجيل الدفعة', err)
    }
  }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">فواتير البيع</h1>
      </div>

      <div className="mi-card">
        <h2 className="mi-section-title">جميع فواتير البيع</h2>

        {/* ── Filter bar ── */}
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
            {([['all', 'الكل'], ['maintenance', 'صيانة'], ['direct_sale', 'بيع مباشر']] as const).map(([val, label]) => (
              <button key={val} className={`pd-tab${typeFilter === val ? ' pd-tab-active' : ''}`}
                onClick={() => setTypeFilter(val)}>{label}</button>
            ))}
          </div>

          <div className="pd-type-tabs">
            {([['all', 'الكل'], ['paid', 'مدفوع'], ['partial_debt', 'دين جزئي'], ['full_debt', 'دين كامل']] as const).map(([val, label]) => (
              <button key={val} className={`pd-tab${statusFilter === val ? ' pd-tab-active' : ''}`}
                onClick={() => setStatusFilter(val)}>{label}</button>
            ))}
          </div>

          <div className="mi-date-range">
            <div className="mi-filter-field">
              <span className="mi-filter-label">من تاريخ</span>
              <input type="date" className="mi-date-input" value={filterFrom} max={today()}
                onChange={e => setFilterFrom(e.target.value)} />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى تاريخ</span>
              <input type="date" className="mi-date-input" value={filterTo} max={today()}
                onChange={e => setFilterTo(e.target.value)} />
            </div>
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

        {/* ── Table ── */}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>نوع الفاتورة</th>
                <th>اسم الزبون</th>
                <th>رقم الهاتف</th>
                <th>الإجمالي ₪</th>
                <th>المدفوع ₪</th>
                <th>المتبقي ₪</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد فواتير تطابق البحث</td></tr>
              ) : filtered.map((inv, i) => (
                <tr key={inv.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsInv(inv)}>
                  <td>{inv.date}</td>
                  <td><span className={TYPE_CLS[inv.type]}>{TYPE_LABELS[inv.type]}</span></td>
                  <td>{inv.customerName}</td>
                  <td>
                    {inv.phone && inv.phone !== '0000'
                      ? <span className="mi-phone-highlight">{inv.phone}</span>
                      : <span className="mi-badge-gray">غير معروف</span>
                    }
                  </td>
                  <td className="mi-amount">{fmt(inv.total)} ₪</td>
                  <td className="pd-paid">{fmt(inv.paid)} ₪</td>
                  <td className={inv.remaining > 0 ? 'pd-remaining' : 'mi-amount'}>{fmt(inv.remaining)} ₪</td>
                  <td><span className={STATUS_CLS[inv.status]}>{STATUS_LABELS[inv.status]}</span></td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => setWarnInv(inv)}>تعديل</button>
                      {inv.remaining > 0 && (
                        <button className="btn btn-sm-green" onClick={() => openPay(inv)}>إضافة دفعة</button>
                      )}
                      <button className="btn btn-danger-sm" onClick={() => setDeleteInv(inv)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Details Modal ════ */}
      {detailsInv && (
        <div className="mi-modal-overlay" onClick={() => setDetailsInv(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الفاتورة #{detailsInv.id}</h3>
              <button className="mi-modal-close" onClick={() => setDetailsInv(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsInv.date}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">نوع الفاتورة</span>
                  <span className={TYPE_CLS[detailsInv.type]}>{TYPE_LABELS[detailsInv.type]}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الحالة</span>
                  <span className={STATUS_CLS[detailsInv.status]}>{STATUS_LABELS[detailsInv.status]}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اسم الزبون</span>
                  <strong>{detailsInv.customerName}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsInv.phone && detailsInv.phone !== '0000'
                    ? <span className="mi-phone-highlight">{detailsInv.phone}</span>
                    : <span className="mi-badge-gray">غير معروف</span>
                  }
                </div>
                {detailsInv.carPlate && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">نمرة السيارة</span>
                    <span className="mi-plate">{detailsInv.carPlate}</span>
                  </div>
                )}
                {detailsInv.carType && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">نوع السيارة</span>
                    <span>{detailsInv.carType}</span>
                  </div>
                )}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(detailsInv.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع</span>
                  <span className="pd-paid">{fmt(detailsInv.paid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className={detailsInv.remaining > 0 ? 'pd-remaining' : 'mi-amount'}>
                    {fmt(detailsInv.remaining)} ₪
                  </span>
                </div>
                {detailsInv.details && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">التفاصيل</span>
                    <span>{detailsInv.details}</span>
                  </div>
                )}
              </div>
              <LinkedOpsSection phone={detailsInv.phone} source="sales_invoice" id={detailsInv.id} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => printInvoice(detailsInv)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsInv(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Confirm before edit ════ */}
      {warnInv && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل فاتورة الزبون "${warnInv.customerName}"؟`}
          onConfirm={confirmEdit}
          onCancel={() => setWarnInv(null)}
        />
      )}

      {/* ════ Edit Form Modal ════ */}
      {editInv && editForm && (
        <div className="mi-modal-overlay" onClick={closeEdit}>
          <div className="mi-modal mi-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editInv.customerName}</h3>
              <button className="mi-modal-close" onClick={closeEdit}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-form-grid">
                <div className="mi-form-field">
                  <label className="mi-form-label">التاريخ</label>
                  <input type="date" className="mi-form-input" value={editForm.date} max={today()}
                    onChange={e => setEditForm(f => f && { ...f, date: e.target.value })} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">نوع الفاتورة</label>
                  <select className="mi-form-input" value={editForm.type}
                    onChange={e => setEditForm(f => f && { ...f, type: e.target.value as SaleInvoiceType })}>
                    <option value="maintenance">صيانة</option>
                    <option value="direct_sale">بيع مباشر</option>
                  </select>
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">اسم الزبون <span className="mi-required">*</span></label>
                  <input type="text" className={'mi-form-input' + (editSubmitted && editNameErr ? ' mi-input-err' : '')} value={editForm.customerName}
                    onChange={e => setEditForm(f => f && { ...f, customerName: e.target.value })} />
                  {editSubmitted && editNameErr && <span className="mi-err">{editNameErr}</span>}
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">رقم الهاتف <span className="mi-required">*</span></label>
                  <input type="text" className={'mi-form-input' + (editSubmitted && editPhoneErr ? ' mi-input-err' : '')} value={editForm.phone}
                    placeholder="05XXXXXXXX" onKeyDown={allowPhoneChars}
                    onChange={e => setEditForm(f => f && { ...f, phone: e.target.value })} />
                  {editSubmitted && editPhoneErr && <span className="mi-err">{editPhoneErr}</span>}
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">الإجمالي ₪</label>
                  <input type="number" min={0} className="mi-form-input" value={editForm.total}
                    onChange={e => setEditForm(f => f && { ...f, total: e.target.value })} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">المدفوع ₪</label>
                  <input type="number" min={0} className="mi-form-input" value={editForm.paid}
                    onChange={e => setEditForm(f => f && { ...f, paid: e.target.value })} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">نمرة السيارة {editForm.type === 'maintenance' && <span className="mi-required">*</span>}</label>
                  <input type="text" className={'mi-form-input' + (editSubmitted && editPlateErr ? ' mi-input-err' : '')} value={editForm.carPlate}
                    onChange={e => setEditForm(f => f && { ...f, carPlate: e.target.value })} />
                  {editSubmitted && editPlateErr && <span className="mi-err">{editPlateErr}</span>}
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">نوع السيارة</label>
                  <input type="text" className="mi-form-input" value={editForm.carType}
                    onChange={e => setEditForm(f => f && { ...f, carType: e.target.value })} />
                </div>
                <div className="mi-form-field mi-form-field-full">
                  <label className="mi-form-label">التفاصيل</label>
                  <textarea className="mi-form-input mi-form-textarea" value={editForm.details}
                    onChange={e => setEditForm(f => f && { ...f, details: e.target.value })} />
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={saveEdit}>حفظ التعديلات</button>
              <button className="btn btn-ghost" onClick={closeEdit}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Payment Modal ════ */}
      {payInvoice && (
        <div className="mi-modal-overlay" onClick={() => setPayInvoice(null)}>
          <div className="mi-modal mi-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>إضافة دفعة — {payInvoice.customerName}</h3>
              <button className="mi-modal-close" onClick={() => setPayInvoice(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              {/* Summary */}
              <div className="pay-summary-row">
                <div className="pay-summary-item">
                  <span className="pay-summary-label">الإجمالي</span>
                  <span className="pay-summary-val mi-amount">{fmt(payInvoice.total)} ₪</span>
                </div>
                <div className="pay-summary-item">
                  <span className="pay-summary-label">المدفوع</span>
                  <span className="pay-summary-val pd-paid">{fmt(payInvoice.paid)} ₪</span>
                </div>
                <div className="pay-summary-item">
                  <span className="pay-summary-label">المتبقي</span>
                  <span className="pay-summary-val pd-remaining">{fmt(payInvoice.remaining)} ₪</span>
                </div>
              </div>

              {/* Payment rows */}
              <div className="pay-rows-section">
                {paymentRows.map((row, idx) => (
                  <div key={row.id} className="pay-row-block">
                    <div className="pay-row-header">
                      <span className="pay-row-num">دفعة {idx + 1}</span>
                      {paymentRows.length > 1 && (
                        <button className="btn btn-ghost-sm" onClick={() => removePayRow(row.id)}>حذف</button>
                      )}
                    </div>
                    <div className="pay-row-fields">
                      <div className="mi-form-field">
                        <label className="mi-form-label">طريقة الدفع</label>
                        <select className="mi-form-input" value={row.method}
                          onChange={e => updatePayRow(row.id, 'method', e.target.value)}>
                          <option value="cash">كاش</option>
                          <option value="check">شيك</option>
                          <option value="visa">فيزا</option>
                        </select>
                      </div>
                      <div className="mi-form-field">
                        <label className="mi-form-label">المبلغ ₪</label>
                        <input type="number" min={0} className="mi-form-input" value={row.amount || ''}
                          onChange={e => updatePayRow(row.id, 'amount', Number(e.target.value))} />
                      </div>
                      {row.method === 'check' && (<>
                        <div className="mi-form-field">
                          <label className="mi-form-label">رقم الشيك</label>
                          <input type="text" className="mi-form-input" value={row.checkNumber}
                            onChange={e => updatePayRow(row.id, 'checkNumber', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">تاريخ الإصدار</label>
                          <input type="date" className="mi-form-input" value={row.issueDate}
                            onChange={e => updatePayRow(row.id, 'issueDate', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">تاريخ الصرف</label>
                          <input type="date" className="mi-form-input" value={row.clearDate} max={today()}
                            onChange={e => updatePayRow(row.id, 'clearDate', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">اسم البنك</label>
                          <input type="text" className="mi-form-input" value={row.bankName}
                            onChange={e => updatePayRow(row.id, 'bankName', e.target.value)} />
                        </div>
                      </>)}
                      {row.method === 'visa' && (<>
                        <div className="mi-form-field">
                          <label className="mi-form-label">اسم البنك</label>
                          <input type="text" className="mi-form-input" value={row.bankName}
                            onChange={e => updatePayRow(row.id, 'bankName', e.target.value)} />
                        </div>
                        <div className="mi-form-field">
                          <label className="mi-form-label">رقم الحركة</label>
                          <input type="text" className="mi-form-input" value={row.transactionNum}
                            onChange={e => updatePayRow(row.id, 'transactionNum', e.target.value)} />
                        </div>
                      </>)}
                    </div>
                  </div>
                ))}
                <button className="btn btn-ghost" style={{ marginTop: '0.5rem' }} onClick={addPayRow}>
                  + إضافة طريقة دفع أخرى
                </button>
              </div>

              {/* Payment date & notes */}
              <div className="mi-form-grid" style={{ marginTop: '1rem' }}>
                <div className="mi-form-field">
                  <label className="mi-form-label">تاريخ الدفع</label>
                  <input type="date" className="mi-form-input" value={payDate} max={today()}
                    onChange={e => setPayDate(e.target.value)} />
                </div>
                <div className="mi-form-field">
                  <label className="mi-form-label">ملاحظات</label>
                  <input type="text" className="mi-form-input" value={payNotes}
                    onChange={e => setPayNotes(e.target.value)} />
                </div>
              </div>

              {totalBeingPaid > 0 && (
                <div className="pay-total-row">
                  <span>إجمالي هذه الدفعة:</span>
                  <span className="mi-amount">{fmt(totalBeingPaid)} ₪</span>
                </div>
              )}
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={submitPayment}
                disabled={totalBeingPaid <= 0}>تأكيد الدفع</button>
              <button className="btn btn-ghost" onClick={() => setPayInvoice(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Delete Confirm ════ */}
      {deleteInv && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف فاتورة الزبون "${deleteInv.customerName}"؟`}
          onConfirm={async () => {
            try {
              if (deleteInv.type === 'maintenance') await dbService.maintenance.delete(deleteInv.id)
              else                                  await dbService.directSale.delete(deleteInv.id)
              await reload()
              setDeleteInv(null)
            } catch (err) { showError('تعذّر حذف الفاتورة', err) }
          }}
          onCancel={() => setDeleteInv(null)}
        />
      )}
    </div>
  )
}
