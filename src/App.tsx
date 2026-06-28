import { HashRouter, Routes, Route } from 'react-router-dom'
import Sidebar from './components/Sidebar'
import Home from './pages/Home'
import MaintenanceInvoices from './pages/MaintenanceInvoices'
import DirectSales from './pages/DirectSales'
import PendingDebts from './pages/PendingDebts'
import './App.css'

export default function App() {
  return (
    <HashRouter>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <Routes>
            <Route path="/"               element={<Home />} />
            <Route path="/maintenance"    element={<MaintenanceInvoices />} />
            <Route path="/direct-sales"   element={<DirectSales />} />
            <Route path="/pending-debts"  element={<PendingDebts />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
