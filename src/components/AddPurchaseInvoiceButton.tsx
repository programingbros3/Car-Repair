import { useState, useRef } from 'react'
import SourcePickerModal from './SourcePickerModal'
import SupplierInvoiceForm, { type SupplierInvoiceFormHandle } from './forms/SupplierInvoiceForm'
import ExpenseForm, { type ExpenseFormHandle } from './forms/ExpenseForm'
import SalaryForm, { type SalaryFormHandle } from './forms/SalaryForm'

/* ════════════════════════════════════════
   AddPurchaseInvoiceButton — زر إضافة فاتورة شراء من صفحة فواتير الشراء المجمّعة
   عند الضغط: اختيار النوع (مورد/مصروف/راتب) ثم فتح نفس نموذج الإضافة الأصلي داخل Modal.
   الحفظ يستدعي نفس قنوات IPC ونفس reload المعرّفة داخل النماذج المشتركة.
   useDraft=false هنا كي لا يتعارض مع مسودات صفحتي الموردين/المصاريف.
════════════════════════════════════════ */
type Step = 'closed' | 'pick' | 'supplier' | 'expense' | 'salary'

export default function AddPurchaseInvoiceButton({ label = '+ إضافة فاتورة' }: { label?: string }) {
  const [step, setStep] = useState<Step>('closed')
  const supRef    = useRef<SupplierInvoiceFormHandle>(null)
  const expRef    = useRef<ExpenseFormHandle>(null)
  const salaryRef = useRef<SalaryFormHandle>(null)

  const close = () => setStep('closed')

  return (
    <>
      <button className="btn btn-primary" onClick={() => setStep('pick')}>{label}</button>

      {step === 'pick' && (
        <SourcePickerModal
          title="اختر نوع الفاتورة"
          options={[
            { key: 'supplier', label: 'فاتورة مورد', desc: 'شراء بنود من مورد مع دفعات' },
            { key: 'expense',  label: 'مصروف يومي',  desc: 'مصروف تشغيلي' },
            { key: 'salary',   label: 'راتب',        desc: 'دفعة راتب موظف' },
          ]}
          onPick={k => setStep(k as Step)}
          onCancel={close}
        />
      )}

      {step === 'supplier' && (
        <div className="mi-modal-overlay" onClick={close}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>فاتورة مورد جديدة</h3>
              <button className="mi-modal-close" onClick={close}>✕</button>
            </div>
            <div className="mi-modal-body">
              <SupplierInvoiceForm ref={supRef} editing={null} onSaved={close} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => supRef.current?.save()}>حفظ الفاتورة</button>
              <button className="btn btn-ghost" onClick={close}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {step === 'expense' && (
        <div className="mi-modal-overlay" onClick={close}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>مصروف يومي جديد</h3>
              <button className="mi-modal-close" onClick={close}>✕</button>
            </div>
            <div className="mi-modal-body">
              <ExpenseForm ref={expRef} editingExpense={null} onSaved={close} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => expRef.current?.save()}>حفظ المصروف</button>
              <button className="btn btn-ghost" onClick={close}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {step === 'salary' && (
        <div className="mi-modal-overlay" onClick={close}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>تسجيل راتب</h3>
              <button className="mi-modal-close" onClick={close}>✕</button>
            </div>
            <div className="mi-modal-body">
              <SalaryForm ref={salaryRef} editingSalary={null} onSaved={close} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => salaryRef.current?.save()}>حفظ الدفعة</button>
              <button className="btn btn-ghost" onClick={close}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
