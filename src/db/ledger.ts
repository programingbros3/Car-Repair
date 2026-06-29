import { getDB } from '../database'
import type { LedgerEntryInput, LedgerRow, LedgerSummary } from './types'

// ─── Reference types used across all payment functions ────────────────────────
export const REF = {
  MAINTENANCE_PAYMENT: 'maintenance_payment',
  MAINTENANCE_RELEASE: 'maintenance_release',
  DIRECT_SALE_PAYMENT: 'direct_sale_payment',
  DEBT_CUSTOMER: 'debt_customer',
  SUPPLIER_PAYMENT: 'supplier_payment',
  SUPPLIER_DEBT: 'supplier_debt',
  DAILY_EXPENSE: 'daily_expense',
  SALARY: 'salary',
} as const

// ─── Internal helper — always call inside a transaction ───────────────────────
export function recordLedgerEntry(entry: LedgerEntryInput): void {
  const db = getDB()

  const last = db.prepare(
    'SELECT balance_after FROM cash_ledger ORDER BY id DESC LIMIT 1'
  ).get() as { balance_after: number } | undefined

  const prevBalance = last?.balance_after ?? 0
  const balance_after = prevBalance + entry.amount_in - entry.amount_out

  db.prepare(`
    INSERT INTO cash_ledger
      (transaction_date, reference_type, reference_id, amount_in, amount_out, balance_after, notes)
    VALUES
      (@transaction_date, @reference_type, @reference_id, @amount_in, @amount_out, @balance_after, @notes)
  `).run({
    transaction_date: entry.transaction_date,
    reference_type: entry.reference_type,
    reference_id: entry.reference_id,
    amount_in: entry.amount_in,
    amount_out: entry.amount_out,
    balance_after,
    notes: entry.notes ?? null,
  })
}

// ─── Public queries ───────────────────────────────────────────────────────────

export function getLedgerSummary(): LedgerSummary {
  const db = getDB()

  const row = db.prepare(`
    SELECT
      COALESCE(SUM(amount_in),  0) AS total_in,
      COALESCE(SUM(amount_out), 0) AS total_out
    FROM cash_ledger
  `).get() as { total_in: number; total_out: number }

  return {
    total_in: row.total_in,
    total_out: row.total_out,
    balance: row.total_in - row.total_out,
  }
}

export function getLedgerByDateRange(from: string, to: string): LedgerRow[] {
  const db = getDB()

  return db.prepare(`
    SELECT * FROM cash_ledger
    WHERE transaction_date BETWEEN ? AND ?
    ORDER BY id ASC
  `).all(from, to) as LedgerRow[]
}
