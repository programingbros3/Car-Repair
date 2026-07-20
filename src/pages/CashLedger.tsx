import { useEffect, useState, useCallback, useMemo } from 'react'
import { printPdf, escapeHtml as esc } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'
import type { LedgerRow, CashAuditRow, CashSystemBreakdown } from '../db/types'
import ConfirmDialog from '../components/ConfirmDialog'
import CollapsibleCard from '../components/CollapsibleCard'
import Pagination from '../components/Pagination'
import { fmt, isBulkNote, parseBulkInvoiceLabel, buildBulkSummary, type BulkAllocation } from '../utils/bulkNote'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type TxType = 'incoming' | 'outgoing'

type PaymentBreakdown = { method: string; amount: number }

type DisplayRow = {
  id: number
  date: string
  type: TxType
  sourceLabel: string
  amount: number
  balanceAfter: number
  notes: string
  breakdown: PaymentBreakdown[]
  // ── دفعة عامة لمورد: العملية الواحدة تغطّي عدة فواتير بنفس طريقة الدفع ──
  isBulk: boolean
  method: string              // طريقة الدفع الموحّدة للدفعة (كاش/شيك/فيزا) — تُعرض مرة واحدة
  allocations: BulkAllocation[]
}

/* ════════════════════════════════════════
   Labels
════════════════════════════════════════ */
const TYPE_LABELS: Record<TxType, string> = { incoming: 'وارد', outgoing: 'صادر' }

const REF_LABELS: Record<string, string> = {
  maintenance_payment: 'صيانة',
  maintenance_release: 'صيانة',
  direct_sale_payment: 'بيع مباشر',
  debt_customer:       'تحصيل دين',
  supplier_payment:    'مورد',
  supplier_debt:       'مورد',
  daily_expense:       'مصروف',
  salary:              'راتب',
}
const refLabel = (t: string) => REF_LABELS[t] ?? t

const METHOD_LABELS: Record<string, string> = {
  cash:   'كاش',
  visa:   'فيزا',
  cheque: 'شيك',
  debt:   'دين',
}
const METHOD_COLORS: Record<string, string> = {
  cash:   '#2ECC71',
  visa:   '#3498DB',
  cheque: '#9B59B6',
  debt:   '#E74C3C',
}

// شارة «دفعة عامة» — بنفسجي بارز يميّزها فوراً عن دفعة الفاتورة العادية
const bulkBadgeStyle: React.CSSProperties = {
  fontSize: '0.72rem', padding: '2px 9px', borderRadius: '10px',
  background: '#8E44AD1f', color: '#8E44AD', fontWeight: 700, whiteSpace: 'nowrap',
}

const todayStr = () => new Date().toISOString().slice(0, 10)
// fmt مستورد من ../utils/bulkNote (مصدر واحد مشترك مع اختبار المحاكاة)
// للمجاميع/الفروق/الصافي القابلة للسالب فعلياً: يُظهر علامة السالب صراحةً (يبقى اللون أحمر)
const fmtSigned = (n: number) => (n < 0 ? '−' : '') + fmt(n)

// M9: طريقة الدفع تُقرأ من عمود method الفعلي. يبقى الاستخراج النصي احتياطاً
// للصفوف القديمة جداً التي قد لا يكون method فيها مملوءاً (نادر بعد الترحيل).
const extractMethod = (notes: string | null): string => {
  const m = (notes ?? '').match(/[—–-]\s*(cash|visa|cheque|debt)\s*$/i)
  return m ? m[1].toLowerCase() : ''
}
const rowMethod = (r: LedgerRow): string => r.method ?? extractMethod(r.notes)

const baseNote = (notes: string | null): string =>
  (notes ?? '').replace(/\s*[—–-]\s*(cash|visa|cheque|debt)\s*$/i, '').trim()

/* دفعة عامة لمورد: منطق بناء نص الملاحظة (isBulkNote/parseBulkInvoiceLabel/
   BULK_NOTE_MAX/buildBulkSummary) مستورد من ../utils/bulkNote — مصدر واحد مشترك
   مع اختبار المحاكاة scripts/simulate-bulk-payments.ts. */

