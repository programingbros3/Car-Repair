import { useState, useEffect, forwardRef, useImperativeHandle } from 'react'
import { useGarage } from '../../store/GarageContext'
import type { Expense } from '../../store/GarageContext'
import { dbService } from '../../services/db'
import { showError } from '../../utils/notify'

/* ════════════════════════════════════════
   ExpenseForm — نموذج إضافة/تعديل مصروف يومي (مشترك)
   يُستخدم داخل صفحة المصاريف (إضافة inline + تعديل modal)
   وداخل صفحة فواتير الشراء (إضافة modal).
════════════════════════════════════════ */
export const EXPENSE_DRAFT_KEY = 'garage-exp-draft'
const today = () => new Date().toISOString().slice(0, 10)

export const hasExpenseDraft   = () => !!localStorage.getItem(EXPENSE_DRAFT_KEY)
export const clearExpenseDraft = () => localStorage.removeItem(EXPENSE_DRAFT_KEY)

const emptyForm = () => ({ description: '', amount: '', date: today(), notes: '' })

const formFromRecord = (exp: Expense) => ({ description: exp.description, amount: String(exp.amount), date: exp.date, notes: exp.notes })

export type ExpenseFormHandle = { save: () => void }

type Props = {
  editingExpense: Expense | null
  useDraft?: boolean
  onSaved: () => void
}

const ExpenseForm = forwardRef<ExpenseFormHandle, Props>(function ExpenseForm(
  { editingExpense, useDraft = false, onSaved }, ref,
) {
  const { reload } = useGarage()

  const [form, setForm] = useState(() => editingExpense ? formFromRecord(editingExpense) : emptyForm())
  const [submitAttempted, setSubmitAttempted] = useState(false)

  /* Draft (add-mode only) */
  useEffect(() => {
    if (editingExpense || !useDraft) return
    try {
      const raw = localStorage.getItem(EXPENSE_DRAFT_KEY)
      if (!raw) return
      const { form: f } = JSON.parse(raw) as { form: typeof form }
      setForm(f)
    } catch { localStorage.removeItem(EXPENSE_DRAFT_KEY) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (useDraft && !editingExpense) localStorage.setItem(EXPENSE_DRAFT_KEY, JSON.stringify({ form }))
  }, [useDraft, editingExpense, form])

  const setField = (field: string, value: string) => setForm(prev => ({ ...prev, [field]: value }))

  const descriptionErr = form.description.trim() ? '' : 'الوصف مطلوب'
  const amountErr      = Number(form.amount) > 0 ? '' : 'المبلغ يجب أن يكون أكبر من صفر'
  const hasErrors      = !!descriptionErr || !!amountErr

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
      await reload(['expenses', 'purchaseInvoices'])   // M10
      if (useDraft && !editingExpense) localStorage.removeItem(EXPENSE_DRAFT_KEY)
      onSaved()
    } catch (err) {
      showError('تعذّر حفظ المصروف', err)
    }
  }

  useImperativeHandle(ref, () => ({ save: handleSave }))

  const showErr = (msg: string) => submitAttempted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls  = (bad: boolean) => bad ? ' mi-input-err' : ''

  return (
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
          onFocus={(e) => { if (e.target.value === '0') setField('amount', '') }}
          onBlur={(e) => { if (!e.target.value) setField('amount', '0') }}
          className={errCls(submitAttempted && !!amountErr)} />
        {showErr(amountErr)}
      </label>
      <label className="mi-field">
        <span>التاريخ</span>
        <input type="date" value={form.date} max={today()}
          onChange={e => setField('date', e.target.value > today() ? today() : e.target.value)} />
      </label>
      <label className="mi-field mi-field-full">
        <span>ملاحظات</span>
        <textarea rows={3} value={form.notes}
          onChange={e => setField('notes', e.target.value)}
          placeholder="أي ملاحظات إضافية..." />
      </label>
    </div>
  )
})

export default ExpenseForm
