import { createContext, useContext, useState, useCallback, useMemo, ReactNode } from 'react'

/* ════════════════════════════════════════
   Shared Enums / Types
════════════════════════════════════════ */
export type PayMethod = 'cash' | 'check' | 'visa' | 'debt'

export type PaymentRow = {
  id: number
  method: PayMethod
  amount: number
  checkNumber: string
  issueDate: string
  clearDate: string
  bankName: string
  transactionNum: string
}

/* ── Maintenance ── */
export type CarItem = {
  name: string; quantity: number; unitPrice: number
  warranty: string; customerOwned: boolean; notes: string
}
export type CarRecord = {
  id: number; customerName: string; phone: string; carPlate: string
  carType: string; carColor: string; dateReceived: string
  status: 'in_progress' | 'delivered'; deliveredDate?: string
  notes: string; total: number; items: CarItem[]
}

/* ── Direct Sales ── */
export type SaleItem = {
  id: number; name: string; quantity: number; unitPrice: number; notes: string
}
export type SaleStatus = 'paid' | 'partial_debt' | 'full_debt'
export type SaleRecord = {
  id: number; customerName: string; phone: string; saleDate: string
  warranty: string; notes: string; total: number
  amountPaid: number; amountRemaining: number; status: SaleStatus
  items: SaleItem[]; payments: PaymentRow[]
}

/* ── Sales Invoices ── */
export type SaleInvoiceType   = 'maintenance' | 'direct_sale'
export type SaleInvoiceStatus = 'paid' | 'partial_debt' | 'full_debt'
export type SaleInvoice = {
  id: number; date: string; type: SaleInvoiceType; customerName: string
  phone: string; total: number; paid: number; remaining: number
  status: SaleInvoiceStatus; carPlate: string; carType: string; details: string
  payments: PaymentRow[]
}

/* ── Purchase Invoices ── */
export type PurchaseType   = 'supplier' | 'expense' | 'salary'
export type PurchaseStatus = 'paid' | 'partial_debt' | 'full_debt'
export type PurchaseInvoice = {
  id: number; date: string; type: PurchaseType; description: string
  phone: string; total: number; paid: number; remaining: number
  status: PurchaseStatus; details: string; payments: PaymentRow[]
}

/* ── Suppliers ── */
export type SupplierItem = {
  name: string; quantity: number; unitPrice: number; notes: string
}
export type SupplierRecord = {
  id: number; supplierName: string; phone: string; purchaseDate: string
  notes: string; total: number; amountPaid: number; amountRemaining: number
  items: SupplierItem[]; payments: PaymentRow[]
}

/* ── Daily Expenses ── */
export type Expense = {
  id: number; description: string; amount: number; date: string; notes: string
}

/* ── Employees ── */
export type Employee    = { id: number; name: string; phone: string }
export type SalaryRecord = {
  id: number; employeeId: number; amount: number; date: string; notes: string
}

/* ── Pending Debts ── */
export type DebtType = 'maintenance' | 'direct_sale'
export type DebtRecord = {
  id: number; type: DebtType; typeLabel: string; customerName: string
  phone: string; date: string; carPlate: string; total: number
  amountPaid: number; amountRemaining: number; payments: PaymentRow[]
}

/* ── Cross-screen linked operation ── */
export type LinkedOp = {
  id: number; source: string; sourceLabel: string; sourceCls: string
  date: string; name: string; total: number
  statusLabel?: string; statusCls?: string
}

/* ── Unknown-phones entry (any screen, phone="0000") ── */
export type UnknownSource = 'maintenance' | 'direct_sale' | 'sales_invoice' | 'purchase_invoice' | 'supplier' | 'debt'
export type UnknownEntry = {
  id: number; source: UnknownSource; sourceLabel: string; sourceCls: string
  date: string; name: string; total: number; statusLabel: string; statusCls: string
}

