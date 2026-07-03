import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

function EspigaIcon({ size = 30 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <path d="M18 54C28 43 34 30 38 10" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M17 54C25 48 34 42 49 39" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <path d="M23 44C14 41 10 34 10 28C18 29 24 35 23 44Z" fill="currentColor" />
      <path d="M28 34C19 31 17 23 19 17C27 20 31 27 28 34Z" fill="currentColor" />
      <path d="M35 27C31 18 34 11 41 7C45 16 42 23 35 27Z" fill="currentColor" />
      <path d="M32 41C34 31 42 26 51 25C50 35 42 40 32 41Z" fill="currentColor" />
      <path d="M38 50C42 43 49 41 56 43C51 50 45 53 38 50Z" fill="currentColor" />
    </svg>
  )
}

const FAB_GROUPS = {
  operaciones: [
    { label: 'Nuevo Pedido', icon: '📋', path: '/pedidos', event: 'fab:nuevo-pedido' },
    { label: 'Nuevo Cobro', icon: '💰', path: '/pagos', event: 'fab:nuevo-cobro' },
    { label: 'Nuevo Cliente', icon: '👤', path: '/clientes', event: 'fab:nuevo-cliente' },
  ],
  clientes: [
    { label: 'Listado', icon: '👥', path: '/clientes' },
    { label: 'Mapa', icon: '🗺️', path: '/mapa' },
    { label: 'Cuenta Corriente', icon: '💳', path: '/ctacte' },
    { label: 'Favoritos', icon: '⭐', path: '/clientes' },
  ],
  productos: [
    { label: 'Listado', icon: '📦', path: '/productos' },
    { label: 'Stock', icon: '🏪', path: '/stock' },
    { label: 'Listas de Precios', icon: '💲', path: '/listas' },
    { label: 'Novedades', icon: '🆕', path: '/novedades' },
  ],
  mas: [
{ label: 'Mi Día', icon: '📅', path: '/mi-dia' },
{ label: 'Reportes', icon: '📊', path: '/reportes' },
{ label: 'Comunicados Internos', icon: '📢', path: '/comunicados' },
{ label: 'Ayuda', icon: '❓', path: '/ayuda' },
  ],
}

function contextFromPath(path) {
  if (['/clientes', '/mapa', '/ctacte'].some(p => path.startsWith(p))) return 'clientes'
  if (['/productos', '/stock', '/listas'].some(p => path.startsWith(p))) return 'productos'
  if (['/remitos', '/mi-dia', '/reportes', '/ayuda', '/comunicados'].some(p => path.startsWith(p))) return 'mas'
  return 'operaciones'
}

export default function FabButton() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const items = FAB_GROUPS[contextFromPath(location.pathname)]

  function runAction(item) {
    setOpen(false)
    if (item.path && location.pathname !== item.path) navigate(item.path)
    if (item.event) setTimeout(() => window.dispatchEvent(new CustomEvent(item.event)), 80)
  }

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 46,
          background: 'rgba(28,25,23,0.22)', backdropFilter: 'blur(2px)'
        }} />
      )}

      {open && (
        <div style={{
          position: 'fixed', bottom: 154, right: 16,
          display: 'flex', flexDirection: 'column-reverse', gap: 18, zIndex: 47
        }}>
          {items.map((item, index) => (
            <div key={item.label} style={{
              display: 'flex', alignItems: 'center', gap: 12, justifyContent: 'flex-end',
              animation: `fabRise .18s ease both`, animationDelay: `${index * 55}ms`
            }}>
              <span style={{
                background: 'rgba(255,255,255,0.97)', color: 'var(--text)',
                padding: '9px 15px', borderRadius: 16, fontSize: 13,
                fontWeight: 800, whiteSpace: 'nowrap', border: '1px solid rgba(232,226,216,0.95)',
                boxShadow: '0 12px 28px rgba(28,25,23,0.18)'
              }}>{item.label}</span>
              <button onClick={() => runAction(item)} style={{
                width: 50, height: 50, borderRadius: '50%', border: '1px solid rgba(154,95,0,0.22)',
                background: 'linear-gradient(145deg,#FF9F0A 0%,#EC7A00 100%)', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 10px 22px rgba(212,134,10,0.34), inset 0 1px 0 rgba(255,255,255,0.34)',
                fontSize: 22
              }}>
                {item.icon}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        aria-label={open ? 'Cerrar acciones rápidas' : 'Abrir acciones rápidas'}
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: 88, right: 16,
          width: 62, height: 62, borderRadius: '50%',
          background: 'linear-gradient(145deg,#FF9F0A 0%,#EC7A00 100%)', color: '#fff',
          fontSize: 28, border: '1px solid rgba(154,95,0,0.22)',
          boxShadow: open
            ? '0 0 0 14px rgba(255,159,10,0.20), 0 12px 28px rgba(212,134,10,0.35)'
            : '0 14px 30px rgba(212,134,10,0.36), inset 0 1px 0 rgba(255,255,255,0.34)',
          cursor: 'pointer', zIndex: 47,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          transform: open ? 'scale(0.96)' : 'scale(1)'
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <EspigaIcon size={34} />
          <span style={{ fontSize: 28, fontWeight: 800, lineHeight: 1 }}>{open ? '×' : '+'}</span>
        </span>
      </button>
    </>
  )
}
