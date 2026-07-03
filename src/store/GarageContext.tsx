import { createContext, useContext, useState, useEffect, useCallback, useMemo, ReactNode } from 'react'
import { dbService } from '../services/db'
import { calcEndDate, daysRemaining } from '../utils/warranty'

/* ════════════════════════════════════════
   Shared Enums / Types
════════════════════════════════════════ */
export type PayMethod = 'cash' | 'check' | 'visa' | 'debt'

/* خصم على مستوى الفاتورة (صيانة/بيع مباشر):
   undefined = غير معروف/لا تغيير (شاشات لا تحمل الخصم)، null = بدون خصم */
export type DiscountType = 'fixed' | 'percentage'

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
  warranty: string; partType: 'part' | 'service'; notes: string
}
export type CarRecord = {
  id: number; invoiceNumber?: string; customerName: string; phone: string; carPlate: string
  carType: string; carColor: string; dateReceived: string
  status: 'in_progress' | 'delivered'; deliveredDate?: string
  notes: string; discountType?: DiscountType | null; discountValue?: number
  total: number; amountPaid?: number; amountRemaining?: number; items: CarItem[]
}

/* ── Direct Sales ── */
export type SaleItem = {
  id: number; name: string; quantity: number; unitPrice: number; notes: string
}
export type SaleStatus = 'paid' | 'partial_debt' | 'full_debt'
export type SaleRecord = {
  id: number; invoiceNumber?: string; customerName: string; phone: string; saleDate: string
  warranty: string; notes: string; discountType?: DiscountType | null; discountValue?: number
  total: number; amountPaid: number; amountRemaining: number; status: SaleStatus
  items: SaleItem[]; payments: PaymentRow[]
}

/* ── Sales Invoices ── */
export type SaleInvoiceType   = 'maintenance' | 'direct_sale'
export type SaleInvoiceStatus = 'paid' | 'partial_debt' | 'full_debt'
export type SaleInvoice = {
  id: number; invoiceNumber: string; date: string; type: SaleInvoiceType; customerName: string
  phone: string; total: number; paid: number; remaining: number
  status: SaleInvoiceStatus; carPlate: string; carType: string; details: string
  carColor?: string                                   // صيانة فقط
  dateReleased?: string                               // صيانة فقط (تاريخ التسليم)
  carStatus?: 'in_progress' | 'delivered'             // حالة الصيانة
  payments: PaymentRow[]
}

/* ── Purchase Invoices ── */
export type PurchaseType   = 'supplier' | 'expense' | 'salary'
export type PurchaseStatus = 'paid' | 'partial_debt' | 'full_debt'
export type PurchaseInvoice = {
  id: number; invoiceNumber: string | null; date: string; type: PurchaseType; description: string
  phone: string; total: number; paid: number; remaining: number
  status: PurchaseStatus; details: string; payments: PaymentRow[]
}

/* ── Suppliers ── */
export type Supplier = { id: number; name: string; phone: string; notes: string }

export type SupplierItem = {
  name: string; quantity: number; unitPrice: number; notes: string
  // خصم على مستوى البند الفردي (null = بدون خصم)
  discountType?: DiscountType | null; discountValue?: number
}
export type SupplierRecord = {
  id: number; invoiceNumber?: string; supplierName: string; phone: string; purchaseDate: string
  notes: string; total: number; amountPaid: number; amountRemaining: number
  items: SupplierItem[]; payments: PaymentRow[]
}

/* ── Daily Expenses ── */
export type Expense = {
  id: number; description: string; amount: number; date: string; notes: string
}

/* ── Employees ── */
export type Employee    = { id: number; name: string; phone: string; dailyWage: number }
export type SalaryRecord = {
  id: number; employeeId: number
  amount: number; dailyWageSnapshot: number
  daysWorked: number; bonus: number; deduction: number
  date: string; notes: string
}

/* ── Pending Debts ── */
export type DebtType = 'maintenance' | 'direct_sale'
export type DebtRecord = {
  id: number; type: DebtType; typeLabel: string; customerName: string
  phone: string; date: string; carPlate: string; total: number
  amountPaid: number; amountRemaining: number; payments: PaymentRow[]
  carType?: string        // صيانة فقط
  carColor?: string       // صيانة فقط
  notes?: string          // صيانة + بيع مباشر
}

/* ── Warranties ── */
export type WarrantyPeriodUnit = 'week' | 'month' | 'year'

export type WarrantyRecord = {
  id: number
  source: 'maintenance' | 'direct_sale'
  sourceId: number
  customerName: string
  phone: string
  carPlate: string          // فارغ لـ direct_sale
  carType?: string          // صيانة فقط (فارغ لـ direct_sale واليدوي القديم)
  carColor?: string         // صيانة فقط (فارغ لـ direct_sale واليدوي القديم)
  itemName: string          // اسم القطعة أو الخدمة
  startDate: string         // YYYY-MM-DD
  periodValue: number       // مثال: 3
  periodUnit: WarrantyPeriodUnit  // 'month'
  notes: string
}

