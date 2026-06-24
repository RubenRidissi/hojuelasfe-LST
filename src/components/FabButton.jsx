import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function FabButton() {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  function go(path) {
    setOpen(false)
    navigate(path)
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
          {[
            { label: 'Nuevo pedido',    icon: '📋', path: '/pedidos' },
            { label: 'Nueva venta',     icon: '🧾', path: '/ventas' },
            { label: 'Registrar cobro', icon: '💰', path: '/pagos' },
            { label: 'Clientes',        icon: '👥', path: '/clientes' },
          ].map(item => (
            <div key={item.path} style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
              <span style={{
                background: 'var(--text)', color: '#fff',
                padding: '6px 12px', borderRadius: 20, fontSize: 13,
                fontWeight: 500, whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
              }}>{item.label}</span>
              <button onClick={() => go(item.path)} style={{
                width: 44, height: 44, borderRadius: '50%',
                background: 'var(--surface)', border: '2px solid var(--primary)',
                color: 'var(--primary)', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
              }}>{item.icon}</button>
            </div>
          ))}
        </div>
      )}

      {/* FAB Button */}
      <button onClick={() => setOpen(o => !o)} style={{
        position: 'fixed', bottom: 76, right: 16,
        width: 56, height: 56, borderRadius: '50%',
        background: 'var(--primary)', color: '#fff',
        fontSize: 28, border: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
        cursor: 'pointer', zIndex: 47,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'transform 0.15s, box-shadow 0.15s'
      }}>＋</button>
    </>
  )
}