/* ════════════════════════════════════════
   Initial Data
════════════════════════════════════════ */
const INIT_CARS: CarRecord[] = [
  {
    id: 1, customerName: 'أحمد محمد', phone: '0501234567',
    carPlate: 'أ ب ج 123', carType: 'تويوتا كامري', carColor: 'أبيض',
    dateReceived: '2026-06-25', status: 'in_progress', notes: 'تغيير زيت وفحص عام', total: 1500,
    items: [
      { name: 'زيت محرك',  quantity: 1, unitPrice: 200,  warranty: '3 أشهر', customerOwned: false, notes: '' },
      { name: 'فلتر هواء', quantity: 1, unitPrice: 150,  warranty: '',        customerOwned: false, notes: '' },
      { name: 'فحص عام',   quantity: 1, unitPrice: 1150, warranty: 'سنة',     customerOwned: false, notes: 'شامل كل شيء' },
    ],
  },
  {
    id: 2, customerName: 'خالد العمري', phone: '0559876543',
    carPlate: 'د هـ و 456', carType: 'هوندا سيفيك', carColor: 'رمادي',
    dateReceived: '2026-06-27', status: 'in_progress', notes: '', total: 800,
    items: [{ name: 'تغيير تايمنج', quantity: 1, unitPrice: 800, warranty: '6 أشهر', customerOwned: false, notes: '' }],
  },
  {
    id: 3, customerName: 'محمد العمري', phone: '0523456789',
    carPlate: 'ز ح ط 789', carType: 'نيسان التيما', carColor: 'أسود',
    dateReceived: '2026-06-20', status: 'delivered', deliveredDate: '2026-06-22',
    notes: 'تغيير فلاتر وبلياردو', total: 650,
    items: [
      { name: 'فلتر زيت', quantity: 1, unitPrice: 50,  warranty: '',       customerOwned: false, notes: '' },
      { name: 'بلياردو',   quantity: 1, unitPrice: 600, warranty: '6 أشهر', customerOwned: false, notes: '' },
    ],
  },
]

const INIT_DIRECT_SALES: SaleRecord[] = [
  {
    id: 1, customerName: 'محمد علي', phone: '0521234567',
    saleDate: '2026-06-26', warranty: '3 أشهر', notes: '',
    total: 350, amountPaid: 350, amountRemaining: 0, status: 'paid',
    items: [
      { id: 1, name: 'زيت محرك', quantity: 2, unitPrice: 150, notes: '' },
      { id: 2, name: 'فلتر زيت', quantity: 1, unitPrice: 50,  notes: '' },
    ],
    payments: [],
  },
  {
    id: 2, customerName: 'سامي الخالد', phone: '0531234567',
    saleDate: '2026-06-27', warranty: '', notes: '',
    total: 350, amountPaid: 0, amountRemaining: 350, status: 'full_debt',
    items: [{ id: 3, name: 'بطارية سيارة', quantity: 1, unitPrice: 350, notes: '' }],
    payments: [],
  },
]

const INIT_SALES_INVOICES: SaleInvoice[] = [
  {
    id: 1, date: '2026-06-22', type: 'maintenance',
    customerName: 'محمد العمري', phone: '0523456789',
    total: 650, paid: 650, remaining: 0, status: 'paid',
    carPlate: 'ز ح ط 789', carType: 'نيسان التيما', details: 'تغيير فلاتر وبلياردو', payments: [],
  },
  {
    id: 2, date: '2026-06-24', type: 'direct_sale',
    customerName: 'محمد علي', phone: '0521234567',
    total: 350, paid: 350, remaining: 0, status: 'paid',
    carPlate: '', carType: '', details: 'زيت محرك × 2 + فلتر زيت × 1', payments: [],
  },
  {
    id: 3, date: '2026-06-25', type: 'maintenance',
    customerName: 'أحمد محمد', phone: '0501234567',
    total: 1500, paid: 500, remaining: 1000, status: 'partial_debt',
    carPlate: 'أ ب ج 123', carType: 'تويوتا كامري', details: 'تغيير زيت وفحص عام', payments: [],
  },
  {
    id: 4, date: '2026-06-26', type: 'maintenance',
    customerName: 'خالد العمري', phone: '0559876543',
    total: 800, paid: 0, remaining: 800, status: 'full_debt',
    carPlate: 'د هـ و 456', carType: 'هوندا سيفيك', details: 'تغيير تايمنج', payments: [],
  },
  {
    id: 5, date: '2026-06-27', type: 'direct_sale',
    customerName: 'سامي الخالد', phone: '0531234567',
    total: 350, paid: 0, remaining: 350, status: 'full_debt',
    carPlate: '', carType: '', details: 'بطارية سيارة', payments: [],
  },
]

