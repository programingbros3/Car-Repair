import type { DiscountType } from './types'

/**
 * يطبّق خصم الفاتورة (على مستوى الفاتورة كاملة) على مجموع البنود قبل الخصم:
 *   fixed      → يُطرح المبلغ كما هو
 *   percentage → يُطرح كنسبة من المجموع قبل الخصم
 * يرمي خطأً عربياً عند القيم غير الصالحة (نفس قواعد validation في الواجهة) —
 * حماية أخيرة في الـ main process كي لا يصبح total_amount سالباً أبداً.
 */
export function applyDiscount(
  subtotal: number,
  discountType: DiscountType | null | undefined,
  discountValue: number | null | undefined,
): number {
  const value = discountValue ?? 0
  if (!discountType || value === 0) return subtotal
  if (value < 0) throw new Error('قيمة الخصم لا يمكن أن تكون سالبة')
  if (discountType === 'percentage') {
    if (value > 100) throw new Error('نسبة الخصم يجب أن تكون بين 0 و 100')
    return subtotal - (subtotal * value) / 100
  }
  if (value > subtotal) throw new Error('قيمة الخصم لا يمكن أن تتجاوز مجموع البنود')
  return subtotal - value
}
