import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

const LOGO_URL = 'https://raw.githubusercontent.com/RubenRidissi/hojuelasfe/main/Distrilst/icon-192.png'

const NAV_ADMIN = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  { separator: 'Clientes' },
  { to: '/clientes',    icon: '👥', label: 'Listado' },
  { to: '/mapa',        icon: '🗺️', label: 'Mapa' },
  { separator: 'Operaciones' },
  { to: '/pedidos',     icon: '📋', label: 'Pedidos' },
  { to: '/ventas',      icon: '🧾', label: 'Ventas' },
  { to: '/remitos',     icon: '🚚', label: 'Remitos' },
  { to: '/pagos',       icon: '💰', label: 'Pagos' },
  { to: '/ctacte',      icon: '📒', label: 'Cta. Corriente' },
  { separator: 'Proveedores' },
  { to: '/proveedor',   icon: '📋', label: 'Pedidos' },
  { to: '/recepciones', icon: '📦', label: 'Recepciones' },
  { to: '/ctacte-prov', icon: '📒', label: 'Cta. Cte.', disabled: true, tag: 'próx.' },
  { separator: 'Productos' },
  { to: '/productos',   icon: '🏷️', label: 'Catálogo' },
  { to: '/stock',       icon: '📦', label: 'Stock' },
  { to: '/listas',      icon: '📋', label: 'Listas de Precios Vigentes' },
  { separator: 'Finanzas' },
  { to: '/finanzas',    icon: '💵', label: 'Finanzas' },
  { to: '/reportes',    icon: '📊', label: 'Reportes' },
  { to: '/config',      icon: '⚙️', label: 'Configuración' },
]

const NAV_VENDEDOR = [
  { to: '/',          icon: '📊', label: 'Inicio' },
  { separator: 'Clientes' },
  { to: '/clientes',  icon: '👥', label: 'Listado' },
  { to: '/mapa',      icon: '🗺️', label: 'Mapa' },
  { separator: 'Operaciones' },
  { to: '/pedidos',   icon: '📋', label: 'Pedidos' },
  { to: '/ventas',    icon: '🧾', label: 'Ventas' },
  { to: '/pagos',     icon: '💰', label: 'Cobros' },
  { separator: 'Productos' },
  { to: '/listas',    icon: '📋', label: 'Listas de Precios' },
]

export default function Sidebar() {
  const { nombre, isAdmin, logout } = useAuth()
  const nav = isAdmin ? NAV_ADMIN : NAV_VENDEDOR

  return (
    <aside style={{
      position: 'fixed',
      top: 0, left: 0, bottom: 0,
      width: 'var(--sidebar-w)',
      background: 'white',
      borderRight: '1px solid var(--border)',
      display: 'flex',
      flexDirection: 'column',
      zIndex: 100,
      overflowY: 'auto'
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        <img src={LOGO_URL} alt="Hojuelas"
          style={{ height: 64, marginBottom: 8 }}
          onError={e => e.target.style.display = 'none'} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>Hojuelas SFE</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Panel de gestión</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {nav.map((item, i) => {
          if (item.separator) {
            return (
              <div key={i} style={{
                padding: '14px 16px 4px',
                fontSize: 10,
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                color: 'var(--muted)'
              }}>
                {item.separator}
              </div>
            )
          }

          if (item.disabled) {
            return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px 8px 28px',
                fontSize: 13, color: '#C4B8A8',
                cursor: 'default'
              }}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.tag && <span style={{ fontSize:10, background:'#F3F4F6', color:'#9CA3AF', padding:'1px 6px', borderRadius:8, marginLeft:'auto' }}>{item.tag}</span>}
              </div>
            )
          }

          return (
            <NavLink
              key={item.to + i}
              to={item.to}
              end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '8px 16px 8px 28px',
                textDecoration: 'none',
                color: isActive ? 'var(--primary-dark)' : 'var(--text)',
                background: isActive ? 'var(--primary-light)' : 'transparent',
                fontWeight: isActive ? 600 : 400,
                fontSize: 13,
                borderRadius: '0 8px 8px 0',
                marginRight: 8,
                transition: 'background 0.15s',
              })}
            >
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User badge + logout */}
      <div style={{
        padding: '12px 16px',
        borderTop: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nombre}
          </div>
          <div style={{
            fontSize: 10, fontWeight: 700,
            background: isAdmin ? 'var(--primary-light)' : '#DBEAFE',
            color: isAdmin ? 'var(--primary-dark)' : '#1D4ED8',
            padding: '1px 8px', borderRadius: 10, display: 'inline-block', marginTop: 2
          }}>
            {isAdmin ? 'Admin' : 'Vendedor'}
          </div>
        </div>
        <button onClick={logout} className="btn btn-secondary btn-sm" title="Cerrar sesión">
          Salir
        </button>
      </div>
    </aside>
  )
}
