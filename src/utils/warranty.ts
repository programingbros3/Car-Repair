import type { WarrantyPeriodUnit } from '../store/GarageContext'

/**
 * يحسب تاريخ انتهاء الكفالة بحساب UTC صرف (بدون الاعتماد على المنطقة الزمنية
 * المحلية) مع تثبيت اليوم على آخر يوم في الشهر الهدف عند التجاوز — مثال:
 * 2026-01-31 + شهر واحد يجب أن تُعطي 2026-02-28 وليس 2026-03-03 (تجاوز
 * JS الافتراضي لـ setMonth عند الأشهر الأقصر).
 */
export function calcEndDate(startDate: string, value: number, unit: WarrantyPeriodUnit): string {
  const [year, month, day] = startDate.split('-').map(Number)

  if (unit === 'week') {
    const d = new Date(Date.UTC(year, month - 1, day + value * 7))
    return d.toISOString().slice(0, 10)
  }

  const monthsToAdd = unit === 'year' ? value * 12 : value
  const totalMonths = (month - 1) + monthsToAdd
  const targetYear = year + Math.floor(totalMonths / 12)
  const targetMonth = ((totalMonths % 12) + 12) % 12
  const lastDayOfTargetMonth = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate()
  const targetDay = Math.min(day, lastDayOfTargetMonth)

  return new Date(Date.UTC(targetYear, targetMonth, targetDay)).toISOString().slice(0, 10)
}

/**
 * عدد الأيام المتبقية حتى تاريخ الانتهاء، بمقارنة تقويمية صرفة (يوم مقابل يوم)
 * بمعزل عن التوقيت المحلي أو ساعة اليوم الحالية — لا يعتمد على Date.now().
 */
export function daysRemaining(endDate: string): number {
  const [y, m, d] = endDate.split('-').map(Number)
  const end = Date.UTC(y, m - 1, d)

  const now = new Date()
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())

  return Math.round((end - today) / 86_400_000)
}
