// ════════════════════════════════════════════════════════════════════════
// bulkAllocation.ts — منطق توزيع «الدفعة العامة» على فواتير المورد غير المسدَّدة
// بترتيب FIFO (الأقدم أولاً). مستخرَج من Suppliers.tsx كي يبقى مصدراً واحداً
// للحقيقة يستعمله العرض (شاشة الموردين) واختبار المحاكاة معاً — بلا إعادة كتابة
// منطق موازٍ. وحدة خالصة بلا أي تبعية على React.
// ════════════════════════════════════════════════════════════════════════

// أقل ما يلزم من حقول الفاتورة لبناء التوزيع (id/تاريخ الشراء/المتبقّي عليها)
export interface FifoInvoice {
  id: number
  purchaseDate: string
  amountRemaining: number
}

// ترتيب FIFO: الأقدم تاريخاً أولاً، وعند تساوي التاريخ الأقدم إدخالاً (id الأصغر).
export function sortFifo<T extends FifoInvoice>(invoices: T[]): T[] {
  return [...invoices].sort((a, b) =>
    a.purchaseDate === b.purchaseDate ? a.id - b.id : a.purchaseDate.localeCompare(b.purchaseDate),
  )
}

// التوزيع الافتراضي: يمشي على الفواتير (المرتَّبة FIFO) ويأخذ من كل فاتورة
// min(المتبقّي من المبلغ، متبقّي الفاتورة) حتى ينفد المبلغ، مستبعِداً الأصفار.
export function buildFifoAllocations<T extends FifoInvoice>(
  sortedUnpaid: T[],
  amount: number,
): { invoice: T; amount: number }[] {
  let rest = Math.max(0, amount)
  return sortedUnpaid
    .map(inv => {
      const alloc = Math.min(rest, inv.amountRemaining)
      rest = Math.max(0, rest - alloc)
      return { invoice: inv, amount: alloc }
    })
    .filter(x => x.amount > 0.001)
}
