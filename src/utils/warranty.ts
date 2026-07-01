import type { WarrantyPeriodUnit } from '../store/GarageContext'

export function calcEndDate(startDate: string, value: number, unit: WarrantyPeriodUnit): string {
  const d = new Date(startDate)
  if (unit === 'week')  d.setDate(d.getDate() + value * 7)
  if (unit === 'month') d.setMonth(d.getMonth() + value)
  if (unit === 'year')  d.setFullYear(d.getFullYear() + value)
  return d.toISOString().slice(0, 10)
}

export function daysRemaining(endDate: string): number {
  return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86_400_000)
}