const INIT_PURCHASE_INVOICES: PurchaseInvoice[] = [
  {
    id: 1, date: '2026-06-22', type: 'supplier',
    description: 'شركة قطع غيار النور', phone: '0501112233',
    total: 2400, paid: 1400, remaining: 1000, status: 'partial_debt',
    details: 'فلتر زيت × 20 + فلتر هواء × 15 + بواجي × 30', payments: [],
  },
  {
    id: 2, date: '2026-06-23', type: 'expense',
    description: 'فاتورة كهرباء الكراج', phone: '',
    total: 120, paid: 120, remaining: 0, status: 'paid',
    details: 'فاتورة شهر يونيو', payments: [],
  },
  {
    id: 3, date: '2026-06-25', type: 'expense',
    description: 'شراء قطع غيار متنوعة', phone: '',
    total: 1200, paid: 1200, remaining: 0, status: 'paid', details: '', payments: [],
  },
  {
    id: 4, date: '2026-06-27', type: 'salary',
    description: 'راتب سامي الأحمد', phone: '',
    total: 600, paid: 600, remaining: 0, status: 'paid', details: 'راتب شهر يونيو 2026', payments: [],
  },
  {
    id: 5, date: '2026-06-27', type: 'supplier',
    description: 'سمير الحداد', phone: '0599887766',
    total: 750, paid: 750, remaining: 0, status: 'paid', details: 'طقم فحمات × 5', payments: [],
  },
  {
    id: 6, date: '2026-06-28', type: 'expense',
    description: 'وجبات غداء للعمال', phone: '',
    total: 180, paid: 180, remaining: 0, status: 'paid', details: 'ثلاثة عمال', payments: [],
  },
]

const INIT_SUPPLIERS: SupplierRecord[] = [
  {
    id: 1, supplierName: 'شركة قطع غيار النور', phone: '0501112233',
    purchaseDate: '2026-06-24', notes: 'طلبية شهرية',
    total: 2400, amountPaid: 1400, amountRemaining: 1000,
    items: [
      { name: 'فلتر زيت',  quantity: 20, unitPrice: 30, notes: '' },
      { name: 'فلتر هواء', quantity: 15, unitPrice: 40, notes: '' },
      { name: 'بواجي',      quantity: 30, unitPrice: 40, notes: 'نوع ممتاز' },
    ],
    payments: [],
  },
  {
    id: 2, supplierName: 'سمير الحداد', phone: '0599887766',
    purchaseDate: '2026-06-27', notes: '',
    total: 750, amountPaid: 750, amountRemaining: 0,
    items: [{ name: 'طقم فحمات', quantity: 5, unitPrice: 150, notes: '' }],
    payments: [],
  },
]

const INIT_EXPENSES: Expense[] = [
  { id: 1, description: 'فاتورة كهرباء',     amount: 450,  date: '2026-06-26', notes: 'فاتورة شهر يونيو' },
  { id: 2, description: 'شراء قطع غيار',      amount: 1200, date: '2026-06-27', notes: '' },
  { id: 3, description: 'وجبات غداء للعمال', amount: 180,  date: '2026-06-28', notes: 'ثلاثة عمال' },
]

const INIT_EMPLOYEES: Employee[] = [
  { id: 1, name: 'محمود علي',  phone: '0501112233' },
  { id: 2, name: 'سامي يوسف',  phone: '0594445566' },
  { id: 3, name: 'كريم حسن',   phone: '0567778899' },
]

const INIT_SALARIES: SalaryRecord[] = [
  { id: 1, employeeId: 1, amount: 3500, date: '2026-06-01', notes: 'راتب شهر مايو' },
  { id: 2, employeeId: 2, amount: 3000, date: '2026-06-01', notes: '' },
  { id: 3, employeeId: 3, amount: 2800, date: '2026-06-05', notes: 'دفعة أولى' },
  { id: 4, employeeId: 1, amount: 1500, date: '2026-06-20', notes: 'سلفة' },
]

