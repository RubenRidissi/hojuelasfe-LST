import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { useComprobante, ComprobanteModal } from '../hooks/useComprobante.jsx'
import { hoyAR, fechaISOBuenosAires, formatMoney } from '../utils/helpers'

const ESTADOS_BADGE = {
  borrador: 'badge-gray', pendiente: 'badge-yellow', confirmado: 'badge-green',
  enviado: 'badge-blue', recibido_incompleto: 'badge-yellow',
  recibido_completo: 'badge-green', cancelado: 'badge-red'
}
const ESTADO_LABEL = {
  recibido_completo: 'Recibido completo', recibido_incompleto: 'Recibido incompleto'
}
const getLabel = e => ESTADO_LABEL[e] || (e.charAt(0).toUpperCase() + e.slice(1))

const EMPTY_FORM = {
  id: '', proveedorId: '',
  fecha: hoyAR(), notas: ''
}

export default function ProveedorPage() {
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  const { toasts, toast } = useToast()
  const { comp, cerrarComp, imprimir, descargar, verComprobantePedidoProveedor } = useComprobante()

  const [pedidos, setPedidos] = useState([])
  const [productos, setProductos] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroEstado, setFiltroEstado] = useState('')

  // Modal pedido
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  // Selector producto
  const [prodSel, setProdSel] = useState('')
  const [cantidad, setCantidad] = useState('')

  // Modal borrador automático
  const [modalBorrador, setModalBorrador] = useState(false)
  const [diasBorrador, setDiasBorrador] = useState(7)
  const [generando, setGenerando] = useState(false)

  useEffect(() => {
    supabase.from('productos').select('id,codigo,nombre,costo').order('codigo')
      .then(({ data }) => setProductos(data || []))
    supabase.from('proveedores').select('id,nombre').order('nombre')
      .then(({ data }) => setProveedores(data || []))
    loadPedidos()
  }, [])

  useEffect(() => { loadPedidos() }, [filtroEstado])

  async function loadPedidos() {
    setLoading(true)
    try {
      let q = supabase.from('pedidos_proveedor').select('*,proveedores(id,nombre)').order('created_at', { ascending: false })
      if (filtroEstado) q = q.eq('estado', filtroEstado)
      const { data } = await q
      setPedidos(data || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  // ===== GUARDAR PEDIDO =====
  async function savePedido() {
    if (!form.proveedorId) { toast('Elegí el proveedor', 'error'); return }
    if (!items.length) { toast('Agregá al menos un producto', 'error'); return }
    const total = items.reduce((s, i) => s + i.cantidad * i.costo_unitario, 0)
    setSaving(true)
    try {
      let pedidoId = form.id
      if (form.id) {
        await supabase.from('pedidos_proveedor').update({ proveedor_id: form.proveedorId, fecha: form.fecha, notas: form.notas, total_estimado: total }).eq('id', form.id)
        await supabase.from('pedido_proveedor_items').delete().eq('pedido_proveedor_id', form.id)
      } else {
        const { data: [pedido] } = await supabase.from('pedidos_proveedor').insert({ proveedor_id: form.proveedorId, fecha: form.fecha, notas: form.notas, total_estimado: total, estado: 'pendiente' }).select()
        pedidoId = pedido.id
      }
      await supabase.from('pedido_proveedor_items').insert(items.map(item => ({
        pedido_proveedor_id: pedidoId, producto_id: item.producto_id, cantidad: item.cantidad, costo_unitario: item.costo_unitario
      })))
      toast(form.id ? 'Pedido actualizado' : 'Pedido creado')
      setModalOpen(false)
      setForm({ ...EMPTY_FORM, fecha: hoyAR() })
      setItems([])
      loadPedidos()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== EDITAR PEDIDO =====
  async function editarPedido(p) {
    if (p.estado !== 'borrador' && p.estado !== 'pendiente') {
      toast('Solo se pueden editar pedidos en Borrador o Pendiente', 'error'); return
    }
    try {
      const { data: its } = await supabase.from('pedido_proveedor_items')
        .select('producto_id,cantidad,costo_unitario,productos(nombre)')
        .eq('pedido_proveedor_id', p.id)
      setForm({ id: p.id, proveedorId: p.proveedor_id, fecha: p.fecha, notas: p.notas || '' })
      setItems((its || []).map(i => ({ producto_id: i.producto_id, nombre: i.productos?.nombre || '—', cantidad: i.cantidad, costo_unitario: parseFloat(i.costo_unitario || 0) })))
      setModalOpen(true)
    } catch (e) { toast('Error al cargar: ' + e.message, 'error') }
  }

  // ===== ACTUALIZAR ESTADO =====
  async function updateEstado(id, estado) {
    try {
      const data = { estado }
      if (estado === 'enviado') data.fecha_enviado = hoyAR()
      await supabase.from('pedidos_proveedor').update(data).eq('id', id)
      toast('Estado actualizado')
      loadPedidos()
    } catch (e) { toast('Error', 'error') }
  }

  // ===== ELIMINAR =====
  async function deletePedido(p) {
    const { data: recs } = await supabase.from('recepciones').select('id').eq('pedido_proveedor_id', p.id)
    if (recs?.length) { toast('Este pedido ya tiene mercadería recibida y no se puede borrar.', 'error'); return }
    if (!confirm('¿Borrar este pedido a proveedor? Esta acción no se puede deshacer.')) return
    try {
      await supabase.from('pedido_proveedor_items').delete().eq('pedido_proveedor_id', p.id)
      await supabase.from('pedidos_proveedor').delete().eq('id', p.id)
      toast('Pedido eliminado')
      loadPedidos()
    } catch (e) { toast('Error al eliminar: ' + e.message, 'error') }
  }

  // ===== AGREGAR ITEM =====
  function addItem() {
    if (!prodSel) { toast('Elegí un producto', 'error'); return }
    const cant = parseInt(cantidad)
    if (!cant || cant <= 0) { toast('Ingresá una cantidad válida', 'error'); return }
    const prod = productos.find(p => p.id === prodSel)
    if (!prod) return
    setItems(prev => {
      const existing = prev.find(i => i.producto_id === prodSel)
      if (existing) return prev.map(i => i.producto_id === prodSel ? { ...i, cantidad: i.cantidad + cant } : i)
      return [...prev, { producto_id: prodSel, nombre: prod.nombre, cantidad: cant, costo_unitario: prod.costo || 0 }]
    })
    setProdSel('')
    setCantidad('')
  }

  function removeItem(pid) { setItems(prev => prev.filter(i => i.producto_id !== pid)) }
  function updateCantItem(pid, val) { setItems(prev => prev.map(i => i.producto_id === pid ? { ...i, cantidad: parseInt(val) || 1 } : i)) }

  // ===== GENERAR BORRADOR AUTOMÁTICO =====
  async function generarBorrador() {
    const proveedorInterno = proveedores.find(p => p.nombre === 'Hojuelas Tucumán')
    if (!proveedorInterno) { toast('No existe el proveedor "Hojuelas Tucumán". Crealo en Proveedores primero.', 'error'); return }
    setGenerando(true)
    try {
      const hoy = new Date()
      const limite = new Date(hoy); limite.setDate(limite.getDate() + diasBorrador)
      const hoyStr = hoyAR()
      const limiteStr = fechaISOBuenosAires(limite)

      const { data: pedidosClientes } = await supabase.from('pedidos')
        .select('id')
        .in('estado', ['pendiente', 'confirmado'])
        .gte('fecha_entrega', hoyStr)
        .lte('fecha_entrega', limiteStr)

      if (!pedidosClientes?.length) { toast('No hay pedidos de clientes en ese rango de fechas', 'error'); setModalBorrador(false); return }

      const pedidoIds = pedidosClientes.map(p => p.id)
      const { data: itsClientes } = await supabase.from('pedido_items').select('producto_id,cantidad,bonificado').in('pedido_id', pedidoIds)

      const demanda = {}
      ;(itsClientes || []).forEach(item => {
        const total = item.cantidad + (item.bonificado || 0)
        demanda[item.producto_id] = (demanda[item.producto_id] || 0) + total
      })

      const { data: stockData } = await supabase.from('stock_actual').select('id,stock')
      const stockMap = {}
      ;(stockData || []).forEach(s => { stockMap[s.id] = parseFloat(s.stock || 0) })

      // Pedidos a Hojuelas ya en camino (todavía sin recibir nada) cuentan como stock cubierto,
      // para no volver a pedir lo mismo dos veces mientras el envío anterior no llegó.
      const { data: pedidosEnCamino } = await supabase.from('pedidos_proveedor')
        .select('id').in('estado', ['borrador', 'pendiente', 'confirmado', 'enviado'])
      const enCaminoMap = {}
      if (pedidosEnCamino?.length) {
        const { data: itsEnCamino } = await supabase.from('pedido_proveedor_items')
          .select('producto_id,cantidad').in('pedido_proveedor_id', pedidosEnCamino.map(p => p.id))
        ;(itsEnCamino || []).forEach(item => {
          enCaminoMap[item.producto_id] = (enCaminoMap[item.producto_id] || 0) + parseFloat(item.cantidad || 0)
        })
      }

      const { data: prods } = await supabase.from('productos').select('id,nombre,costo,stock_minimo')
      const itemsBorrador = []
      Object.entries(demanda).forEach(([productoId, dem]) => {
        const prod = prods?.find(p => p.id === productoId)
        if (!prod) return
        const stockHoy = stockMap[productoId] || 0
        const stockEnCamino = enCaminoMap[productoId] || 0
        const stockMin = prod.stock_minimo || 0
        const faltante = dem + stockMin - stockHoy - stockEnCamino
        if (faltante > 0) itemsBorrador.push({ producto_id: productoId, nombre: prod.nombre, cantidad: Math.ceil(faltante), costo_unitario: prod.costo || 0 })
      })

      if (!itemsBorrador.length) { toast('No hay faltantes — el stock actual cubre la demanda', 'error'); setModalBorrador(false); return }

      const total = itemsBorrador.reduce((s, i) => s + i.cantidad * i.costo_unitario, 0)
      const { data: [pedido] } = await supabase.from('pedidos_proveedor').insert({
        proveedor_id: proveedorInterno.id, estado: 'borrador', fecha: hoyStr,
        notas: `Generado automáticamente (demanda a ${diasBorrador} días)`, total_estimado: total
      }).select()

      await supabase.from('pedido_proveedor_items').insert(itemsBorrador.map(item => ({
        pedido_proveedor_id: pedido.id, producto_id: item.producto_id, cantidad: item.cantidad, costo_unitario: item.costo_unitario
      })))

      toast(`Borrador generado con ${itemsBorrador.length} producto(s) ✓`)
      setModalBorrador(false)
      loadPedidos()
      // Abrir el pedido para editar
      setForm({ id: pedido.id, proveedorId: proveedorInterno.id, fecha: hoyStr, notas: `Generado automáticamente (demanda a ${diasBorrador} días)` })
      setItems(itemsBorrador)
      setModalOpen(true)
    } catch (e) { toast('Error al generar borrador: ' + e.message, 'error') } finally { setGenerando(false) }
  }

  const totalItems = items.reduce((s, i) => s + i.cantidad * i.costo_unitario, 0)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pedidos Proveedor</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => setModalBorrador(true)}>🤖 Generar borrador</button>
          <button className="btn btn-primary" onClick={() => { setForm({ ...EMPTY_FORM, fecha: hoyAR() }); setItems([]); setModalOpen(true) }}>+ Nuevo pedido</button>
        </div>
      </div>

      {/* Filtro estado */}
      <div className="filter-bar">
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">Todos los estados</option>
          {['borrador','pendiente','confirmado','enviado','recibido_incompleto','recibido_completo','cancelado'].map(e => (
            <option key={e} value={e}>{getLabel(e)}</option>
          ))}
        </select>
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : pedidos.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏭</div><p>No hay pedidos a proveedor todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>N°</th><th>Proveedor</th><th>Fecha</th><th>Estado</th><th>Total est.</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {pedidos.map(p => (
                  <tr key={p.id}>
                    <td style={{ color: 'var(--muted)', fontSize: 12 }}>#{String(p.numero).padStart(4, '0')}</td>
                    <td>{p.proveedores?.nombre || '—'}</td>
                    <td style={{ fontSize: 12 }}>{new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                    <td><span className={`badge ${ESTADOS_BADGE[p.estado] || 'badge-gray'}`}>{getLabel(p.estado)}</span></td>
                    <td>{formatMoney(parseFloat(p.total_estimado || 0))}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        {(p.estado === 'borrador' || p.estado === 'pendiente') && <>
                          <button className="btn btn-sm btn-secondary" onClick={() => editarPedido(p)}>✏</button>
                          <button className="btn btn-sm btn-success" onClick={() => updateEstado(p.id, 'confirmado')}>✓ Confirmar</button>
                        </>}
                        {p.estado === 'confirmado' && (
                          <button className="btn btn-sm" style={{ background: '#DBEAFE', color: '#1D4ED8' }} onClick={() => updateEstado(p.id, 'enviado')}>📤 Enviar</button>
                        )}
                        {['confirmado','enviado','recibido_incompleto'].includes(p.estado) && (
                          <button className="btn btn-sm btn-success" onClick={() => navigate('/recepciones', { state: { pedidoProveedorId: p.id } })}>📥 Recibir</button>
                        )}
                        {['confirmado','enviado','recibido_completo','recibido_incompleto','cancelado'].includes(p.estado) && (
                          <button className="btn btn-sm btn-secondary" onClick={async () => { try { await verComprobantePedidoProveedor(p.id) } catch (e) { toast('Error: ' + e.message, 'error') } }}>👁 Ver</button>
                        )}
                        {!['cancelado','recibido_completo','recibido_incompleto'].includes(p.estado) && (
                          <button className="btn btn-sm btn-danger" onClick={() => deletePedido(p)}>Borrar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards mobile */}
      <div className="mobile-cards cards-grid">
        {loading ? (
          <div className="empty"><p>Cargando...</p></div>
        ) : pedidos.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏭</div><p>No hay pedidos a proveedor todavía</p></div>
        ) : pedidos.map(p => {
          const fecha = new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })
          return (
            <div key={p.id} className="op-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{p.proveedores?.nombre || '—'}</div>
                  <div style={{ fontSize: 12, color: 'var(--muted)' }}>#{String(p.numero).padStart(4, '0')} · {fecha}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{formatMoney(parseFloat(p.total_estimado || 0), { maximumFractionDigits: 0 })}</div>
                  <span className={`badge ${ESTADOS_BADGE[p.estado] || 'badge-gray'}`} style={{ marginTop: 4, display: 'inline-block' }}>{getLabel(p.estado)}</span>
                </div>
              </div>
              <div className="op-card-actions" style={{ marginTop: 10, flexWrap: 'wrap' }}>
                {(p.estado === 'borrador' || p.estado === 'pendiente') && <>
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => editarPedido(p)}>✏ Editar</button>
                  <button className="btn btn-success" style={{ flex: 1 }} onClick={() => updateEstado(p.id, 'confirmado')}>✓ Confirmar</button>
                </>}
                {p.estado === 'confirmado' && (
                  <button className="btn" style={{ flex: 1, background: '#DBEAFE', color: '#1D4ED8' }} onClick={() => updateEstado(p.id, 'enviado')}>📤 Enviar</button>
                )}
                {['confirmado','enviado','recibido_incompleto'].includes(p.estado) && (
                  <button className="btn btn-success" style={{ flex: 1 }} onClick={() => navigate('/recepciones', { state: { pedidoProveedorId: p.id } })}>📥 Recibir</button>
                )}
                {['confirmado','enviado','recibido_completo','recibido_incompleto','cancelado'].includes(p.estado) && (
                  <button className="btn btn-secondary" style={{ flex: 1 }} onClick={async () => { try { await verComprobantePedidoProveedor(p.id) } catch (e) { toast('Error: ' + e.message, 'error') } }}>👁 Ver</button>
                )}
                {!['cancelado','recibido_completo','recibido_incompleto'].includes(p.estado) && (
                  <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => deletePedido(p)}>✕</button>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== MODAL PEDIDO ===== */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>{form.id ? 'Editar pedido a proveedor' : 'Nuevo pedido a proveedor'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Proveedor *</label>
                  <select value={form.proveedorId} onChange={e => setForm(f => ({ ...f, proveedorId: e.target.value }))}>
                    <option value="">— Elegí un proveedor —</option>
                    {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Notas</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
              </div>

              {/* Agregar producto */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Agregar producto</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <select value={prodSel} onChange={e => setProdSel(e.target.value)} style={{ flex: 3 }}>
                    <option value="">Elegí un producto</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</option>)}
                  </select>
                  <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ width: 80 }} placeholder="Cant." />
                  <button className="btn btn-primary" onClick={addItem}>+ Agregar</button>
                </div>
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 12 }}>
                  <table>
                    <thead><tr><th>Producto</th><th style={{ textAlign: 'center' }}>Cant.</th><th style={{ textAlign: 'right' }}>Costo</th><th style={{ textAlign: 'right' }}>Subtotal</th><th></th></tr></thead>
                    <tbody>
                      {items.map(i => (
                        <tr key={i.producto_id}>
                          <td style={{ fontSize: 13 }}>{i.nombre}</td>
                          <td style={{ textAlign: 'center' }}>
                            <input type="number" value={i.cantidad} min="1"
                              style={{ width: 70, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6 }}
                              onChange={e => updateCantItem(i.producto_id, e.target.value)} />
                          </td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>{formatMoney(i.costo_unitario)}</td>
                          <td style={{ textAlign: 'right', fontSize: 13 }}>{formatMoney((i.cantidad * i.costo_unitario))}</td>
                          <td><button className="btn btn-sm btn-danger" onClick={() => removeItem(i.producto_id)}>✕</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ textAlign: 'right', padding: '8px 0', fontWeight: 600, fontSize: 15 }}>
                    Total estimado: {formatMoney(totalItems)}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePedido} disabled={saving}>{saving ? 'Guardando...' : 'Guardar pedido'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL BORRADOR AUTOMÁTICO ===== */}
      {modalBorrador && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalBorrador(false)}>
          <div className="modal" style={{ maxWidth: 400 }}>
            <div className="modal-header">
              <h2>Generar borrador automático</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalBorrador(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 16, color: 'var(--muted)', fontSize: 13 }}>
                Genera un borrador de pedido calculando la demanda de los pedidos de clientes con entrega en los próximos días, restando el stock actual.
              </p>
              <div className="form-group">
                <label>Días a proyectar</label>
                <input type="number" min="1" max="30" value={diasBorrador} onChange={e => setDiasBorrador(parseInt(e.target.value) || 7)} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalBorrador(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={generarBorrador} disabled={generando}>{generando ? 'Generando...' : '🤖 Generar'}</button>
            </div>
          </div>
        </div>
      )}

      <ComprobanteModal comp={comp} onClose={cerrarComp} onPrint={imprimir} onDownload={descargar} />
      <ToastContainer toasts={toasts} />
    </div>
  )
}
