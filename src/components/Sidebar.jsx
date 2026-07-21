import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const LOGO_URL = 'https://raw.githubusercontent.com/RubenRidissi/hojuelasfe/main/Distrilst/icon-192.png'

const NAV_ADMIN = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  {
    group: 'Clientes', icon: '👥', defaultOpen: true, items: [
      { to: '/clientes', icon: '👥', label: 'Listado' },
      { to: '/mi-ruta',  icon: '🗓️', label: 'Mi Ruta' },
      { to: '/mapa',     icon: '🗺️', label: 'Mapa' },
      { to: '/ctacte',   icon: '📒', label: 'Cta. Corriente' },
    ]
  },
  {
    group: 'Operación Comercial', icon: '🛒', defaultOpen: true, items: [
      { to: '/pedidos', icon: '📋', label: 'Pedidos' },
      { to: '/ventas',  icon: '🧾', label: 'Ventas' },
      { to: '/pagos',   icon: '💰', label: 'Cobros' },
    ]
  },
  {
    group: 'Productos', icon: '📦', defaultOpen: false, items: [
      { to: '/productos', icon: '📦', label: 'Productos' },
      { to: '/stock',     icon: '🏪', label: 'Stock' },
      { to: '/listas',    icon: '📋', label: 'Listas de precios' },
    ]
  },
  {
    group: 'Logística', icon: '🚚', defaultOpen: false, items: [
      { to: '/remitos', icon: '🚚', label: 'Remitos' },
    ]
  },
  {
    group: 'Proveedores', icon: '🏭', defaultOpen: false, items: [
      { to: '/proveedores',        icon: '🏭', label: 'Listado' },
      { to: '/proveedor',          icon: '📋', label: 'Pedidos proveedor' },
      { to: '/recepciones',        icon: '📥', label: 'Recepciones' },
      { to: '/ctacte-proveedores', icon: '💳', label: 'Ctas. Ctes.' },
      { to: '/pagos-proveedores',  icon: '💸', label: 'Pagos' },
    ]
  },
  {
    group: 'Administración', icon: '📊', defaultOpen: false, items: [
      { to: '/reportes', icon: '📊', label: 'Reportes' },
      { to: '/finanzas', icon: '💵', label: 'Finanzas' },
      { to: '/gastos', icon: '🧾', label: 'Gastos' },
      { to: '/comisiones', icon: '🤝', label: 'Comisiones' },
      { to: '/historial-visitas', icon: '🗓️', label: 'Historial de Visitas' },
    ]
  },
  {
    group: 'Sistema', icon: '⚙️', defaultOpen: false, items: [
      { to: '/config', icon: '⚙️', label: 'Configuración' },
    ]
  },
]

const NAV_VENDEDOR = [
  { to: '/', icon: '📊', label: 'Inicio' },
  {
    group: 'Clientes', icon: '👥', defaultOpen: true, items: [
      { to: '/clientes', icon: '👥', label: 'Listado' },
      { to: '/mi-ruta',  icon: '🗓️', label: 'Mi Ruta' },
      { to: '/mapa',     icon: '🗺️', label: 'Mapa' },
      { to: '/ctacte',   icon: '📒', label: 'Cta. Corriente' },
    ]
  },
  {
    group: 'Operación Comercial', icon: '🛒', defaultOpen: true, items: [
      { to: '/pedidos', icon: '📋', label: 'Pedidos' },
      { to: '/ventas',  icon: '🧾', label: 'Ventas' },
      { to: '/pagos',   icon: '💰', label: 'Cobros' },
    ]
  },
  {
    group: 'Productos', icon: '📦', defaultOpen: false, items: [
      { to: '/productos', icon: '📦', label: 'Productos' },
      { to: '/stock',     icon: '🏪', label: 'Stock' },
      { to: '/listas',    icon: '📋', label: 'Listas de precios' },
    ]
  },
  {
    group: 'Logística', icon: '🚚', defaultOpen: false, items: [
      { to: '/remitos', icon: '🚚', label: 'Remitos' },
    ]
  },
  {
    group: 'Información', icon: 'ℹ️', defaultOpen: false, items: [
      { to: '/reportes', icon: '📊', label: 'Reportes' },
      { to: '/ayuda',    icon: '❓', label: 'Ayuda' },
    ]
  },
  {
    group: 'Sistema', icon: '⚙️', defaultOpen: false, items: [
      { to: '/config', icon: '⚙️', label: 'Mi cuenta' },
    ]
  },
]

