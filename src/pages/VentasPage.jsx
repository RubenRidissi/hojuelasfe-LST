import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const EMPTY_FORM = {
  clienteId: '', fecha: new Date().toISOString().split('T')[0], notas: '', modalidad: 'sin_iva'
}

function badgePago(estado) {
  const map = { pendiente: 'badge-yellow', parcial: 'badge-blue', pagado: 'badge-green' }
  return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado}</span>
}

export default function VentasPage() {
  const { user, isAdmin } = useAuth()
  const { toasts, toast } = useToast()
  const navigate = useNavigate()

  const [ventas, setVentas] = useState([])
  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')

  // Remitos
  const [origenesConRemito, setOrigenesConRemito] = useState(new Set())

  // Modal venta
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  // Selector producto
  const [prodSel, setProdSel] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [precioEditable, setPrecioEditable] = useState('')

  // Modal fecha entrega
  const [modalFecha, setModalFecha] = useState(null)
  const [fechaInput, setFechaInput] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [{ data: v }, { data: c }, { data: p }] = await Promise.all([
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('clientes').select('id,nombre,nombre_fantasia,vendedor_id,descuento_pct,modalidad_factura,estado_cliente').order('nombre'),
        supabase.from('productos').select('id,codigo,nombre,precio,costo,promo,precio_editable,familia').order('codigo'),
      ])
      setVendedores(v || [])
      setClientes(c || [])
      setProductos(p || [])
    } catch (e) { console.error(e) }
    loadVentas()
  }

  async function loadVentas() {
    setLoading(true)
    try {
      let q = supabase.from('ventas')
        .select('id,numero,fecha,fecha_entrega_real,total,estado_pago,vendedor_id,cliente_id,notas,clientes(nombre,nombre_fantasia)')
        .order('created_at', { ascending: false })

      if (!isAdmin) q = q.eq('vendedor_id', user)
      if (isAdmin && filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      if (filtroCliente) q = q.eq('cliente_id', filtroCliente)

      const { data: vents } = await q

      // Buscar remitos — incluye pedidos relacionados
      const ventaIds = (vents || []).map(v => v.id)
      if (ventaIds.length) {
        const { data: pedRel } = await supabase.from('pedidos').select('id,convertido_venta_id').in('convertido_venta_id', ventaIds)
        const idsRelevantes = [...ventaIds, ...(pedRel || []).map(p => p.id)]
        const { data: remitos } = await supabase.from('remitos').select('origen_id').in('origen_id', idsRelevantes)
        const pedRelMap = {}
        ;(pedRel || []).forEach(p => { pedRelMap[p.convertido_venta_id] = p.id })
        const origenSet = new Set((remitos || []).map(r => r.origen_id))
        setOrigenesConRemito(origenSet)
        // guardar pedRelMap para uso en render
        setPedRelMap(pedRelMap)
      }

      setVentas(vents || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const [pedRelMap, setPedRelMap] = useState({})

  useEffect(() => { loadVentas() }, [filtroCliente, filtroVendedor])

  // ===== AGREGAR ITEM =====
  function addItem() {
    if (!prodSel) { toast('Elegí un producto', 'error'); return }
    const prod = productos.find(p => p.id === prodSel)
    if (!prod) return
    const cant = parseInt(cantidad) || 1
    const esEditable = prod.precio_editable
    const precio = esEditable ? (parseFloat(precioEditable) || 0) : (prod.precio || 0)

    let bonificado = 0
    if (prod.promo) {
      const [paga] = prod.promo.split('+').map(Number)
      bonificado = Math.floor(cant / paga)
    }

    setItems(prev => {
      const existing = prev.find(i => i.producto_id === prodSel)
      if (existing) {
        return prev.map(i => i.producto_id === prodSel
          ? { ...i, cantidad: i.cantidad + cant, bonificado: (i.bonificado || 0) + bonificado }
          : i)
      }
      return [...prev, { producto_id: prodSel, nombre: prod.nombre, costo: prod.costo || 0, cantidad: cant, bonificado, precio_unitario: precio, promo: prod.promo || '' }]
    })
    setCantidad(1)
    setProdSel('')
    setPrecioEditable('')
  }

  function removeItem(idx) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  // ===== CALCULOS =====
  function getDescPct(clienteId) {
    return parseFloat(clientes.find(c => c.id === clienteId)?.descuento_pct || 0)
  }

  function getIvaFactor(modalidad) {
    return modalidad === 'con_iva' ? 1.21 : 1
  }

  function calcTotal(itemsArr, clienteId, modalidad) {
    const descPct = getDescPct(clienteId)
    const ivaFactor = getIvaFactor(modalidad)
    return itemsArr.reduce((s, item) => s + item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor, 0)
  }

  function calcGanancia(itemsArr, clienteId, modalidad) {
    const descPct = getDescPct(clienteId)
    const ivaFactor = getIvaFactor(modalidad)
    const total = calcTotal(itemsArr, clienteId, modalidad)
    const costo = itemsArr.reduce((s, item) => s + parseFloat(item.costo || 0) * item.cantidad, 0)
    const ganancia = total - costo
    const margen = total > 0 ? (ganancia / total * 100) : 0
    return { ganancia, margen }
  }

  // ===== GUARDAR VENTA =====
  async function saveVenta() {
    if (!form.clienteId) { toast('Seleccioná un cliente', 'error'); return }
    if (!items.length) { toast('Agregá al menos un producto', 'error'); return }
    setSaving(true)
    try {
      const cliente = clientes.find(c => c.id === form.clienteId)
      const descPct = getDescPct(form.clienteId)
      const ivaFactor = getIvaFactor(form.modalidad)
      const total = calcTotal(items, form.clienteId, form.modalidad)

      const notas = [
        form.notas,
        descPct > 0 ? `Descuento aplicado: ${descPct}%` : '',
        form.modalidad === 'con_iva' ? 'Con IVA 21%' : '',
        items.some(i => i.bonificado > 0) ? 'Incluye unidades bonificadas por promo' : '',
        items.some(i => i.precio_unitario === 0) ? 'Incluye muestras sin cargo' : ''
      ].filter(Boolean).join(' | ')

      const vendedorId = cliente?.vendedor_id || user
      const fecha = form.fecha || new Date().toISOString().split('T')[0]

      const { data: [venta] } = await supabase.from('ventas').insert({
        cliente_id: form.clienteId, fecha, notas, total,
        vendedor_id: vendedorId, modalidad_factura: form.modalidad, estado_pago: 'pendiente'
      }).select()

      await Promise.all(items.map(item => {
        const precioConDesc = item.precio_unitario * (1 - descPct / 100) * ivaFactor
        const cantTotal = item.cantidad + (item.bonificado || 0)
        return Promise.all([
          supabase.from('venta_items').insert({ venta_id: venta.id, producto_id: item.producto_id, cantidad: item.cantidad, bonificado: item.bonificado || 0, precio_unitario: precioConDesc }),
          supabase.from('stock_movimientos').insert({ producto_id: item.producto_id, tipo: 'salida', origen: 'venta', cantidad: -cantTotal, referencia_id: venta.id, notas: `Venta #${venta.id.substring(0, 8)}${item.bonificado ? ` (incl. ${item.bonificado} bonif.)` : ''}`, fecha })
        ])
      }))

      // Activar cliente si estaba Pendiente/Inactivo
      if (cliente && cliente.estado_cliente !== 'Activo') {
        await supabase.from('clientes').update({ estado_cliente: 'Activo' }).eq('id', form.clienteId)
      }

      toast('Venta registrada')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      setItems([])
      loadVentas()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== ELIMINAR VENTA =====
  async function deleteVenta(v) {
    if (v.estado_pago === 'pagado') { toast('No se puede borrar una venta ya cobrada.', 'error'); return }
    if (!confirm(`¿Borrar venta de ${nombreCliente(v.clientes)}?`)) return
    try {
      await supabase.from('stock_movimientos').delete().eq('referencia_id', v.id).eq('origen', 'venta')
      await supabase.from('venta_items').delete().eq('venta_id', v.id)
      await supabase.from('ventas').delete().eq('id', v.id)
      toast('Venta eliminada y stock revertido')
      loadVentas()
    } catch (e) { toast('Error al eliminar', 'error') }
  }

  // ===== FECHA ENTREGA =====
  async function confirmarFecha(borrar = false) {
    if (!modalFecha) return
    const fecha = borrar ? null : fechaInput
    if (!borrar && !fecha) { toast('Elegí una fecha', 'error'); return }
    try {
      await supabase.from('ventas').update({ fecha_entrega_real: fecha }).eq('id', modalFecha.id)
      // Sincronizar con pedido origen si existe
      const { data: pedOrigen } = await supabase.from('pedidos').select('id').eq('convertido_venta_id', modalFecha.id)
      if (pedOrigen?.length) {
        const dataPedido = { fecha_entrega_real: fecha }
        if (fecha) dataPedido.estado = 'entregado'
        await supabase.from('pedidos').update(dataPedido).eq('id', pedOrigen[0].id)
      }
      toast(borrar ? 'Fecha borrada' : 'Fecha guardada')
      setModalFecha(null)
      loadVentas()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  // ===== RENDER HELPERS =====
  const misClientes = isAdmin ? clientes : clientes.filter(c => c.vendedor_id === user)
  const descPct = getDescPct(form.clienteId)
  const ivaFactor = getIvaFactor(form.modalidad)
  const total = calcTotal(items, form.clienteId, form.modalidad)
  const { ganancia, margen } = calcGanancia(items, form.clienteId, form.modalidad)
  const margenColor = margen >= 20 ? 'var(--success)' : margen >= 10 ? '#F59E0B' : 'var(--danger)'
  const prodSelObj = productos.find(p => p.id === prodSel)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Ventas</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary hide-on-mobile" onClick={() => toast('Excel — próximamente', 'info')}>📥 Excel</button>
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setItems([]); setModalOpen(true) }}>+ Nueva venta</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ flex: 2, minWidth: 150 }}>
          <option value="">Todos los clientes</option>
          {misClientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
        </select>
        {isAdmin && (
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
          </select>
        )}
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : ventas.length === 0 ? (
          <div className="empty"><div className="empty-icon">🧾</div><p>No hay ventas todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Facturación / Entrega</th>
                  <th>Total</th>
                  <th>Pago</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => {
                  const tieneRemito = origenesConRemito.has(v.id) || (pedRelMap[v.id] && origenesConRemito.has(pedRelMap[v.id]))
                  return (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>#{String(v.numero || 0).padStart(6, '0')}</td>
                      <td>{v.clientes ? nombreCliente(v.clientes) : '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        <div>🧾 {v.fecha}</div>
                        <div style={{ color: v.fecha_entrega_real ? 'var(--success)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {v.fecha_entrega_real ? `✓ Entregado: ${v.fecha_entrega_real}` : 'Sin entregar'}
                          {v.fecha_entrega_real && (
                            <span style={{ cursor: 'pointer' }}
                              onClick={() => { setModalFecha({ id: v.id, fechaActual: v.fecha_entrega_real }); setFechaInput(v.fecha_entrega_real) }}
                              title="Editar fecha">✏</span>
                          )}
                        </div>
                      </td>
                      <td>${parseFloat(v.total || 0).toLocaleString('es-AR')}</td>
                      <td>{badgePago(v.estado_pago)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'nowrap' }}>
                          {v.estado_pago === 'pagado'
                            ? <span className="badge badge-green">Pagado</span>
                            : v.estado_pago === 'parcial'
                              ? <span className="badge badge-yellow">Parcial</span>
                              : <button className="btn btn-sm btn-success" onClick={() => navigate('/pagos')}>💰 Cobrar</button>
                          }
                          {!v.fecha_entrega_real && (
                            <button className="btn btn-sm" style={{ background: '#DBEAFE', color: '#1D4ED8' }}
                              onClick={() => { setModalFecha({ id: v.id, fechaActual: '' }); setFechaInput(new Date().toISOString().split('T')[0]) }}
                              title="Marcar como entregado">📦 Entregar</button>
                          )}
                          <button className="btn btn-sm btn-secondary" onClick={() => toast('Comprobante — próximamente', 'info')}>🧾</button>
                          {tieneRemito
                            ? <button className="btn btn-sm" style={{ background: '#F3F4F6', color: '#374151' }} onClick={() => toast('Ver remito — próximamente', 'info')}>👁 Remito</button>
                            : <button className="btn btn-sm" style={{ background: '#FEF3C7', color: '#92400E' }} onClick={() => toast('Imprimir remito — próximamente', 'info')}>🚚</button>
                          }
                          {isAdmin && v.estado_pago !== 'pagado' && (
                            <button className="btn btn-sm btn-danger" onClick={() => deleteVenta(v)}>Borrar</button>
                          )}
                        </div>
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
        ) : ventas.length === 0 ? (
          <div className="empty"><div className="empty-icon">🧾</div><p>No hay ventas todavía</p></div>
        ) : ventas.map(v => {
          const tieneRemito = origenesConRemito.has(v.id)
          const fechaCorta = v.fecha ? new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'
          return (
            <div key={v.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-num">#{String(v.numero || 0).padStart(6, '0')} · {fechaCorta}</span>
                {badgePago(v.estado_pago)}
                {!v.fecha_entrega_real
                  ? <span style={{ fontSize: 11, color: '#D97706' }}>Sin entregar</span>
                  : <span style={{ fontSize: 11, color: 'var(--success)' }}>✓ Entregado</span>
                }
              </div>
              <div className="op-card-cliente">{v.clientes ? nombreCliente(v.clientes) : '—'}</div>
              <div className="op-card-total">${parseFloat(v.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
              <div className="op-card-actions">
                <button className="btn btn-secondary" onClick={() => toast('Comprobante — próximamente', 'info')}>🧾 Ver</button>
                {!v.fecha_entrega_real && (
                  <button className="btn btn-secondary"
                    onClick={() => { setModalFecha({ id: v.id, fechaActual: '' }); setFechaInput(new Date().toISOString().split('T')[0]) }}>
                    📦 Entregar
                  </button>
                )}
                {v.estado_pago !== 'pagado' && (
                  <button className="btn btn-success" onClick={() => navigate('/pagos')}>💰 Cobrar</button>
                )}
                {tieneRemito
                  ? <button className="btn btn-secondary" onClick={() => toast('Ver remito — próximamente', 'info')}>👁 Remito</button>
                  : <button className="btn btn-secondary" onClick={() => toast('Imprimir remito — próximamente', 'info')}>🚚 Remito</button>
                }
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== MODAL NUEVA VENTA ===== */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>Nueva venta</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente *</label>
                  <select value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}>
                    <option value="">— Elegí un cliente —</option>
                    {misClientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}{c.tipo ? ` — ${c.tipo}` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Modalidad de factura</label>
                  <select value={form.modalidad} onChange={e => setForm(f => ({ ...f, modalidad: e.target.value }))}>
                    <option value="sin_iva">Sin IVA</option>
                    <option value="con_iva">Con IVA 21%</option>
                  </select>
                </div>
                <div className="form-group">
                  <label>Notas</label>
                  <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
                </div>
              </div>

              {/* Agregar producto */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Agregar producto</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select value={prodSel} onChange={e => setProdSel(e.target.value)} style={{ flex: 3, minWidth: 180 }}>
                    <option value="">— Elegí un producto —</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre} — ${parseFloat(p.precio || 0).toLocaleString('es-AR')}{p.promo ? ` 🎁${p.promo}` : ''}</option>)}
                  </select>
                  <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ width: 70 }} placeholder="Cant." />
                  {prodSelObj?.precio_editable && (
                    <input type="number" value={precioEditable} onChange={e => setPrecioEditable(e.target.value)} style={{ width: 100 }} placeholder="Precio" />
                  )}
                  <button className="btn btn-primary" onClick={addItem}>+ Agregar</button>
                </div>
              </div>

              {/* Lista de items */}
              {items.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  {items.map((item, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ flex: 2 }}>{item.nombre}</span>
                      <span style={{ flex: 1, textAlign: 'center' }}>
                        {item.cantidad}
                        {item.bonificado > 0 && <span style={{ color: 'var(--success)', fontSize: 11 }}> +{item.bonificado} bon.</span>}
                        {item.precio_unitario === 0 && <span style={{ background: '#DCFCE7', color: '#15803D', fontSize: 10, padding: '1px 5px', borderRadius: 8, marginLeft: 4 }}>🎁 muestra</span>}
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' }}>
                        {descPct > 0 && <span style={{ textDecoration: 'line-through', color: 'var(--muted)', fontSize: 11 }}>${(item.cantidad * item.precio_unitario).toLocaleString('es-AR')}<br /></span>}
                        ${(item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </span>
                      <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    {descPct > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Descuento {descPct}%</div>}
                    {items.reduce((s, i) => s + (i.bonificado || 0), 0) > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--success)' }}>Unidades bonificadas: {items.reduce((s, i) => s + (i.bonificado || 0), 0)}</div>
                    )}
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Total: ${total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</div>
                    {isAdmin && items.length > 0 && (
                      <div style={{ fontSize: 12, marginTop: 4, color: margenColor }}>
                        Ganancia estimada: ${ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })} ({margen.toFixed(1)}% margen)
                        {margen < 10 && margen > 0 && <div style={{ color: 'var(--danger)', fontWeight: 500 }}>⚠ Margen bajo — revisá el descuento aplicado</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveVenta} disabled={saving}>{saving ? 'Guardando...' : 'Registrar venta'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL FECHA ENTREGA ===== */}
      {modalFecha && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2>{modalFecha.fechaActual ? 'Editar fecha de entrega' : 'Marcar como entregado'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalFecha(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{modalFecha.fechaActual ? 'Fecha real de entrega' : '¿Qué fecha se entregó?'}</label>
                <input type="date" value={fechaInput} onChange={e => setFechaInput(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              {modalFecha.fechaActual && (
                <button className="btn btn-danger" onClick={() => confirmarFecha(true)}>Borrar fecha</button>
              )}
              <button className="btn btn-secondary" onClick={() => setModalFecha(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => confirmarFecha(false)}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
