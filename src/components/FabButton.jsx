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

function MiniIcon({ item }) {
  if (item.kind === 'pedido') return <span style={{ fontSize: 22 }}>📋</span>
  if (item.kind === 'visita') return <span style={{ fontSize: 22 }}>👤</span>
  if (item.kind === 'cliente') return <span style={{ fontSize: 22 }}>👤</span>
  return <span style={{ fontSize: 20 }}>{item.icon}</span>
}

export default function FabButton() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()
  const path = location.pathname

  function go(path) {
    setOpen(false)
    navigate(path)
  }

  function fire(eventName) {
    setOpen(false)
    window.dispatchEvent(new CustomEvent(eventName))
  }

  const MODULOS = [
    { key: 'pedidos', label: 'Pedidos', icon: '📋', path: '/pedidos', nuevoLabel: 'Nuevo pedido', event: 'fab:nuevo-pedido', kind: 'pedido' },
    { key: 'ventas', label: 'Visitas', icon: '👤', path: '/ventas', nuevoLabel: 'Nueva visita', event: 'fab:nueva-venta', kind: 'visita' },
    { key: 'clientes', label: 'Clientes', icon: '👥', path: '/clientes', nuevoLabel: 'Nuevo cliente', event: 'fab:nuevo-cliente', kind: 'cliente' },
  ]

  const contextual = (() => {
    if (path.startsWith('/pedidos')) return 'pedidos'
    if (path.startsWith('/ventas')) return 'ventas'
    if (path.startsWith('/clientes')) return 'clientes'
    return null
  })()

  const items = contextual
    ? [
        { ...MODULOS.find(m => m.key === contextual), isAction: true },
        ...MODULOS.filter(m => m.key !== contextual)
      ]
    : MODULOS

  function handleItem(item) {
    if (item.isAction) fire(item.event)
    else go(item.path)
  }

  return (
    <>
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 46,
          background: 'rgba(28,25,23,0.12)', backdropFilter: 'blur(1px)'
        }} />
      )}

      {open && (
        <div style={{
          position: 'fixed', bottom: 136, right: 16,
          display: 'flex', flexDirection: 'column', gap: 12, zIndex: 47
        }}>
          {items.map(item => (
            <div key={item.isAction ? item.event : item.path} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
              <span style={{
                background: 'rgba(255,255,255,0.96)', color: 'var(--text)',
                padding: '8px 14px', borderRadius: 14, fontSize: 13,
                fontWeight: 700, whiteSpace: 'nowrap', border: '1px solid rgba(232,226,216,0.95)',
                boxShadow: '0 10px 24px rgba(28,25,23,0.16)'
              }}>{item.isAction ? item.nuevoLabel : item.label}</span>
              <button onClick={() => handleItem(item)} style={{
                width: 48, height: 48, borderRadius: '50%', border: '1px solid rgba(154,95,0,0.22)',
                background: 'linear-gradient(145deg,#FF9F0A 0%,#EC7A00 100%)', color: '#fff',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 10px 22px rgba(212,134,10,0.34), inset 0 1px 0 rgba(255,255,255,0.34)',
                position: 'relative'
              }}>
                <MiniIcon item={item} />
                {item.kind === 'cliente' && <span style={{ position: 'absolute', right: 8, bottom: 8, fontSize: 13, fontWeight: 900 }}>＋</span>}
              </button>
            </div>
          ))}
        </div>
      )}

      <button
        aria-label={open ? 'Cerrar acciones rápidas' : 'Abrir acciones rápidas'}
        onClick={() => setOpen(o => {
          const next = !o
          if (next) window.dispatchEvent(new CustomEvent('fab:menu-open'))
          return next
        })}
        style={{
          position: 'fixed', bottom: 76, right: 16,
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
