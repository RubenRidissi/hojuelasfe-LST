import { NavLink } from 'react-router-dom'
import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const LOGO_URL = 'https://raw.githubusercontent.com/RubenRidissi/hojuelasfe/main/Distrilst/icon-192.png'

const NAV_ADMIN = [
  { to: '/', icon: '📊', label: 'Dashboard' },
  {
    group: 'Clientes', icon: '👥', defaultOpen: true, items: [
      { to: '/clientes', icon: '👥', label: 'Listado' },
      { to: '/mapa',     icon: '🗺️', label: 'Mapa' },
      { to: '/pedidos',  icon: '📋', label: 'Pedidos' },
      { to: '/ventas',   icon: '🧾', label: 'Ventas' },
      { to: '/remitos',  icon: '🚚', label: 'Remitos' },
      { to: '/pagos',    icon: '💰', label: 'Pagos' },
      { to: '/ctacte',   icon: '📒', label: 'Cta. Corriente' },
    ]
  },
  {
    group: 'Proveedores', icon: '🏭', defaultOpen: false, items: [
      { to: '/proveedor',   icon: '📋', label: 'Pedidos' },
      { to: '/recepciones', icon: '📦', label: 'Recepciones' },
      { to: '/ctacte-prov', icon: '📒', label: 'Cta. Cte.', disabled: true, tag: 'próx.' },
    ]
  },
  {
    group: 'Productos', icon: '🏷️', defaultOpen: false, items: [
      { to: '/productos', icon: '🏷️', label: 'Catálogo' },
      { to: '/stock',     icon: '📦', label: 'Stock' },
      { to: '/listas',    icon: '📋', label: 'Listas de Precios Vigentes' },
    ]
  },
  { to: '/finanzas', icon: '💵', label: 'Finanzas' },
  { to: '/reportes', icon: '📊', label: 'Reportes' },
  { to: '/config',   icon: '⚙️', label: 'Configuración' },
]

const NAV_VENDEDOR = [
  { to: '/', icon: '📊', label: 'Inicio' },
  {
    group: 'Clientes', icon: '👥', defaultOpen: true, items: [
      { to: '/clientes', icon: '👥', label: 'Listado' },
      { to: '/mapa',     icon: '🗺️', label: 'Mapa' },
      { to: '/pedidos',  icon: '📋', label: 'Pedidos' },
      { to: '/ventas',   icon: '🧾', label: 'Ventas' },
      { to: '/pagos',    icon: '💰', label: 'Cobros' },
      { to: '/ctacte',   icon: '📒', label: 'Cta. Corriente' },
    ]
  },
  {
    group: 'Productos', icon: '🏷️', defaultOpen: false, items: [
      { to: '/listas', icon: '📋', label: 'Listas de Precios' },
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

export default function Sidebar() {
  const { nombre, isAdmin, logout } = useAuth()
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
          }}>{isAdmin ? 'Admin' : 'Vendedor'}</div>
        </div>
        <button onClick={logout} className="btn btn-secondary btn-sm">Salir</button>
      </div>
    </aside>
  )
}
