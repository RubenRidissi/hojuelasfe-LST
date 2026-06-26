import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function MobileNav() {
  const { nombre, isAdmin, logout } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()

  const [openDrawer, setOpenDrawer] = useState(null) // 'clientes' | 'productos' | 'logistica' | 'more' | null

  function go(path) {
    setOpenDrawer(null)
    navigate(path)
  }

  function toggleDrawer(name) {
    setOpenDrawer(prev => prev === name ? null : name)
  }

  const path = location.pathname
  const isActive = (p) => p === '/' ? path === '/' : path.startsWith(p)

  const navItemStyle = (active) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    padding: '8px 4px 10px', cursor: 'pointer', flex: 1,
    border: 'none', background: 'none',
    color: active ? 'var(--primary)' : 'var(--muted)',
    fontSize: 10, gap: 3, minWidth: 0, transition: 'color 0.15s'
  })

  const drawerItemStyle = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '12px 20px', cursor: 'pointer', fontSize: 14, color: 'var(--text)'
  }

  const drawerLabelStyle = {
    padding: '12px 20px 8px', fontSize: 12, fontWeight: 600,
    color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em'
  }

  const iconStyle = { fontSize: 20, width: 28, textAlign: 'center' }

  return (
    <>
      {/* Overlay */}
      {openDrawer && (
        <div onClick={() => setOpenDrawer(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 44 }} />
      )}

      {/* CLIENTES DRAWER */}
      <div style={{
        position: 'fixed', bottom: 64, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        zIndex: 45, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
        display: openDrawer === 'clientes' ? 'block' : 'none'
      }}>
        <div style={drawerLabelStyle}>Clientes</div>
        <div style={drawerItemStyle} onClick={() => go('/clientes')}><span style={iconStyle}>👥</span>Listado</div>
        <div style={drawerItemStyle} onClick={() => go('/mapa')}><span style={iconStyle}>🗺️</span>Mapa</div>
        <div style={drawerItemStyle} onClick={() => go('/ctacte')}><span style={iconStyle}>💳</span>Cta. Corriente</div>
      </div>

      {/* PRODUCTOS DRAWER */}
      <div style={{
        position: 'fixed', bottom: 64, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        zIndex: 45, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
        display: openDrawer === 'productos' ? 'block' : 'none'
      }}>
        <div style={drawerLabelStyle}>Productos</div>
        <div style={drawerItemStyle} onClick={() => go('/productos')}><span style={iconStyle}>📦</span>Productos</div>
        <div style={drawerItemStyle} onClick={() => go('/stock')}><span style={iconStyle}>🏪</span>Stock</div>
        <div style={drawerItemStyle} onClick={() => go('/listas')}><span style={iconStyle}>📋</span>Listas de precios</div>
      </div>

      {/* LOGÍSTICA DRAWER */}
      <div style={{
        position: 'fixed', bottom: 64, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        zIndex: 45, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
        display: openDrawer === 'logistica' ? 'block' : 'none'
      }}>
        <div style={drawerLabelStyle}>Logística</div>
        <div style={drawerItemStyle} onClick={() => go('/remitos')}><span style={iconStyle}>🚚</span>Remitos</div>
      </div>

      {/* MÁS DRAWER */}
      <div style={{
        position: 'fixed', bottom: 64, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        zIndex: 45, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
        display: openDrawer === 'more' ? 'block' : 'none'
      }}>
        {isAdmin ? (
          <>
            <div style={drawerLabelStyle}>Proveedores</div>
            <div style={drawerItemStyle} onClick={() => go('/proveedor')}><span style={iconStyle}>📋</span>Pedidos proveedor</div>
            <div style={drawerItemStyle} onClick={() => go('/recepciones')}><span style={iconStyle}>📥</span>Recepciones</div>
            <div style={drawerItemStyle} onClick={() => go('/ctacte-proveedores')}><span style={iconStyle}>💳</span>Ctas. Ctes. Proveedores</div>
            <div style={drawerItemStyle} onClick={() => go('/pagos-proveedores')}><span style={iconStyle}>💸</span>Pagos</div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            <div style={drawerLabelStyle}>Administración</div>
            <div style={drawerItemStyle} onClick={() => go('/reportes')}><span style={iconStyle}>📊</span>Reportes</div>
            <div style={drawerItemStyle} onClick={() => go('/finanzas')}><span style={iconStyle}>💵</span>Finanzas</div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            <div style={drawerLabelStyle}>Sistema</div>
            <div style={drawerItemStyle} onClick={() => go('/config')}><span style={iconStyle}>⚙️</span>Configuración</div>
          </>
        ) : (
          <>
            <div style={drawerLabelStyle}>Información</div>
            <div style={drawerItemStyle} onClick={() => go('/reportes')}><span style={iconStyle}>📊</span>Reportes</div>
            <div style={drawerItemStyle} onClick={() => go('/ayuda')}><span style={iconStyle}>❓</span>Ayuda</div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            <div style={drawerLabelStyle}>Mi cuenta</div>
            <div style={drawerItemStyle} onClick={() => go('/perfil')}><span style={iconStyle}>👤</span>Mi Perfil</div>

            <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
            <div style={drawerLabelStyle}>Sistema</div>
            <div style={drawerItemStyle} onClick={() => go('/config')}><span style={iconStyle}>⚙️</span>Configuración</div>
          </>
        )}

        <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
        <div style={{ padding: '10px 20px 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--primary-light)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>👤</div>
          <div>
            <div style={{ fontSize: 13, fontWeight: 600 }}>{nombre}</div>
            <div style={{ fontSize: 11, color: 'var(--muted)' }}>{isAdmin ? 'Admin' : 'Vendedor'}</div>
          </div>
        </div>
        <div style={{ ...drawerItemStyle, color: 'var(--danger)' }} onClick={() => { setOpenDrawer(null); logout() }}>
          <span style={iconStyle}>🚪</span>Cerrar sesión
        </div>
      </div>

      {/* BOTTOM NAV */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        zIndex: 50, padding: '0 4px', display: 'flex'
      }}>
        <button style={navItemStyle(isActive('/'))} onClick={() => go('/')}>
          <span style={{ fontSize: 20 }}>📊</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>Inicio</span>
        </button>
        <button style={navItemStyle(
          isActive('/clientes') || isActive('/ctacte') || isActive('/mapa') || openDrawer === 'clientes'
        )} onClick={() => toggleDrawer('clientes')}>
          <span style={{ fontSize: 20 }}>👥</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>Clientes</span>
        </button>
        <button style={navItemStyle(
          isActive('/productos') || isActive('/stock') || isActive('/listas') || openDrawer === 'productos'
        )} onClick={() => toggleDrawer('productos')}>
          <span style={{ fontSize: 20 }}>📦</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>Productos</span>
        </button>
        <button style={navItemStyle(isActive('/remitos') || openDrawer === 'logistica')} onClick={() => toggleDrawer('logistica')}>
          <span style={{ fontSize: 20 }}>🚚</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>Logística</span>
        </button>
        <button style={navItemStyle(openDrawer === 'more')} onClick={() => toggleDrawer('more')}>
          <span style={{ fontSize: 20 }}>☰</span>
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 56 }}>Más</span>
        </button>
      </nav>
    </>
  )
}
