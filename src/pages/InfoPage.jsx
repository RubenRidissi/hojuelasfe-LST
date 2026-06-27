import { useMemo } from 'react'

const CONTENT = {
  '/mi-dia': {
    icon: '📰', title: 'Mi Día', subtitle: 'Resumen rápido para empezar a trabajar.',
    items: ['Revisá tus pedidos pendientes.', 'Controlá cobranzas del día.', 'Consultá novedades y comunicados.']
  },
  '/ayuda': {
    icon: '❓', title: 'Ayuda', subtitle: 'Atajos y soporte para el vendedor.',
    items: ['Usá el FAB para acciones rápidas.', 'Desde Clientes podés consultar mapa y cuenta corriente.', 'Ante dudas operativas, contactá a administración.']
  },
  '/comunicados': {
    icon: '📢', title: 'Comunicados', subtitle: 'Avisos internos de Hojuelas.',
    items: ['Sin comunicados pendientes por ahora.']
  },
  '/novedades': {
    icon: '🆕', title: 'Novedades de Productos', subtitle: 'Altas, discontinuidades y cambios importantes.',
    items: ['Sin novedades cargadas por ahora.']
  }
}

export default function InfoPage({ type }) {
  const data = useMemo(() => CONTENT[type] || CONTENT['/mi-dia'], [type])
  return (
    <div style={{ paddingBottom: 120 }}>
      <div className="card" style={{ borderRadius: 24, padding: 24, boxShadow: '0 14px 34px rgba(28,25,23,.07)' }}>
        <div style={{ fontSize: 42, marginBottom: 12 }}>{data.icon}</div>
        <h1 style={{ fontSize: 26, lineHeight: 1.1, margin: 0, fontWeight: 900 }}>{data.title}</h1>
        <p style={{ color: 'var(--muted)', margin: '8px 0 20px', fontSize: 15 }}>{data.subtitle}</p>
        <div style={{ display: 'grid', gap: 10 }}>
          {data.items.map((item, i) => (
            <div key={i} style={{ padding: '13px 14px', borderRadius: 16, background: '#FAF8F4', border: '1px solid var(--border)', fontWeight: 650 }}>
              {item}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
