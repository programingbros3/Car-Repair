import { useState, useRef } from 'react'
import SourcePickerModal from './SourcePickerModal'
import MaintenanceForm, { type MaintenanceFormHandle } from './forms/MaintenanceForm'
import DirectSaleForm, { type DirectSaleFormHandle } from './forms/DirectSaleForm'

/* ════════════════════════════════════════
   AddSalesInvoiceButton — زر إضافة فاتورة بيع (صيانة/بيع مباشر) من أي صفحة مجمّعة
   (الديون المعلقة / فواتير البيع / الكفالات).
   عند الضغط: اختيار المصدر ثم فتح نفس نموذج الإضافة الأصلي داخل Modal.
   الحفظ يستدعي نفس قنوات IPC ونفس reload المعرّفة داخل النماذج المشتركة —
   فتُنشأ فاتورة كاملة (بنود/دفعات/كفالات/Ledger/رقم فاتورة/خصم) دون أي منطق جديد.
   useDraft=false دائماً هنا كي لا يتعارض مع مسودات صفحتي الصيانة/البيع المباشر.
════════════════════════════════════════ */
type Step = 'closed' | 'pick' | 'maintenance' | 'direct_sale'

export default function AddSalesInvoiceButton({ label = '+ إضافة فاتورة' }: { label?: string }) {
  const [step, setStep] = useState<Step>('closed')
  const maintRef = useRef<MaintenanceFormHandle>(null)
  const dsRef    = useRef<DirectSaleFormHandle>(null)

  const close = () => setStep('closed')

  return (
    <>
      <button className="btn btn-primary" onClick={() => setStep('pick')}>{label}</button>

      {step === 'pick' && (
        <SourcePickerModal
          title="اختر نوع الفاتورة"
          options={[
            { key: 'maintenance', label: 'فاتورة صيانة', desc: 'سيارة صيانة ببنود وكفالات' },
            { key: 'direct_sale', label: 'فاتورة بيع مباشر', desc: 'بيع أصناف مع كفالة اختيارية' },
          ]}
          onPick={k => setStep(k as Step)}
          onCancel={close}
        />
      )}

      {step === 'maintenance' && (
        <div className="mi-modal-overlay" onClick={close}>
          <div className="mi-modal mi-modal-lg" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>فاتورة صيانة جديدة</h3>
              <button className="mi-modal-close" onClick={close}>✕</button>
            </div>
            <div className="mi-modal-body">
              <MaintenanceForm ref={maintRef} editingCar={null} onSaved={close} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => maintRef.current?.save()}>حفظ الفاتورة</button>
              <button className="btn btn-ghost" onClick={close}>إلغاء</button>
            </div>
          </div>
        </div>
      )}

      {step === 'direct_sale' && (
        <div className="mi-modal-overlay" onClick={close}>
          <div className="mi-modal" onClick={e => e.stopPropagation()}>
            <div className="mi-modal-header">
              <h3>فاتورة بيع مباشر جديدة</h3>
              <button className="mi-modal-close" onClick={close}>✕</button>
            </div>
            <div className="mi-modal-body">
              <DirectSaleForm ref={dsRef} editingInvoice={null} onSaved={close} />
            </div>
            <div className="mi-modal-footer">
              <button className="btn btn-primary" onClick={() => dsRef.current?.save()}>حفظ الفاتورة</button>
              <button className="btn btn-ghost" onClick={close}>إلغاء</button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
