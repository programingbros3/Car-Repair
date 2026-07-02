import { useState, forwardRef, useImperativeHandle } from 'react'
import { useGarage } from '../../store/GarageContext'
import type { SalaryRecord } from '../../store/GarageContext'
import { dbService } from '../../services/db'
import { showError } from '../../utils/notify'

/* ════════════════════════════════════════
   SalaryForm — نموذج إضافة/تعديل دفعة راتب (مشترك)
   يُستخدم داخل صفحة الموظفين (إضافة inline + تعديل modal)
   وداخل صفحة فواتير الشراء (إضافة modal).
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

const emptyForm = () => ({ employeeId: '', daysWorked: '', bonus: '0', deduction: '0', date: today(), notes: '' })

const formFromRecord = (rec: SalaryRecord) => ({
  employeeId: String(rec.employeeId),
  daysWorked: String(rec.daysWorked),
  bonus:      String(rec.bonus),
  deduction:  String(rec.deduction),
  date:       rec.date,
  notes:      rec.notes,
})

export type SalaryFormHandle = { save: () => void }

type Props = {
  editingSalary: SalaryRecord | null
  onSaved: () => void
}

const SalaryForm = forwardRef<SalaryFormHandle, Props>(function SalaryForm(
  { editingSalary, onSaved }, ref,
) {
  const { employees, reload } = useGarage()

  const [salaryForm, setSalaryForm] = useState(() => editingSalary ? formFromRecord(editingSalary) : emptyForm())
  const [salarySubmitted, setSalarySubmitted] = useState(false)

  const setSalaryField = (field: string, value: string) => setSalaryForm(prev => ({ ...prev, [field]: value }))

  const selectedEmp = employees.find(e => e.id === Number(salaryForm.employeeId))
  const liveWage    = editingSalary ? editingSalary.dailyWageSnapshot : (selectedEmp?.dailyWage ?? 0)
  const liveNet     = liveWage * Number(salaryForm.daysWorked || 0)
                    + Number(salaryForm.bonus || 0)
                    - Number(salaryForm.deduction || 0)

  const salaryEmpErr    = salaryForm.employeeId ? '' : 'يجب اختيار الموظف'
  const salaryDaysErr   = Number(salaryForm.daysWorked) > 0 ? '' : 'عدد الأيام يجب أن يكون أكبر من صفر'
  const salaryBonusErr  = Number(salaryForm.bonus) >= 0 ? '' : 'البونص يجب أن يكون صفرًا أو أكبر'
  const salaryDeductErr = Number(salaryForm.deduction) >= 0 ? '' : 'الخصم يجب أن يكون صفرًا أو أكبر'
  const salaryHasError  = !!salaryEmpErr || !!salaryDaysErr || !!salaryBonusErr || !!salaryDeductErr

  const handleSave = async () => {
    setSalarySubmitted(true)
    if (salaryHasError) return
    const salData: SalaryRecord = {
      id:               editingSalary?.id ?? 0,
      employeeId:       Number(salaryForm.employeeId),
      amount:           0,   // computed on backend
      dailyWageSnapshot: editingSalary?.dailyWageSnapshot ?? 0,  // not used on add
      daysWorked:       Number(salaryForm.daysWorked),
      bonus:            Number(salaryForm.bonus || 0),
      deduction:        Number(salaryForm.deduction || 0),
      date:             salaryForm.date,
      notes:            salaryForm.notes,
    }
    try {
      if (editingSalary) await dbService.salary.update(editingSalary.id, salData)
      else               await dbService.salary.add(salData)
      await reload()
      onSaved()
    } catch (err) {
      showError('تعذّر حفظ دفعة الراتب', err)
    }
  }

  useImperativeHandle(ref, () => ({ save: handleSave }))

  const showSalaryErr = (msg: string) => salarySubmitted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls        = (bad: boolean) => bad ? ' mi-input-err' : ''

  return (
    <div className="mi-form-grid">
      <label className="mi-field">
        <span>الموظف <span className="mi-required">*</span></span>
        <select value={salaryForm.employeeId} disabled={!!editingSalary}
          onChange={e => setSalaryField('employeeId', e.target.value)}
          className={'pay-select' + errCls(salarySubmitted && !!salaryEmpErr)}>
          <option value="">— اختر الموظف —</option>
          {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
        </select>
        {showSalaryErr(salaryEmpErr)}
      </label>
      <label className="mi-field">
        <span>عدد أيام الدوام <span className="mi-required">*</span></span>
        <input type="number" min={0.5} step="0.5" value={salaryForm.daysWorked}
          onChange={e => setSalaryField('daysWorked', e.target.value)} placeholder="0"
          onFocus={e => { if (e.target.value === '0') setSalaryField('daysWorked', '') }}
          className={errCls(salarySubmitted && !!salaryDaysErr)} />
        {showSalaryErr(salaryDaysErr)}
      </label>
      <label className="mi-field">
        <span>بونص (₪)</span>
        <input type="number" min={0} step="0.01" value={salaryForm.bonus}
          onChange={e => setSalaryField('bonus', e.target.value)} placeholder="0"
          className={errCls(salarySubmitted && !!salaryBonusErr)} />
        {showSalaryErr(salaryBonusErr)}
      </label>
      <label className="mi-field">
        <span>خصم (₪)</span>
        <input type="number" min={0} step="0.01" value={salaryForm.deduction}
          onChange={e => setSalaryField('deduction', e.target.value)} placeholder="0"
          className={errCls(salarySubmitted && !!salaryDeductErr)} />
        {showSalaryErr(salaryDeductErr)}
      </label>
      <div className="mi-field">
        <span>صافي الراتب</span>
        <div style={{
          padding: '8px 12px', background: '#f0fdf4', border: '1px solid #27ae60',
          borderRadius: '6px', fontWeight: 700, fontSize: '16px', color: '#27ae60',
        }}>
          {liveNet.toLocaleString('en-US')} ₪
          {editingSalary && (
            <span style={{ fontSize: '11px', fontWeight: 400, color: '#888', marginRight: '8px' }}>
              (اليومية المحفوظة: {editingSalary.dailyWageSnapshot.toLocaleString('en-US')} ₪/يوم)
            </span>
          )}
        </div>
      </div>
      <label className="mi-field">
        <span>تاريخ الدفعة</span>
        <input type="date" value={salaryForm.date} max={today()}
          onChange={e => setSalaryField('date', e.target.value > today() ? today() : e.target.value)} />
      </label>
      <label className="mi-field mi-field-full">
        <span>ملاحظات</span>
        <textarea rows={3} value={salaryForm.notes}
          onChange={e => setSalaryField('notes', e.target.value)}
          placeholder="أي ملاحظات إضافية..." />
      </label>
    </div>
  )
})

export default SalaryForm
