import { useState, useMemo } from 'react'

/* ════════════════════════════════════════
   Types
════════════════════════════════════════ */
type Employee = {
  id: number
  name: string
  phone: string
}

type SalaryRecord = {
  id: number
  employeeId: number
  amount: number
  date: string
  notes: string
}

/* ════════════════════════════════════════
   Initial data
════════════════════════════════════════ */
const INITIAL_EMPLOYEES: Employee[] = [
  { id: 1, name: 'محمود علي',   phone: '0501112233' },
  { id: 2, name: 'سامي يوسف',   phone: '0594445566' },
  { id: 3, name: 'كريم حسن',    phone: '0567778899' },
]

const INITIAL_SALARIES: SalaryRecord[] = [
  { id: 1, employeeId: 1, amount: 3500, date: '2026-06-01', notes: 'راتب شهر مايو' },
  { id: 2, employeeId: 2, amount: 3000, date: '2026-06-01', notes: '' },
  { id: 3, employeeId: 3, amount: 2800, date: '2026-06-05', notes: 'دفعة أولى' },
  { id: 4, employeeId: 1, amount: 1500, date: '2026-06-20', notes: 'سلفة' },
]

/* ════════════════════════════════════════
   Module-level helpers
════════════════════════════════════════ */
const today = () => new Date().toISOString().slice(0, 10)

/* ── Key-press filter: block digits (name = letters only) ── */
const blockDigits = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && /\d/.test(e.key)) e.preventDefault()
}
const allowPhoneChars = (e: React.KeyboardEvent<HTMLInputElement>) => {
  if (e.key.length === 1 && !/[\d+\-() ]/.test(e.key)) e.preventDefault()
}

/* ── Validation ── */
const validateEmpName = (v: string) => {
  if (!v.trim()) return 'اسم الموظف مطلوب'
  if (/\d/.test(v)) return 'الاسم يجب أن يحتوي على حروف فقط'
  return ''
}
const validateEmployeeId = (v: string) => v ? '' : 'يجب اختيار الموظف'
const validateAmount     = (v: string) => Number(v) > 0 ? '' : 'المبلغ يجب أن يكون أكبر من صفر'

const emptyEmpForm = () => ({
  name:  '',
  phone: '',
})

