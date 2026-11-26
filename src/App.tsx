import { useCallback, useEffect, useState } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { GarageProvider, useGarage } from './store/GarageContext'
import { useAutoLock } from './utils/useAutoLock'
import PasswordGate from './components/PasswordGate'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import ErrorToast from './components/ErrorToast'
import ErrorBoundary from './components/ErrorBoundary'
import CashLedger from './pages/CashLedger'
import MaintenanceInvoices from './pages/MaintenanceInvoices'
import DirectSales from './pages/DirectSales'
import SalesInvoices from './pages/SalesInvoices'
import PurchaseInvoices from './pages/PurchaseInvoices'
import PendingDebts from './pages/PendingDebts'
import DailyExpenses from './pages/DailyExpenses'
import Suppliers from './pages/Suppliers'
import Employees from './pages/Employees'
import Warranties from './pages/Warranties'
import Cheques from './pages/Cheques'
import Reports from './pages/Reports'
import Settings from './pages/Settings'
import './App.css'

function AppShell() {
  const { loading } = useGarage()

  if (loading) {
    return (
      <div className="app-loading">
        <div className="app-spinner" />
        <span>جارٍ تحميل البيانات…</span>
      </div>
    )
  }

  return (
    <HashRouter>
      <div className="app-layout">
        <Sidebar />
        <div className="app-main">
          <main className="main-content">
            <Routes>
            <Route path="/"                   element={<Navigate to="/cash-ledger" replace />} />
            <Route path="/cash-ledger"        element={<CashLedger />} />
            <Route path="/sales-invoices"     element={<SalesInvoices />} />
            <Route path="/purchase-invoices"  element={<PurchaseInvoices />} />
            <Route path="/maintenance"        element={<MaintenanceInvoices />} />
            <Route path="/direct-sales"       element={<DirectSales />} />
            <Route path="/pending-debts"      element={<PendingDebts />} />
            <Route path="/cheques"            element={<Cheques />} />
            <Route path="/expenses"           element={<DailyExpenses />} />
            <Route path="/suppliers"          element={<Suppliers />} />
            <Route path="/employees"          element={<Employees />} />
            <Route path="/warranties"         element={<Warranties />} />
            <Route path="/reports"            element={<Reports />} />
            <Route path="/settings"           element={<Settings />} />
            </Routes>
          </main>
          <Footer />
        </div>
      </div>
    </HashRouter>
  )
}

/* يمنع إدخال تواريخ مستقبلية عبر الكيبورد في جميع حقول التاريخ التي لها max */
function useDateClampGuard() {
  useEffect(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
    const clamp = (e: Event) => {
      const input = e.target as HTMLInputElement
      if (input.type !== 'date' || !input.max || !input.value) return
      if (input.value > input.max) {
        setter?.call(input, input.max)
        input.dispatchEvent(new Event('input', { bubbles: true }))
      }
    }
    document.addEventListener('change', clamp, true)
    document.addEventListener('blur', clamp, true)
    return () => {
      document.removeEventListener('change', clamp, true)
      document.removeEventListener('blur', clamp, true)
    }
  }, [])
}

export default function App() {
  useDateClampGuard()
  const [isUnlocked, setIsUnlocked] = useState(false)
  const lock = useCallback(() => setIsUnlocked(false), [])

  useAutoLock(isUnlocked, lock)

  return (
    <ErrorBoundary>
      {!isUnlocked ? (
        <PasswordGate onUnlock={() => setIsUnlocked(true)} />
      ) : (
        <GarageProvider>
          <AppShell />
          <ErrorToast />
        </GarageProvider>
      )}
    </ErrorBoundary>
  )
}