/* ── Upcoming Cheques (الشيكات المستحقة قريباً) — قراءة فقط ── */
export type UpcomingChequeSource = 'maintenance' | 'direct_sale' | 'supplier' | 'supplier_debt'
export type UpcomingCheque = {
  source: UpcomingChequeSource
  partyName: string
  chequeNumber: string
  bankName: string
  amount: number
  cashDate: string
  daysRemaining: number
}

/* ── Cheques (كل الشيكات — صفحة الشيكات) — قراءة فقط ── */
// نفس UpcomingCheque + تاريخ الإصدار (issueDate) + تفاصيل العملية المصدر (للمودال/الطباعة)
export type ChequeRecord = UpcomingCheque & {
  issueDate: string
  invoiceNumber: string | null
  partyPhone: string | null
  invoiceDate: string | null
  invoiceTotal: number | null
  carPlate: string | null
  carType: string | null
  carColor: string | null
  dateReleased: string | null
}

/* ── Cross-screen linked operation ── */
export type LinkedOp = {
  id: number; source: string; sourceLabel: string; sourceCls: string
  date: string; name: string; total: number
  statusLabel?: string; statusCls?: string
}

/* ════════════════════════════════════════
   Context Type
════════════════════════════════════════ */
type GarageContextType = {
  /* status */
  loading:          boolean
  /* يعيد جلب كل البيانات من قاعدة البيانات (يُستدعى بعد كل عملية كتابة ناجحة) */
  reload:           () => Promise<void>
  /* data */
  maintenanceCars:  CarRecord[];       setMaintenanceCars:  React.Dispatch<React.SetStateAction<CarRecord[]>>
  directSales:      SaleRecord[];      setDirectSales:      React.Dispatch<React.SetStateAction<SaleRecord[]>>
  salesInvoices:    SaleInvoice[];     setSalesInvoices:    React.Dispatch<React.SetStateAction<SaleInvoice[]>>
  purchaseInvoices: PurchaseInvoice[]; setPurchaseInvoices: React.Dispatch<React.SetStateAction<PurchaseInvoice[]>>
  suppliers:        Supplier[];        setSuppliers:        React.Dispatch<React.SetStateAction<Supplier[]>>
  supplierInvoices: SupplierRecord[];  setSupplierInvoices: React.Dispatch<React.SetStateAction<SupplierRecord[]>>
  expenses:         Expense[];         setExpenses:         React.Dispatch<React.SetStateAction<Expense[]>>
  employees:        Employee[];        setEmployees:        React.Dispatch<React.SetStateAction<Employee[]>>
  salaries:         SalaryRecord[];    setSalaries:         React.Dispatch<React.SetStateAction<SalaryRecord[]>>
  debts:            DebtRecord[];      setDebts:            React.Dispatch<React.SetStateAction<DebtRecord[]>>
  warranties:       WarrantyRecord[];  setWarranties:       React.Dispatch<React.SetStateAction<WarrantyRecord[]>>
  /* cross-screen helpers */
  getLinkedOps:        (phone: string, currentSource: string, currentId: number) => LinkedOp[]
  /* نظير getLinkedOps لكن بنمرة السيارة بدل الهاتف (وسيلة ربط رئيسية إضافية).
     البيع المباشر بلا عمود car_plate فيُبحث في الصيانة والكفالات المرتبطة فقط — راجع التعليق عند التعريف. */
  getLinkedOpsByPlate: (carPlate: string, currentSource: string, currentId: number) => LinkedOp[]
}

const GarageContext = createContext<GarageContextType>(null!)

