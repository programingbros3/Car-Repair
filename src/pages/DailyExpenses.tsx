import { useState, useMemo, useRef, useEffect } from 'react'
import Fuse from 'fuse.js'
import { useGarage } from '../store/GarageContext'
import type { Expense } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import ExpenseForm, { hasExpenseDraft, clearExpenseDraft, type ExpenseFormHandle } from '../components/forms/ExpenseForm'
import Pagination from '../components/Pagination'
import { printPdf, escapeHtml as esc } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

const normalizeAr = (s: string) =>
  s.replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/\s+/g, '').toLowerCase()

function printExpense(exp: Expense): void {
  const body = `
    <div class="detail-grid">
      <div class="detail-item"><label>الوصف</label><span>${esc(exp.description)}</span></div>
      <div class="detail-item"><label>المبلغ</label><span class="amount-out">${exp.amount.toLocaleString('en-US')} ₪</span></div>
      <div class="detail-item"><label>التاريخ</label><span>${esc(exp.date)}</span></div>
      ${exp.notes ? `<div class="detail-item"><label>الملاحظات</label><span>${esc(exp.notes)}</span></div>` : ''}
    </div>`
  printPdf('مصروف يومي', body)
}

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function DailyExpenses() {
  const { expenses, reload } = useGarage()

  /* form */
  const [showForm,       setShowForm]       = useState(hasExpenseDraft())
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const formRef = useRef<ExpenseFormHandle>(null)

  /* modals */
  const [detailsExp, setDetailsExp] = useState<Expense | null>(null)
  const [deleteExp,  setDeleteExp]  = useState<Expense | null>(null)
  const [warnExp,    setWarnExp]    = useState<Expense | null>(null)

  /* filters */
  const [search,     setSearch]     = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')
  const [amtMin,     setAmtMin]     = useState('')
  const [amtMax,     setAmtMax]     = useState('')

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

  /* ── Pagination ── */
  const [currentPage, setCurrentPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  useEffect(() => {
    setCurrentPage(1)
  }, [search, filterFrom, filterTo, amtMin, amtMax])

  const paginatedExpenses = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredExpenses.slice(start, start + pageSize)
  }, [filteredExpenses, currentPage, pageSize])
  const clearFilters = () => { setSearch(''); setFilterFrom(''); setFilterTo(''); setAmtMin(''); setAmtMax('') }

  const totalExpenses = useMemo(
    () => filteredExpenses.reduce((s, e) => s + e.amount, 0),
    [filteredExpenses],
  )

  /* ── Form open/close ── */
  const openEdit = (exp: Expense) => setWarnExp(exp)

  const confirmEditExp = () => {
    if (!warnExp) return
    clearExpenseDraft()
    setEditingExpense(warnExp)
    setShowForm(true)
    setWarnExp(null)
  }

  const closeForm = () => { clearExpenseDraft(); setShowForm(false); setEditingExpense(null) }
  const onSaved   = () => { setShowForm(false); setEditingExpense(null) }

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
          <ExpenseForm ref={formRef} key="new" editingExpense={null} useDraft onSaved={onSaved} />
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={() => formRef.current?.save()}>حفظ المصروف</button>
            <button className="btn btn-ghost" onClick={closeForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Edit Modal ════ */}
      {showForm && editingExpense && (
        <div className="mi-modal-overlay" onClick={closeForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editingExpense.description}</h3>
              <button className="mi-modal-close" onClick={closeForm}>✕</button>
            </div>
            <div className="mi-modal-body">
              <ExpenseForm ref={formRef} key={editingExpense.id} editingExpense={editingExpense} onSaved={onSaved} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => formRef.current?.save()}>حفظ التعديلات</button>
              <button className="btn btn-ghost" onClick={closeForm}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Expenses list ════ */}
      <div className="mi-card">
        <div className="stat-card" style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', boxShadow: 'none', borderRadius: 0, padding: 0,
          paddingBottom: '1.25rem', marginBottom: '1.25rem',
          borderBottom: '1px solid #e8edf2',
        }}>
          <span className="stat-label">إجمالي المصاريف</span>
          <span className="stat-value outgoing">{totalExpenses.toLocaleString('en-US')} ₪</span>
        </div>
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
                onChange={e => setFilterFrom(e.target.value > today() ? today() : e.target.value)} />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى تاريخ</span>
              <input type="date" className="mi-date-input" value={filterTo} max={today()}
                onChange={e => setFilterTo(e.target.value > today() ? today() : e.target.value)} />
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
              {paginatedExpenses.length === 0 ? (
                <tr><td colSpan={5} className="mi-empty-row">لا توجد مصاريف تطابق البحث</td></tr>
              ) : paginatedExpenses.map((exp, i) => (
                <tr key={exp.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsExp(exp)}>
                  <td>{exp.description}</td>
                  <td className="mi-amount">{exp.amount.toLocaleString('en-US')} ₪</td>
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
        <Pagination
          currentPage={currentPage}
          totalItems={filteredExpenses.length}
          pageSize={pageSize}
          onPageChange={setCurrentPage}
          onPageSizeChange={(size) => {
            setPageSize(size)
            setCurrentPage(1)
          }}
        />
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
                  <span className="mi-amount">{detailsExp.amount.toLocaleString('en-US')} ₪</span>
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
            try { await dbService.expense.delete(deleteExp.id); await reload(['expenses', 'purchaseInvoices']); setDeleteExp(null) }
            catch (err) { showError('تعذّر حذف المصروف', err) }
          }}
          onCancel={() => setDeleteExp(null)}
        />
      )}

      {/* ════ Confirm before edit ════ */}
      {warnExp && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل المصروف "${warnExp.description}"؟`}
          onConfirm={confirmEditExp}
          onCancel={() => setWarnExp(null)}
        />
      )}
    </div>
  )
}
