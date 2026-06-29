import { useState } from 'react'
import './PaymentForm.css'

// ─── Types ────────────────────────────────────────────────────────────────────

export type PaymentMethod = 'cash' | 'cheque' | 'visa' | 'debt'

export interface PaymentEntry {
  id: string
  method: PaymentMethod
  amount: number
  // حقول الشيك
  chequeNumber: string
  issueDate: string
  cashDate: string
  bankName: string
  // حقول الفيزا
  transactionNumber: string
  notes: string
}

export interface PaymentFormProps {
  totalAmount: number
  onConfirm: (payments: PaymentEntry[]) => void
  onCancel?: () => void
}

// ─── Constants ────────────────────────────────────────────────────────────────

const METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: 'كاش',
  cheque: 'شيك',
  visa: 'فيزا',
  debt: 'دين',
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function createEntry(method: PaymentMethod): PaymentEntry {
  return {
    id: crypto.randomUUID(),
    method,
    amount: 0,
    chequeNumber: '',
    issueDate: '',
    cashDate: '',
    bankName: '',
    transactionNumber: '',
    notes: '',
  }
}

function isEntryValid(entry: PaymentEntry): boolean {
  if (!entry.amount || entry.amount <= 0) return false
  if (entry.method === 'cheque') {
    if (!entry.chequeNumber || !entry.issueDate || !entry.cashDate || !entry.bankName) return false
  }
  if (entry.method === 'visa') {
    if (!entry.bankName || !entry.transactionNumber) return false
  }
  return true
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PaymentForm({ totalAmount, onConfirm, onCancel }: PaymentFormProps) {
  const [entries, setEntries] = useState<PaymentEntry[]>([])

  const totalPaid = entries.reduce((sum, e) => sum + (e.amount || 0), 0)
  const remaining = totalAmount - totalPaid
  const isOverPaid = totalPaid > totalAmount + 0.001
  const allValid = entries.length > 0 && !isOverPaid && entries.every(isEntryValid)

  function addEntry(method: PaymentMethod) {
    setEntries(prev => [...prev, createEntry(method)])
  }

  function updateEntry(id: string, field: keyof PaymentEntry, value: string | number) {
    setEntries(prev =>
      prev.map(e => (e.id === id ? { ...e, [field]: value } : e))
    )
  }

  function removeEntry(id: string) {
    setEntries(prev => prev.filter(e => e.id !== id))
  }

  return (
    <div className="pf-root" dir="rtl">

      {/* إجمالي الفاتورة */}
      <div className="pf-invoice-total">
        <span>إجمالي الفاتورة</span>
        <span>{totalAmount.toLocaleString('ar-SA')} ل.س</span>
      </div>

      {/* قائمة الدفعات */}
      {entries.map(entry => (
        <div key={entry.id} className={`pf-entry pf-entry--${entry.method}`}>
          <div className="pf-entry-header">
            <span className={`pf-badge pf-badge--${entry.method}`}>
              {METHOD_LABELS[entry.method]}
            </span>
            <button className="pf-remove-btn" onClick={() => removeEntry(entry.id)} title="حذف">
              ✕
            </button>
          </div>

          {/* المبلغ — مشترك لكل الطرق */}
          <div className="pf-field">
            <label>المبلغ</label>
            <input
              type="number"
              min={0}
              value={entry.amount || ''}
              placeholder="0"
              onChange={e => updateEntry(entry.id, 'amount', parseFloat(e.target.value) || 0)}
            />
          </div>

          {/* حقول الشيك */}
          {entry.method === 'cheque' && (
            <div className="pf-extra-fields">
              <div className="pf-field">
                <label>رقم الشيك</label>
                <input
                  type="text"
                  value={entry.chequeNumber}
                  onChange={e => updateEntry(entry.id, 'chequeNumber', e.target.value)}
                />
              </div>
              <div className="pf-row">
                <div className="pf-field">
                  <label>تاريخ الإصدار</label>
                  <input
                    type="date"
                    value={entry.issueDate}
                    onChange={e => updateEntry(entry.id, 'issueDate', e.target.value)}
                  />
                </div>
                <div className="pf-field">
                  <label>تاريخ الصرف</label>
                  <input
                    type="date"
                    value={entry.cashDate}
                    onChange={e => updateEntry(entry.id, 'cashDate', e.target.value)}
                  />
                </div>
              </div>
              <div className="pf-field">
                <label>اسم البنك</label>
                <input
                  type="text"
                  value={entry.bankName}
                  onChange={e => updateEntry(entry.id, 'bankName', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* حقول الفيزا */}
          {entry.method === 'visa' && (
            <div className="pf-extra-fields">
              <div className="pf-field">
                <label>اسم البنك</label>
                <input
                  type="text"
                  value={entry.bankName}
                  onChange={e => updateEntry(entry.id, 'bankName', e.target.value)}
                />
              </div>
              <div className="pf-field">
                <label>رقم العملية</label>
                <input
                  type="text"
                  value={entry.transactionNumber}
                  onChange={e => updateEntry(entry.id, 'transactionNumber', e.target.value)}
                />
              </div>
            </div>
          )}

          {/* ملاحظات — اختياري لكل الطرق */}
          <div className="pf-field">
            <label>ملاحظات (اختياري)</label>
            <input
              type="text"
              value={entry.notes}
              onChange={e => updateEntry(entry.id, 'notes', e.target.value)}
            />
          </div>
        </div>
      ))}

      {/* أزرار إضافة طريقة دفع */}
      <div className="pf-add-row">
        {(['cash', 'cheque', 'visa', 'debt'] as PaymentMethod[]).map(method => (
          <button
            key={method}
            className={`pf-add-btn pf-add-btn--${method}`}
            onClick={() => addEntry(method)}
          >
            + {METHOD_LABELS[method]}
          </button>
        ))}
      </div>

      {/* ملخص الدفع */}
      <div className="pf-summary">
        <div className="pf-summary-row">
          <span>المدفوع</span>
          <span className={isOverPaid ? 'pf-text-error' : 'pf-text-paid'}>
            {totalPaid.toLocaleString('ar-SA')} ل.س
          </span>
        </div>
        <div className="pf-summary-row pf-summary-row--main">
          <span>المتبقي</span>
          <span className={remaining < 0 ? 'pf-text-error' : remaining > 0 ? 'pf-text-debt' : 'pf-text-ok'}>
            {remaining.toLocaleString('ar-SA')} ل.س
          </span>
        </div>
      </div>

      {/* رسالة خطأ */}
      {isOverPaid && (
        <p className="pf-error-msg">المبلغ المدفوع يتجاوز إجمالي الفاتورة</p>
      )}

      {/* أزرار التأكيد والإلغاء */}
      <div className="pf-actions">
        {onCancel && (
          <button className="pf-btn pf-btn--cancel" onClick={onCancel}>
            إلغاء
          </button>
        )}
        <button
          className="pf-btn pf-btn--confirm"
          onClick={() => onConfirm(entries)}
          disabled={!allValid}
        >
          تأكيد الدفع
        </button>
      </div>

    </div>
  )
}