const INIT_DEBTS: DebtRecord[] = [
  {
    id: 1, type: 'maintenance', typeLabel: 'صيانة',
    customerName: 'أحمد محمد', phone: '0501234567',
    date: '2026-06-25', carPlate: 'أ ب ج 123',
    total: 1500, amountPaid: 500, amountRemaining: 1000, payments: [],
  },
  {
    id: 2, type: 'direct_sale', typeLabel: 'بيع مباشر',
    customerName: 'سامي الخالد', phone: '0531234567',
    date: '2026-06-27', carPlate: '',
    total: 350, amountPaid: 0, amountRemaining: 350, payments: [],
  },
]

/* ════════════════════════════════════════
   Context Type
════════════════════════════════════════ */
type GarageContextType = {
  /* data */
  maintenanceCars:  CarRecord[];       setMaintenanceCars:  React.Dispatch<React.SetStateAction<CarRecord[]>>
  directSales:      SaleRecord[];      setDirectSales:      React.Dispatch<React.SetStateAction<SaleRecord[]>>
  salesInvoices:    SaleInvoice[];     setSalesInvoices:    React.Dispatch<React.SetStateAction<SaleInvoice[]>>
  purchaseInvoices: PurchaseInvoice[]; setPurchaseInvoices: React.Dispatch<React.SetStateAction<PurchaseInvoice[]>>
  suppliers:        SupplierRecord[];  setSuppliers:        React.Dispatch<React.SetStateAction<SupplierRecord[]>>
  expenses:         Expense[];         setExpenses:         React.Dispatch<React.SetStateAction<Expense[]>>
  employees:        Employee[];        setEmployees:        React.Dispatch<React.SetStateAction<Employee[]>>
  salaries:         SalaryRecord[];    setSalaries:         React.Dispatch<React.SetStateAction<SalaryRecord[]>>
  debts:            DebtRecord[];      setDebts:            React.Dispatch<React.SetStateAction<DebtRecord[]>>
  /* cross-screen helpers */
  getLinkedOps:     (phone: string, currentSource: string, currentId: number) => LinkedOp[]
  getUnknownEntries: () => UnknownEntry[]
  updatePhone:      (source: UnknownSource, id: number, phone: string) => void
}

const GarageContext = createContext<GarageContextType>(null!)

