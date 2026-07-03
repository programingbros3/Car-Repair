import { useEffect, useState } from 'react'
import { dbService } from '../services/db'

/*
 * useSettlementTotal — يجلب مجموع "خصم التسوية" (settlement_discount) لفاتورة معيّنة
 * لعرضه بصف/سطر منفصل في مودالات التفاصيل (قراءة فقط، لا يمسّ أي حساب).
 * يعيد استخدام قنوات القراءة القائمة:
 *   - maintenance / direct_sale → payments:getByInvoice (تجمع payments + debt_payments)
 *   - supplier                  → supplierPayments:getByInvoice (تجمع supplier_payments + supplier_debt_payments)
 * القيمة المرجعة 0 حين لا فاتورة مفتوحة أو لا خصم تسوية.
 */
export function useSettlementTotal(
  source: 'maintenance' | 'direct_sale' | 'supplier' | null,
  id: number | null,
): number {
  const [total, setTotal] = useState(0)
  useEffect(() => {
    let cancelled = false
    if (!source || id == null) { setTotal(0); return }
    const p = source === 'supplier'
      ? dbService.invoicePayments.getSupplier(id)
      : dbService.invoicePayments.get(id, source)
    p.then(rows => {
      if (!cancelled) {
        setTotal(rows.reduce((s, r) => s + Number(r.settlement_discount || 0), 0))
      }
    }).catch(() => { if (!cancelled) setTotal(0) })
    return () => { cancelled = true }
  }, [source, id])
  return total
}
