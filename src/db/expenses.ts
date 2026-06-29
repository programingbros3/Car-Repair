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
    INSERT INTO employees (name, phone) VALUES (@name, @phone)
  `).run({ name: input.name, phone: input.phone ?? null })

  return Number(lastInsertRowid)
}

export function getEmployees(): EmployeeRow[] {
  const db = getDB()
  return db.prepare('SELECT * FROM employees ORDER BY name ASC').all() as EmployeeRow[]
}

// ─── Day 4: Salary payments ───────────────────────────────────────────────────

export function addSalaryPayment(employeeId: number, input: SalaryInput): number {
  const db = getDB()

  const run = db.transaction(() => {
    const { lastInsertRowid } = db.prepare(`
      INSERT INTO salary_payments (employee_id, amount, payment_date, notes)
      VALUES (@employee_id, @amount, @payment_date, @notes)
    `).run({
      employee_id: employeeId,
      amount: input.amount,
      payment_date: input.payment_date,
      notes: input.notes ?? null,
    })

    const salaryId = Number(lastInsertRowid)

    // Get employee name for the ledger note
    const emp = db.prepare(
      'SELECT name FROM employees WHERE id = ?'
    ).get(employeeId) as { name: string } | undefined

    recordLedgerEntry({
      transaction_date: input.payment_date,
      reference_type: REF.SALARY,
      reference_id: salaryId,
      amount_in: 0,
      amount_out: input.amount,
      notes: `راتب: ${emp?.name ?? `موظف #${employeeId}`}`,
    })

    return salaryId
  })

  return run()
}

export function getSalaryHistory(employeeId: number): SalaryRow[] {
  const db = getDB()

  return db.prepare(`
    SELECT
      sp.id,
      sp.employee_id,
      e.name AS employee_name,
      sp.amount,
      sp.payment_date,
      sp.notes,
      sp.created_at
    FROM salary_payments sp
    JOIN employees e ON e.id = sp.employee_id
    WHERE sp.employee_id = ?
    ORDER BY sp.payment_date DESC
  `).all(employeeId) as SalaryRow[]
}

export function getAllSalaries(): SalaryRow[] {
  const db = getDB()

  return db.prepare(`
    SELECT
      sp.id,
      sp.employee_id,
      e.name AS employee_name,
      sp.amount,
      sp.payment_date,
      sp.notes,
      sp.created_at
    FROM salary_payments sp
    JOIN employees e ON e.id = sp.employee_id
    ORDER BY sp.payment_date DESC
  `).all() as SalaryRow[]
}