/* ════════════════════════════════════════
   Provider
════════════════════════════════════════ */
export function GarageProvider({ children }: { children: ReactNode }) {
  const [maintenanceCars,  setMaintenanceCars]  = useState<CarRecord[]>(INIT_CARS)
  const [directSales,      setDirectSales]      = useState<SaleRecord[]>(INIT_DIRECT_SALES)
  const [salesInvoices,    setSalesInvoices]    = useState<SaleInvoice[]>(INIT_SALES_INVOICES)
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(INIT_PURCHASE_INVOICES)
  const [suppliers,        setSuppliers]        = useState<SupplierRecord[]>(INIT_SUPPLIERS)
  const [expenses,         setExpenses]         = useState<Expense[]>(INIT_EXPENSES)
  const [employees,        setEmployees]        = useState<Employee[]>(INIT_EMPLOYEES)
  const [salaries,         setSalaries]         = useState<SalaryRecord[]>(INIT_SALARIES)
  const [debts,            setDebts]            = useState<DebtRecord[]>(INIT_DEBTS)

  /* ── Cross-screen: previous operations by phone ── */
  const getLinkedOps = useCallback((phone: string, currentSource: string, currentId: number): LinkedOp[] => {
    if (!phone || phone === '0000') return []
    const ops: LinkedOp[] = []

    maintenanceCars.forEach(c => {
      if (c.phone !== phone) return
      if (currentSource === 'maintenance' && c.id === currentId) return
      ops.push({
        id: c.id, source: 'maintenance', sourceLabel: 'صيانة', sourceCls: 'mi-badge-orange',
        date: c.dateReceived, name: c.customerName, total: c.total,
        statusLabel: c.status === 'in_progress' ? 'قيد الصيانة' : 'تم التسليم',
        statusCls:   c.status === 'in_progress' ? 'mi-badge-orange' : 'mi-badge-green',
      })
    })

    directSales.forEach(s => {
      if (s.phone !== phone) return
      if (currentSource === 'direct_sale' && s.id === currentId) return
      const sCls = s.status === 'paid' ? 'mi-badge-green' : s.status === 'partial_debt' ? 'mi-badge-yellow' : 'mi-badge-red'
      ops.push({
        id: s.id, source: 'direct_sale', sourceLabel: 'بيع مباشر', sourceCls: 'mi-badge-blue',
        date: s.saleDate, name: s.customerName, total: s.total,
        statusLabel: s.status === 'paid' ? 'مدفوع' : s.status === 'partial_debt' ? 'دين جزئي' : 'دين كامل',
        statusCls: sCls,
      })
    })

    salesInvoices.forEach(inv => {
      if (inv.phone !== phone) return
      if (currentSource === 'sales_invoice' && inv.id === currentId) return
      const sCls = inv.status === 'paid' ? 'mi-badge-green' : inv.status === 'partial_debt' ? 'mi-badge-yellow' : 'mi-badge-red'
      ops.push({
        id: inv.id, source: 'sales_invoice', sourceLabel: 'فاتورة بيع', sourceCls: 'mi-badge-green',
        date: inv.date, name: inv.customerName, total: inv.total,
        statusLabel: inv.status === 'paid' ? 'مدفوع' : inv.status === 'partial_debt' ? 'دين جزئي' : 'دين كامل',
        statusCls: sCls,
      })
    })

    purchaseInvoices.forEach(inv => {
      if (inv.phone !== phone) return
      if (currentSource === 'purchase_invoice' && inv.id === currentId) return
      const sCls = inv.status === 'paid' ? 'mi-badge-green' : inv.status === 'partial_debt' ? 'mi-badge-yellow' : 'mi-badge-red'
      ops.push({
        id: inv.id, source: 'purchase_invoice', sourceLabel: 'فاتورة شراء', sourceCls: 'mi-badge-purple',
        date: inv.date, name: inv.description, total: inv.total,
        statusLabel: inv.status === 'paid' ? 'مدفوع' : inv.status === 'partial_debt' ? 'دين جزئي' : 'دين كامل',
        statusCls: sCls,
      })
    })

    suppliers.forEach(s => {
      if (s.phone !== phone) return
      if (currentSource === 'supplier' && s.id === currentId) return
      ops.push({
        id: s.id, source: 'supplier', sourceLabel: 'مورد', sourceCls: 'mi-badge-purple',
        date: s.purchaseDate, name: s.supplierName, total: s.total,
        statusLabel: s.amountRemaining > 0 ? 'دين' : 'مدفوع',
        statusCls:   s.amountRemaining > 0 ? 'mi-badge-red' : 'mi-badge-green',
      })
    })

    debts.forEach(d => {
      if (d.phone !== phone) return
      if (currentSource === 'debt' && d.id === currentId) return
      ops.push({
        id: d.id, source: 'debt', sourceLabel: d.typeLabel,
        sourceCls: d.type === 'maintenance' ? 'mi-badge-orange' : 'mi-badge-blue',
        date: d.date, name: d.customerName, total: d.total,
        statusLabel: 'دين معلق', statusCls: 'mi-badge-red',
      })
    })

    return ops
  }, [maintenanceCars, directSales, salesInvoices, purchaseInvoices, suppliers, debts])

  /* ── Cross-screen: all entries with phone="0000" ── */
  const getUnknownEntries = useCallback((): UnknownEntry[] => {
    const entries: UnknownEntry[] = []

    maintenanceCars.filter(c => c.phone === '0000').forEach(c => entries.push({
      id: c.id, source: 'maintenance', sourceLabel: 'صيانة', sourceCls: 'mi-badge-orange',
      date: c.dateReceived, name: c.customerName, total: c.total,
      statusLabel: c.status === 'in_progress' ? 'قيد الصيانة' : 'تم التسليم',
      statusCls:   c.status === 'in_progress' ? 'mi-badge-orange' : 'mi-badge-green',
    }))

    directSales.filter(s => s.phone === '0000').forEach(s => {
      const sCls = s.status === 'paid' ? 'mi-badge-green' : s.status === 'partial_debt' ? 'mi-badge-yellow' : 'mi-badge-red'
      entries.push({
        id: s.id, source: 'direct_sale', sourceLabel: 'بيع مباشر', sourceCls: 'mi-badge-blue',
        date: s.saleDate, name: s.customerName, total: s.total,
        statusLabel: s.status === 'paid' ? 'مدفوع' : s.status === 'partial_debt' ? 'دين جزئي' : 'دين كامل',
        statusCls: sCls,
      })
    })

    salesInvoices.filter(i => i.phone === '0000').forEach(i => {
      const sCls = i.status === 'paid' ? 'mi-badge-green' : i.status === 'partial_debt' ? 'mi-badge-yellow' : 'mi-badge-red'
      entries.push({
        id: i.id, source: 'sales_invoice', sourceLabel: 'فاتورة بيع', sourceCls: 'mi-badge-green',
        date: i.date, name: i.customerName, total: i.total,
        statusLabel: i.status === 'paid' ? 'مدفوع' : i.status === 'partial_debt' ? 'دين جزئي' : 'دين كامل',
        statusCls: sCls,
      })
    })

    purchaseInvoices.filter(i => i.phone === '0000').forEach(i => {
      const sCls = i.status === 'paid' ? 'mi-badge-green' : i.status === 'partial_debt' ? 'mi-badge-yellow' : 'mi-badge-red'
      entries.push({
        id: i.id, source: 'purchase_invoice', sourceLabel: 'فاتورة شراء', sourceCls: 'mi-badge-purple',
        date: i.date, name: i.description, total: i.total,
        statusLabel: i.status === 'paid' ? 'مدفوع' : i.status === 'partial_debt' ? 'دين جزئي' : 'دين كامل',
        statusCls: sCls,
      })
    })

    suppliers.filter(s => s.phone === '0000').forEach(s => entries.push({
      id: s.id, source: 'supplier', sourceLabel: 'مورد', sourceCls: 'mi-badge-purple',
      date: s.purchaseDate, name: s.supplierName, total: s.total,
      statusLabel: s.amountRemaining > 0 ? 'دين' : 'مدفوع',
      statusCls:   s.amountRemaining > 0 ? 'mi-badge-red' : 'mi-badge-green',
    }))

    debts.filter(d => d.phone === '0000').forEach(d => entries.push({
      id: d.id, source: 'debt', sourceLabel: d.typeLabel,
      sourceCls: d.type === 'maintenance' ? 'mi-badge-orange' : 'mi-badge-blue',
      date: d.date, name: d.customerName, total: d.total,
      statusLabel: 'دين معلق', statusCls: 'mi-badge-red',
    }))

    return entries.sort((a, b) => b.date.localeCompare(a.date))
  }, [maintenanceCars, directSales, salesInvoices, purchaseInvoices, suppliers, debts])

  /* ── Update phone in the correct slice ── */
  const updatePhone = useCallback((source: UnknownSource, id: number, phone: string) => {
    const p = phone.trim() || '0000'
    if (source === 'maintenance')       setMaintenanceCars(prev  => prev.map(c   => c.id   !== id ? c   : { ...c,   phone: p }))
    else if (source === 'direct_sale')  setDirectSales(prev      => prev.map(s   => s.id   !== id ? s   : { ...s,   phone: p }))
    else if (source === 'sales_invoice') setSalesInvoices(prev   => prev.map(inv => inv.id !== id ? inv : { ...inv, phone: p }))
    else if (source === 'purchase_invoice') setPurchaseInvoices(prev => prev.map(inv => inv.id !== id ? inv : { ...inv, phone: p }))
    else if (source === 'supplier')     setSuppliers(prev        => prev.map(s   => s.id   !== id ? s   : { ...s,   phone: p }))
    else if (source === 'debt')         setDebts(prev            => prev.map(d   => d.id   !== id ? d   : { ...d,   phone: p }))
  }, [])

  const value = useMemo<GarageContextType>(() => ({
    maintenanceCars,  setMaintenanceCars,
    directSales,      setDirectSales,
    salesInvoices,    setSalesInvoices,
    purchaseInvoices, setPurchaseInvoices,
    suppliers,        setSuppliers,
    expenses,         setExpenses,
    employees,        setEmployees,
    salaries,         setSalaries,
    debts,            setDebts,
    getLinkedOps, getUnknownEntries, updatePhone,
  }), [
    maintenanceCars, directSales, salesInvoices, purchaseInvoices,
    suppliers, expenses, employees, salaries, debts,
    getLinkedOps, getUnknownEntries, updatePhone,
  ])

  return <GarageContext.Provider value={value}>{children}</GarageContext.Provider>
}

export const useGarage = () => useContext(GarageContext)
