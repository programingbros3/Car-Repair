import { useState, useMemo, useEffect } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { DebtRecord, DebtType, CarRecord, SaleRecord } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import AddSalesInvoiceButton from '../components/AddSalesInvoiceButton'
import Pagination from '../components/Pagination'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import { useSettlementTotal } from '../utils/useSettlementTotal'

/* ════════════════════════════════════════
   Local-only types (payment modal)
════════════════════════════════════════ */
type PayMethod = 'cash' | 'check' | 'visa'

type PaymentRow = {
  id: number; method: PayMethod; amount: number
  checkNumber: string; issueDate: string; clearDate: string
  bankName: string; transactionNum: string
}

/* ════════════════════════════════════════
   Helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)
let nextPayId = 1

const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const emptyPayRow = (): PaymentRow => ({
  id: nextPayId++, method: 'cash', amount: 0,
  checkNumber: '', issueDate: '', clearDate: '', bankName: '', transactionNum: '',
})

const PAY_LABELS: Record<PayMethod, string> = { cash: 'كاش', check: 'شيك', visa: 'فيزا' }
const fmt = (n: number) => n.toLocaleString('en-US')

async function printDebt(debt: DebtRecord): Promise<void> {
  const PAY_AR: Record<string, string> = { cash: 'نقداً', cheque: 'شيك', check: 'شيك', visa: 'فيزا', debt: 'دين' }
  let payments: Array<{ method: string; amount: number; settlement_discount?: number }> = []
  try {
    payments = await dbService.invoicePayments.get(debt.id, debt.type)
  } catch (err) {
    showError('تعذّر جلب دفعات الدين للطباعة', err)
    return
  }
  const settlementTotal = payments.reduce((s, p) => s + Number(p.settlement_discount || 0), 0)
  const payRows = payments.filter(p => Number(p.amount) > 0).map(p => `
    <tr>
      <td>${PAY_AR[p.method] || p.method}</td>
      <td class="amount-in">${fmt(p.amount)} ₪</td>
    </tr>`).join('')
    + (settlementTotal > 0 ? `
    <tr>
      <td>خصم تسوية</td>
      <td class="amount-out">−${fmt(settlementTotal)} ₪</td>
    </tr>` : '')
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><label>اسم الزبون</label><span>${debt.customerName}</span></div>
      <div class="detail-item"><label>رقم الهاتف</label><span>${debt.phone && debt.phone !== '0000' ? debt.phone : 'غير معروف'}</span></div>
      <div class="detail-item"><label>النوع</label><span>${debt.typeLabel}</span></div>
      <div class="detail-item"><label>التاريخ</label><span>${debt.date}</span></div>
      ${debt.type === 'maintenance' && debt.carPlate ? `<div class="detail-item"><label>نمرة السيارة</label><span>${debt.carPlate}</span></div>` : ''}
      ${debt.type === 'maintenance' && debt.carType ? `<div class="detail-item"><label>نوع السيارة</label><span>${debt.carType}</span></div>` : ''}
      ${debt.type === 'maintenance' && debt.carColor ? `<div class="detail-item"><label>لون السيارة</label><span>${debt.carColor}</span></div>` : ''}
    </div>
    <div class="detail-grid">
      <div class="detail-item"><label>الإجمالي</label><span>${fmt(debt.total)} ₪</span></div>
      <div class="detail-item"><label>المدفوع</label><span class="amount-in">${fmt(debt.amountPaid)} ₪</span></div>
      <div class="detail-item"><label>المتبقي</label><span class="amount-out">${fmt(debt.amountRemaining)} ₪</span></div>
      ${debt.notes ? `<div class="detail-item"><label>ملاحظات</label><span>${debt.notes}</span></div>` : ''}
    </div>
    ${payRows ? `
    <table style="margin-top:12px;">
      <thead><tr><th>طريقة الدفع</th><th>المبلغ</th></tr></thead>
      <tbody>${payRows}</tbody>
    </table>` : ''}`
  printPdf('دين معلق', body)
}

type DebtEditForm = {
  customerName: string; phone: string; date: string; carPlate: string
  type: DebtType; total: string; amountPaid: string
}

const debtToForm = (d: DebtRecord): DebtEditForm => ({
  customerName: d.customerName, phone: d.phone === '0000' ? '' : d.phone,
  date: d.date, carPlate: d.carPlate, type: d.type,
  total: String(d.total), amountPaid: String(d.amountPaid),
})

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
   Component
════════════════════════════════════════ */
export default function PendingDebts() {
  const { debts, reload } = useGarage()

  /* filters */
  const [search,      setSearch]      = useState('')
  const [phoneSearch, setPhoneSearch] = useState('')
  const [plateSearch, setPlateSearch] = useState('')
  const [typeFilter,  setTypeFilter]  = useState<'all' | DebtType>('all')
  const [amtMin,      setAmtMin]      = useState('')
  const [amtMax,      setAmtMax]      = useState('')

  /* modals */
  const [detailsDebt, setDetailsDebt] = useState<DebtRecord | null>(null)
  const detailsSettlement = useSettlementTotal(detailsDebt ? detailsDebt.type : null, detailsDebt?.id ?? null)
  const [deleteDebt,  setDeleteDebt]  = useState<DebtRecord | null>(null)
  const [warnDebt,    setWarnDebt]    = useState<DebtRecord | null>(null)

  /* edit modal */
  const [editDebt,      setEditDebt]      = useState<DebtRecord | null>(null)
  const [editForm,      setEditForm]      = useState<DebtEditForm | null>(null)
  const [editSubmitted, setEditSubmitted] = useState(false)

  /* payment modal */
  const [payDebt,      setPayDebt]      = useState<DebtRecord | null>(null)
  const [payDate,      setPayDate]      = useState(today())
  const [payNotes,     setPayNotes]     = useState('')
  const [paymentRows,  setPaymentRows]  = useState<PaymentRow[]>([])
  const [settleDiscount, setSettleDiscount] = useState('')
  const [paySubmitted, setPaySubmitted] = useState(false)

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => debts.map((d, i) => ({ _idx: i, customerName: normalizeAr(d.customerName), carPlate: normalizeAr(d.carPlate) })),
    [debts],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['customerName', 'carPlate'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  /* ── Filtered debts ── */
  const filteredDebts = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => debts[r.item._idx])
      : [...debts]
    if (phoneSearch)          result = result.filter(d => d.phone.includes(phoneSearch))
    /* بحث بنمرة السيارة (maintenance فقط — direct_sale بلا نمرة فتُستبعد تلقائياً) */
    if (plateSearch)          result = result.filter(d => d.carPlate.toLowerCase().includes(plateSearch.toLowerCase()))
    if (typeFilter !== 'all') result = result.filter(d => d.type === typeFilter)
    if (amtMin)               result = result.filter(d => d.amountRemaining >= Number(amtMin))
    if (amtMax)               result = result.filter(d => d.amountRemaining <= Number(amtMax))
    return result
  }, [debts, search, phoneSearch, plateSearch, typeFilter, amtMin, amtMax, fuse])

  const hasFilters   = !!search.trim() || !!phoneSearch || !!plateSearch || typeFilter !== 'all' || !!amtMin || !!amtMax
  const clearFilters = () => { setSearch(''); setPhoneSearch(''); setPlateSearch(''); setTypeFilter('all'); setAmtMin(''); setAmtMax('') }

  const totalRemaining = debts.reduce((s, d) => s + d.amountRemaining, 0)
  const debtCount      = debts.length

  /* ── Pagination ── */
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, phoneSearch, plateSearch, typeFilter, amtMin, amtMax])

  const paginatedDebts = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredDebts.slice(start, start + pageSize)
  }, [filteredDebts, currentPage, pageSize])

  /* ── Payment modal ── */
  const openPay = (debt: DebtRecord) => {
    setPayDebt(debt); setPayDate(today()); setPayNotes('')
    setPaymentRows([emptyPayRow()]); setSettleDiscount(''); setPaySubmitted(false)
  }
  const addPaymentRow    = () => setPaymentRows(prev => [...prev, emptyPayRow()])
  const removePaymentRow = (id: number) => setPaymentRows(prev => prev.filter(r => r.id !== id))
  const updatePaymentRow = (id: number, update: Partial<Omit<PaymentRow, 'id'>>) =>
    setPaymentRows(prev => prev.map(r => r.id !== id ? r : { ...r, ...update }))

  const thisPaymentTotal = paymentRows.reduce((s, r) => s + (r.amount || 0), 0)
  const settleNum        = Math.max(0, Number(settleDiscount || 0))
  const remainingAfter   = (payDebt?.amountRemaining ?? 0) - thisPaymentTotal - settleNum
  const payExceedsDebt   = thisPaymentTotal + settleNum > (payDebt?.amountRemaining ?? 0) + 0.001

  /* ── Edit flow ── */
  const doOpenEdit = (debt: DebtRecord) => { setEditDebt(debt); setEditForm(debtToForm(debt)); setEditSubmitted(false) }

  const openEdit = (debt: DebtRecord) => setWarnDebt(debt)

  const confirmEditDebt = () => {
    if (!warnDebt) return
    doOpenEdit(warnDebt)
    setWarnDebt(null)
  }

  const editNameErr  = editForm && !editForm.customerName.trim() ? 'اسم الزبون مطلوب' : ''
  const editPhoneErr = editForm && !editForm.phone.trim() ? 'رقم الهاتف مطلوب' : ''

  const saveEdit = async () => {
    if (!editDebt || !editForm) return
    setEditSubmitted(true)
    if (editNameErr || editPhoneErr) return
    const phone = editForm.phone.trim()
    /* الدين هو فاتورة مصدر (صيانة/بيع مباشر)؛ نعدّل الفاتورة الأصلية حسب نوعها.
       (الإجمالي/المدفوع مشتقّان في DB من البنود والدفعات ولا يُعدَّلان مباشرةً.) */
    try {
      if (editDebt.type === 'maintenance') {
        const car: CarRecord = {
          id: editDebt.id, customerName: editForm.customerName, phone,
          carPlate: editForm.carPlate, carType: '', carColor: '',
          dateReceived: editForm.date, status: 'delivered',
          notes: '', total: editDebt.total, items: [],
        }
        await dbService.maintenance.update(car)
      } else {
        const sale: SaleRecord = {
          id: editDebt.id, customerName: editForm.customerName, phone,
          saleDate: editForm.date, warranty: '', notes: '',
          total: editDebt.total, amountPaid: editDebt.amountPaid,
          amountRemaining: editDebt.amountRemaining, status: 'partial_debt',
          items: [], payments: [],
        }
        await dbService.directSale.update(sale)
      }
      await reload()
      setEditDebt(null); setEditForm(null); setEditSubmitted(false)
    } catch (err) {
      showError('تعذّر تعديل الدين', err)
    }
  }

  const handlePayConfirm = async () => {
    setPaySubmitted(true)
    if ((thisPaymentTotal <= 0 && settleNum <= 0) || payExceedsDebt || !payDebt) return
    const rows = paymentRows.filter(r => r.amount > 0)
    try {
      await dbService.debt.addPayment(payDebt.id, payDebt.type, rows, payDate, settleNum)
      await reload()
      setPayDebt(null)
    } catch (err) {
      showError('تعذّر تسجيل دفعة الدين', err)
    }
  }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">الديون المعلقة</h1>
        <AddSalesInvoiceButton label="+ إضافة دين" />
      </div>

      {/* ── Stats ── */}
      <div className="stats-grid pd-stats">
        <div className="stat-card">
          <span className="stat-label">إجمالي الديون</span>
          <span className="stat-value outgoing">{fmt(totalRemaining)} ₪</span>
        </div>
        <div className="stat-card">
          <span className="stat-label">عدد الديون المعلقة</span>
          <span className="stat-value cars">{debtCount}</span>
        </div>
      </div>

      {/* ════ Debts list ════ */}
      <div className="mi-card" style={{ marginTop: '1.5rem' }}>
        <h2 className="mi-section-title">قائمة الديون</h2>

        <div className="mi-filters pd-filter-bar">
          <div className="mi-search-wrap">
            <input type="text" className="mi-search-input" placeholder="🔍  بحث باسم الزبون..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="📞  بحث برقم الهاتف..."
              value={phoneSearch} onChange={e => setPhoneSearch(e.target.value)} />
          </div>
          <div className="mi-search-wrap" style={{ minWidth: 160, flex: '0 0 auto' }}>
            <input type="text" className="mi-search-input" placeholder="🚗  بحث بنمرة السيارة..."
              value={plateSearch} onChange={e => setPlateSearch(e.target.value)} />
          </div>
          <div className="pd-type-tabs">
            {([['all', 'الكل'], ['maintenance', 'صيانة'], ['direct_sale', 'بيع مباشر']] as const).map(([val, label]) => (
              <button key={val} className={`pd-tab${typeFilter === val ? ' pd-tab-active' : ''}`}
                onClick={() => setTypeFilter(val)}>{label}</button>
            ))}
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
                <th>اسم الزبون</th><th>رقم الهاتف</th><th>النوع</th><th>التاريخ</th>
                <th>نمرة السيارة</th><th>الإجمالي ₪</th><th>المدفوع ₪</th><th>المتبقي ₪</th><th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {paginatedDebts.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد ديون تطابق البحث</td></tr>
              ) : paginatedDebts.map((debt, i) => (
                <tr key={debt.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsDebt(debt)}>
                  <td>{debt.customerName}</td>
                  <td>
                    {debt.phone && debt.phone !== '0000'
                      ? <span className="mi-phone-highlight">{debt.phone}</span>
                      : <span className="mi-badge-gray">غير معروف</span>
                    }
                  </td>
                  <td>
                    {debt.type === 'maintenance'
                      ? <span className="mi-badge-orange">{debt.typeLabel}</span>
                      : <span className="mi-badge-blue">{debt.typeLabel}</span>}
                  </td>
                  <td>{debt.date}</td>
                  <td>{debt.type === 'maintenance' ? (debt.carPlate || '—') : ''}</td>
                  <td className="mi-amount">{fmt(debt.total)} ₪</td>
                  <td className="pd-paid">{fmt(debt.amountPaid)} ₪</td>
                  <td className="pd-remaining">{fmt(debt.amountRemaining)} ₪</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => openEdit(debt)}>تعديل</button>
                      <button className="btn btn-sm-green" onClick={() => openPay(debt)}>إضافة دفعة</button>
                      <button className="btn btn-danger-sm" onClick={() => setDeleteDebt(debt)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalItems={filteredDebts.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setCurrentPage(1)
          }}
        />
      </div>

      {/* ════ Details Modal ════ */}
      {detailsDebt && (
        <div className="mi-modal-overlay" onClick={() => setDetailsDebt(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الدين</h3>
              <button className="mi-modal-close" onClick={() => setDetailsDebt(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اسم الزبون</span>
                  <strong>{detailsDebt.customerName}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsDebt.phone && detailsDebt.phone !== '0000'
                    ? <span className="mi-phone-highlight">{detailsDebt.phone}</span>
                    : <span className="mi-badge-gray">غير معروف</span>
                  }
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">النوع</span>
                  <span className={detailsDebt.type === 'maintenance' ? 'mi-badge-orange' : 'mi-badge-blue'}>
                    {detailsDebt.typeLabel}
                  </span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsDebt.date}</span>
                </div>
                {detailsDebt.type === 'maintenance' && detailsDebt.carPlate && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">نمرة السيارة</span>
                    <span className="mi-plate">{detailsDebt.carPlate}</span>
                  </div>
                )}
                {detailsDebt.type === 'maintenance' && detailsDebt.carType && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">نوع السيارة</span>
                    <span>{detailsDebt.carType}</span>
                  </div>
                )}
                {detailsDebt.type === 'maintenance' && detailsDebt.carColor && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">لون السيارة</span>
                    <span>{detailsDebt.carColor}</span>
                  </div>
                )}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الإجمالي</span>
                  <span className="mi-amount">{fmt(detailsDebt.total)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المدفوع</span>
                  <span className="pd-paid">{fmt(detailsDebt.amountPaid)} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المتبقي</span>
                  <span className="pd-remaining">{fmt(detailsDebt.amountRemaining)} ₪</span>
                </div>
                {detailsSettlement > 0 && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">خصم تسوية (ليس نقداً)</span>
                    <span className="mi-badge-orange">−{fmt(detailsSettlement)} ₪</span>
                  </div>
                )}
                {detailsDebt.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsDebt.notes}</span>
                  </div>
                )}
              </div>
              <LinkedOpsSection phone={detailsDebt.phone} source="debt" id={detailsDebt.id} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => printDebt(detailsDebt)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsDebt(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Payment Modal ════ */}
      {payDebt && (
        <div className="mi-modal-overlay" onClick={() => setPayDebt(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>إضافة دفعة — {payDebt.customerName}</h3>
              <button className="mi-modal-close" onClick={() => setPayDebt(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid pd-debt-summary">
                <div className="mi-detail-item"><span className="mi-detail-label">اسم الزبون</span><strong>{payDebt.customerName}</strong></div>
                <div className="mi-detail-item"><span className="mi-detail-label">إجمالي الفاتورة</span><span className="mi-amount">{fmt(payDebt.total)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المدفوع حتى الآن</span><span className="pd-paid">{fmt(payDebt.amountPaid)} ₪</span></div>
                <div className="mi-detail-item"><span className="mi-detail-label">المتبقي</span><span className="pd-remaining">{fmt(payDebt.amountRemaining)} ₪</span></div>
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
              {paymentRows.map(row => (
                <div key={row.id} className="pay-row">
                  <div className="pay-row-main">
                    <select className="pay-select" value={row.method}
                      onChange={e => updatePaymentRow(row.id, { method: e.target.value as PayMethod })}>
                      {(Object.entries(PAY_LABELS) as [PayMethod, string][]).map(([val, label]) => (
                        <option key={val} value={val}>{label}</option>
                      ))}
                    </select>
                    <input type="number" min={0} placeholder="المبلغ ₪" value={row.amount || ''}
                      className="mi-td-input pay-amount"
                      onChange={e => updatePaymentRow(row.id, { amount: Math.max(0, Number(e.target.value)) })}
                      onBlur={e => { if (!e.target.value) updatePaymentRow(row.id, { amount: 0 }) }} />
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

              <label className="mi-field" style={{ marginTop: '1rem', maxWidth: 260 }}>
                <span>خصم / إسقاط مبلغ (تسوية) ₪</span>
                <input type="number" min={0} placeholder="0" value={settleDiscount}
                  className="mi-td-input"
                  onChange={e => setSettleDiscount(e.target.value)} />
                <span className="mi-field-hint" style={{ fontSize: '0.72rem', color: '#888' }}>
                  يُسقَط من المتبقي دون تسجيله كنقدية في الصندوق
                </span>
              </label>

              {paySubmitted && thisPaymentTotal <= 0 && settleNum <= 0 && (
                <p className="pd-pay-error">يجب إدخال مبلغ الدفعة أو خصم التسوية</p>
              )}
              {payExceedsDebt && (
                <p className="pd-pay-error">مجموع الدفعة والخصم ({fmt(thisPaymentTotal + settleNum)} ₪) يتجاوز المتبقي ({fmt(payDebt.amountRemaining)} ₪)</p>
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
              <button className="btn btn-ghost" onClick={() => setPayDebt(null)}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Edit Modal ════ */}
      {editDebt && editForm && (
        <div className="mi-modal-overlay" onClick={() => { setEditDebt(null); setEditForm(null); setEditSubmitted(false) }}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editDebt.customerName}</h3>
              <button className="mi-modal-close" onClick={() => { setEditDebt(null); setEditForm(null); setEditSubmitted(false) }}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-form-grid">
                <label className="mi-field">
                  <span>اسم الزبون <span className="mi-required">*</span></span>
                  <input type="text" value={editForm.customerName}
                    className={editSubmitted && editNameErr ? 'mi-input-err' : ''}
                    onChange={e => setEditForm(f => f && { ...f, customerName: e.target.value })} />
                  {editSubmitted && editNameErr && <span className="mi-err">{editNameErr}</span>}
                </label>
                <label className="mi-field">
                  <span>رقم الهاتف <span className="mi-required">*</span></span>
                  <input type="text" value={editForm.phone} placeholder="05XXXXXXXX" onKeyDown={allowPhoneChars}
                    className={editSubmitted && editPhoneErr ? 'mi-input-err' : ''}
                    onChange={e => setEditForm(f => f && { ...f, phone: e.target.value })} />
                  {editSubmitted && editPhoneErr && <span className="mi-err">{editPhoneErr}</span>}
                </label>
                <label className="mi-field">
                  <span>النوع</span>
                  <select className="pay-select" value={editForm.type}
                    onChange={e => setEditForm(f => f && { ...f, type: e.target.value as DebtType })}>
                    <option value="maintenance">صيانة</option>
                    <option value="direct_sale">بيع مباشر</option>
                  </select>
                </label>
                <label className="mi-field">
                  <span>التاريخ</span>
                  <input type="date" value={editForm.date} max={today()}
                    onChange={e => setEditForm(f => f && { ...f, date: e.target.value > today() ? today() : e.target.value })} />
                </label>
                <label className="mi-field">
                  <span>نمرة السيارة</span>
                  <input type="text" value={editForm.carPlate}
                    onChange={e => setEditForm(f => f && { ...f, carPlate: e.target.value })} />
                </label>
                <label className="mi-field">
                  <span>الإجمالي ₪</span>
                  <input type="number" min={0} value={editForm.total}
                    onChange={e => setEditForm(f => f && { ...f, total: e.target.value })}
                    onFocus={e => { if (e.target.value === '0') setEditForm(f => f && { ...f, total: '' }) }}
                    onBlur={e => { if (!e.target.value) setEditForm(f => f && { ...f, total: '0' }) }} />
                </label>
                <label className="mi-field">
                  <span>المدفوع ₪</span>
                  <input type="number" min={0} value={editForm.amountPaid}
                    onChange={e => setEditForm(f => f && { ...f, amountPaid: e.target.value })}
                    onFocus={e => { if (e.target.value === '0') setEditForm(f => f && { ...f, amountPaid: '' }) }}
                    onBlur={e => { if (!e.target.value) setEditForm(f => f && { ...f, amountPaid: '0' }) }} />
                </label>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={saveEdit}>حفظ التعديلات</button>
              <button className="btn btn-ghost" onClick={() => { setEditDebt(null); setEditForm(null); setEditSubmitted(false) }}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Delete Confirm ════ */}
      {deleteDebt && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف دين الزبون "${deleteDebt.customerName}"؟ سيتم حذف الفاتورة المصدر بالكامل.`}
          onConfirm={async () => {
            try {
              if (deleteDebt.type === 'maintenance') await dbService.maintenance.delete(deleteDebt.id)
              else                                   await dbService.directSale.delete(deleteDebt.id)
              await reload()
              setDeleteDebt(null)
            } catch (err) { showError('تعذّر حذف الدين', err) }
          }}
          onCancel={() => setDeleteDebt(null)}
        />
      )}

      {/* ════ Confirm before edit ════ */}
      {warnDebt && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل دين الزبون "${warnDebt.customerName}"؟`}
          onConfirm={confirmEditDebt}
          onCancel={() => setWarnDebt(null)}
        />
      )}
    </div>
  )
}
