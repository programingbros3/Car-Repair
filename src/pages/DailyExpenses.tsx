import { useState, useMemo } from 'react'
import Fuse from 'fuse.js'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type Expense = {
  id: number
  description: string
  amount: number
  date: string
  notes: string
}

/* ════════════════════════════════════════
   Initial data
════════════════════════════════════════ */
const INITIAL_EXPENSES: Expense[] = [
  { id: 1, description: 'فاتورة كهرباء',      amount: 450,  date: '2026-06-26', notes: 'فاتورة شهر يونيو' },
  { id: 2, description: 'شراء قطع غيار',       amount: 1200, date: '2026-06-27', notes: '' },
  { id: 3, description: 'وجبات غداء للعمال',   amount: 180,  date: '2026-06-28', notes: 'ثلاثة عمال' },
]

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

/* Normalize Arabic: unify alef forms, teh marbuta, alef maqsura, strip spaces */
const normalizeAr = (s: string) =>
  s
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/\s+/g, '')
    .toLowerCase()

const emptyForm = () => ({
  description: '',
  amount:      '',
  date:        today(),
  notes:       '',
})

/* ── Validation ── */
const validateDescription = (v: string) => v.trim() ? '' : 'الوصف مطلوب'
const validateAmount      = (v: string) => Number(v) > 0 ? '' : 'المبلغ يجب أن يكون أكبر من صفر'

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function DailyExpenses() {
  /* expenses */
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES)

  /* form */
  const [showForm, setShowForm]               = useState(false)
  const [editingExpense, setEditingExpense]   = useState<Expense | null>(null)
  const [form, setForm]                       = useState(emptyForm)
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* filters */
  const [search, setSearch]         = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')

  /* ── Fuse.js fuzzy search over normalized description ── */
  const fuseItems = useMemo(
    () => expenses.map((exp, i) => ({
      _idx:        i,
      description: normalizeAr(exp.description),
    })),
    [expenses],
  )
  const fuse = useMemo(
    () => new Fuse(fuseItems, {
      keys: ['description'],
      threshold: 0.4,
      ignoreLocation: true,
    }),
    [fuseItems],
  )

  /* ── Filtered expenses ── */
  const filteredExpenses = useMemo(() => {
    const q = search.trim()
    let result = q
      ? fuse.search(normalizeAr(q)).map(r => expenses[r.item._idx])
      : [...expenses]
    if (filterFrom) result = result.filter(e => e.date >= filterFrom)
    if (filterTo)   result = result.filter(e => e.date <= filterTo)
    return result
  }, [expenses, search, filterFrom, filterTo, fuse])

  const hasFilters   = !!search.trim() || !!filterFrom || !!filterTo
  const clearFilters = () => { setSearch(''); setFilterFrom(''); setFilterTo('') }

  /* ── Total of filtered expenses ── */
  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((s, e) => s + e.amount, 0),
    [filteredExpenses],
  )

  /* ── Form helpers ── */
  const setField = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  /* ── Open edit form by clicking a row ── */
  const openEdit = (exp: Expense) => {
    setEditingExpense(exp)
    setForm({
      description: exp.description,
      amount:      String(exp.amount),
      date:        exp.date,
      notes:       exp.notes,
    })
    setSubmitAttempted(false)
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  /* ── Validation ── */
  const descriptionErr = validateDescription(form.description)
  const amountErr      = validateAmount(form.amount)
  const hasErrors      = !!descriptionErr || !!amountErr

  /* ── Save (add or update) ── */
  const handleSave = () => {
    setSubmitAttempted(true)
    if (hasErrors) return

    if (editingExpense) {
      setExpenses(prev => prev.map(e => e.id !== editingExpense.id ? e : {
        ...e,
        description: form.description,
        amount:      Number(form.amount),
        date:        form.date,
        notes:       form.notes,
      }))
    } else {
      setExpenses(prev => [{
        id:          Date.now(),
        description: form.description,
        amount:      Number(form.amount),
        date:        form.date,
        notes:       form.notes,
      }, ...prev])
    }
    clearForm()
  }

  const clearForm = () => {
    setShowForm(false)
    setSubmitAttempted(false)
    setForm(emptyForm())
    setEditingExpense(null)
  }

  /* ── UI helpers ── */
  const showErr = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls  = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header mi-page-header">
        <h1 className="page-title">المصاريف اليومية</h1>
        {!showForm && (
          <button className="btn btn-primary" onClick={() => { setEditingExpense(null); setShowForm(true) }}>
            + إضافة مصروف جديد
          </button>
        )}
      </div>

      {/* ════ Form (add / edit) ════ */}
      {showForm && (
        <div className={`mi-card mi-form-card${editingExpense ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editingExpense
              ? `تعديل المصروف — ${editingExpense.description}`
              : 'بيانات المصروف'}
          </h2>
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

          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSave}>
              {editingExpense ? 'حفظ التعديلات' : 'حفظ المصروف'}
            </button>
            <button className="btn btn-ghost" onClick={clearForm}>إلغاء</button>
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

        {/* Filter bar */}
        <div className="mi-filters">
          <div className="mi-search-wrap">
            <input
              type="text"
              className="mi-search-input"
              placeholder="🔍  بحث بالوصف..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
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
            {hasFilters && (
              <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>
                مسح الفلتر
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr>
                <th>الوصف</th>
                <th>المبلغ</th>
                <th>التاريخ</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {filteredExpenses.length === 0 ? (
                <tr>
                  <td colSpan={4} className="mi-empty-row">لا توجد مصاريف تطابق البحث</td>
                </tr>
              ) : filteredExpenses.map((exp, i) => (
                <tr
                  key={exp.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={() => openEdit(exp)}
                >
                  <td>{exp.description}</td>
                  <td className="mi-amount">{exp.amount.toLocaleString('ar-EG')} ₪</td>
                  <td>{exp.date}</td>
                  <td>{exp.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showForm && (
          <p className="mi-row-hint">اضغط على أي صف لتعديل بياناته</p>
        )}
      </div>
    </div>
  )
}
