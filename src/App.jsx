import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import ClientesPage from './pages/ClientesPage'
import PedidosPage from './pages/PedidosPage'
import VentasPage from './pages/VentasPage'
import PagosPage from './pages/PagosPage'
import RemitosPage from './pages/RemitosPage'
import CtaCorrientePage from './pages/CtaCorrientePage'
import ProveedorPage from './pages/ProveedorPage'
import ProveedoresPage from './pages/ProveedoresPage'
import CtaCorrienteProveedoresPage from './pages/CtaCorrienteProveedoresPage'
import RecepcionesPage from './pages/RecepcionesPage'
import PagosProveedoresPage from './pages/PagosProveedoresPage'
import ProductosPage from './pages/ProductosPage'
import StockPage from './pages/StockPage'
import ListasPage from './pages/ListasPage'
import FinanzasPage from './pages/FinanzasPage'
import ReportesPage from './pages/ReportesPage'
import ConfigPage from './pages/ConfigPage'
import MapaPage from './pages/MapaPage'
import InfoPage from './pages/InfoPage'
import Sidebar from './components/Sidebar'
import MobileNav from './components/MobileNav'
import FabButton from './components/FabButton'
import { ToastContainer } from './components/Toast'
import { useToast } from './hooks/useToast'

function AppLayout() {
  const { toasts } = useToast()
  const location = useLocation()
  const hideFab = location.pathname === '/'

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
          <Route path="/mapa"      element={<MapaPage />} />
          <Route path="/pedidos"  element={<PedidosPage />} />
          <Route path="/ventas"   element={<VentasPage />} />
          <Route path="/pagos"    element={<PagosPage />} />
          <Route path="/remitos"  element={<RemitosPage />} />
          <Route path="/ctacte"   element={<CtaCorrientePage />} />
          <Route path="/proveedores" element={<AdminRoute><ProveedoresPage /></AdminRoute>} />
          <Route path="/proveedor" element={<AdminRoute><ProveedorPage /></AdminRoute>} />
          <Route path="/recepciones" element={<AdminRoute><RecepcionesPage /></AdminRoute>} />
          <Route path="/pagos-proveedores" element={<AdminRoute><PagosProveedoresPage /></AdminRoute>} />
          <Route path="/ctacte-proveedores" element={<AdminRoute><CtaCorrienteProveedoresPage /></AdminRoute>} />
          <Route path="/productos"   element={<ProductosPage />} />
          <Route path="/stock"       element={<StockPage />} />
          <Route path="/listas"      element={<ListasPage />} />
          <Route path="/finanzas"    element={<AdminRoute><FinanzasPage /></AdminRoute>} />
          <Route path="/reportes"    element={<ReportesPage />} />
          <Route path="/config"      element={<ConfigPage />} />
          <Route path="/mi-dia"      element={<InfoPage type="/mi-dia" />} />
          <Route path="/ayuda"       element={<InfoPage type="/ayuda" />} />
          <Route path="/comunicados" element={<InfoPage type="/comunicados" />} />
          <Route path="/novedades"   element={<InfoPage type="/novedades" />} />
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {/* Mobile nav solo en mobile */}
      <div className="hide-on-desktop">
        <MobileNav />
        {!hideFab && <FabButton />}
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

function AdminRoute({ children }) {
  const { isAdmin } = useAuth()
  return isAdmin ? children : <Navigate to="/" replace />
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
