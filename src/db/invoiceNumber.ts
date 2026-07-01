import { getDB } from '../database'

const SEQ_DIGITS = 4

/**
 * فواتير الصيانة والبيع المباشر تشترك بتسلسل واحد ("INV") لأنهما تُعرضان
 * مجتمعتين كفاتورة بيع واحدة في SalesInvoices.tsx — لو استُخدم عدّاد منفصل
 * لكل جدول بنفس البادئة لأمكن ظهور نفس الرقم (مثلاً INV-2026-0001) على فاتورتين
 * مختلفتين، وهو ما يُفقد الرقم صفة "معرّف فريد يعرفه الزبون".
 */
export const SALES_INVOICE_NUMBER_TABLES = ['maintenance_invoices', 'direct_sale_invoices']

/** فواتير الموردين ("PUR") مستقلة تماماً عن تسلسل فواتير البيع. */
export const PURCHASE_INVOICE_NUMBER_TABLES = ['supplier_invoices']

/**
 * الرقم التسلسلي التالي بصيغة {prefix}-{year}-{seq}. يبحث عن أعلى رقم مستخدم
 * لنفس السنة عبر كل الجداول المُمرَّرة معاً (وليس كل جدول على حدة) لضمان تفرّد
 * الرقم عند تشارك عدة جداول نفس البادئة. يجب استدعاؤها دائماً من داخل نفس
 * transaction الذي يحتوي INSERT الفاتورة (better-sqlite3 متزامن على اتصال
 * واحد، فلا يوجد قارئ آخر يمكن أن يتداخل بين القراءة والإدراج).
 */
export function nextInvoiceNumber(prefix: string, tables: string[], year = new Date().getFullYear()): string {
  const db = getDB()
  const pattern = `${prefix}-${year}-%`

  let maxSeq = 0
  for (const table of tables) {
    const row = db.prepare(
      `SELECT invoice_number FROM ${table} WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`
    ).get(pattern) as { invoice_number: string } | undefined
    if (row) {
      const seq = Number(row.invoice_number.slice(-SEQ_DIGITS))
      if (seq > maxSeq) maxSeq = seq
    }
  }

  return `${prefix}-${year}-${String(maxSeq + 1).padStart(SEQ_DIGITS, '0')}`
}
