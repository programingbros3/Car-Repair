import { useState, useMemo, useRef } from 'react'
import { useGarage } from '../store/GarageContext'
import type { Employee, SalaryRecord } from '../store/GarageContext'
import ConfirmDialog from '../components/ConfirmDialog'
import SalaryForm, { type SalaryFormHandle } from '../components/forms/SalaryForm'
import { printPdf } from '../utils/printPdf'
import { dbService } from '../services/db'
import { showError } from '../utils/notify'

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

const emptyEmpForm = () => ({ name: '', phone: '', dailyWage: '' })

/* ════════════════════════════════════════
   Component
════════════════════════════════════════ */
export default function Employees() {
  const { employees, salaries, reload } = useGarage()

  /* employee form */
  const [showEmpForm,  setShowEmpForm]  = useState(false)
  const [editingEmp,   setEditingEmp]   = useState<Employee | null>(null)
  const [empForm,      setEmpForm]      = useState(emptyEmpForm)
  const [empSubmitted, setEmpSubmitted] = useState(false)

  /* salary form */
  const [showSalaryForm,  setShowSalaryForm]  = useState(false)
  const [editingSalary,   setEditingSalary]   = useState<SalaryRecord | null>(null)
  const salaryFormRef = useRef<SalaryFormHandle>(null)

  /* details modals */
  const [detailsEmp,    setDetailsEmp]    = useState<Employee | null>(null)
  const [detailsSalary, setDetailsSalary] = useState<SalaryRecord | null>(null)

  /* delete confirms */
  const [deleteEmp,    setDeleteEmp]    = useState<Employee | null>(null)
  const [deleteSalary, setDeleteSalary] = useState<SalaryRecord | null>(null)

  /* edit confirms */
  const [warnEmp,    setWarnEmp]    = useState<Employee | null>(null)
  const [warnSalary, setWarnSalary] = useState<SalaryRecord | null>(null)

  /* salary filters */
  const [filterEmp,  setFilterEmp]  = useState('')
  const [filterFrom, setFilterFrom] = useState('')
  const [filterTo,   setFilterTo]   = useState('')

  const empName  = (id: number) => employees.find(e => e.id === id)?.name ?? '—'
  const empPhone = (id: number) => employees.find(e => e.id === id)?.phone ?? ''

  /* ── Print salary receipt ── */
  const handlePrintSalary = (rec: SalaryRecord) => {
    const base = rec.dailyWageSnapshot * rec.daysWorked
    const body = `
      <div class="detail-grid">
        <div class="detail-item"><label>اسم الموظف</label><span>${empName(rec.employeeId)}</span></div>
        <div class="detail-item"><label>تاريخ الدفعة</label><span>${rec.date}</span></div>
        <div class="detail-item"><label>اليومية (وقت الدفعة)</label><span>${rec.dailyWageSnapshot.toLocaleString('en-US')} ₪/يوم</span></div>
        <div class="detail-item"><label>عدد أيام الدوام</label><span>${rec.daysWorked} يوم</span></div>
        <div class="detail-item" style="grid-column:span 2"><label>اليومية × الأيام (${rec.dailyWageSnapshot.toLocaleString('en-US')} × ${rec.daysWorked})</label><span>${base.toLocaleString('en-US')} ₪</span></div>
        <div class="detail-item"><label>البونص</label><span class="amount-in">+${rec.bonus.toLocaleString('en-US')} ₪</span></div>
        <div class="detail-item"><label>الخصم</label><span class="amount-out">−${rec.deduction.toLocaleString('en-US')} ₪</span></div>
      </div>
      <div style="text-align:center;margin:20px 0;padding:16px;background:#f0fdf4;border-radius:8px;border:2px solid #27ae60;">
        <div style="font-size:12px;color:#888;margin-bottom:4px;">الصافي النهائي</div>
        <div style="font-size:24px;font-weight:700;color:#27ae60;">${rec.amount.toLocaleString('en-US')} ₪</div>
      </div>
      ${rec.notes ? `<div style="margin-top:12px;padding:12px;background:#fafafa;border-radius:6px;"><span style="font-size:11px;color:#888;">ملاحظات:</span> ${rec.notes}</div>` : ''}
    `
    printPdf('إيصال راتب', body)
  }

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

  const doOpenEmpEdit = (emp: Employee) => {
    setEditingEmp(emp)
    setEmpForm({ name: emp.name, phone: emp.phone, dailyWage: String(emp.dailyWage) })
    setEmpSubmitted(false)
    setShowEmpForm(true)
  }

  const openEmpEdit = (emp: Employee) => setWarnEmp(emp)

  const confirmEmpEdit = () => {
    if (!warnEmp) return
    doOpenEmpEdit(warnEmp)
    setWarnEmp(null)
  }

  const empNameErr      = empForm.name.trim() ? (/\d/.test(empForm.name) ? 'الاسم يجب أن يحتوي على حروف فقط' : '') : 'اسم الموظف مطلوب'
  const empPhoneErr     = empForm.phone.trim() ? '' : 'رقم الهاتف مطلوب'
  const empDailyWageErr = Number(empForm.dailyWage) > 0 ? '' : 'اليومية يجب أن تكون أكبر من صفر'
  const empHasError     = !!empNameErr || !!empPhoneErr || !!empDailyWageErr

  const handleEmpSave = async () => {
    setEmpSubmitted(true)
    if (empHasError) return
    const empData: Employee = {
      id: editingEmp?.id ?? 0,
      name: empForm.name,
      phone: empForm.phone,
      dailyWage: Number(empForm.dailyWage),
    }
    try {
      if (editingEmp) await dbService.employee.update(empData)
      else            await dbService.employee.add(empData)
      await reload()
      clearEmpForm()
    } catch (err) {
      showError('تعذّر حفظ الموظف', err)
    }
  }

  const clearEmpForm = () => {
    setShowEmpForm(false); setEmpSubmitted(false); setEmpForm(emptyEmpForm()); setEditingEmp(null)
  }

  /* ── Salary form ── */
  const openSalaryEdit = (rec: SalaryRecord) => setWarnSalary(rec)

  const confirmSalaryEdit = () => {
    if (!warnSalary) return
    setEditingSalary(warnSalary)
    setShowSalaryForm(true)
    setWarnSalary(null)
  }

  const clearSalaryForm  = () => { setShowSalaryForm(false); setEditingSalary(null) }
  const onSalarySaved    = () => { setShowSalaryForm(false); setEditingSalary(null) }

  const showEmpErr = (msg: string) => empSubmitted && msg ? <span className="mi-err">{msg}</span> : null
  const errCls     = (bad: boolean) => bad ? ' mi-input-err' : ''

  /* Shared employee form body */
  const empFormBody = (
    <div className="mi-form-grid">
      <label className="mi-field">
        <span>اسم الموظف <span className="mi-required">*</span></span>
        <input type="text" value={empForm.name} onKeyDown={blockDigits}
          onChange={e => setEmpField('name', e.target.value)} placeholder="اسم الموظف"
          className={errCls(empSubmitted && !!empNameErr)} />
        {showEmpErr(empNameErr)}
      </label>
      <label className="mi-field">
        <span>رقم الهاتف <span className="mi-required">*</span></span>
        <input type="text" value={empForm.phone} onKeyDown={allowPhoneChars}
          onChange={e => setEmpField('phone', e.target.value)} placeholder="05XXXXXXXX"
          className={errCls(empSubmitted && !!empPhoneErr)} />
        {showEmpErr(empPhoneErr)}
      </label>
      <label className="mi-field">
        <span>اليومية (₪/يوم) <span className="mi-required">*</span></span>
        <input type="number" min={0.01} step="0.01" value={empForm.dailyWage}
          onChange={e => setEmpField('dailyWage', e.target.value)} placeholder="0"
          onFocus={e => { if (e.target.value === '0') setEmpField('dailyWage', '') }}
          onBlur={e  => { if (!e.target.value) setEmpField('dailyWage', '0') }}
          className={errCls(empSubmitted && !!empDailyWageErr)} />
        {showEmpErr(empDailyWageErr)}
      </label>
    </div>
  )

  /* ════════════════════════════════════════
     JSX
  ════════════════════════════════════════ */
  return (
    <div>
      <div className="page-header mi-page-header">
        <h1 className="page-title">الموظفون والرواتب</h1>
      </div>

      {/* ════ Employee Add Form (inline) ════ */}
      {showEmpForm && !editingEmp && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">بيانات الموظف</h2>
          {empFormBody}
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={handleEmpSave}>حفظ الموظف</button>
            <button className="btn btn-ghost"   onClick={clearEmpForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Employee Edit Modal ════ */}
      {showEmpForm && editingEmp && (
        <div className="mi-modal-overlay" onClick={clearEmpForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل — {editingEmp.name}</h3>
              <button className="mi-modal-close" onClick={clearEmpForm}>✕</button>
            </div>
            <div className="mi-modal-body">{empFormBody}</div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={handleEmpSave}>حفظ التعديلات</button>
              <button className="btn btn-ghost"   onClick={clearEmpForm}>إلغاء</button>
            </div>
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
              <tr><th>اسم الموظف</th><th>رقم الهاتف</th><th>اليومية (₪/يوم)</th><th>الإجراءات</th></tr>
            </thead>
            <tbody>
              {employees.length === 0 ? (
                <tr><td colSpan={4} className="mi-empty-row">لا يوجد موظفون</td></tr>
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
                  <td className="mi-amount">{emp.dailyWage.toLocaleString('en-US')} ₪</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-outline" onClick={() => openEmpEdit(emp)}>تعديل</button>
                      <button className="btn btn-danger-sm"  onClick={() => setDeleteEmp(emp)}>حذف</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ════ Salary Add Form (inline) ════ */}
      {showSalaryForm && !editingSalary && (
        <div className="mi-card mi-form-card">
          <h2 className="mi-section-title">تسجيل راتب</h2>
          <SalaryForm ref={salaryFormRef} key="new" editingSalary={null} onSaved={onSalarySaved} />
          <div className="mi-form-actions">
            <button className="btn btn-primary" onClick={() => salaryFormRef.current?.save()}>حفظ الدفعة</button>
            <button className="btn btn-ghost"   onClick={clearSalaryForm}>إلغاء</button>
          </div>
        </div>
      )}

      {/* ════ Salary Edit Modal ════ */}
      {showSalaryForm && editingSalary && (
        <div className="mi-modal-overlay" onClick={clearSalaryForm}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تعديل دفعة راتب — {empName(editingSalary.employeeId)}</h3>
              <button className="mi-modal-close" onClick={clearSalaryForm}>✕</button>
            </div>
            <div className="mi-modal-body">
              <SalaryForm ref={salaryFormRef} key={editingSalary.id} editingSalary={editingSalary} onSaved={onSalarySaved} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => salaryFormRef.current?.save()}>حفظ التعديلات</button>
              <button className="btn btn-ghost"   onClick={clearSalaryForm}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Salary Records List ════ */}
      <div className="mi-card">
        <div className="stat-card" style={{
          flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
          background: 'transparent', boxShadow: 'none', borderRadius: 0, padding: 0,
          paddingBottom: '1.25rem', marginBottom: '1.25rem',
          borderBottom: '1px solid #e8edf2',
        }}>
          <span className="stat-label">إجمالي الرواتب المدفوعة (الصافي)</span>
          <span className="stat-value outgoing">{totalSalaries.toLocaleString('en-US')} ₪</span>
        </div>
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
                onChange={e => setFilterFrom(e.target.value > today() ? today() : e.target.value)} />
            </div>
            <div className="mi-filter-field">
              <span className="mi-filter-label">إلى تاريخ</span>
              <input type="date" className="mi-date-input" value={filterTo} max={today()}
                onChange={e => setFilterTo(e.target.value > today() ? today() : e.target.value)} />
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
                <th>الموظف</th>
                <th>اليومية (وقت الدفعة)</th>
                <th>الأيام</th>
                <th>بونص ₪</th>
                <th>خصم ₪</th>
                <th>الصافي ₪</th>
                <th>تاريخ الدفعة</th>
                <th>الإجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filteredSalaries.length === 0 ? (
                <tr><td colSpan={8} className="mi-empty-row">لا توجد رواتب تطابق البحث</td></tr>
              ) : filteredSalaries.map((rec, i) => (
                <tr key={rec.id} className={`${i % 2 === 0 ? 'mi-row-even' : 'mi-row-odd'} mi-clickable-row`}
                  onClick={() => setDetailsSalary(rec)}>
                  <td>{empName(rec.employeeId)}</td>
                  <td className="mi-amount">{rec.dailyWageSnapshot.toLocaleString('en-US')} ₪</td>
                  <td>{rec.daysWorked}</td>
                  <td className="mi-amount">{rec.bonus.toLocaleString('en-US')} ₪</td>
                  <td className="mi-amount">{rec.deduction.toLocaleString('en-US')} ₪</td>
                  <td className="mi-amount" style={{ fontWeight: 700 }}>{rec.amount.toLocaleString('en-US')} ₪</td>
                  <td>{rec.date}</td>
                  <td>
                    <div className="mi-actions" onClick={e => e.stopPropagation()}>
                      <button className="btn btn-sm-green"   onClick={() => handlePrintSalary(rec)}>طباعة</button>
                      <button className="btn btn-sm-outline" onClick={() => openSalaryEdit(rec)}>تعديل</button>
                      <button className="btn btn-danger-sm"  onClick={() => setDeleteSalary(rec)}>حذف</button>
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
                <div className="mi-detail-item">
                  <span className="mi-detail-label">اليومية الحالية</span>
                  <span className="mi-amount">{detailsEmp.dailyWage.toLocaleString('en-US')} ₪/يوم</span>
                </div>
                <div className="mi-detail-item mi-detail-full">
                  <span className="mi-detail-label">إجمالي الرواتب المدفوعة (الصافي)</span>
                  <span className="mi-amount">
                    {salaries.filter(s => s.employeeId === detailsEmp.id).reduce((sum, s) => sum + s.amount, 0).toLocaleString('en-US')} ₪
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
                  <span className="mi-detail-label">اليومية (وقت الدفعة)</span>
                  <span className="mi-amount">{detailsSalary.dailyWageSnapshot.toLocaleString('en-US')} ₪/يوم</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">عدد أيام الدوام</span>
                  <span>{detailsSalary.daysWorked} يوم</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">بونص</span>
                  <span className="cl-amount-in">+{detailsSalary.bonus.toLocaleString('en-US')} ₪</span>
                </div>
                <div className="mi-detail-item">
                  <span className="mi-detail-label">خصم</span>
                  <span className="cl-amount-out">−{detailsSalary.deduction.toLocaleString('en-US')} ₪</span>
                </div>
                <div className="mi-detail-item mi-detail-full" style={{ borderTop: '2px solid #27ae60', paddingTop: '12px' }}>
                  <span className="mi-detail-label">الصافي النهائي</span>
                  <span className="mi-amount" style={{ fontSize: '18px', color: '#27ae60', fontWeight: 700 }}>
                    {detailsSalary.amount.toLocaleString('en-US')} ₪
                  </span>
                </div>
                {detailsSalary.notes && (
                  <div className="mi-detail-item mi-detail-full">
                    <span className="mi-detail-label">ملاحظات</span>
                    <span>{detailsSalary.notes}</span>
                  </div>
                )}
                <div className="mi-detail-item">
                  <span className="mi-detail-label">تاريخ الدفعة</span>
                  <span>{detailsSalary.date}</span>
                </div>
              </div>
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-secondary"
                onClick={() => handlePrintSalary(detailsSalary)}>طباعة</button>
              <button className="btn btn-ghost" onClick={() => setDetailsSalary(null)}>إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ════ Delete Employee Confirm ════ */}
      {deleteEmp && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف الموظف "${deleteEmp.name}"؟`}
          onConfirm={async () => {
            try { await dbService.employee.delete(deleteEmp.id); await reload(); setDeleteEmp(null) }
            catch (err) { showError('تعذّر حذف الموظف', err) }
          }}
          onCancel={() => setDeleteEmp(null)}
        />
      )}

      {/* ════ Delete Salary Confirm ════ */}
      {deleteSalary && (
        <ConfirmDialog
          title="تأكيد الحذف"
          message={`هل أنت متأكد من حذف دفعة راتب الموظف "${empName(deleteSalary.employeeId)}"؟`}
          onConfirm={async () => {
            try { await dbService.salary.delete(deleteSalary.id); await reload(); setDeleteSalary(null) }
            catch (err) { showError('تعذّر حذف دفعة الراتب', err) }
          }}
          onCancel={() => setDeleteSalary(null)}
        />
      )}

      {/* ════ Confirm before employee edit ════ */}
      {warnEmp && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل بيانات الموظف "${warnEmp.name}"؟`}
          onConfirm={confirmEmpEdit}
          onCancel={() => setWarnEmp(null)}
        />
      )}

      {/* ════ Confirm before salary edit ════ */}
      {warnSalary && (
        <ConfirmDialog
          title="تأكيد التعديل"
          message={`هل أنت متأكد من رغبتك في تعديل دفعة راتب الموظف "${empName(warnSalary.employeeId)}"؟`}
          onConfirm={confirmSalaryEdit}
          onCancel={() => setWarnSalary(null)}
        />
      )}
    </div>
  )
}