const emptySalaryForm = () => ({
  employeeId: '',
  amount:     '',
  date:       today(),
  notes:      '',
})

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Employees() {
  /* data */
  const [employees, setEmployees] = useState<Employee[]>(INITIAL_EMPLOYEES)
  const [salaries, setSalaries]   = useState<SalaryRecord[]>(INITIAL_SALARIES)

  /* employee form */
  const [showEmpForm, setShowEmpForm]       = useState(false)
  const [editingEmp, setEditingEmp]         = useState<Employee | null>(null)
  const [empForm, setEmpForm]               = useState(emptyEmpForm)
  const [empSubmitted, setEmpSubmitted]     = useState(false)

  /* salary form */
  const [showSalaryForm, setShowSalaryForm]     = useState(false)
  const [editingSalary, setEditingSalary]       = useState<SalaryRecord | null>(null)
  const [salaryForm, setSalaryForm]             = useState(emptySalaryForm)
  const [salarySubmitted, setSalarySubmitted]   = useState(false)

  /* salary filters */
  const [filterEmp, setFilterEmp]   = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo, setFilterTo]     = useState('')

  /* ── Lookup helpers ── */
  const empName = (id: number) => employees.find(e => e.id === id)?.name ?? '—'

  /* ── Filtered salary records ── */
  const filteredSalaries = useMemo(() => {
    let result = [...salaries]
    if (filterEmp)  result = result.filter(s => s.employeeId === Number(filterEmp))
    if (filterFrom) result = result.filter(s => s.date >= filterFrom)
    if (filterTo)   result = result.filter(s => s.date <= filterTo)
    return result
  }, [salaries, filterEmp, filterFrom, filterTo])

  const hasFilters   = !!filterEmp || !!filterFrom || !!filterTo
  const clearFilters = () => { setFilterEmp(''); setFilterFrom(''); setFilterTo('') }

  /* ── Total of filtered salaries ── */
  const totalSalaries = useMemo(
    () => filteredSalaries.reduce((s, r) => s + r.amount, 0),
    [filteredSalaries],
  )

  /* ════════════════════════════════════════
     Employee form
  ════════════════════════════════════════ */
  const setEmpField = (field: string, value: string) => setEmpForm(prev => ({ ...prev, [field]: value }))

  const openEmpEdit = (emp: Employee) => {
    setEditingEmp(emp)
    setEmpForm({ name: emp.name, phone: emp.phone })
    setEmpSubmitted(false)
    setShowEmpForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const empNameErr  = validateEmpName(empForm.name)
  const empHasError = !!empNameErr

  const handleEmpSave = () => {
    setEmpSubmitted(true)
    if (empHasError) return

    if (editingEmp) {
      setEmployees(prev => prev.map(e => e.id !== editingEmp.id ? e : {
        ...e,
        name:  empForm.name,
        phone: empForm.phone,
      }))
    } else {
      setEmployees(prev => [{
        id:    Date.now(),
        name:  empForm.name,
        phone: empForm.phone,
      }, ...prev])
    }
    clearEmpForm()
  }

  const clearEmpForm = () => {
    setShowEmpForm(false)
    setEmpSubmitted(false)
    setEmpForm(emptyEmpForm())
    setEditingEmp(null)
  }

  /* ════════════════════════════════════════
     Salary form
  ════════════════════════════════════════ */
  const setSalaryField = (field: string, value: string) => setSalaryForm(prev => ({ ...prev, [field]: value }))

  const openSalaryEdit = (rec: SalaryRecord) => {
    setEditingSalary(rec)
    setSalaryForm({
      employeeId: String(rec.employeeId),
      amount:     String(rec.amount),
      date:       rec.date,
      notes:      rec.notes,
    })
    setSalarySubmitted(false)
    setShowSalaryForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const salaryEmpErr    = validateEmployeeId(salaryForm.employeeId)
  const salaryAmountErr = validateAmount(salaryForm.amount)
  const salaryHasError  = !!salaryEmpErr || !!salaryAmountErr

  const handleSalarySave = () => {
    setSalarySubmitted(true)
    if (salaryHasError) return

    if (editingSalary) {
      setSalaries(prev => prev.map(s => s.id !== editingSalary.id ? s : {
        ...s,
        employeeId: Number(salaryForm.employeeId),
        amount:     Number(salaryForm.amount),
        date:       salaryForm.date,
        notes:      salaryForm.notes,
      }))
    } else {
      setSalaries(prev => [{
        id:         Date.now(),
        employeeId: Number(salaryForm.employeeId),
        amount:     Number(salaryForm.amount),
        date:       salaryForm.date,
        notes:      salaryForm.notes,
      }, ...prev])
    }
    clearSalaryForm()
  }

  const clearSalaryForm = () => {
    setShowSalaryForm(false)
    setSalarySubmitted(false)
    setSalaryForm(emptySalaryForm())
    setEditingSalary(null)
  }

  /* ── UI helpers ── */
  const showEmpErr    = (msg: string) => empSubmitted && msg ? <span className="mi-err">{msg}</span> : null
  const showSalaryErr = (msg: string) => salarySubmitted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls        = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      {/* ── Page header ── */}
      <div className="page-header mi-page-header">
        <h1 className="page-title">الموظفون والرواتب</h1>
      </div>

      {/* ════════════════════════════════════
          Section 1 — Employees
      ════════════════════════════════════ */}

      {/* Employee form (add / edit) */}
      {showEmpForm && (
        <div className={`mi-card mi-form-card${editingEmp ? ' mi-form-card-edit' : ''}`}>
          <h2 className="mi-section-title">
            {editingEmp
              ? `تعديل بيانات الموظف — ${editingEmp.name}`
              : 'بيانات الموظف'}
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
                onChange={e => setEmpField('phone', e.target.value)} placeholder="05XXXXXXXX" />
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

      {/* Employees list */}
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
              <tr>
                <th>اسم الموظف</th>
                <th>رقم الهاتف</th>
              </tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr>
                  <td colSpan={2} className="mi-empty-row">لا يوجد موظفون</td>
                </tr>
              ) : employees.map((emp, i) => (
                <tr
                  key={emp.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={() => openEmpEdit(emp)}
                >
                  <td>{emp.name}</td>
                  <td>{emp.phone || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showEmpForm && (
          <p className="mi-row-hint">اضغط على أي صف لتعديل بياناته</p>
        )}
      </div>

      {/* ════════════════════════════════════
          Section 2 — Salary records
      ════════════════════════════════════ */}

      {/* Salary form (add / edit) */}
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
                {employees.map(emp => (
                  <option key={emp.id} value={emp.id}>{emp.name}</option>
                ))}
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

      {/* Total salaries card */}
      <div className="stats-grid">
        <div className="stat-card">
          <span className="stat-label">إجمالي الرواتب المدفوعة</span>
          <span className="stat-value outgoing">{totalSalaries.toLocaleString('ar-EG')} ₪</span>
        </div>
      </div>

      {/* Salary records list */}
      <div className="mi-card">
        <div className="mi-parts-header">
          <h2 className="mi-section-title">سجل الرواتب</h2>
          {!showSalaryForm && (
            <button className="btn btn-primary" onClick={() => { setEditingSalary(null); setShowSalaryForm(true) }}>
              + تسجيل راتب
            </button>
          )}
        </div>

        {/* Filter bar */}
        <div className="mi-filters">
          <div className="mi-search-wrap">
            <select className="mi-search-input" value={filterEmp}
              onChange={e => setFilterEmp(e.target.value)}>
              <option value="">كل الموظفين</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>{emp.name}</option>
              ))}
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
                <th>الموظف</th>
                <th>المبلغ المدفوع</th>
                <th>تاريخ الدفعة</th>
                <th>ملاحظات</th>
              </tr>
            </thead>
            <tbody>
              {filteredSalaries.length === 0 ? (
                <tr>
                  <td colSpan={4} className="mi-empty-row">لا توجد رواتب تطابق البحث</td>
                </tr>
              ) : filteredSalaries.map((rec, i) => (
                <tr
                  key={rec.id}
                  className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-row-clickable`}
                  onClick={() => openSalaryEdit(rec)}
                >
                  <td>{empName(rec.employeeId)}</td>
                  <td className="mi-amount">{rec.amount.toLocaleString('ar-EG')} ₪</td>
                  <td>{rec.date}</td>
                  <td>{rec.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!showSalaryForm && (
          <p className="mi-row-hint">اضغط على أي صف لتعديل بياناته</p>
        )}
      </div>
    </div>
  )
}
