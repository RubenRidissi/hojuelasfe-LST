import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

function contextFromPath(path) {
  if (['/clientes', '/mapa', '/ctacte'].some(p => path.startsWith(p))) return 'clientes'
  if (['/productos', '/stock', '/listas', '/novedades'].some(p => path.startsWith(p))) return 'productos'
  if (['/remitos', '/mi-dia', '/reportes', '/ayuda', '/comunicados'].some(p => path.startsWith(p))) return 'mas'
  return 'operaciones'
}

function FarewellOverlay() {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 10000,
      background: 'linear-gradient(135deg,#B91C1C 0%,#DC2626 55%,#9F1239 100%)',
      color: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, textAlign: 'center', animation: 'fadeIn .18s ease both'
    }}>
      <div style={{ animation: 'fabRise .24s ease both' }}>
        <img src="/branding/logo-principal.png" alt="Hojuelas" style={{ width: 116, height: 116, objectFit: 'contain', marginBottom: 18, filter: 'drop-shadow(0 12px 26px rgba(0,0,0,.25))' }} />
        <div style={{ fontSize: 20, fontWeight: 900, marginBottom: 6 }}>¡Gracias por tu trabajo hoy!</div>
        <div style={{ fontSize: 18, fontWeight: 700, opacity: .94 }}>Dios te bendiga.</div>
      </div>
    </div>
  )
}

export default function MobileNav() {
  const { logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [farewell, setFarewell] = useState(false)
  const active = contextFromPath(location.pathname)

  const items = [
    { key: 'operaciones', label: 'Operaciones', icon: '💼', path: '/pedidos' },
    { key: 'clientes', label: 'Clientes', icon: '👥', path: '/clientes' },
    { key: 'productos', label: 'Productos', icon: '📦', path: '/productos' },
    { key: 'mas', label: 'Más', icon: '☰', path: '/mi-dia' },
  ]

  async function cerrarSesion() {
  setFarewell(true)
  setTimeout(async () => {
    sessionStorage.removeItem('hojuelas_versiculo_mostrado')
    await logout()
  }, 2500)
}

  const navItemStyle = (isActive) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '8px 4px 10px', cursor: 'pointer', flex: 1,
    border: 'none', background: 'none',
    color: isActive ? 'var(--primary)' : 'var(--muted)',
    fontSize: 10, gap: 3, minWidth: 0, transition: 'color 0.15s'
  })

  return (
    <>
      {farewell && <FarewellOverlay />}
      {location.pathname !== '/' && (
  <button
    onClick={() => navigate('/')}
    aria-label="Volver al inicio"
    style={{
      position: 'fixed',
      top: 12,
      right: 16,
      zIndex: 55,
      width: 40,
      height: 40,
      border: 0,
      borderRadius: 999,
      background: 'rgba(255,255,255,.92)',
      boxShadow: '0 10px 24px rgba(28,25,23,.12)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 6
    }}
  >
    <img
      src="/branding/logo-principal.png"
      alt="Inicio"
      style={{ width: 36, height: 36, objectFit: 'contain' }}
    />
  </button>
)}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        zIndex: 50, padding: '0 4px', display: 'flex'
      }}>
        {items.map(item => (
          <button key={item.key} style={navItemStyle(active === item.key)} onClick={() => navigate(item.path)}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 72 }}>{item.label}</span>
          </button>
        ))}
      </nav>
      {location.pathname.startsWith('/mi-dia') && (
        <button onClick={cerrarSesion} style={{
          position: 'fixed', left: 16, bottom: 82, zIndex: 45,
          border: '1px solid rgba(220,38,38,.16)', background: 'rgba(255,255,255,.94)',
          color: 'var(--danger)', borderRadius: 999, padding: '9px 13px', fontWeight: 800,
          boxShadow: '0 10px 24px rgba(28,25,23,.10)'
        }}>🚪 Salir</button>
      )}
    </>
  )
}
