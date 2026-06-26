import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useComprobante, ComprobanteModal } from '../hooks/useComprobante.jsx'
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
  const { comp, cerrarComp, imprimir, descargar, verComprobanteVenta, verRemito, imprimirRemito } = useComprobante()
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
  const [pedRelMap, setPedRelMap] = useState({})

  // Modal venta
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  // Selector producto
  const [prodSel, setProdSel] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [precioEditable, setPrecioEditable] = useState('')
  const [descuentoItem, setDescuentoItem] = useState('')
  const [promoInfo, setPromoInfo] = useState(null)
  const [aplicarPromo, setAplicarPromo] = useState(false)
  const [searchCliente, setSearchCliente] = useState('')
  const [modalPromoCombi, setModalPromoCombi] = useState(null)
  const [promoCombiElegido, setPromoCombiElegido] = useState(null)

  // Lista histórica / especial: por ahora queda como referencia avanzada.
  // La venta usa precio actual automático según tipo de cliente.
  const [usarListaHistorica, setUsarListaHistorica] = useState(false)
  const [versionId, setVersionId] = useState('')
  const [versiones, setVersiones] = useState([])

  // Modal fecha entrega
  const [modalFecha, setModalFecha] = useState(null)
  const [fechaInput, setFechaInput] = useState('')

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [{ data: v }, { data: c }, { data: p }] = await Promise.all([
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('clientes').select('id,nombre,nombre_fantasia,vendedor_id,descuento_pct,modalidad_factura,estado_cliente,tipo').order('nombre'),
        supabase.from('productos').select('id,codigo,nombre,costo,descuento_costo,markup_representante,markup_distribuidor,markup_mayorista,markup_supermercado,markup_almacen,precio_representante,precio_distribuidor,precio_mayorista,precio_supermercado,precio_almacen,promo,precio_editable,familia').order('codigo'),
      ])
      setVendedores(v || [])
      setClientes(c || [])
      setProductos(p || [])

      const { data: vers } = await supabase
        .from('listas_precios_repo')
        .select('id,nombre,created_at')
        .order('created_at', { ascending: false })

      setVersiones(vers || [])
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

  useEffect(() => { loadVentas() }, [filtroCliente, filtroVendedor])

  const PRECIO_POR_TIPO = {
    'Representante': 'precio_representante',
    'Distribuidor':  'precio_distribuidor',
    'Mayorista':     'precio_mayorista',
    'Supermercado':  'precio_supermercado',
    'Almacén':       'precio_almacen',
  }

  function getTipoClienteActual() {
    const cliente = clientes.find(c => c.id === form.clienteId)
    return cliente?.tipo || 'Distribuidor'
  }

  function cambiarVersion(nuevaVersionId) {
    setVersionId(nuevaVersionId)
    if (nuevaVersionId) {
      toast('Lista histórica seleccionada. En esta etapa las ventas siguen usando precios actuales.', 'info')
    }
  }

  function getPrecioVenta(productoId, clienteId) {
    const p = productos.find(x => x.id === productoId)
    if (!p) return 0
    const cliente = clientes.find(c => c.id === clienteId)
    const tipo = cliente?.tipo || 'Distribuidor'
    const col = PRECIO_POR_TIPO[tipo] || 'precio_distribuidor'
    return parseFloat(p[col] || 0)
  }

  function onProdSelChange(pid) {
    setProdSel(pid)
    setAplicarPromo(false)
    if (!pid) { setPromoInfo(null); return }
    const prod = productos.find(p => p.id === pid)
    if (prod?.promo) {
      const [paga, lleva] = prod.promo.split('+').map(Number)
      setPromoInfo({ texto: `Este producto tiene promo ${prod.promo}: comprando ${paga} llevás ${paga + lleva}.`, paga, lleva })
    } else { setPromoInfo(null) }
  }

  function verificarPromoCombi(itemsActuales) {
    const conPromo = itemsActuales.filter(i => i.promo && i.familia)
    if (conPromo.length < 2) return
    const familiaMap = {}
    conPromo.forEach(item => {
      if (!familiaMap[item.familia]) familiaMap[item.familia] = []
      familiaMap[item.familia].push(item)
    })
    Object.entries(familiaMap).forEach(([familia, grupo]) => {
      if (grupo.length < 2) return
      const promo = grupo[0].promo
      if (!promo) return
      const [paga] = promo.split('+').map(Number)
      const totalCant = grupo.reduce((s, i) => s + i.cantidad, 0)
      const totalBonif = grupo.reduce((s, i) => s + (i.bonificado || 0), 0)
      const bonifPosible = Math.floor(totalCant / paga) - totalBonif
      if (bonifPosible <= 0) return
      setModalPromoCombi({ familia, grupoItems: grupo, bonifPosible, promo })
      setPromoCombiElegido(grupo[0].producto_id)
    })
  }

  function aplicarPromoCombi() {
    if (!modalPromoCombi || !promoCombiElegido) return
    setItems(prev => prev.map(i => i.producto_id === promoCombiElegido
      ? { ...i, bonificado: (i.bonificado || 0) + modalPromoCombi.bonifPosible }
      : i))
    toast('✓ ' + modalPromoCombi.bonifPosible + ' unidad(es) bonificada(s) agregada(s)')
    setModalPromoCombi(null); setPromoCombiElegido(null)
  }

  // ===== AGREGAR ITEM =====
  function addItem() {
    if (!prodSel) { toast('Elegí un producto', 'error'); return }
    const prod = productos.find(p => p.id === prodSel)
    if (!prod) return
    const cant = parseInt(cantidad) || 1
    const esEditable = prod.precio_editable
    const precioBase = esEditable ? (parseFloat(precioEditable) || 0) : getPrecioVenta(prodSel, form.clienteId)
    const descItem = parseFloat(descuentoItem) || 0
    const precio = descItem > 0 ? precioBase * (1 - descItem / 100) : precioBase

    // Promo individual: solo si el vendedor tildó "Aplicar promo"
    let bonificado = 0
    if (prod.promo && aplicarPromo) {
      const [paga] = prod.promo.split('+').map(Number)
      bonificado = Math.floor(cant / paga)
    }

    const nuevosItems = (() => {
      const existing = items.find(i => i.producto_id === prodSel)
      if (existing) {
        return items.map(i => i.producto_id === prodSel
          ? { ...i, cantidad: i.cantidad + cant, bonificado: (i.bonificado || 0) + bonificado }
          : i)
      }
      return [...items, { producto_id: prodSel, nombre: prod.nombre, costo: prod.costo || 0, familia: prod.familia || '', cantidad: cant, bonificado, precio_unitario: precio, descuento_item: descItem, promo: prod.promo || '' }]
    })()

    setItems(nuevosItems)
    setCantidad(1)
    setProdSel('')
    setPrecioEditable('')
    setDescuentoItem('')
    setPromoInfo(null)
    setAplicarPromo(false)
    verificarPromoCombi(nuevosItems)
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

  // ===== ANULAR / ELIMINAR VENTA =====
  async function deleteVenta(v) {
    if (!isAdmin) {
      toast('Solo el administrador puede anular ventas.', 'error')
      return
    }

    const nombre = v.clientes ? nombreCliente(v.clientes) : 'este cliente'
    const ok = confirm(
      `¿Anular la venta #${String(v.numero || 0).padStart(6, '0')} de ${nombre}?\n\n` +
      'Esta acción eliminará los ítems de la venta, revertirá movimientos de stock asociados y, si proviene de un pedido, lo dejará nuevamente confirmado.'
    )
    if (!ok) return

    try {
      const { data: imputaciones, error: impReadError } = await supabase
        .from('pago_ventas')
        .select('pago_id, venta_id, monto_aplicado')
        .eq('venta_id', v.id)

      if (impReadError) throw impReadError

      if ((imputaciones || []).length > 0 || v.estado_pago === 'pagado' || v.estado_pago === 'parcial') {
        toast('No se puede anular esta venta porque tiene cobros asociados. Primero anulá el cobro.', 'error')
        return
      }

      const { data: remitosVenta, error: remReadError } = await supabase
        .from('remitos')
        .select('id,numero,origen_id')
        .eq('origen_id', v.id)

      if (remReadError) throw remReadError

      const { data: pedidosOrigen, error: pedReadError } = await supabase
        .from('pedidos')
        .select('id,numero')
        .eq('convertido_venta_id', v.id)

      if (pedReadError) throw pedReadError

      const pedidoOrigen = pedidosOrigen?.[0] || null

      let remitosPedido = []
      if (pedidoOrigen?.id) {
        const { data, error } = await supabase
          .from('remitos')
          .select('id,numero,origen_id')
          .eq('origen_id', pedidoOrigen.id)

        if (error) throw error
        remitosPedido = data || []
      }

      if ((remitosVenta || []).length > 0 || remitosPedido.length > 0) {
        toast('No se puede anular automáticamente: la venta/pedido tiene remito. Primero revisá o anulá el remito.', 'error')
        return
      }

      const { error: stockError } = await supabase
        .from('stock_movimientos')
        .delete()
        .eq('referencia_id', v.id)
        .eq('origen', 'venta')

      if (stockError) throw stockError

      const { error: itemsError } = await supabase
        .from('venta_items')
        .delete()
        .eq('venta_id', v.id)

      if (itemsError) throw itemsError

      if (pedidoOrigen?.id) {
        const { error: pedidoError } = await supabase
          .from('pedidos')
          .update({
            convertido_venta_id: null,
            estado: 'confirmado',
            fecha_entrega_real: null
          })
          .eq('id', pedidoOrigen.id)

        if (pedidoError) throw pedidoError
      }

      const { error: ventaError } = await supabase
        .from('ventas')
        .delete()
        .eq('id', v.id)

      if (ventaError) throw ventaError

      toast(pedidoOrigen
        ? 'Venta anulada. El pedido quedó nuevamente confirmado.'
        : 'Venta anulada y stock revertido.'
      )
      loadVentas()
    } catch (e) {
      toast('Error al anular venta: ' + e.message, 'error')
    }
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
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setItems([]); setSearchCliente(''); setPromoInfo(null); setAplicarPromo(false); setUsarListaHistorica(false); setVersionId(''); setModalOpen(true) }}>+ Nueva venta</button>
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
                          <button className="btn btn-sm btn-secondary" onClick={async () => { try { await verComprobanteVenta(v.id) } catch(e) { toast('Error', 'error') } }}>🧾</button>
                          {tieneRemito
                            ? <button className="btn btn-sm" style={{ background: '#F3F4F6', color: '#374151' }} onClick={async () => { try { await verRemito('venta', v.id) } catch(e) { toast('Error', 'error') } }}>👁 Remito</button>
                            : <button className="btn btn-sm" style={{ background: '#FEF3C7', color: '#92400E' }} onClick={async () => { try { await imprimirRemito('venta', v.id); loadVentas() } catch(e) { toast('Error', 'error') } }}>🚚</button>
                          }
                          {isAdmin && v.estado_pago !== 'pagado' && (
                            <button className="btn btn-sm btn-danger" onClick={() => deleteVenta(v)}>Anular</button>
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
                <button className="btn btn-secondary" onClick={async () => { try { await verComprobanteVenta(v.id) } catch(e) { toast('Error', 'error') } }}>🧾 Ver</button>
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
                  ? <button className="btn btn-secondary" onClick={async () => { try { await verRemito('venta', v.id) } catch(e) { toast('Error', 'error') } }}>👁 Remito</button>
                  : <button className="btn btn-secondary" onClick={async () => { try { await imprimirRemito('venta', v.id); loadVentas() } catch(e) { toast('Error', 'error') } }}>🚚 Remito</button>
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
                  <input type="text" placeholder="Buscar cliente..." value={searchCliente}
                    onChange={e => setSearchCliente(e.target.value)}
                    style={{ marginBottom: 4, borderRadius: 'var(--radius) var(--radius) 0 0', borderBottom: 'none' }} />
                  <select value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}
                    style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
                    <option value="">— Elegí un cliente —</option>
                    {misClientes
                      .filter(c => !searchCliente || nombreCliente(c).toLowerCase().includes(searchCliente.toLowerCase()))
                      .map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}{c.tipo ? ` — ${c.tipo}` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Lista de precios</label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                    <input
                      type="checkbox"
                      id="usar-lista-historica-venta"
                      checked={usarListaHistorica}
                      onChange={e => {
                        setUsarListaHistorica(e.target.checked)
                        if (!e.target.checked) setVersionId('')
                      }}
                    />
                    <label htmlFor="usar-lista-historica-venta" style={{ margin: 0, fontWeight: 500, cursor: 'pointer' }}>
                      Usar lista histórica / especial
                    </label>
                  </div>
                  {usarListaHistorica ? (
                    <select value={versionId} onChange={e => cambiarVersion(e.target.value)}>
                      <option value="">Precios actuales</option>
                      {versiones.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  ) : (
                    <input
                      readOnly
                      value={`Actual automática: ${getTipoClienteActual()}`}
                      style={{ background: 'var(--bg)', color: 'var(--muted)' }}
                    />
                  )}
                </div>
                <div className="form-group">
                  <label>Modalidad de factura</label>
                  <select value={form.modalidad} onChange={e => setForm(f => ({ ...f, modalidad: e.target.value }))}>
                    <option value="sin_iva">Sin IVA</option>
                    <option value="con_iva">Con IVA 21%</option>
                  </select>
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Notas</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
              </div>

              {/* Agregar producto */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Agregar producto</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select value={prodSel} onChange={e => onProdSelChange(e.target.value)} style={{ flex: 3, minWidth: 180 }}>
                    <option value="">— Elegí un producto —</option>
                    {productos.map(p => {
                        const cliente = clientes.find(c => c.id === form.clienteId)
                        const tipo = cliente?.tipo || 'Distribuidor'
                        const col = PRECIO_POR_TIPO[tipo] || 'precio_distribuidor'
                        const precio = parseFloat(p[col] || 0)
                        return (
                          <option key={p.id} value={p.id}>
                            {p.codigo ? `${p.codigo} — ` : ''}{p.nombre} — ${precio.toLocaleString('es-AR')}{p.promo ? ` 🎁${p.promo}` : ''}
                          </option>
                        )
                      })}
                  </select>
                  <input type="number" min="1" value={cantidad} onChange={e => setCantidad(e.target.value)} style={{ width: 70 }} placeholder="Cant." />
                  {prodSelObj?.precio_editable && (
                    <input type="number" value={precioEditable} onChange={e => setPrecioEditable(e.target.value)} style={{ width: 100 }} placeholder="Precio" />
                  )}
                  <input type="number" min="0" max="100" step="0.1" value={descuentoItem} onChange={e => setDescuentoItem(e.target.value)} style={{ width: 80 }} placeholder="Dcto %" title="Descuento % sobre precio de lista" />
                  <button className="btn btn-primary" onClick={addItem}>+ Agregar</button>
                </div>
                {promoInfo && (
                  <div style={{ marginTop: 8, padding: '8px 10px', background: '#FEF9C3', borderRadius: 8, fontSize: 12, color: '#92400E', display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span>{promoInfo.texto}</span>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      <input type="checkbox" checked={aplicarPromo} onChange={e => setAplicarPromo(e.target.checked)} />
                      Aplicar promo
                    </label>
                  </div>
                )}
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

      <ComprobanteModal comp={comp} onClose={cerrarComp} onPrint={imprimir} onDownload={descargar} />

      {modalPromoCombi && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>¡Promo combinada en familia "{modalPromoCombi.familia}"!</h2>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>
                Entre todos los productos de esta familia sumás la promo {modalPromoCombi.promo}.
                Podés agregar <strong>{modalPromoCombi.bonifPosible} unidad(es) bonificada(s)</strong>.
              </p>
              <p style={{ marginBottom: 12, fontWeight: 600, fontSize: 13 }}>¿A qué producto agregamos el bonificado?</p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {modalPromoCombi.grupoItems.map(item => (
                  <label key={item.producto_id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: promoCombiElegido === item.producto_id ? 'var(--primary-light)' : 'var(--bg)', borderRadius: 8, cursor: 'pointer', border: `1px solid ${promoCombiElegido === item.producto_id ? 'var(--primary)' : 'var(--border)'}` }}>
                    <input type="radio" name="promoCombiV" checked={promoCombiElegido === item.producto_id} onChange={() => setPromoCombiElegido(item.producto_id)} />
                    <span style={{ fontSize: 14 }}>{item.nombre} <span style={{ color: 'var(--muted)', fontSize: 12 }}>({item.cantidad} u. cargadas)</span></span>
                  </label>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setModalPromoCombi(null); setPromoCombiElegido(null) }}>No, gracias</button>
              <button className="btn btn-primary" onClick={aplicarPromoCombi}>✓ Agregar bonificado</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
