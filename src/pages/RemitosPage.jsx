import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useComprobante, ComprobanteModal } from '../hooks/useComprobante'
import { ToastContainer } from '../components/Toast'

export default function RemitosPage() {
  const { user, isAdmin } = useAuth()
  const { toasts, toast } = useToast()
  const { comp, cerrarComp, imprimir, descargar, verRemito } = useComprobante()

  const [remitos, setRemitos] = useState([])
  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroOrigen, setFiltroOrigen] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [{ data: v }, { data: c }] = await Promise.all([
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('clientes').select('id,nombre,nombre_fantasia').order('nombre'),
      ])
      setVendedores(v || [])
      setClientes(c || [])
    } catch (e) { console.error(e) }
    loadRemitos()
  }

  async function loadRemitos() {
    setLoading(true)
    try {
      let q = supabase.from('remitos').select('*').order('numero', { ascending: false })
      if (!isAdmin) q = q.eq('vendedor_id', user)
      if (isAdmin && filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      if (filtroOrigen) q = q.eq('origen_tipo', filtroOrigen)

      const { data } = await q
      setRemitos(data || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { loadRemitos() }, [filtroOrigen, filtroVendedor])

  async function handleVerRemito(r) {
    try {
      await verRemito(r.origen_tipo, r.origen_id)
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Remitos</h1>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
          <option value="">Todos los orígenes</option>
          <option value="pedido">📋 Pedidos</option>
          <option value="venta">🧾 Ventas</option>
        </select>
        {isAdmin && (
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ flex: 1, minWidth: 140 }}>
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
          </select>
        )}
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : remitos.length === 0 ? (
          <div className="empty"><div className="empty-icon">🚚</div><p>No hay remitos generados todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Origen</th>
                  <th>Generado</th>
                  <th>Entregado</th>
                  <th>Total</th>
                  {isAdmin && <th>Vendedor</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {remitos.map(r => {
                  const cliente = clientes.find(c => c.id === r.cliente_id)
                  const vendedorNombre = vendedores.find(v => v.user_id === r.vendedor_id)?.nombre || '—'
                  const origenBadge = r.origen_tipo === 'pedido'
                    ? <span className="badge badge-yellow">📋 Pedido</span>
                    : <span className="badge badge-green">🧾 Venta</span>
                  return (
                    <tr key={r.id}>
                      <td style={{ fontWeight: 600 }}>#{String(r.numero).padStart(6, '0')}</td>
                      <td>{cliente ? nombreCliente(cliente) : '—'}</td>
                      <td>{origenBadge}</td>
                      <td style={{ fontSize: 12 }}>{r.fecha_generado ? new Date(r.fecha_generado + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</td>
                      <td style={{ fontSize: 12, color: r.fecha_entrega_real ? 'var(--success)' : 'var(--muted)' }}>
                        {r.fecha_entrega_real ? `✓ ${new Date(r.fecha_entrega_real + 'T00:00:00').toLocaleDateString('es-AR')}` : 'Sin entregar'}
                      </td>
                      <td>${parseFloat(r.total || 0).toLocaleString('es-AR')}</td>
                      {isAdmin && <td style={{ fontSize: 12, color: 'var(--muted)' }}>{vendedorNombre}</td>}
                      <td>
                        <button className="btn btn-sm btn-secondary" onClick={() => handleVerRemito(r)}>👁 Ver</button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards mobile */}
      <div className="mobile-cards cards-grid">
        {loading ? (
          <div className="empty"><p>Cargando...</p></div>
        ) : remitos.length === 0 ? (
          <div className="empty"><div className="empty-icon">🚚</div><p>No hay remitos todavía</p></div>
        ) : remitos.map(r => {
          const cliente = clientes.find(c => c.id === r.cliente_id)
          const fechaGen = r.fecha_generado ? new Date(r.fecha_generado + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'
          const entregado = !!r.fecha_entrega_real
          return (
            <div key={r.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-num">#{String(r.numero).padStart(6, '0')} · {fechaGen}</span>
                {r.origen_tipo === 'pedido'
                  ? <span className="badge badge-yellow">📋 Pedido</span>
                  : <span className="badge badge-green">🧾 Venta</span>
                }
                <span style={{ fontSize: 11, color: entregado ? 'var(--success)' : '#D97706' }}>
                  {entregado ? '✓ Entregado' : 'Sin entregar'}
                </span>
              </div>
              <div className="op-card-cliente">{cliente ? nombreCliente(cliente) : '—'}</div>
              <div className="op-card-total">${parseFloat(r.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
              <div className="op-card-actions">
                <button className="btn btn-secondary" onClick={() => handleVerRemito(r)}>👁 Ver remito</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal comprobante */}
      <ComprobanteModal
        comp={comp}
        onClose={cerrarComp}
        onPrint={imprimir}
        onDownload={descargar}
      />

      <ToastContainer toasts={toasts} />
    </div>
  )
}
