import { useState, useEffect, useMemo } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { Expense } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const DRAFT_KEY = 'garage-exp-draft'
const today = () => new Date().toISOString().slice(0, 10)

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

const emptyForm = () => ({ description: '', amount: '', date: today(), notes: '' })

function printExpense(exp: Expense): void {
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><label>الوصف</label><span>${exp.description}</span></div>
      <div class="detail-item"><label>المبلغ</label><span class="amount-out">${exp.amount.toLocaleString('ar-EG')} ₪</span></div>
      <div class="detail-item"><label>التاريخ</label><span>${exp.date}</span></div>
      ${exp.notes ? `<div class="detail-item"><label>الملاحظات</label><span>${exp.notes}</span></div>` : ''}
    </div>`
  printPdf('مصروف يومي', body)
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function DailyExpenses() {
  const { expenses, reload } = useGarage()

  /* form */
  const [showForm,       setShowForm]       = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [form,           setForm]           = useState(emptyForm)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* modals */
  const [detailsExp, setDetailsExp] = useState<Expense | null>(null)
  const [deleteExp,  setDeleteExp]  = useState<Expense | null>(null)

  /* filters */
  const [search,     setSearch]     = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')
  const [amtMin,     setAmtMin]     = useState('')
  const [amtMax,     setAmtMax]     = useState('')

  /* ── Draft restore / persist ── */
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY)
      if (!raw) return
      const { form: f } = JSON.parse(raw) as { form: typeof form }
      setShowForm(true); setForm(f)
    } catch { localStorage.removeItem(DRAFT_KEY) }
  }, [])

  useEffect(() => {
    if (showForm && !editingExpense) {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ form }))
    }
  }, [showForm, editingExpense, form])

  /* ── Fuse.js ── */
  const fuseItems = useMemo(
    () => expenses.map((exp, i) => ({ _idx: i, description: normalizeAr(exp.description) })),
    [expenses],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, { keys: ['description'], threshold: 0.4, ignoreLocation: true }),
    [fuseItems],
  )

  const filteredExpenses = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => expenses[r.item._idx])
      : [...expenses]
    if (filterFrom) result = result.filter(e => e.date >= filterFrom)
    if (filterTo)   result = result.filter(e => e.date <= filterTo)
    if (amtMin)     result = result.filter(e => e.amount >= Number(amtMin))
    if (amtMax)     result = result.filter(e => e.amount <= Number(amtMax))
    return result
  }, [expenses, search, filterFrom, filterTo, amtMin, amtMax, fuse])

  const hasFilters   = !!search.trim() || !!filterFrom || !!filterTo || !!amtMin || !!amtMax
  const clearFilters = () => { setSearch(''); setFilterFrom(''); setFilterTo(''); setAmtMin(''); setAmtMax('') }

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((s, e) => s + e.amount, 0),
    [filteredExpenses],
  )

  /* ── Form helpers ── */
  const setField = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  const openEdit = (exp: Expense) => {
    localStorage.removeItem(DRAFT_KEY)
    setEditingExpense(exp)
    setForm({ description: exp.description, amount: String(exp.amount), date: exp.date, notes: exp.notes })
    setSubmitAttempted(false)
    setShowForm(true)
  }

  /* ── Validation ── */
  const descriptionErr = form.description.trim() ? '' : 'الوصف مطلوب'
  const amountErr      = Number(form.amount) > 0 ? '' : 'المبلغ يجب أن يكون أكبر من صفر'
  const hasErrors      = !!descriptionErr || !!amountErr

  /* ── Save ── */
  const handleSave = async () => {
    setSubmitAttempted(true)
    if (hasErrors) return
    const expData: Expense = {
      id: editingExpense?.id ?? 0, description: form.description,
      amount: Number(form.amount), date: form.date, notes: form.notes,
    }
    try {
      if (editingExpense) await dbService.expense.update(expData)
      else                await dbService.expense.add(expData)
      await reload()
      clearForm()
    } catch (err) {
      showError('تعذّر حفظ المصروف', err)
    }
  }

  const clearForm = () => {
    localStorage.removeItem(DRAFT_KEY)
    setShowForm(false); setSubmitAttempted(false)
    setForm(emptyForm()); setEditingExpense(null)
  }

  const showErr = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls  = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* Shared form body (used inline for add, inside modal for edit) */
  const formBody = (
    <div className="mi-form-grid">
      <label className="mi-field">
        <span>الوصف <span className="mi-required">*</span></span>
        <input type="text" value={form.description}
          onChange={e => setField('description', e.target.value)} placeholder="وصف المصروف"
          className={errCls(submitAttempted && !!descriptionErr)} />
        {showErr(descriptionErr)}
      </label>
      <label className="mi-field">
        <span>المبلغ (₪) <span className="mi-required">*</span></span>
        <input type="number" min={0} value={form.amount}
          onChange={e => setField('amount', e.target.value)} placeholder="0"
          className={errCls(submitAttempted && !!amountErr)} />
        {showErr(amountErr)}
      </label>
      <label className="mi-field">
        <span>التاريخ</span>
        <input type="date" value={form.date} max={today()}
          onChange={e => setField('date', e.target.value)} />
      </label>
      <label className="mi-field mi-field-full">
        <span>ملاحظات</span>
        <textarea rows={3} value={form.notes}
          onChange={e => setField('notes', e.target.value)}
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
        <h1 className="page-title">المصاريف اليومية</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingExpense(null); setShowForm(true) }}>
            + إضافة مصروف جديد
          </button>
        )}
      </div>

      {/* ════ Add Form (inline) ════ */}
      {showForm && !editingExpense && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">بيانات المصروف</h2>
          {formBody}
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSave}>حفظ المصروف</button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Edit Modal ════ */}
      {showForm && editingExpense && (
        <div className="mi-modal-overlay" onClick={clearForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editingExpense.description}</h3>
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

      {/* ════ Total card ════ */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">إجمالي المصاريف</span>
          <span className="stat-value outgoing">{totalExpenses.toLocaleString('ar-EG')} ₪</span>
        </div>
      </div>

      {/* ════ Expenses list ════ */}
      <div className="mi-card">
        <h2 className="mi-section-title">المصاريف المسجلة</h2>

        <div className="mi-filters">
          <div className="mi-search-wrap">
            <input type="text" className="mi-search-input" placeholder="🔍  بحث بالوصف..."
              value={search} onChange={e => setSearch(e.target.value)} />
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
            <div className="mi-filter-field">
              <span className="mi-filter-label">من مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input" value={amtMin}
                onChange={e => setAmtMin(e.target.value)} placeholder="0" />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى مبلغ ₪</span>
              <input type="number" min={0} className="mi-amount-input" value={amtMax}
                onChange={e => setAmtMax(e.target.value)} placeholder="∞" />
            </div>
            {hasFilters && (
              <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلتر</button>
            )}
          </div>
        </div>

        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>المبلغ ₪</th>
                <th>التاريخ</th>
                <th>ملاحظات</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr><td colSpan={5} className="mi-empty-row">لا توجد مصاريف تطابق البحث</td></tr>
              ) : filteredExpenses.map((exp, i) => (
                <tr key={exp.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsExp(exp)}>
                  <td>{exp.description}</td>
                  <td className="mi-amount">{exp.amount.toLocaleString('ar-EG')} ₪</td>
                  <td>{exp.date}</td>
                  <td>{exp.notes || '—'}</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => openEdit(exp)}>تعديل</button>
                      <button className="btn btn-danger-sm" onClick={() => setDeleteExp(exp)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Details Modal ════ */}
      {detailsExp && (
        <div className="mi-modal-overlay" onClick={() => setDetailsExp(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل المصروف</h3>
              <button className="mi-modal-close" onClick={() => setDetailsExp(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الوصف</span>
                  <strong>{detailsExp.description}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المبلغ</span>
                  <span className="mi-amount">{detailsExp.amount.toLocaleString('ar-EG')} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">التاريخ</span>
                  <span>{detailsExp.date}</span>
                </div>
                {detailsExp.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsExp.notes}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => printExpense(detailsExp)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsExp(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Delete Confirm ════ */}
      {deleteExp && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف المصروف "${deleteExp.description}"؟`}
          onConfirm={async () => {
            try { await dbService.expense.delete(deleteExp.id); await reload(); setDeleteExp(null) }
            catch (err) { showError('تعذّر حذف المصروف', err) }
          }}
          onCancel={() => setDeleteExp(null)}
        />
      )}
    </div>
  )
}
