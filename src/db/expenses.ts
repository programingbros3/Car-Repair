import { getDB } from '../database'
import { recordLedgerEntry, REF } from './ledger'
import type {
  DailyExpenseInput,
  DailyExpenseRow,
  ExpenseFilters,
  EmployeeInput,
  EmployeeRow,
  SalaryInput,
  SalaryRow,
} from './types'

// Shared salary SELECT columns
const SALARY_COLS = `
  sp.id,
  sp.employee_id,
  e.name AS employee_name,
  sp.amount,
  sp.daily_wage_snapshot,
  sp.days_worked,
  sp.bonus,
  sp.deduction,
  sp.payment_date,
  sp.notes,
  sp.created_at
`

// ─── Day 4: Daily expenses ────────────────────────────────────────────────────

export function addDailyExpense(input: DailyExpenseInput): number {
  const db = getDB()

  const run = db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO daily_expenses (description, amount, expense_date, notes)
      VALUES (@description, @amount, @expense_date, @notes)
    `).run({
      description: input.description,
      amount: input.amount,
      expense_date: input.expense_date,
      notes: input.notes ?? null,
    })

    const expenseId = Number(lastInsertRowid)

    recordLedgerEntry({
      transaction_date: input.expense_date,
      reference_type: REF.DAILY_EXPENSE,
      reference_id: expenseId,
      amount_in: 0,
      amount_out: input.amount,
      notes: input.description,
    })

    return expenseId
  })

  return run()
}

export function getDailyExpenses(filters: ExpenseFilters = {}): DailyExpenseRow[] {
  const db = getDB()

  const conditions: string[] = []
  const params: unknown[] = []

  if (filters.date_from) {
    conditions.push('expense_date >= ?')
    params.push(filters.date_from)
  }
  if (filters.date_to) {
    conditions.push('expense_date <= ?')
    params.push(filters.date_to)
  }
  if (filters.search) {
    conditions.push('description LIKE ?')
    params.push(`%${filters.search}%`)
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''

  return db.prepare(`
    SELECT * FROM daily_expenses ${where} ORDER BY expense_date DESC, id DESC
  `).all(...params) as DailyExpenseRow[]
}

// ─── Day 4: Employees ─────────────────────────────────────────────────────────

export function addEmployee(input: EmployeeInput): number {
  const db = getDB()

  const { lastInsertRowid } = db.prepare(`
    INSERT INTO employees (name, phone, daily_wage) VALUES (@name, @phone, @daily_wage)
  `).run({ name: input.name, phone: input.phone ?? null, daily_wage: input.daily_wage })

  return Number(lastInsertRowid)
}

export function updateEmployee(id: number, input: EmployeeInput): void {
  const db = getDB()
  db.prepare(`UPDATE employees SET name=?, phone=?, daily_wage=? WHERE id=?`)
    .run(input.name, input.phone ?? null, input.daily_wage, id)
}

export function getEmployees(): EmployeeRow[] {
  const db = getDB()
  return db.prepare('SELECT * FROM employees ORDER BY name ASC').all() as EmployeeRow[]
}

// ─── Day 4: Salary payments ───────────────────────────────────────────────────

export function addSalaryPayment(employeeId: number, input: SalaryInput): number {
  const db = getDB()

  const run = db.transaction(() => {
    const emp = db.prepare(
      'SELECT name, daily_wage FROM employees WHERE id = ?'
    ).get(employeeId) as { name: string; daily_wage: number } | undefined

    const dailyWage = emp?.daily_wage ?? 0
    const amount = dailyWage * input.days_worked + input.bonus - input.deduction

    const { lastInsertRowid } = db.prepare(`
      INSERT INTO salary_payments
        (employee_id, amount, daily_wage_snapshot, days_worked, bonus, deduction, payment_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(employeeId, amount, dailyWage, input.days_worked, input.bonus, input.deduction,
           input.payment_date, input.notes ?? null)

    const salaryId = Number(lastInsertRowid)

    recordLedgerEntry({
      transaction_date: input.payment_date,
      reference_type: REF.SALARY,
      reference_id: salaryId,
      amount_in: 0,
      amount_out: amount,
      notes: `راتب: ${emp?.name ?? `موظف #${employeeId}`}`,
    })

    return salaryId
  })

  return run()
}

export function updateSalaryPayment(id: number, input: SalaryInput): void {
  const db = getDB()

  db.transaction(() => {
    const existing = db.prepare(
      'SELECT daily_wage_snapshot, employee_id FROM salary_payments WHERE id = ?'
    ).get(id) as { daily_wage_snapshot: number; employee_id: number } | undefined

    if (!existing) throw new Error(`salary payment ${id} not found`)

    const amount = existing.daily_wage_snapshot * input.days_worked + input.bonus - input.deduction

    db.prepare(`
      UPDATE salary_payments
      SET days_worked=?, bonus=?, deduction=?, amount=?, payment_date=?, notes=?
      WHERE id=?
    `).run(input.days_worked, input.bonus, input.deduction, amount,
           input.payment_date, input.notes ?? null, id)

    // Follow expense:update pattern — replace ledger entry so financial totals stay consistent
    const emp = db.prepare(
      'SELECT name FROM employees WHERE id = ?'
    ).get(existing.employee_id) as { name: string } | undefined

    db.prepare(
      'DELETE FROM cash_ledger WHERE reference_type=? AND reference_id=?'
    ).run(REF.SALARY, id)

    recordLedgerEntry({
      transaction_date: input.payment_date,
      reference_type: REF.SALARY,
      reference_id: id,
      amount_in: 0,
      amount_out: amount,
      notes: `راتب: ${emp?.name ?? `موظف #${existing.employee_id}`}`,
    })
  })()
}

export function getSalaryHistory(employeeId: number): SalaryRow[] {
  const db = getDB()

  return db.prepare(`
    SELECT ${SALARY_COLS}
    FROM salary_payments sp
    JOIN employees e ON e.id = sp.employee_id
    WHERE sp.employee_id = ?
    ORDER BY sp.payment_date DESC
  `).all(employeeId) as SalaryRow[]
}

export function getAllSalaries(): SalaryRow[] {
  const db = getDB()

  return db.prepare(`
    SELECT ${SALARY_COLS}
    FROM salary_payments sp
    JOIN employees e ON e.id = sp.employee_id
    ORDER BY sp.payment_date DESC
  `).all() as SalaryRow[]
}
