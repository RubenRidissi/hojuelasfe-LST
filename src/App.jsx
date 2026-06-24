import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ClientesPage from './pages/ClientesPage'
import PedidosPage from './pages/PedidosPage'
import VentasPage from './pages/VentasPage'
import PagosPage from './pages/PagosPage'
import RemitosPage from './pages/RemitosPage'
import CtaCorrientePage from './pages/CtaCorrientePage'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import FabButton from './components/FabButton'
import { ToastContainer } from './components/Toast'
import { useToast } from './hooks/useToast'

function AppLayout() {
  const { toasts } = useToast()
  return (
    <div className="app-layout">
      {/* Sidebar solo en PC */}
      <div className="hide-on-mobile">
        <Sidebar />
      </div>
      <main className="main-content">
        <Routes>
          <Route path="/"         element={<DashboardPage />} />
          <Route path="/clientes" element={<ClientesPage />} />
          <Route path="/pedidos"  element={<PedidosPage />} />
          <Route path="/ventas"   element={<VentasPage />} />
          <Route path="/pagos"    element={<PagosPage />} />
          <Route path="/remitos"  element={<RemitosPage />} />
          <Route path="/ctacte"   element={<CtaCorrientePage />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {/* Mobile nav solo en mobile */}
      <div className="hide-on-desktop">
        <MobileNav />
        <FabButton />
      </div>
      <ToastContainer toasts={toasts} />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ color: 'var(--muted)' }}>Cargando...</div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

function PublicRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <div style={{ color: 'var(--muted)' }}>Cargando...</div>
    </div>
  )
  return user ? <Navigate to="/" replace /> : children
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />
        <Route path="/*" element={<ProtectedRoute><AppLayout /></ProtectedRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
