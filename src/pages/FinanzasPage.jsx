import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const fmt = n => '$' + parseFloat(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })
const sum = arr => arr.reduce((s, x) => s + parseFloat(x.monto || 0), 0)
const sumCC = (arr, cc) => arr.filter(x => x.centro_costo === cc).reduce((s, x) => s + parseFloat(x.monto || 0), 0)

export default function FinanzasPage() {
  const { toasts, toast } = useToast()

  const [filtroCC, setFiltroCC] = useState('')
  const [loading, setLoading] = useState(true)

  // Posición período
  const [cobradoHoy, setCobradoHoy] = useState({ total: 0, cc1: 0, cc2: 0 })
  const [cobradoMes, setCobradoMes] = useState({ total: 0, cc1: 0, cc2: 0 })
  const [pagadoProvHoy, setPagadoProvHoy] = useState(0)
  const [pagadoProvMes, setPagadoProvMes] = useState(0)

  // Cuentas a cobrar
  const [totalCobrar, setTotalCobrar] = useState(0)
  const [cobroPorVendedor, setCobroPorVendedor] = useState([])
  const [topClientes, setTopClientes] = useState([])

  // Cuentas a pagar
  const [totalPagar, setTotalPagar] = useState(0)
  const [totalRecepPend, setTotalRecepPend] = useState(0)
  const [totalNC, setTotalNC] = useState(0)
  const [totalND, setTotalND] = useState(0)
  const [recepDeuda, setRecepDeuda] = useState([])
  const [vendedores, setVendedores] = useState([])

  useEffect(() => { loadFinanzas() }, [filtroCC])

  async function loadFinanzas() {
    setLoading(true)
    try {
      const now = new Date()
      const hoy = now.toISOString().split('T')[0]
      const mesDesde = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const mesHasta = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()}`

      // Vendedores
      const { data: vends } = await supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor')
      setVendedores(vends || [])

      // 1. POSICIÓN DEL PERÍODO
      let qHoy = supabase.from('pagos').select('monto,centro_costo').eq('fecha', hoy)
      let qMes = supabase.from('pagos').select('monto,centro_costo').gte('fecha', mesDesde).lte('fecha', mesHasta)
      if (filtroCC) { qHoy = qHoy.eq('centro_costo', filtroCC); qMes = qMes.eq('centro_costo', filtroCC) }

      const [{ data: cobHoy }, { data: cobMes }, { data: ppHoy }, { data: ppMes }] = await Promise.all([
        qHoy, qMes,
        supabase.from('pagos_proveedor').select('monto').eq('fecha', hoy),
        supabase.from('pagos_proveedor').select('monto').gte('fecha', mesDesde).lte('fecha', mesHasta)
      ])

      setCobradoHoy({ total: sum(cobHoy || []), cc1: sumCC(cobHoy || [], 'CC1'), cc2: sumCC(cobHoy || [], 'CC2') })
      setCobradoMes({ total: sum(cobMes || []), cc1: sumCC(cobMes || [], 'CC1'), cc2: sumCC(cobMes || [], 'CC2') })
      setPagadoProvHoy(sum(ppHoy || []))
      setPagadoProvMes(sum(ppMes || []))

      // 2. CUENTAS A COBRAR
      const [{ data: ventasPend }, { data: ajustesClientes }] = await Promise.all([
        supabase.from('ventas').select('total,monto_pagado,vendedor_id,cliente_id,clientes(nombre,nombre_fantasia)').neq('estado_pago', 'pagado'),
        supabase.from('ajustes_cliente').select('tipo,monto,cliente_id')
      ])

      const ajustesPorCliente = {}
      ;(ajustesClientes || []).forEach(a => {
        if (!ajustesPorCliente[a.cliente_id]) ajustesPorCliente[a.cliente_id] = 0
        ajustesPorCliente[a.cliente_id] += a.tipo === 'NC' ? -parseFloat(a.monto || 0) : parseFloat(a.monto || 0)
      })

      const porVendedor = {}
      const porCliente = {}
      ;(ventasPend || []).forEach(v => {
        const saldo = parseFloat(v.total || 0) - parseFloat(v.monto_pagado || 0)
        const vid = v.vendedor_id || 'sin_asignar'
        porVendedor[vid] = (porVendedor[vid] || 0) + saldo
        const nCli = v.clientes?.nombre_fantasia || v.clientes?.nombre || 'Sin nombre'
        porCliente[nCli] = (porCliente[nCli] || 0) + saldo
      })

      const totalAjustes = Object.values(ajustesPorCliente).reduce((s, v) => s + v, 0)
      const totalVentasPend = (ventasPend || []).reduce((s, v) => s + parseFloat(v.total || 0) - parseFloat(v.monto_pagado || 0), 0)

      setTotalCobrar(totalVentasPend + totalAjustes)
      setCobroPorVendedor(Object.entries(porVendedor).sort((a, b) => b[1] - a[1]).map(([vid, saldo]) => ({
        nombre: (vends || []).find(v => v.user_id === vid)?.nombre || 'Sin asignar', saldo
      })))
      setTopClientes(Object.entries(porCliente).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([nombre, saldo]) => ({ nombre, saldo })))

      // 3. CUENTAS A PAGAR
      const [{ data: receps }, { data: ajustesProv }] = await Promise.all([
        supabase.from('recepciones').select('numero,fecha_recepcion_real,remito_proveedor,total,monto_pagado_prov,estado_pago_prov').neq('estado_pago_prov', 'pagado').eq('estado', 'confirmada').order('fecha_recepcion_real'),
        supabase.from('ajustes_proveedor').select('tipo,monto')
      ])

      const nc = (ajustesProv || []).filter(a => a.tipo === 'NC').reduce((s, a) => s + parseFloat(a.monto || 0), 0)
      const nd = (ajustesProv || []).filter(a => a.tipo === 'ND').reduce((s, a) => s + parseFloat(a.monto || 0), 0)
      const totalRecep = (receps || []).reduce((s, r) => s + parseFloat(r.total || 0) - parseFloat(r.monto_pagado_prov || 0), 0)

      setRecepDeuda(receps || [])
      setTotalNC(nc)
      setTotalND(nd)
      setTotalRecepPend(totalRecep)
      setTotalPagar(totalRecep - nc + nd)

    } catch (e) { console.error(e); toast('Error cargando finanzas', 'error') } finally { setLoading(false) }
  }

  const ccBadge = cc => cc === 'CC1'
    ? <span style={{ fontSize: 11, background: '#DBEAFE', color: '#1D4ED8', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>CC1</span>
    : <span style={{ fontSize: 11, background: '#F3F4F6', color: '#374151', padding: '1px 7px', borderRadius: 10, fontWeight: 600 }}>CC2</span>

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Finanzas</h1>
        <div className="page-header-actions">
          <select value={filtroCC} onChange={e => setFiltroCC(e.target.value)} style={{ padding: '8px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 13 }}>
            <option value="">CC1 + CC2</option>
            <option value="CC1">Solo CC1 (blanco)</option>
            <option value="CC2">Solo CC2 (negro)</option>
          </select>
        </div>
      </div>

      {loading ? (
        <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
      ) : (
        <>
          {/* 1. POSICIÓN DEL PERÍODO */}
          <div className="card" style={{ marginBottom: 16, padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>
              Posición del período {filtroCC && ccBadge(filtroCC)}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
              {[
                { label: 'Cobrado hoy', valor: cobradoHoy.total, cc: !filtroCC ? { cc1: cobradoHoy.cc1, cc2: cobradoHoy.cc2 } : null, color: 'var(--success)' },
                { label: 'Cobrado este mes', valor: cobradoMes.total, cc: !filtroCC ? { cc1: cobradoMes.cc1, cc2: cobradoMes.cc2 } : null, color: 'var(--success)' },
                { label: 'Pagado a proveedor hoy', valor: pagadoProvHoy, color: 'var(--danger)' },
                { label: 'Pagado a proveedor este mes', valor: pagadoProvMes, color: 'var(--danger)' },
              ].map((item, i) => (
                <div key={i} style={{ background: 'var(--bg)', borderRadius: 8, padding: 14, textAlign: 'center' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em', color: 'var(--muted)', marginBottom: 6 }}>{item.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{fmt(item.valor)}</div>
                  {item.cc && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      CC1: {fmt(item.cc.cc1)} · CC2: {fmt(item.cc.cc2)}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 2. CUENTAS A COBRAR */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div className="card" style={{ padding: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>Cuentas a cobrar</div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#DC2626' }}>{fmt(totalCobrar)}</div>
              </div>
              <div style={{ fontWeight: 600, fontSize: 11, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Por vendedor</div>
              {cobroPorVendedor.length === 0
                ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin deudas pendientes</p>
                : cobroPorVendedor.map((v, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span>{v.nombre}</span><strong style={{ color: '#DC2626' }}>{fmt(v.saldo)}</strong>
                  </div>
                ))
              }
            </div>

            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Top clientes con deuda</div>
              {topClientes.length === 0
                ? <p style={{ color: 'var(--muted)', fontSize: 13 }}>Sin deudas pendientes</p>
                : topClientes.map((c, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                    <span>{c.nombre}</span><strong style={{ color: '#DC2626' }}>{fmt(c.saldo)}</strong>
                  </div>
                ))
              }
            </div>
          </div>

          {/* 3. CUENTAS A PAGAR */}
          <div className="card">
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: 13 }}>Cuentas a pagar al proveedor</div>
              <div>
                <div style={{ fontWeight: 700, fontSize: 18, color: '#DC2626', textAlign: 'right' }}>{fmt(totalPagar)}</div>
                {(totalNC > 0 || totalND > 0) && (
                  <div style={{ fontSize: 11, color: 'var(--muted)', textAlign: 'right' }}>
                    Recepciones: {fmt(totalRecepPend)} − NC: {fmt(totalNC)} + ND: {fmt(totalND)}
                  </div>
                )}
              </div>
            </div>
            <div className="table-wrap desktop-table">
              <table>
                <thead>
                  <tr><th>N°</th><th>Fecha</th><th>Remito</th><th style={{ textAlign: 'right' }}>Total</th><th style={{ textAlign: 'right' }}>Pagado</th><th style={{ textAlign: 'right' }}>Saldo</th><th>Estado</th></tr>
                </thead>
                <tbody>
                  {recepDeuda.length === 0
                    ? <tr><td colSpan={7} style={{ textAlign: 'center', padding: 16, color: 'var(--muted)' }}>Sin deudas con el proveedor</td></tr>
                    : recepDeuda.map(r => {
                      const saldo = parseFloat(r.total || 0) - parseFloat(r.monto_pagado_prov || 0)
                      return (
                        <tr key={r.id}>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>#{String(r.numero).padStart(4, '0')}</td>
                          <td style={{ fontSize: 12 }}>{r.fecha_recepcion_real ? new Date(r.fecha_recepcion_real + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</td>
                          <td style={{ fontSize: 12 }}>{r.remito_proveedor || '—'}</td>
                          <td style={{ textAlign: 'right' }}>${parseFloat(r.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)' }}>${parseFloat(r.monto_pagado_prov || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: '#DC2626' }}>${saldo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                          <td><span style={{ fontSize: 11, fontWeight: 600, color: r.estado_pago_prov === 'parcial' ? '#D97706' : '#DC2626' }}>{r.estado_pago_prov}</span></td>
                        </tr>
                      )
                    })
                  }
                </tbody>
              </table>
            </div>
            {/* Mobile */}
            <div className="mobile-cards" style={{ padding: 12 }}>
              {recepDeuda.length === 0
                ? <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 16 }}>Sin deudas con el proveedor</p>
                : recepDeuda.map(r => {
                  const saldo = parseFloat(r.total || 0) - parseFloat(r.monto_pagado_prov || 0)
                  return (
                    <div key={r.id} className="op-card" style={{ marginBottom: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>#{String(r.numero).padStart(4, '0')}</div>
                          {r.fecha_recepcion_real && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(r.fecha_recepcion_real + 'T00:00:00').toLocaleDateString('es-AR')}</div>}
                          {r.remito_proveedor && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{r.remito_proveedor}</div>}
                        </div>
                        <div style={{ textAlign: 'right' }}>
                          <div style={{ fontSize: 18, fontWeight: 700, color: '#DC2626' }}>{fmt(saldo)}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>de {fmt(r.total)}</div>
                          <span style={{ fontSize: 11, fontWeight: 600, color: r.estado_pago_prov === 'parcial' ? '#D97706' : '#DC2626' }}>{r.estado_pago_prov}</span>
                        </div>
                      </div>
                    </div>
                  )
                })
              }
            </div>
          </div>
        </>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
