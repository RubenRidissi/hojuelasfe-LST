import { useAuth } from '../context/AuthContext'

export default function DashboardPage() {
  const { nombre, isAdmin } = useAuth()

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
      </div>
      <div className="card" style={{ padding: 32, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👋</div>
        <h2 style={{ marginBottom: 8 }}>Bienvenido, {nombre}</h2>
        <p style={{ color: 'var(--muted)' }}>
          {isAdmin ? 'Panel de administración' : 'Panel de vendedor'} — En construcción
        </p>
      </div>
    </div>
  )
}
