import { useState } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'

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
    { key: 'clientes', label: 'Clientes', icon: '👥', path: '/clientes', nuevoLabel: 'Nuevo cliente', event: 'fab:nuevo-cliente' },
    { key: 'pedidos',  label: 'Pedidos',  icon: '📋', path: '/pedidos',  nuevoLabel: 'Nuevo pedido',  event: 'fab:nuevo-pedido' },
    { key: 'ventas',   label: 'Ventas',   icon: '🧾', path: '/ventas',   nuevoLabel: 'Nueva venta',   event: 'fab:nueva-venta' },
    { key: 'cobros',   label: 'Cobros',   icon: '💰', path: '/pagos',    nuevoLabel: 'Registrar cobro', event: 'fab:nuevo-cobro' },
  ]

  const contextual = (() => {
    if (path.startsWith('/clientes')) return 'clientes'
    if (path.startsWith('/pedidos')) return 'pedidos'
    if (path.startsWith('/ventas')) return 'ventas'
    if (path.startsWith('/pagos')) return 'cobros'
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
      {/* Overlay */}
      {open && (
        <div onClick={() => setOpen(false)} style={{
          position: 'fixed', inset: 0, zIndex: 46,
          background: 'rgba(0,0,0,0.3)'
        }} />
      )}

      {/* FAB Menu */}
      {open && (
        <div style={{
          position: 'fixed', bottom: 140, right: 16,
          display: 'flex', flexDirection: 'column', gap: 10, zIndex: 47
        }}>
          {items.map(item => (
            <div key={item.isAction ? item.event : item.path} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
              <span style={{
                background: item.isAction ? 'var(--primary)' : 'var(--text)',
                color: '#fff',
                padding: '6px 12px', borderRadius: 20, fontSize: 13,
                fontWeight: 500, whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}>{item.isAction ? item.nuevoLabel : item.label}</span>
              <button onClick={() => handleItem(item)} style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--surface)', border: `2px solid ${item.isAction ? 'var(--primary)' : 'var(--primary)'}`,
                color: 'var(--primary)', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}>{item.isAction ? '＋' : item.icon}</button>
            </div>
          ))}
        </div>
      )}

      {/* FAB Button */}
      <button onClick={() => setOpen(o => {
        const next = !o
        if (next) window.dispatchEvent(new CustomEvent('fab:menu-open'))
        return next
      })} style={{
        position: 'fixed', bottom: 76, right: 16,
        width: 56, height: 56, borderRadius: '50%',
        background: 'var(--primary)', color: '#fff',
        fontSize: 28, border: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        cursor: 'pointer', zIndex: 47,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s'
      }}>{open ? '×' : '＋'}</button>
    </>
  )
}