function NavGroup({ group, icon, defaultOpen, items }) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div>
      <button onClick={() => setOpen(o => !o)} style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', padding: '9px 16px',
        background: 'none', border: 'none', cursor: 'pointer',
        fontSize: 13, fontWeight: 600, color: 'var(--text)',
        textAlign: 'left'
      }}>
        <span style={{ fontSize: 15 }}>{icon}</span>
        <span style={{ flex: 1 }}>{group}</span>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ paddingLeft: 8 }}>
          {items.map((item, i) => {
            if (item.disabled) return (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '8px 16px', fontSize: 13, color: '#C4B8A8'
              }}>
                <span>{item.icon}</span>
                <span>{item.label}</span>
                {item.tag && <span style={{ fontSize: 10, background: '#F3F4F6', color: '#9CA3AF', padding: '1px 6px', borderRadius: 8, marginLeft: 'auto' }}>{item.tag}</span>}
              </div>
            )
            return (
              <NavLink key={item.to} to={item.to}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 16px', textDecoration: 'none',
                  color: isActive ? 'var(--primary-dark)' : 'var(--text)',
                  background: isActive ? 'var(--primary-light)' : 'transparent',
                  fontWeight: isActive ? 600 : 400,
                  fontSize: 13,
                  borderRadius: '0 8px 8px 0',
                  marginRight: 8,
                })}>
                <span style={{ fontSize: 15 }}>{item.icon}</span>
                <span>{item.label}</span>
              </NavLink>
            )
          })}
        </div>
      )}
    </div>
  )
}

const ROL_LABEL = { admin: 'Admin', vendedor: 'Vendedor', invitado: 'Invitado' }

export default function Sidebar() {
  const { nombre, rol, isAdmin, logout } = useAuth()
  const nav = isAdmin ? NAV_ADMIN : NAV_VENDEDOR

  return (
    <aside style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 'var(--sidebar-w)', background: 'white',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      zIndex: 100, overflowY: 'auto'
    }}>
      {/* Logo */}
      <div style={{ padding: '20px 16px 16px', textAlign: 'center', borderBottom: '1px solid var(--border)' }}>
        <img src={LOGO_URL} alt="Hojuelas" style={{ height: 64, marginBottom: 8 }}
          onError={e => e.target.style.display = 'none'} />
        <div style={{ fontWeight: 700, fontSize: 15 }}>Hojuelas SFE</div>
        <div style={{ fontSize: 11, color: 'var(--muted)' }}>Panel de gestión</div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '8px 0' }}>
        {nav.map((item, i) => {
          if (item.group) return <NavGroup key={i} {...item} />
          return (
            <NavLink key={item.to} to={item.to} end={item.to === '/'}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 16px', textDecoration: 'none',
                color: isActive ? 'var(--primary-dark)' : 'var(--text)',
                background: isActive ? 'var(--primary-light)' : 'transparent',
                fontWeight: isActive ? 600 : 400, fontSize: 13,
                borderRadius: '0 8px 8px 0', marginRight: 8,
              })}>
              <span style={{ fontSize: 15 }}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          )
        })}
      </nav>

      {/* User + logout */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{nombre}</div>
          <div style={{
            fontSize: 10, fontWeight: 700,
            background: isAdmin ? 'var(--primary-light)' : '#DBEAFE',
            color: isAdmin ? 'var(--primary-dark)' : '#1D4ED8',
            padding: '1px 8px', borderRadius: 10, display: 'inline-block', marginTop: 2
          }}>{ROL_LABEL[rol] || 'Vendedor'}</div>
        </div>
        <button onClick={logout} className="btn btn-secondary btn-sm">Salir</button>
      </div>
    </aside>
  )
}