/* ════════════════════════════════════════
   Provider
════════════════════════════════════════ */
export function GarageProvider({ children }: { children: ReactNode }) {
  const [maintenanceCars,  setMaintenanceCars]  = useState<CarRecord[]>([])
  const [directSales,      setDirectSales]      = useState<SaleRecord[]>([])
  const [salesInvoices,    setSalesInvoices]    = useState<SaleInvoice[]>([])
  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>([])
  const [suppliers,        setSuppliers]        = useState<Supplier[]>([])
  const [supplierInvoices, setSupplierInvoices] = useState<SupplierRecord[]>([])
  const [expenses,         setExpenses]         = useState<Expense[]>([])
  const [employees,        setEmployees]        = useState<Employee[]>([])
  const [salaries,         setSalaries]         = useState<SalaryRecord[]>([])
  const [debts,            setDebts]            = useState<DebtRecord[]>([])
  const [warranties,       setWarranties]       = useState<WarrantyRecord[]>([])
  const [loading,          setLoading]          = useState(true)

  /* ── جلب كل البيانات من قاعدة البيانات (تحميل أولي + إعادة مزامنة) ── */
  const reload = useCallback(async (): Promise<void> => {
    const [cars, sales, salesInv, purchaseInv, supplierInv, suppliersList, exp, emp, sal, debt, warr] =
      await Promise.all([
        dbService.maintenance.getAll(),
        dbService.directSale.getAll(),
        dbService.salesInvoice.getAll(),
        dbService.purchaseInvoice.getAll(),
        dbService.supplierInvoice.getAll(),
        dbService.suppliers.getAll(),
        dbService.expense.getAll(),
        dbService.employee.getAll(),
        dbService.salary.getAll(),
        dbService.debt.getAll(),
        dbService.warranty.getAll(),
      ])
    setMaintenanceCars(cars)
    setDirectSales(sales)
    setSalesInvoices(salesInv)
    setPurchaseInvoices(purchaseInv)
    setSupplierInvoices(supplierInv)
    setSuppliers(suppliersList)
    setExpenses(exp)
    setEmployees(emp)
    setSalaries(sal)
    setDebts(debt)
    setWarranties(warr)
  }, [])

  /* ── Initial load ── */
  useEffect(() => {
    reload()
      .catch(err => console.error('فشل تحميل البيانات من قاعدة البيانات:', err))
      .finally(() => setLoading(false))
  }, [reload])

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

    supplierInvoices.forEach(s => {
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
  }, [maintenanceCars, directSales, salesInvoices, purchaseInvoices, supplierInvoices, debts])

  /* ── Cross-screen: previous operations by CAR PLATE (نمرة السيارة) ──
     نظير getLinkedOps لكن الربط بنمرة السيارة بدل رقم الهاتف — نمرة السيارة وسيلة ربط وبحث
     رئيسية إضافية بنفس أهمية الهاتف، لا بديل عن أي مفتاح داخلي (id لم يتغيّر).
     ملاحظة مهمّة: فواتير البيع المباشر (direct_sale_invoices) لا تحمل عمود car_plate في قاعدة
     البيانات (SaleRecord بلا carPlate)، لذا لا يمكن ربطها بالنمرة — يقتصر البحث فعلياً على
     فواتير الصيانة (maintenance_invoices) والكفالات المرتبطة (warranties.car_plate، تُملأ
     للصيانة فقط). المقارنة تجرى على النمرة بعد إزالة الفراغات وتوحيد حالة الأحرف. */
  const getLinkedOpsByPlate = useCallback((carPlate: string, currentSource: string, currentId: number): LinkedOp[] => {
    const norm = (p: string) => (p || '').replace(/\s+/g, '').toLowerCase()
    const plate = norm(carPlate)
    if (!plate) return []
    const ops: LinkedOp[] = []

    maintenanceCars.forEach(c => {
      if (norm(c.carPlate) !== plate) return
      if (currentSource === 'maintenance' && c.id === currentId) return
      ops.push({
        id: c.id, source: 'maintenance', sourceLabel: 'صيانة', sourceCls: 'mi-badge-orange',
        date: c.dateReceived, name: c.customerName, total: c.total,
        statusLabel: c.status === 'in_progress' ? 'قيد الصيانة' : 'تم التسليم',
        statusCls:   c.status === 'in_progress' ? 'mi-badge-orange' : 'mi-badge-green',
      })
    })

    /* الكفالات المرتبطة بنفس النمرة (الكفالة بلا إجمالي مالي → total = 0، الحالة سارية/منتهية) */
    warranties.forEach(w => {
      if (norm(w.carPlate) !== plate) return
      if (currentSource === 'warranty' && w.id === currentId) return
      const remaining = daysRemaining(calcEndDate(w.startDate, w.periodValue, w.periodUnit))
      ops.push({
        id: w.id, source: 'warranty', sourceLabel: 'كفالة', sourceCls: 'mi-badge-blue',
        date: w.startDate, name: w.itemName, total: 0,
        statusLabel: remaining > 0 ? 'سارية' : 'منتهية',
        statusCls:   remaining > 0 ? 'mi-badge-green' : 'mi-badge-red',
      })
    })

    return ops
  }, [maintenanceCars, warranties])

  const value = useMemo<GarageContextType>(() => ({
    loading,
    reload,
    maintenanceCars,  setMaintenanceCars,
    directSales,      setDirectSales,
    salesInvoices,    setSalesInvoices,
    purchaseInvoices, setPurchaseInvoices,
    suppliers,        setSuppliers,
    supplierInvoices, setSupplierInvoices,
    expenses,         setExpenses,
    employees,        setEmployees,
    salaries,         setSalaries,
    debts,            setDebts,
    warranties,       setWarranties,
    getLinkedOps,
    getLinkedOpsByPlate,
  }), [
    loading, reload,
    maintenanceCars, directSales, salesInvoices, purchaseInvoices,
    suppliers, supplierInvoices, expenses, employees, salaries, debts,
    warranties,
    getLinkedOps,
    getLinkedOpsByPlate,
  ])

  return <GarageContext.Provider value={value}>{children}</GarageContext.Provider>
}

export const useGarage = () => useContext(GarageContext)
