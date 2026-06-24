import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useAuth } from './context/AuthContext'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import Sidebar from './components/Sidebar'
import { ToastContainer } from './components/Toast'
import { useToast } from './hooks/useToast'

// Páginas — se van agregando módulo a módulo
// import ClientesPage from './pages/ClientesPage'

function AppLayout() {
  const { toasts, toast } = useToast()

  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/"         element={<DashboardPage />} />
          {/* Próximamente: */}
          {/* <Route path="/clientes"  element={<ClientesPage />} /> */}
          <Route path="*"         element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <ToastContainer toasts={toasts} />
    </div>
  )
}

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth()
  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
      <div style={{ color:'var(--muted)' }}>Cargando...</div>
    </div>
  )
  return user ? children : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/*" element={
          <ProtectedRoute>
            <AppLayout />
          </ProtectedRoute>
        } />
      </Routes>
    </BrowserRouter>
  )
}
