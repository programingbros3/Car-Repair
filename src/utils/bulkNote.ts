// ════════════════════════════════════════════════════════════════════════
// bulkNote.ts — منطق بناء نص ملاحظة «الدفعة العامة للمورد» في سجل الصندوق.
// مستخرَج من CashLedger.tsx كي يبقى مصدراً واحداً للحقيقة يستعمله العرض
// (CashLedger) واختبار المحاكاة (scripts/simulate-bulk-payments.ts) معاً — بلا
// إعادة كتابة منطق موازٍ. وحدة خالصة بلا أي تبعية على React أو الـ DOM.
// ════════════════════════════════════════════════════════════════════════

// توزيع «دفعة عامة لمورد» على فاتورة واحدة (نفس طريقة الدفع لكل التوزيعات)
export type BulkAllocation = { invoiceLabel: string; amount: number }

export const fmt = (n: number) => Math.abs(n).toLocaleString('en-US')

/* ── دفعة عامة لمورد ──
   ملاحظة صف اللِّيدجر: «دفعة عامة لمورد {الاسم} #{bulkId} — فاتورة {رقم} — {الطريقة}».
   كل توزيع فاتورة صفٌّ مستقل، لكنها كلها بنفس bulkId فتُجمَّع في عملية واحدة. */
export const isBulkNote = (notes: string | null): boolean => /دفعة عامة/.test(notes ?? '')

// رقم الفاتورة (PUR-…) من ملاحظة التوزيع — يتوقّف عند أول فراغ أو شرطة
export const parseBulkInvoiceLabel = (notes: string | null): string => {
  const m = (notes ?? '').match(/فاتورة\s+([^\s—–]+)/)
  return m ? m[1] : ''
}

// أقصى عدد فواتير تُسرد نصياً في «الملاحظات»؛ فوقه نختصر ونعتمد قسم التوزيع بالتفاصيل
export const BULK_NOTE_MAX = 4

// ملخّص نصّي للملاحظات: «دفعة عامة لمورد خليل #1 — غطّت: PUR-2026-0001 (82₪)، …»
export const buildBulkSummary = (rawNote: string | null, allocations: BulkAllocation[]): string => {
  const m = (rawNote ?? '').match(/^دفعة عامة لمورد .+?#\d+/)
  const prefix = m ? m[0] : 'دفعة عامة'
  if (allocations.length === 0) return prefix
  if (allocations.length > BULK_NOTE_MAX) {
    return `${prefix} — غطّت ${allocations.length} فواتير (انظر التوزيع أدناه)`
  }
  const list = allocations
    .map(a => `${a.invoiceLabel || '—'} (${fmt(a.amount)}₪)`)
    .join('، ')
  return `${prefix} — غطّت: ${list}`
}
