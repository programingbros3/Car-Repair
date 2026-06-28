import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import CashLedger from './pages/CashLedger'
import MaintenanceInvoices from './pages/MaintenanceInvoices'
import DirectSales from './pages/DirectSales'
import PendingDebts from './pages/PendingDebts'
import DailyExpenses from './pages/DailyExpenses'
import Suppliers from './pages/Suppliers'
import Employees from './pages/Employees'
import Reports from './pages/Reports'
import './App.css'

export default function App() {
  return (
    <HashRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/"               element={<Home />} />
            <Route path="/cash-ledger"    element={<CashLedger />} />
            <Route path="/maintenance"    element={<MaintenanceInvoices />} />
            <Route path="/direct-sales"   element={<DirectSales />} />
            <Route path="/pending-debts"  element={<PendingDebts />} />
            <Route path="/expenses"       element={<DailyExpenses />} />
            <Route path="/suppliers"      element={<Suppliers />} />
            <Route path="/employees"      element={<Employees />} />
            <Route path="/reports"        element={<Reports />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
