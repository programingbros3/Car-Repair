import { useState, useMemo } from 'react'
import { useGarage } from '../store/GarageContext'
import type { Employee, SalaryRecord } from '../store/GarageContext'

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

const blockDigits = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault()
}
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

const emptyEmpForm    = () => ({ name: '', phone: '' })
const emptySalaryForm = () => ({ employeeId: '', amount: '', date: today(), notes: '' })

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Employees() {
  const { employees, setEmployees, salaries, setSalaries } = useGarage()

  /* employee form */
  const [showEmpForm,  setShowEmpForm]  = useState(false)
  const [editingEmp,   setEditingEmp]   = useState<Employee | null>(null)
  const [empForm,      setEmpForm]      = useState(emptyEmpForm)
  const [empSubmitted, setEmpSubmitted] = useState(false)

  /* salary form */
  const [showSalaryForm,   setShowSalaryForm]   = useState(false)
  const [editingSalary,    setEditingSalary]    = useState<SalaryRecord | null>(null)
  const [salaryForm,       setSalaryForm]       = useState(emptySalaryForm)
  const [salarySubmitted,  setSalarySubmitted]  = useState(false)

  /* details modals */
  const [detailsEmp,    setDetailsEmp]    = useState<Employee | null>(null)
  const [detailsSalary, setDetailsSalary] = useState<SalaryRecord | null>(null)

  /* salary filters */
  const [filterEmp,  setFilterEmp]  = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')

  const empName = (id: number) => employees.find(e => e.id === id)?.name ?? '—'
  const empPhone = (id: number) => employees.find(e => e.id === id)?.phone ?? ''

  const filteredSalaries = useMemo(() => {
    let result = [...salaries]
    if (filterEmp)  result = result.filter(s => s.employeeId === Number(filterEmp))
    if (filterFrom) result = result.filter(s => s.date >= filterFrom)
    if (filterTo)   result = result.filter(s => s.date <= filterTo)
    return result
  }, [salaries, filterEmp, filterFrom, filterTo])

  const hasFilters   = !!filterEmp || !!filterFrom || !!filterTo
  const clearFilters = () => { setFilterEmp(''); setFilterFrom(''); setFilterTo('') }

  const totalSalaries = useMemo(
    () => filteredSalaries.reduce((s, r) => s + r.amount, 0),
    [filteredSalaries],
  )

  /* ── Employee form ── */
  const setEmpField = (field: string, value: string) => setEmpForm(prev => ({ ...prev, [field]: value }))

  const openEmpEdit = (emp: Employee) => {
    setEditingEmp(emp)
    setEmpForm({ name: emp.name, phone: emp.phone })
    setEmpSubmitted(false)
    setShowEmpForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const empNameErr  = empForm.name.trim() ? (/\d/.test(empForm.name) ? 'الاسم يجب أن يحتوي على حروف فقط' : '') : 'اسم الموظف مطلوب'
  const empHasError = !!empNameErr

  const handleEmpSave = () => {
    setEmpSubmitted(true)
    if (empHasError) return
    if (editingEmp) {
      setEmployees(prev => prev.map(e => e.id !== editingEmp.id ? e : { ...e, name: empForm.name, phone: empForm.phone }))
    } else {
      setEmployees(prev => [{ id: Date.now(), name: empForm.name, phone: empForm.phone }, ...prev])
    }
    clearEmpForm()
  }

  const clearEmpForm = () => {
    setShowEmpForm(false); setEmpSubmitted(false); setEmpForm(emptyEmpForm()); setEditingEmp(null)
  }

  /* ── Salary form ── */
  const setSalaryField = (field: string, value: string) => setSalaryForm(prev => ({ ...prev, [field]: value }))

  const openSalaryEdit = (rec: SalaryRecord) => {
    setEditingSalary(rec)
    setSalaryForm({ employeeId: String(rec.employeeId), amount: String(rec.amount), date: rec.date, notes: rec.notes })
    setSalarySubmitted(false)
    setShowSalaryForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const salaryEmpErr    = salaryForm.employeeId ? '' : 'يجب اختيار الموظف'
  const salaryAmountErr = Number(salaryForm.amount) > 0 ? '' : 'المبلغ يجب أن يكون أكبر من صفر'
  const salaryHasError  = !!salaryEmpErr || !!salaryAmountErr

  const handleSalarySave = () => {
    setSalarySubmitted(true)
    if (salaryHasError) return
    if (editingSalary) {
      setSalaries(prev => prev.map(s => s.id !== editingSalary.id ? s : {
        ...s, employeeId: Number(salaryForm.employeeId), amount: Number(salaryForm.amount),
        date: salaryForm.date, notes: salaryForm.notes,
      }))
    } else {
      setSalaries(prev => [{
        id: Date.now(), employeeId: Number(salaryForm.employeeId),
        amount: Number(salaryForm.amount), date: salaryForm.date, notes: salaryForm.notes,
      }, ...prev])
    }
    clearSalaryForm()
  }

  const clearSalaryForm = () => {
    setShowSalaryForm(false); setSalarySubmitted(false); setSalaryForm(emptySalaryForm()); setEditingSalary(null)
  }

  const showEmpErr    = (msg: string) => empSubmitted && msg ? <span className="mi-err">{msg}</span> : null
  const showSalaryErr = (msg: string) => salarySubmitted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls        = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">الموظفون والرواتب</h1>
      </div>

      {/* ════ Employee Form ════ */}
      {showEmpForm && (
        <div className={`mi-card mi-form-card${editingEmp ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editingEmp ? `تعديل بيانات الموظف — ${editingEmp.name}` : 'بيانات الموظف'}
          </h2>
          <div className="mi-form-grid">
            <label className="mi-field">
              <span>اسم الموظف <span className="mi-required">*</span></span>
              <input type="text" value={empForm.name} onKeyDown={blockDigits}
                onChange={e => setEmpField('name', e.target.value)} placeholder="اسم الموظف"
                className={errCls(empSubmitted && !!empNameErr)} />
              {showEmpErr(empNameErr)}
            </label>
            <label className="mi-field">
              <span>رقم الهاتف</span>
              <input type="text" value={empForm.phone} onKeyDown={allowPhoneChars}
                onChange={e => setEmpField('phone', e.target.value)}
                placeholder="اتركه فارغاً إذا غير معروف" />
            </label>
          </div>
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleEmpSave}>
              {editingEmp ? 'حفظ التعديلات' : 'حفظ الموظف'}
            </button>
            <button className="btn btn-ghost" onClick={clearEmpForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Employees List ════ */}
      <div className="mi-card">
        <div className="mi-parts-header">
          <h2 className="mi-section-title">قائمة الموظفين</h2>
          {!showEmpForm && (
            <button className="btn btn-primary" onClick={() => { setEditingEmp(null); setShowEmpForm(true) }}>
              + إضافة موظف جديد
            </button>
          )}
        </div>
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr><th>اسم الموظف</th><th>رقم الهاتف</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan={3} className="mi-empty-row">لا يوجد موظفون</td></tr>
              ) : employees.map((emp, i) => (
                <tr key={emp.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsEmp(emp)}>
                  <td>{emp.name}</td>
                  <td>
                    {emp.phone
                      ? <span className="mi-phone-highlight">{emp.phone}</span>
                      : <span style={{ color: '#9ca3af' }}>—</span>
                    }
                  </td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => setDetailsEmp(emp)}>تفاصيل</button>
                      <button className="btn btn-sm-outline" onClick={() => openEmpEdit(emp)}>تعديل</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Salary Form ════ */}
      {showSalaryForm && (
        <div className={`mi-card mi-form-card${editingSalary ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editingSalary ? 'تعديل دفعة الراتب' : 'تسجيل راتب'}
          </h2>
          <div className="mi-form-grid">
            <label className="mi-field">
              <span>الموظف <span className="mi-required">*</span></span>
              <select value={salaryForm.employeeId}
                onChange={e => setSalaryField('employeeId', e.target.value)}
                className={'pay-select' + errCls(salarySubmitted && !!salaryEmpErr)}>
                <option value="">— اختر الموظف —</option>
                {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
              </select>
              {showSalaryErr(salaryEmpErr)}
            </label>
            <label className="mi-field">
              <span>المبلغ المدفوع (₪) <span className="mi-required">*</span></span>
              <input type="number" min={0} value={salaryForm.amount}
                onChange={e => setSalaryField('amount', e.target.value)} placeholder="0"
                className={errCls(salarySubmitted && !!salaryAmountErr)} />
              {showSalaryErr(salaryAmountErr)}
            </label>
            <label className="mi-field">
              <span>تاريخ الدفعة</span>
              <input type="date" value={salaryForm.date} max={today()}
                onChange={e => setSalaryField('date', e.target.value)} />
            </label>
            <label className="mi-field mi-field-full">
              <span>ملاحظات</span>
              <textarea rows={3} value={salaryForm.notes}
                onChange={e => setSalaryField('notes', e.target.value)}
                placeholder="أي ملاحظات إضافية..." />
            </label>
          </div>
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleSalarySave}>
              {editingSalary ? 'حفظ التعديلات' : 'حفظ الدفعة'}
            </button>
            <button className="btn btn-ghost" onClick={clearSalaryForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Stats ════ */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">إجمالي الرواتب المدفوعة</span>
          <span className="stat-value outgoing">{totalSalaries.toLocaleString('ar-EG')} ₪</span>
        </div>
      </div>

      {/* ════ Salary Records List ════ */}
      <div className="mi-card">
        <div className="mi-parts-header">
          <h2 className="mi-section-title">سجل الرواتب</h2>
          {!showSalaryForm && (
            <button className="btn btn-primary" onClick={() => { setEditingSalary(null); setShowSalaryForm(true) }}>
              + تسجيل راتب
            </button>
          )}
        </div>
        <div className="mi-filters">
          <div className="mi-search-wrap">
            <select className="mi-search-input" value={filterEmp} onChange={e => setFilterEmp(e.target.value)}>
              <option value="">كل الموظفين</option>
              {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
            </select>
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
              <button className="btn btn-ghost mi-clear-btn" onClick={clearFilters}>مسح الفلتر</button>
            )}
          </div>
        </div>
        <div className="mi-table-wrap">
          <table className="mi-table">
            <thead>
              <tr><th>الموظف</th><th>المبلغ المدفوع ₪</th><th>تاريخ الدفعة</th><th>ملاحظات</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              {filteredSalaries.length === 0 ? (
                <tr><td colSpan={5} className="mi-empty-row">لا توجد رواتب تطابق البحث</td></tr>
              ) : filteredSalaries.map((rec, i) => (
                <tr key={rec.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsSalary(rec)}>
                  <td>{empName(rec.employeeId)}</td>
                  <td className="mi-amount">{rec.amount.toLocaleString('ar-EG')} ₪</td>
                  <td>{rec.date}</td>
                  <td>{rec.notes || '—'}</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => setDetailsSalary(rec)}>تفاصيل</button>
                      <button className="btn btn-sm-outline" onClick={() => openSalaryEdit(rec)}>تعديل</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Employee Details Modal ════ */}
      {detailsEmp && (
        <div className="mi-modal-overlay" onClick={() => setDetailsEmp(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل الموظف</h3>
              <button className="mi-modal-close" onClick={() => setDetailsEmp(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الاسم</span>
                  <strong>{detailsEmp.name}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {detailsEmp.phone
                    ? <span className="mi-phone-highlight">{detailsEmp.phone}</span>
                    : <span style={{ color: '#9ca3af' }}>—</span>
                  }
                </div>
                <div className="mi-detail-item mi-detail-full">
                  <span className="mi-detail-label">إجمالي الرواتب المدفوعة</span>
                  <span className="mi-amount">
                    {salaries.filter(s => s.employeeId === detailsEmp.id).reduce((sum, s) => sum + s.amount, 0).toLocaleString('ar-EG')} ₪
                  </span>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-ghost" onClick={() => setDetailsEmp(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Salary Details Modal ════ */}
      {detailsSalary && (
        <div className="mi-modal-overlay" onClick={() => setDetailsSalary(null)}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تفاصيل دفعة الراتب</h3>
              <button className="mi-modal-close" onClick={() => setDetailsSalary(null)}>✕</button>
            </div>
            <div className="mi-modal-body">
              <div className="mi-detail-grid">
                <div className="mi-detail-item">
                  <span className="mi-detail-label">الموظف</span>
                  <strong>{empName(detailsSalary.employeeId)}</strong>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">رقم الهاتف</span>
                  {empPhone(detailsSalary.employeeId)
                    ? <span className="mi-phone-highlight">{empPhone(detailsSalary.employeeId)}</span>
                    : <span style={{ color: '#9ca3af' }}>—</span>
                  }
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">المبلغ المدفوع</span>
                  <span className="mi-amount">{detailsSalary.amount.toLocaleString('ar-EG')} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">تاريخ الدفعة</span>
                  <span>{detailsSalary.date}</span>
                </div>
                {detailsSalary.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsSalary.notes}</span>
                  </div>
                )}
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => { console.log('=== طباعة راتب ===', detailsSalary, empName(detailsSalary.employeeId)) }}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsSalary(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