// مفتاح التجميع: التاريخ + نوع المرجع + رقم الفاتورة من الـ notes
// (reference_id في اللِّيدجر هو payment_id وليس invoice_id)
const groupKey = (e: LedgerRow): string => {
  const m = (e.notes ?? '').match(/#(\d+)/)
  const invoiceId = m ? m[1] : String(e.reference_id)
  return `${e.transaction_date}|${e.reference_type}|${invoiceId}`
}

// يجمّع صفوف اللِّيدجر المتعلقة بنفس العملية في صف واحد
const groupEntries = (entries: LedgerRow[]): DisplayRow[] => {
  const groups = new Map<string, LedgerRow[]>()
  for (const e of entries) {
    const key = groupKey(e)
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key)!.push(e)
  }

  return Array.from(groups.values()).map(group => {
    const first    = group[0]
    const last     = group[group.length - 1]
    const totalIn  = group.reduce((s, r) => s + r.amount_in,  0)
    const totalOut = group.reduce((s, r) => s + r.amount_out, 0)
    const type: TxType = totalIn > 0 ? 'incoming' : 'outgoing'

    const isBulk = isBulkNote(first.notes)

    // دفعة عامة: كل صف = توزيع على فاتورة بنفس طريقة الدفع → نعرضه كتوزيع على الفواتير
    // وليس كوسائل دفع متعددة. غيرها: كل صف وسيلة دفع مستقلة (كاش+شيك مثلاً).
    const allocations: BulkAllocation[] = isBulk
      ? group.map(r => ({
          invoiceLabel: parseBulkInvoiceLabel(r.notes),
          amount:       r.amount_out > 0 ? r.amount_out : r.amount_in,
        }))
      : []

    const breakdown: PaymentBreakdown[] = isBulk
      ? []
      : group
          .map(r => ({
            method: rowMethod(r),
            amount: r.amount_in > 0 ? r.amount_in : r.amount_out,
          }))
          .filter(b => b.method && b.amount > 0)

    return {
      id:           first.id,
      date:         first.transaction_date,
      type,
      sourceLabel:  refLabel(first.reference_type),
      amount:       totalIn > 0 ? totalIn : totalOut,
      balanceAfter: last.balance_after,
      notes:        isBulk ? buildBulkSummary(first.notes, allocations) : baseNote(first.notes),
      breakdown,
      isBulk,
      method:       rowMethod(first),
      allocations,
    }
  })
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function CashLedger() {
  /* ── Date filter ── */
  const [selectedDate, setSelectedDate] = useState(todayStr)

  /* ── Operations ── */
  const [rows, setRows]       = useState<DisplayRow[]>([])
  const [loading, setLoading] = useState(true)

  /* ── Overall summary (removed — no longer used) ── */

  /* ── Daily totals for the 4 summary cards (tied to selectedDate) ── */
  const [dayTotals, setDayTotals] = useState({
    salesIncome:      0, // إيرادات اليوم (صيانة + بيع مباشر)
    expenses:         0, // مصاريف اليوم
    supplierPayments: 0, // مدفوعات الموردين اليوم
    salaries:         0, // رواتب اليوم
  })

  /* ── End-of-day audit ── */
  const [sysBreakdown, setSysBreakdown]     = useState<CashSystemBreakdown>({ cash: 0, visa: 0, cheque: 0 })
  const [actualCash, setActualCash]         = useState('')
  const [actualVisa, setActualVisa]         = useState('')
  const [actualCheck, setActualCheck]       = useState('')
  const [matchOk, setMatchOk]               = useState(false)
  const [diffModal, setDiffModal]           = useState<{
    sysCash: number; sysVisa: number; sysCheck: number
    actCash: number; actVisa: number; actCheck: number
    diffCash: number; diffVisa: number; diffCheck: number
  } | null>(null)
  const [saving, setSaving]                 = useState(false)

  /* ── Audit records ── */
  const [auditRecords, setAuditRecords]     = useState<CashAuditRow[]>([])
  const [auditsLoading, setAuditsLoading]   = useState(true)

  /* ── Details modal ── */
  const [detailsTx, setDetailsTx] = useState<DisplayRow | null>(null)

  /* ── Locking / per-field edit of a committed audit ── */
  const [lockConfirm, setLockConfirm]       = useState(false)                                  // تأكيد قبل التثبيت
  const [pwdField, setPwdField]             = useState<'cash' | 'visa' | 'check' | null>(null)  // الحقل بانتظار كلمة السر
  const [editingField, setEditingField]     = useState<'cash' | 'visa' | 'check' | null>(null)  // الحقل المفتوح للتعديل
  const [editFieldPassword, setEditFieldPassword] = useState('')                                // كلمة السر المُلتقَطة لجلسة التعديل
  const [deleteAudit, setDeleteAudit]       = useState<CashAuditRow | null>(null)

  /* ── Pagination: Operations ── */
  const [opsPage, setOpsPage] = useState(1)
  const [opsPageSize, setOpsPageSize] = useState(10)

  const paginatedRows = useMemo(() => {
    const start = (opsPage - 1) * opsPageSize
    return rows.slice(start, start + opsPageSize)
  }, [rows, opsPage, opsPageSize])

  // Reset ops page when date changes
  useEffect(() => { setOpsPage(1) }, [selectedDate])

  /* ── Pagination: Audit Records ── */
  const [auditPage, setAuditPage] = useState(1)
  const [auditPageSize, setAuditPageSize] = useState(10)

  const paginatedAudits = useMemo(() => {
    const start = (auditPage - 1) * auditPageSize
    return auditRecords.slice(start, start + auditPageSize)
  }, [auditRecords, auditPage, auditPageSize])

  /* ─── Load audit records ─── */
  const loadAudits = useCallback(() => {
    setAuditsLoading(true)
    dbService.cashAudit.getAll()
      .then(setAuditRecords)
      .catch(err => showError('تعذّر تحميل سجل الإحصاءات', err))
      .finally(() => setAuditsLoading(false))
  }, [])

  useEffect(() => { loadAudits() }, [loadAudits])

  /* ─── Load day operations + daily net + system breakdown ─── */
  const loadDayData = useCallback((date: string) => {
    setLoading(true)
    Promise.all([
      dbService.ledger.getByDateRange(date, date),
      dbService.report.daily(date),
      dbService.cashAudit.getSystemBreakdown(date),
    ])
      .then(([entries, report, breakdown]) => {
        setRows(groupEntries([...entries].reverse()))
        setDayTotals({
          salesIncome:      report.today_sales_income,
          expenses:         report.today_expenses,
          supplierPayments: report.today_supplier_payments,
          salaries:         report.today_salaries,
        })
        setSysBreakdown(breakdown)
      })
      .catch(err => showError('تعذّر تحميل بيانات اليوم', err))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadDayData(selectedDate)
    setActualCash('')
    setActualVisa('')
    setActualCheck('')
    setMatchOk(false)
    setDiffModal(null)
    setLockConfirm(false)
    setPwdField(null)
    setEditingField(null)
    setEditFieldPassword('')
  }, [selectedDate, loadDayData])

  /* ─── احسب الفرق ─── */
  const handleCalcDiff = () => {
    if (actualCash.trim() === '' && actualVisa.trim() === '' && actualCheck.trim() === '') return
    const actCash  = parseFloat(actualCash)  || 0
    const actVisa  = parseFloat(actualVisa)  || 0
    const actCheck = parseFloat(actualCheck) || 0
    const diffCash  = actCash  - sysBreakdown.cash
    const diffVisa  = actVisa  - sysBreakdown.visa
    const diffCheck = actCheck - sysBreakdown.cheque
    const allMatch = Math.abs(diffCash) < 0.001 && Math.abs(diffVisa) < 0.001 && Math.abs(diffCheck) < 0.001
    if (allMatch) {
      setMatchOk(true)
      setDiffModal(null)
    } else {
      setMatchOk(false)
      setDiffModal({
        sysCash:  sysBreakdown.cash,  sysVisa:  sysBreakdown.visa,  sysCheck:  sysBreakdown.cheque,
        actCash,  actVisa,  actCheck,
        diffCash, diffVisa, diffCheck,
      })
    }
  }

  /* ─── تثبيت وقفل الإحصاء (أول عملية تثبيت — is_locked: 0 → 1) ───
     يحفظ القيم الثلاث الفعلية + لقطة النظام لكل طريقة + الفروق، ويقفل السجل.
     بعدها لا يمكن الكتابة فوقه إلا عبر مسار «تعديل» المحمي بكلمة السر. */
  const handleLock = async () => {
    const actCash  = parseFloat(actualCash)  || 0
    const actVisa  = parseFloat(actualVisa)  || 0
    const actCheck = parseFloat(actualCheck) || 0
    const actual   = actCash + actVisa + actCheck
    const sysTotal = sysBreakdown.cash + sysBreakdown.visa + sysBreakdown.cheque
    const diff     = actual - sysTotal
    setSaving(true)
    try {
      await dbService.cashAudit.save({
        audit_date:    selectedDate,
        system_total:  sysTotal,
        actual_amount: actual,
        actual_cash:   actCash,
        actual_visa:   actVisa,
        actual_check:  actCheck,
        system_cash:   sysBreakdown.cash,
        system_visa:   sysBreakdown.visa,
        system_check:  sysBreakdown.cheque,
        difference:    diff,
        is_locking:    true,
      })
      await loadAudits()
      setLockConfirm(false)
      setMatchOk(false)
      setDiffModal(null)
    } catch (err) {
      showError('تعذّر تثبيت الإحصاء', err)
    } finally {
      setSaving(false)
    }
  }

  /* ─── فتح تعديل حقل واحد بعد تأكيد كلمة السر ───
     يُعيد فتح صندوق إدخال ذلك الحقل وحده مع بذر قيمته من السجل المحفوظ. */
  const beginFieldEdit = (field: 'cash' | 'visa' | 'check', password: string, saved: CashAuditRow) => {
    if (field === 'cash')  setActualCash(String(saved.actual_cash))
    if (field === 'visa')  setActualVisa(String(saved.actual_visa))
    if (field === 'check') setActualCheck(String(saved.actual_check))
    setEditFieldPassword(password)
    setEditingField(field)
    setPwdField(null)
  }

  const cancelFieldEdit = () => {
    setEditingField(null)
    setEditFieldPassword('')
  }

  /* ─── حفظ تعديل حقل واحد على سجل مقفل ───
     النظام يبقى مجمَّداً كما ثُبِّت وقت القفل؛ يُعاد حساب الفرق فقط من الفعلي الجديد.
     يمرّ عبر cashAudit:updateLocked (كلمة السر تُعاد تحقّقها في الـ backend) ويُسجَّل بالنشاط. */
  const saveFieldEdit = async (field: 'cash' | 'visa' | 'check', saved: CashAuditRow) => {
    const actCash  = field === 'cash'  ? (parseFloat(actualCash)  || 0) : saved.actual_cash
    const actVisa  = field === 'visa'  ? (parseFloat(actualVisa)  || 0) : saved.actual_visa
    const actCheck = field === 'check' ? (parseFloat(actualCheck) || 0) : saved.actual_check
    const actual   = actCash + actVisa + actCheck
    const sysTotal = saved.system_cash + saved.system_visa + saved.system_check
    const diff     = actual - sysTotal
    const fieldLabel = field === 'cash' ? 'الكاش' : field === 'visa' ? 'الفيزا' : 'الشيك'
    setSaving(true)
    try {
      await dbService.cashAudit.updateLocked({
        audit_date:    saved.audit_date,
        system_total:  sysTotal,
        actual_amount: actual,
        actual_cash:   actCash,
        actual_visa:   actVisa,
        actual_check:  actCheck,
        system_cash:   saved.system_cash,
        system_visa:   saved.system_visa,
        system_check:  saved.system_check,
        difference:    diff,
        password:      editFieldPassword,
        field:         fieldLabel,
      })
      await loadAudits()
      cancelFieldEdit()
    } catch (err) {
      showError('تعذّر حفظ التعديل', err)
    } finally {
      setSaving(false)
    }
  }

  /* ─── Delete audit record ─── */
  const handleDeleteAudit = async (rec: CashAuditRow) => {
    try {
      await dbService.cashAudit.delete(rec.id)
      await loadAudits()
      setDeleteAudit(null)
    } catch (err) {
      showError('تعذّر حذف السجل', err)
    }
  }

  /* ─── Print audit row ─── */
  const handlePrintAudit = (rec: CashAuditRow) => {
    const diffSign = rec.difference > 0 ? '+' : rec.difference < 0 ? '−' : ''
    const diffCls  = Math.abs(rec.difference) < 0.001 ? 'amount-in' : rec.difference > 0 ? 'amount-in' : 'amount-out'
    const statusTxt = Math.abs(rec.difference) < 0.001 ? 'مطابق' : rec.difference > 0 ? 'زيادة' : 'نقص'
    const body = `
      <div class="detail-grid">
        <div class="detail-item"><label>التاريخ</label><span>${esc(rec.audit_date)}</span></div>
        <div class="detail-item"><label>إجمالي النظام</label><span class="mi-amount">${fmtSigned(rec.system_total)} ₪</span></div>
        <div class="detail-item"><label>المبلغ الفعلي</label><span class="mi-amount">${fmt(rec.actual_amount)} ₪</span></div>
        <div class="detail-item"><label>الفرق</label><span class="${diffCls}">${diffSign}${fmt(rec.difference)} ₪</span></div>
        <div class="detail-item"><label>الحالة</label><span>${statusTxt}</span></div>
      </div>`
    printPdf('إحصاء يومي', body)
  }

  /* ─── Print receipt ─── */
  const handlePrint = (tx: DisplayRow) => {
    const sign      = tx.type === 'incoming' ? '+' : '−'
    const amountCls = tx.type === 'incoming' ? 'amount-in' : 'amount-out'
    const bulkRows = tx.isBulk
      ? `
        <div class="detail-item"><label>نوع العملية</label><span>دفعة عامة لمورد (${tx.allocations.length} فواتير)</span></div>
        ${tx.method ? `<div class="detail-item"><label>طريقة الدفع</label><span>${esc(METHOD_LABELS[tx.method] ?? tx.method)}</span></div>` : ''}
        ${tx.allocations.length ? `<div class="detail-item"><label>توزيع الدفعة على الفواتير</label><span>${tx.allocations.map(a => `${esc(a.invoiceLabel || '—')} (${fmt(a.amount)} ₪)`).join('، ')}</span></div>` : ''}`
      : ''
    const body = `
      <div class="detail-grid">
        <div class="detail-item"><label>رقم العملية</label><span>${tx.id}</span></div>
        <div class="detail-item"><label>التاريخ</label><span>${esc(tx.date)}</span></div>
        <div class="detail-item"><label>النوع</label><span class="${amountCls}">${TYPE_LABELS[tx.type]}</span></div>
        <div class="detail-item"><label>المصدر</label><span>${esc(tx.sourceLabel)}</span></div>
        <div class="detail-item"><label>المبلغ</label><span class="${amountCls}">${sign}${fmt(tx.amount)} ₪</span></div>
        <div class="detail-item"><label>الرصيد بعد العملية</label><span>${fmt(tx.balanceAfter)} ₪</span></div>
        ${bulkRows}
        ${tx.notes ? `<div class="detail-item"><label>الملاحظات</label><span>${esc(tx.notes)}</span></div>` : ''}
      </div>`
    printPdf('إيصال عملية صندوق', body)
  }

  /* ─── Audit status badge ─── */
  const auditBadge = (diff: number) => {
    if (Math.abs(diff) < 0.001) return <span className="mi-badge-green">مطابق</span>
    if (diff > 0)                return <span className="cl-badge-in">زيادة</span>
    return                              <span className="cl-badge-out">نقص</span>
  }

  const diffColor = (diff: number) =>
    Math.abs(diff) < 0.001 ? '#2ECC71' : diff > 0 ? '#2ECC71' : '#E74C3C'

  /* ─── سجل اليوم المحدد + حالة القفل ─── */
  const savedAudit = auditRecords.find(a => a.audit_date === selectedDate) ?? null
  const isLocked   = savedAudit?.is_locked === 1
  // النظام المعروض: عند القفل نُظهر اللقطة المجمَّدة وقت التثبيت؛ قبل القفل نُظهر الحساب الحيّ.
  const sysShown = isLocked && savedAudit
    ? { cash: savedAudit.system_cash, visa: savedAudit.system_visa, cheque: savedAudit.system_check }
    : sysBreakdown
  const hasActualInput = actualCash.trim() !== '' || actualVisa.trim() !== '' || actualCheck.trim() !== ''

  /* ─── خلية «الفعلي» في جدول المقارنة — تتبدّل حسب حالة القفل/التعديل ───
     • غير مقفل: صندوق إدخال عادي.
     • مقفل + هذا الحقل قيد التعديل: صندوق إدخال + «حفظ التعديل» + «إلغاء».
     • مقفل + غير قيد التعديل: نص عادي يتمدّد بحرية + زر «تعديل» مستقل لهذا الرقم وحده. */
  const renderActualCell = (
    field: 'cash' | 'visa' | 'check',
    value: string, setValue: (v: string) => void, savedVal: number,
  ) => {
    if (!isLocked) {
      return (
        <input type="number" min="0" step="0.01" className="mi-td-input"
          style={{ width: '130px' }} placeholder="0.00"
          value={value}
          onChange={e => { setValue(e.target.value); setMatchOk(false) }}
          onFocus={e => { if (e.target.value === '0') setValue('') }}
          onKeyDown={e => e.key === 'Enter' && handleCalcDiff()} />
      )
    }
    if (editingField === field) {
      return (
        <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="number" min="0" step="0.01" className="mi-td-input"
            style={{ width: '120px' }} value={value} autoFocus
            onChange={e => setValue(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && savedAudit) saveFieldEdit(field, savedAudit) }} />
          <button className="btn btn-sm-green" disabled={saving}
            onClick={() => savedAudit && saveFieldEdit(field, savedAudit)}>
            {saving ? '...' : 'حفظ التعديل'}
          </button>
          <button className="btn btn-sm-outline" onClick={cancelFieldEdit}>إلغاء</button>
        </div>
      )
    }
    return (
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 700 }}>{fmt(savedVal)} ₪</span>
        <button className="btn btn-sm-outline" style={{ color: '#E67E22', borderColor: '#E67E22' }}
          disabled={editingField !== null} onClick={() => setPwdField(field)}>تعديل</button>
      </div>
    )
  }

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  const thStyle: React.CSSProperties = {
    padding: '0.55rem 0.85rem', textAlign: 'right', fontWeight: 600,
    fontSize: '0.85rem', color: '#555', borderBottom: '2px solid #e2e8f0',
  }
  const tdStyle: React.CSSProperties = {
    padding: '0.6rem 0.85rem', borderBottom: '1px solid #e8edf2',
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">الصندوق الرئيسي</h1>
      </div>

      {/* ── بطاقات ملخّص اليوم (إيرادات/مصاريف/موردين/رواتب) — مرتبطة بـ selectedDate وتتحدّث حياً ── */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">إيرادات اليوم (صيانة + بيع مباشر) ₪</span>
          <span className="stat-value" style={{ color: '#2ECC71' }}>
            {fmt(dayTotals.salesIncome)} ₪
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">مصاريف اليوم ₪</span>
          <span className="stat-value" style={{ color: '#E74C3C' }}>
            {fmt(dayTotals.expenses)} ₪
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">مدفوعات الموردين اليوم ₪</span>
          <span className="stat-value" style={{ color: '#E74C3C' }}>
            {fmt(dayTotals.supplierPayments)} ₪
          </span>
        </div>
        <div className="stat-card">
          <span className="stat-label">رواتب اليوم ₪</span>
          <span className="stat-value" style={{ color: '#E74C3C' }}>
            {fmt(dayTotals.salaries)} ₪
          </span>
        </div>
      </div>

      {/* ── Daily Stats ── */}
      {(() => {
        const saved = savedAudit

        // سجل مقفل: نعرض لقطة النظام المجمَّدة وقت التثبيت (لتطابق الفرق المُسجَّل)؛
        // خلاف ذلك نعرض الحساب الحيّ من الصندوق.
        const sysCash  = saved?.is_locked === 1 ? saved.system_cash  : sysBreakdown.cash
        const sysVisa  = saved?.is_locked === 1 ? saved.system_visa  : sysBreakdown.visa
        const sysCheck = saved?.is_locked === 1 ? saved.system_check : sysBreakdown.cheque
        const sysTotal = sysCash + sysVisa + sysCheck

        const actCash  = saved?.actual_cash   ?? null
        const actVisa  = saved?.actual_visa   ?? null
        const actCheck = saved?.actual_check  ?? null
        const actTotal = saved?.actual_amount ?? null

        const diffCash  = actCash  !== null ? actCash  - sysCash  : null
        const diffVisa  = actVisa  !== null ? actVisa  - sysVisa  : null
        const diffCheck = actCheck !== null ? actCheck - sysCheck : null
        const diffTotal = actTotal !== null ? actTotal - sysTotal : null

        const breakdown = (items: { label: string; color: string; value: number | null; signed?: boolean }[]) => (
          <div style={{ display: 'flex', gap: '0.6rem', marginTop: '0.55rem', flexWrap: 'wrap', justifyContent: 'center' }}>
            {items.map(it => (
              <span key={it.label} style={{ fontSize: '0.75rem', color: it.value !== null ? it.color : '#aaa', fontWeight: 500 }}>
                {it.label}:&nbsp;
                <span style={{ fontWeight: 700 }}>
                  {it.value === null ? '—' : `${it.value < 0 ? '−' : it.signed && it.value > 0 ? '+' : ''}${fmt(it.value)} ₪`}
                </span>
              </span>
            ))}
          </div>
        )

        return (
          <div className="stats-grid">
            {/* إجمالي النظام */}
            <div className="stat-card">
              <span className="stat-label">إجمالي النظام ₪</span>
              <span className="stat-value" style={{ color: sysTotal >= 0 ? '#2ECC71' : '#E74C3C' }}>
                {fmtSigned(sysTotal)} ₪
              </span>
              {breakdown([
                { label: 'كاش',  color: '#2ECC71', value: sysCash  },
                { label: 'فيزا', color: '#3498DB', value: sysVisa  },
                { label: 'شيك',  color: '#9B59B6', value: sysCheck },
              ])}
            </div>

            {/* المبلغ الفعلي */}
            <div className="stat-card">
              <span className="stat-label">المبلغ الفعلي ₪</span>
              <span className="stat-value balance">
                {actTotal !== null ? `${fmt(actTotal)} ₪` : '—'}
              </span>
              {breakdown([
                { label: 'كاش',  color: '#2ECC71', value: actCash  },
                { label: 'فيزا', color: '#3498DB', value: actVisa  },
                { label: 'شيك',  color: '#9B59B6', value: actCheck },
              ])}
            </div>

            {/* الفرق */}
            <div className="stat-card">
              <span className="stat-label">الفرق ₪</span>
              <span className="stat-value" style={{ color: diffTotal !== null ? diffColor(diffTotal) : '#999' }}>
                {diffTotal === null ? '—' : `${diffTotal > 0 ? '+' : diffTotal < 0 ? '−' : ''}${fmt(diffTotal)} ₪`}
              </span>
              {breakdown([
                { label: 'كاش',  color: diffCash  !== null ? diffColor(diffCash)  : '#aaa', value: diffCash,  signed: true },
                { label: 'فيزا', color: diffVisa  !== null ? diffColor(diffVisa)  : '#aaa', value: diffVisa,  signed: true },
                { label: 'شيك',  color: diffCheck !== null ? diffColor(diffCheck) : '#aaa', value: diffCheck, signed: true },
              ])}
            </div>
          </div>
        )
      })()}

      {/* ════ إحصاء نهاية اليوم ════ */}
      <div className="mi-card" style={{ marginTop: '1.5rem' }}>
        <h2 className="mi-section-title">إحصاء نهاية اليوم</h2>

        {/* Date picker */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
          <div className="mi-filter-field">
            <span className="mi-filter-label">تاريخ الحساب</span>
            <input
              type="date"
              className="mi-date-input"
              value={selectedDate}
              max={todayStr()}
              onChange={e => { const v = e.target.value; setSelectedDate(v > todayStr() ? todayStr() : v) }}
            />
          </div>
          {selectedDate !== todayStr() && (
            <button className="btn btn-ghost" onClick={() => setSelectedDate(todayStr())}>
              العودة لليوم
            </button>
          )}
        </div>

        {/* Locked banner */}
        {isLocked && (
          <div style={{
            marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.6rem',
            padding: '0.7rem 1rem', background: '#eef2f7', borderRadius: '8px',
            border: '1px solid #d8e0ea', color: '#334155', fontWeight: 600, fontSize: '0.9rem',
          }}>
            🔒 هذا الإحصاء مُثبَّت ومقفل. لتعديل أي رقم اضغط «تعديل» بجانبه وأدخل كلمة السر.
          </div>
        )}

        {/* Comparison table: system vs actual per method */}
        <div style={{ overflowX: 'auto', marginBottom: '1.25rem' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.93rem' }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                <th style={thStyle}>وسيلة الدفع</th>
                <th style={thStyle}>النظام ₪</th>
                <th style={thStyle}>{isLocked ? 'الفعلي' : 'الفعلي (أدخل)'}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={tdStyle}><span style={{ color: '#2ECC71', fontWeight: 600 }}>● كاش</span></td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtSigned(sysShown.cash)} ₪</td>
                <td style={tdStyle}>
                  {renderActualCell('cash', actualCash, setActualCash, savedAudit?.actual_cash ?? 0)}
                </td>
              </tr>
              <tr style={{ background: '#f8fafc' }}>
                <td style={tdStyle}><span style={{ color: '#3498DB', fontWeight: 600 }}>● فيزا</span></td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtSigned(sysShown.visa)} ₪</td>
                <td style={tdStyle}>
                  {renderActualCell('visa', actualVisa, setActualVisa, savedAudit?.actual_visa ?? 0)}
                </td>
              </tr>
              <tr>
                <td style={tdStyle}><span style={{ color: '#9B59B6', fontWeight: 600 }}>● شيك</span></td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtSigned(sysShown.cheque)} ₪</td>
                <td style={tdStyle}>
                  {renderActualCell('check', actualCheck, setActualCheck, savedAudit?.actual_check ?? 0)}
                </td>
              </tr>
              <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                <td style={tdStyle}>الإجمالي</td>
                <td style={{ ...tdStyle, color: (sysShown.cash + sysShown.visa + sysShown.cheque) >= 0 ? '#2ECC71' : '#E74C3C' }}>
                  {fmtSigned(sysShown.cash + sysShown.visa + sysShown.cheque)} ₪
                </td>
                <td style={{ ...tdStyle, color: '#555' }}>
                  {isLocked && savedAudit
                    ? `${fmt(savedAudit.actual_amount)} ₪`
                    : `${fmt((parseFloat(actualCash)||0) + (parseFloat(actualVisa)||0) + (parseFloat(actualCheck)||0))} ₪`}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Actions (only before locking) */}
        {!isLocked && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button
              className="btn btn-primary"
              disabled={!hasActualInput}
              onClick={handleCalcDiff}
            >
              احسب الفرق
            </button>
            <button
              className="btn btn-sm-green"
              disabled={!hasActualInput || saving}
              onClick={() => setLockConfirm(true)}
            >
              🔒 تثبيت وقفل الإحصاء
            </button>
          </div>
        )}

        {/* Match result */}
        {!isLocked && matchOk && (
          <div style={{
            marginTop: '1rem', display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '0.75rem 1rem', background: '#d4f5e3', borderRadius: '8px',
            border: '1px solid #a8e6c0',
          }}>
            <span style={{ color: '#1a7a45', fontWeight: 700, flex: 1 }}>✓ الصندوق مطابق تماماً</span>
            <button className="btn btn-sm-green" onClick={() => setLockConfirm(true)} disabled={saving}>
              🔒 تثبيت وقفل الإحصاء
            </button>
          </div>
        )}
      </div>

      {/* ════ سجل العمليات ════ */}
      <CollapsibleCard title={
        <>
          سجل العمليات
          <span style={{ fontSize: '0.85rem', fontWeight: 400, color: '#888', marginRight: '0.5rem' }}>
            {selectedDate}
          </span>
        </>
      }>
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>النوع</th>
                <th>المصدر</th>
                <th>المبلغ</th>
                <th>الرصيد بعد العملية</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="mi-empty-row">جارٍ تحميل الحركات...</td></tr>
              ) : paginatedRows.length === 0 ? (
                <tr><td colSpan={6} className="mi-empty-row">لا توجد عمليات في هذا اليوم</td></tr>
              ) : paginatedRows.map((tx, i) => (
                <tr
                  key={tx.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={() => setDetailsTx(tx)}
                >
                  <td>{tx.date}</td>
                  <td>
                    <span className={tx.type === 'incoming' ? 'cl-badge-in' : 'cl-badge-out'}>
                      {TYPE_LABELS[tx.type]}
                    </span>
                  </td>
                  <td>{tx.sourceLabel}</td>
                  <td>
                    <div className={tx.type === 'incoming' ? 'cl-amount-in' : 'cl-amount-out'} style={{ fontWeight: 700 }}>
                      {tx.type === 'incoming' ? '+' : '−'}{fmt(tx.amount)} ₪
                    </div>
                    {tx.isBulk ? (
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.3rem', alignItems: 'center' }}>
                        <span style={bulkBadgeStyle}>دفعة عامة · {tx.allocations.length} فواتير</span>
                        <span style={{
                          fontSize: '0.75rem', padding: '1px 7px', borderRadius: '10px',
                          background: (METHOD_COLORS[tx.method] ?? '#999') + '22',
                          color: METHOD_COLORS[tx.method] ?? '#999',
                          fontWeight: 600, whiteSpace: 'nowrap',
                        }}>
                          {METHOD_LABELS[tx.method] ?? tx.method}
                        </span>
                      </div>
                    ) : tx.breakdown.length > 1 && (
                      <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.3rem' }}>
                        {tx.breakdown.map((b, bi) => (
                          <span key={bi} style={{
                            fontSize: '0.75rem', padding: '1px 7px', borderRadius: '10px',
                            background: (METHOD_COLORS[b.method] ?? '#999') + '22',
                            color: METHOD_COLORS[b.method] ?? '#999',
                            fontWeight: 600, whiteSpace: 'nowrap',
                          }}>
                            {METHOD_LABELS[b.method] ?? b.method} {fmt(b.amount)}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="mi-amount">{fmt(tx.balanceAfter)} ₪</td>
                  <td>{tx.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={opsPage}
          totalItems={rows.length}
          pageSize={opsPageSize}
          onPageChange={setOpsPage}
          onPageSizeChange={(size) => { setOpsPageSize(size); setOpsPage(1) }}
        />
        <p className="mi-row-hint">اضغط على أي صف لعرض التفاصيل</p>
      </CollapsibleCard>

      {/* ════ سجل الإحصاءات اليومية ════ */}
      <CollapsibleCard title="سجل الإحصاءات اليومية">
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>التاريخ</th>
                <th>إجمالي النظام ₪</th>
                <th>كاش ₪</th>
                <th>فيزا ₪</th>
                <th>شيك ₪</th>
                <th>الإجمالي الفعلي ₪</th>
                <th>الفرق ₪</th>
                <th>الحالة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {auditsLoading ? (
                <tr><td colSpan={9} className="mi-empty-row">جارٍ التحميل...</td></tr>
              ) : paginatedAudits.length === 0 ? (
                <tr><td colSpan={9} className="mi-empty-row">لا توجد إحصاءات مسجّلة بعد</td></tr>
              ) : paginatedAudits.map((rec, i) => (
                <tr key={rec.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setSelectedDate(rec.audit_date)}>
                  <td>{rec.audit_date}</td>
                  <td className="mi-amount">{fmtSigned(rec.system_total)} ₪</td>
                  <td className="mi-amount">{fmt(rec.actual_cash  || 0)} ₪</td>
                  <td className="mi-amount">{fmt(rec.actual_visa  || 0)} ₪</td>
                  <td className="mi-amount">{fmt(rec.actual_check || 0)} ₪</td>
                  <td className="mi-amount">{fmt(rec.actual_amount)} ₪</td>
                  <td style={{ fontWeight: 700, color: diffColor(rec.difference) }}>
                    {rec.difference > 0 ? '+' : rec.difference < 0 ? '−' : ''}{fmt(rec.difference)} ₪
                  </td>
                  <td>{auditBadge(rec.difference)}</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-secondary btn-sm-outline" onClick={() => handlePrintAudit(rec)}>طباعة</button>
                      {/* التعديل يتم من بطاقة «إحصاء نهاية اليوم» أعلاه (تعديل مستقل لكل رقم عبر كلمة السر)
                          بعد فتح يوم السجل — اضغط على الصف. */}
                      <button className="btn btn-sm-outline" style={{ color: '#E67E22', borderColor: '#E67E22' }}
                        onClick={() => setSelectedDate(rec.audit_date)}>تعديل</button>
                      <button className="btn btn-danger-sm" onClick={() => setDeleteAudit(rec)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={auditPage}
          totalItems={auditRecords.length}
          pageSize={auditPageSize}
          onPageChange={setAuditPage}
          onPageSizeChange={(size) => { setAuditPageSize(size); setAuditPage(1) }}
        />
        <p className="mi-row-hint">اضغط على أي صف لعرض إحصاء ذلك اليوم في البطاقات أعلاه</p>
      </CollapsibleCard>

      {/* ════ Details Modal ════ */}
      {detailsTx && (
        <div className="mi-modal-overlay" onClick={() => setDetailsTx(null)}>
          <div className="mi-modal mi-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                تفاصيل العملية
                {detailsTx.isBulk && <span style={bulkBadgeStyle}>دفعة عامة</span>}
              </h3>
              <button className="mi-modal-close" onClick={() => setDetailsTx(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsTx.date}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">النوع</span>
                  <span className={detailsTx.type === 'incoming' ? 'cl-badge-in' : 'cl-badge-out'}>
                    {TYPE_LABELS[detailsTx.type]}
                  </span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المصدر</span>
                  <span>{detailsTx.sourceLabel}</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المبلغ الإجمالي</span>
                  <span className={detailsTx.type === 'incoming' ? 'cl-amount-in' : 'cl-amount-out'}>
                    {detailsTx.type === 'incoming' ? '+' : '−'}{fmt(detailsTx.amount)} ₪
                  </span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الرصيد بعد العملية</span>
                  <span className="mi-amount">{fmt(detailsTx.balanceAfter)} ₪</span>
                </div>

                {/* دفعة عامة: طريقة دفع واحدة موحّدة + توزيع على الفواتير (وليست وسائل دفع متعددة) */}
                {detailsTx.isBulk && detailsTx.method && (
                  <div className="mi-detail-item">
                    <span className="mi-detail-label">طريقة الدفع</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', fontWeight: 700, color: METHOD_COLORS[detailsTx.method] ?? '#555' }}>
                      <span style={{
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: METHOD_COLORS[detailsTx.method] ?? '#999', flexShrink: 0,
                      }} />
                      {METHOD_LABELS[detailsTx.method] ?? detailsTx.method}
                    </span>
                  </div>
                )}

                {detailsTx.isBulk ? (
                  detailsTx.allocations.length > 0 && (
                    <div className="mi-detail-item mi-detail-full">
                      <span className="mi-detail-label">توزيع الدفعة على الفواتير</span>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.3rem' }}>
                        {detailsTx.allocations.map((a, i) => (
                          <div key={i} style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            gap: '0.6rem', maxWidth: '340px',
                            padding: '0.3rem 0.55rem', borderRadius: '6px', background: '#f6f2fa',
                          }}>
                            <span style={{ fontWeight: 600, color: '#6c3483' }}>🧾 {a.invoiceLabel || '—'}</span>
                            <span style={{ fontWeight: 700 }}>{fmt(a.amount)} ₪</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                ) : detailsTx.breakdown.length > 0 && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">تفصيل وسائل الدفع</span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', marginTop: '0.2rem' }}>
                      {detailsTx.breakdown.map((b, i) => (
                        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                          <span style={{
                            width: '8px', height: '8px', borderRadius: '50%',
                            background: METHOD_COLORS[b.method] ?? '#999', flexShrink: 0,
                          }} />
                          <span style={{ fontWeight: 600, color: METHOD_COLORS[b.method] ?? '#555', minWidth: '40px' }}>
                            {METHOD_LABELS[b.method] ?? b.method}
                          </span>
                          <span style={{ fontWeight: 700 }}>{fmt(b.amount)} ₪</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {detailsTx.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsTx.notes}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary" onClick={() => handlePrint(detailsTx)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsTx(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ تأكيد التثبيت والقفل ════ */}
      {lockConfirm && (
        <ConfirmDialog
          title="تثبيت وقفل الإحصاء"
          message={`سيُثبَّت إحصاء يوم ${selectedDate} ويُقفَل.\nبعد القفل لا يمكن تعديل أي رقم إلا بإدخال كلمة السر. هل تريد المتابعة؟`}
          requirePassword={false}
          onConfirm={handleLock}
          onCancel={() => setLockConfirm(false)}
        />
      )}

      {/* ════ كلمة السر لفتح تعديل حقل مقفل ════ */}
      {pwdField && savedAudit && (
        <ConfirmDialog
          title="تعديل رقم مُثبَّت"
          message={`أنت على وشك تعديل «${pwdField === 'cash' ? 'الكاش' : pwdField === 'visa' ? 'الفيزا' : 'الشيك'}» في إحصاء مُدقَّق ومقفل ليوم ${selectedDate}.\nأدخل كلمة السر للمتابعة.`}
          onConfirm={(password) => beginFieldEdit(pwdField, password ?? '', savedAudit)}
          onCancel={() => setPwdField(null)}
        />
      )}

      {/* ════ Delete Audit Confirm ════ */}
      {deleteAudit && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف سجل إحصاء يوم ${deleteAudit.audit_date}؟`}
          onConfirm={() => handleDeleteAudit(deleteAudit)}
          onCancel={() => setDeleteAudit(null)}
        />
      )}

      {/* ════ Difference Modal ════ */}
      {diffModal && (
        <div className="mi-modal-overlay" onClick={() => setDiffModal(null)}>
          <div className="mi-modal mi-modal-sm" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>فرق في الصندوق</h3>
              <button className="mi-modal-close" onClick={() => setDiffModal(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.92rem', marginBottom: '1rem' }}>
                <thead>
                  <tr style={{ background: '#f1f5f9' }}>
                    <th style={thStyle}>وسيلة الدفع</th>
                    <th style={thStyle}>النظام ₪</th>
                    <th style={thStyle}>الفعلي ₪</th>
                    <th style={thStyle}>الفرق ₪</th>
                  </tr>
                </thead>
                <tbody>
                  {([
                    { label: 'كاش',  color: '#2ECC71', sys: diffModal.sysCash,  act: diffModal.actCash,  diff: diffModal.diffCash  },
                    { label: 'فيزا', color: '#3498DB', sys: diffModal.sysVisa,  act: diffModal.actVisa,  diff: diffModal.diffVisa  },
                    { label: 'شيك',  color: '#9B59B6', sys: diffModal.sysCheck, act: diffModal.actCheck, diff: diffModal.diffCheck },
                  ] as const).map(row => (
                    <tr key={row.label}>
                      <td style={tdStyle}><span style={{ color: row.color, fontWeight: 600 }}>● {row.label}</span></td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{fmtSigned(row.sys)} ₪</td>
                      <td style={{ ...tdStyle, fontWeight: 600 }}>{fmt(row.act)} ₪</td>
                      <td style={{ ...tdStyle, fontWeight: 700, color: diffColor(row.diff) }}>
                        {row.diff > 0 ? '+' : row.diff < 0 ? '−' : ''}{fmt(row.diff)} ₪
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: '#f1f5f9', fontWeight: 700 }}>
                    <td style={tdStyle}>الإجمالي</td>
                    <td style={tdStyle}>{fmtSigned(diffModal.sysCash + diffModal.sysVisa + diffModal.sysCheck)} ₪</td>
                    <td style={tdStyle}>{fmt(diffModal.actCash + diffModal.actVisa + diffModal.actCheck)} ₪</td>
                    <td style={{ ...tdStyle, color: diffColor(diffModal.diffCash + diffModal.diffVisa + diffModal.diffCheck) }}>
                      {(() => { const d = diffModal.diffCash + diffModal.diffVisa + diffModal.diffCheck; return `${d > 0 ? '+' : d < 0 ? '−' : ''}${fmt(d)} ₪` })()}
                    </td>
                  </tr>
                </tbody>
              </table>
              <div style={{
                padding: '0.75rem 1rem', background: '#FEF3C7', borderRadius: '8px',
                color: '#B45309', fontSize: '0.92rem', fontWeight: 600,
              }}>
                {(() => {
                  // رسالة تُحدِّد أي طريقة دفع فيها الفرق تحديداً (وليس رقماً إجمالياً مبهماً)
                  const parts = ([
                    { label: 'الكاش', diff: diffModal.diffCash  },
                    { label: 'الفيزا', diff: diffModal.diffVisa },
                    { label: 'الشيك', diff: diffModal.diffCheck },
                  ] as const)
                    .filter(p => Math.abs(p.diff) >= 0.001)
                    .map(p => `${p.label} بمقدار ${fmt(p.diff)} ₪ (${p.diff > 0 ? 'زيادة' : 'نقص'})`)
                  return `⚠ يوجد فرق في ${parts.join('، و')} — يرجى مراجعة عمليات اليوم قبل التثبيت`
                })()}
              </div>
            </div>
            <div className="mi-modal-footer">
              <button
                className="btn btn-sm-green"
                disabled={saving}
                onClick={() => { setDiffModal(null); setLockConfirm(true) }}
              >
                🔒 تثبيت وقفل الإحصاء
              </button>
              <button className="btn btn-ghost" onClick={() => setDiffModal(null)}>
                مراجعة العمليات
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
