/* ════════════════════════════════════════════════════════════════════════
   validate.ts — تحقّق دفاعي في الـ main process (M5)
   ───────────────────────────────────────────────────────────────────────
   الواجهة تتحقّق من المدخلات، لكن الـ main process لا يجب أن يثق بها ثقة عمياء:
   أي خلل في الواجهة أو استدعاء IPC مباشر يمكن أن يمرّر قيماً فاسدة. هذه الدوال
   ترمي رسائل عربية واضحة بدل ترك SQLite يرمي رسائل خام أو ترك بيانات فاسدة تُحفَظ.
════════════════════════════════════════════════════════════════════════ */
import type Database from 'better-sqlite3'
import type { PaymentInput } from './types'

/** يتحقّق أن المبلغ رقم منتهٍ وأكبر من صفر */
export function assertPositiveAmount(amount: number, label = 'المبلغ'): number {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    throw new Error(`${label} غير صالح`)
  }
  if (amount <= 0) {
    throw new Error(`${label} يجب أن يكون أكبر من صفر`)
  }
  return amount
}

/** يتحقّق أن القيمة رقم منتهٍ غير سالب (يسمح بالصفر) */
export function assertNonNegative(value: number, label = 'القيمة'): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} غير صالح`)
  }
  if (value < 0) {
    throw new Error(`${label} لا يمكن أن يكون سالباً`)
  }
  return value
}

/** يتحقّق أن النص غير فارغ بعد إزالة الفراغات */
export function assertNonEmpty(value: string | undefined | null, label: string): string {
  const v = (value ?? '').trim()
  if (!v) throw new Error(`${label} مطلوب`)
  return v
}

/* ── تفاصيل الشيك/الفيزا: بدل non-null assertions (p.chequeNumber!) نتحقّق
   صراحةً ونرمي رسالة عربية واضحة عند نقص أي حقل مطلوب ── */
export interface ChequeDetails {
  chequeNumber: string
  issueDate: string
  cashDate: string
  bankName: string
}

export function extractChequeDetails(p: PaymentInput): ChequeDetails {
  return {
    chequeNumber: assertNonEmpty(p.chequeNumber, 'رقم الشيك'),
    issueDate:    assertNonEmpty(p.issueDate, 'تاريخ إصدار الشيك'),
    cashDate:     assertNonEmpty(p.cashDate, 'تاريخ صرف الشيك'),
    bankName:     assertNonEmpty(p.bankName, 'اسم البنك (الشيك)'),
  }
}

export interface VisaDetails {
  bankName: string
  transactionNumber: string
}

export function extractVisaDetails(p: PaymentInput): VisaDetails {
  return {
    bankName:          assertNonEmpty(p.bankName, 'اسم البنك (الفيزا)'),
    transactionNumber: assertNonEmpty(p.transactionNumber, 'رقم عملية الفيزا'),
  }
}

/* L1: إدراج تفاصيل الشيك/الفيزا موحّد بدل تكراره في خمسة مواضع إدراج دفعات.
   أسماء الجداول تختلف حسب نوع الدفعة (صيانة/دين/مورد…)، فتُمرَّر كمعامل. يجب
   استدعاؤها داخل transaction. لا تفعل شيئاً للنقد أو الدين. */
export function insertChequeOrVisaDetails(
  db: Database.Database,
  payId: number,
  p: PaymentInput,
  tables: { cheque: string; visa: string },
): void {
  if (p.method === 'cheque') {
    const c = extractChequeDetails(p)
    db.prepare(
      `INSERT INTO ${tables.cheque} (payment_id, cheque_number, issue_date, cash_date, bank_name) VALUES (?,?,?,?,?)`,
    ).run(payId, c.chequeNumber, c.issueDate, c.cashDate, c.bankName)
  } else if (p.method === 'visa') {
    const v = extractVisaDetails(p)
    db.prepare(
      `INSERT INTO ${tables.visa} (payment_id, bank_name, transaction_number) VALUES (?,?,?)`,
    ).run(payId, v.bankName, v.transactionNumber)
  }
}
