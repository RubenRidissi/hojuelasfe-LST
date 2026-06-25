import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useComprobante, ComprobanteModal } from '../hooks/useComprobante.jsx'
import { ToastContainer } from '../components/Toast'

const ESTADOS = ['pendiente', 'confirmado', 'entregado', 'cancelado']

const EMPTY_FORM = {
  id: '', clienteId: '', fechaEntrega: '', notas: '', modalidad: 'sin_iva'
}

export default function PedidosPage() {
  const { user, isAdmin } = useAuth()
  const { toasts, toast } = useToast()
  const { comp, cerrarComp, imprimir, descargar, verComprobantePedido, verRemito, imprimirRemito } = useComprobante()

  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')

  // Modal pedido
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  // Selector de producto
  const [prodSel, setProdSel] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [versionId, setVersionId] = useState('')
  const [precioEditable, setPrecioEditable] = useState('')
  const [descuentoItem, setDescuentoItem] = useState('')
  const [promoInfo, setPromoInfo] = useState(null) // { texto, paga, lleva } del producto seleccionado
  const [aplicarPromo, setAplicarPromo] = useState(false)
  const [versiones, setVersiones] = useState([])
  const [versionItems, setVersionItems] = useState({}) // cache de items por version_id
  const [searchCliente, setSearchCliente] = useState('')
  const [modalPromoCombi, setModalPromoCombi] = useState(null) // { familia, grupoItems, bonifPosible }
  const [promoCombiElegido, setPromoCombiElegido] = useState(null)

  // Modal fecha entrega
  const [modalFecha, setModalFecha] = useState(null) // { id, modo, tabla, fechaActual }
  const [fechaInput, setFechaInput] = useState('')

  // Modal convertir
  const [modalConvertir, setModalConvertir] = useState(null) // pedido
  const [yaEntregado, setYaEntregado] = useState(false)
  const [fechaConvertir, setFechaConvertir] = useState('')
  const [convirtiendo, setConvirtiendo] = useState(false)

  // Cache remitos
  const [origenesConRemito, setOrigenesConRemito] = useState(new Set())

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    try {
      const [{ data: v }, { data: c }, { data: p }] = await Promise.all([
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('clientes').select('id,nombre,nombre_fantasia,vendedor_id,descuento_pct,modalidad_factura,estado_cliente').order('nombre'),
        supabase.from('productos').select('id,codigo,nombre,costo,descuento_costo,markup_representante,markup_distribuidor,markup_mayorista,markup_supermercado,markup_almacen,precio_representante,precio_distribuidor,precio_mayorista,precio_supermercado,precio_almacen,promo,precio_editable,familia').order('codigo'),
      ])
      setVendedores(v || [])
      setClientes(c || [])
      setProductos(p || [])
    // Cargar versiones de precios
    const { data: vers } = await supabase.from('listas_precios_repo').select('id,nombre,created_at').order('created_at', { ascending: false })
    setVersiones(vers || [])
    } catch (e) { console.error(e) }
    loadPedidos()
  }

  async function loadPedidos() {
    setLoading(true)
    try {
      let q = supabase.from('pedidos')
        .select('id,numero,fecha,fecha_entrega,fecha_entrega_real,estado,total,vendedor_id,convertido_venta_id,cliente_id,notas,clientes(nombre,nombre_fantasia)')
        .order('created_at', { ascending: false })

      if (filtroEstado) q = q.eq('estado', filtroEstado)
      if (filtroCliente) q = q.eq('cliente_id', filtroCliente)
      if (isAdmin && filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      if (!isAdmin) q = q.eq('vendedor_id', user)

      const { data: peds } = await q

      const ids = (peds || []).map(p => p.id)
      const ventaIds = (peds || []).filter(p => p.convertido_venta_id).map(p => p.convertido_venta_id)
      const todosIds = [...ids, ...ventaIds]
      if (todosIds.length) {
        const { data: remitos } = await supabase.from('remitos').select('origen_id').in('origen_id', todosIds)
        setOrigenesConRemito(new Set((remitos || []).map(r => r.origen_id)))
      }

      setPedidos(peds || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { loadPedidos() }, [filtroEstado, filtroCliente, filtroVendedor])

  // ===== PRECIO DE PRODUCTO por tipo de cliente =====
  const PRECIO_POR_TIPO = {
    'Representante': 'precio_representante',
    'Distribuidor':  'precio_distribuidor',
    'Mayorista':     'precio_mayorista',
    'Supermercado':  'precio_supermercado',
    'Almacén':       'precio_almacen',
  }

  function getPrecio(productoId) {
    const p = productos.find(x => x.id === productoId)
    if (!p) return 0
    const cliente = clientes.find(c => c.id === form.clienteId)
    const tipoCliente = cliente?.tipo || 'Distribuidor'
    const colPrecio = PRECIO_POR_TIPO[tipoCliente] || 'precio_distribuidor'
    return parseFloat(p[colPrecio] || 0)
  }

  function getPrecioLabel(productoId) {
    const p = productos.find(x => x.id === productoId)
    if (!p) return ''
    const cliente = clientes.find(c => c.id === form.clienteId)
    const tipoCliente = cliente?.tipo || 'Distribuidor'
    const colPrecio = PRECIO_POR_TIPO[tipoCliente] || 'precio_distribuidor'
    return parseFloat(p[colPrecio] || 0)
  }

  // Al seleccionar producto, mostrar info de promo
  function onProdSelChange(pid) {
    setProdSel(pid)
    setAplicarPromo(false)
    if (!pid) { setPromoInfo(null); return }
    const prod = productos.find(p => p.id === pid)
    if (prod?.promo) {
      const [paga, lleva] = prod.promo.split('+').map(Number)
      setPromoInfo({ texto: 'Este producto tiene promo ' + prod.promo + ': comprando ' + paga + ' llevás ' + (paga + lleva) + '.', paga, lleva })
    } else {
      setPromoInfo(null)
    }
  }

  // ===== ITEMS =====
  function addItem() {
    if (!prodSel) { toast('Elegí un producto', 'error'); return }
    const prod = productos.find(p => p.id === prodSel)
    if (!prod) return
    const cant = parseInt(cantidad) || 1
    const esEditable = prod.precio_editable
    const precioBase = esEditable ? (parseFloat(precioEditable) || 0) : getPrecio(prodSel)
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
      return [...items, { producto_id: prodSel, nombre: prod.nombre, familia: prod.familia || '', cantidad: cant, bonificado, precio_unitario: precio, descuento_item: descItem, promo: prod.promo || '' }]
    })()

    setItems(nuevosItems)
    setCantidad(1)
    setProdSel('')
    setPrecioEditable('')
    setDescuentoItem('')
    setPromoInfo(null)
    setAplicarPromo(false)

    // Verificar promo combinada por familia
    verificarPromoCombi(nuevosItems)
  }

  function verificarPromoCombi(itemsActuales) {
    const conPromo = itemsActuales.filter(i => i.promo && i.familia)
    if (conPromo.length < 2) return

    // Agrupar por familia
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
      : i
    ))
    toast('✓ ' + modalPromoCombi.bonifPosible + ' unidad(es) bonificada(s) agregada(s)')
    setModalPromoCombi(null)
    setPromoCombiElegido(null)
  }

  function removeItem(idx) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  function calcTotal(itemsArr, clienteId) {
    const cliente = clientes.find(c => c.id === clienteId)
    const descPct = parseFloat(cliente?.descuento_pct || 0)
    const modalidad = form.modalidad || cliente?.modalidad_factura || 'sin_iva'
    const ivaFactor = modalidad === 'con_iva' ? 1.21 : 1
    return itemsArr.reduce((s, item) => s + item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor, 0)
  }

  // ===== GUARDAR PEDIDO =====
  async function savePedido() {
    if (!form.clienteId) { toast('Seleccioná un cliente', 'error'); return }
    if (!items.length) { toast('Agregá al menos un producto', 'error'); return }
    setSaving(true)
    try {
      const cliente = clientes.find(c => c.id === form.clienteId)
      const descPct = parseFloat(cliente?.descuento_pct || 0)
      const modalidad = form.modalidad || cliente?.modalidad_factura || 'sin_iva'
      const ivaFactor = modalidad === 'con_iva' ? 1.21 : 1
      const total = calcTotal(items, form.clienteId)

      const notas = [form.notas, descPct > 0 ? `Descuento aplicado: ${descPct}%` : '', modalidad === 'con_iva' ? 'Con IVA 21%' : '', items.some(i => i.bonificado > 0) ? 'Incluye unidades bonificadas por promo' : ''].filter(Boolean).join(' | ')

      let pedidoId = form.id
      if (form.id) {
        await supabase.from('pedidos').update({ cliente_id: form.clienteId, fecha_entrega: form.fechaEntrega || null, notas, total, modalidad_factura: modalidad }).eq('id', form.id)
        await supabase.from('pedido_items').delete().eq('pedido_id', form.id)
      } else {
        const vendedorId = cliente?.vendedor_id || user
        const { data: [pedido] } = await supabase.from('pedidos').insert({ cliente_id: form.clienteId, fecha_entrega: form.fechaEntrega || null, notas, total, vendedor_id: vendedorId, modalidad_factura: modalidad }).select()
        pedidoId = pedido.id
      }

      await Promise.all(items.map(item => {
        const precioConDesc = item.precio_unitario * (1 - descPct / 100) * ivaFactor
        return supabase.from('pedido_items').insert({ pedido_id: pedidoId, producto_id: item.producto_id, cantidad: item.cantidad, bonificado: item.bonificado || 0, precio_unitario: precioConDesc })
      }))

      // Si cliente sin asignar → asignar al vendedor que crea el pedido
      if (cliente && !cliente.vendedor_id && !isAdmin) {
        await supabase.from('clientes').update({ vendedor_id: user, estado_cliente: 'Activo' }).eq('id', form.clienteId)
        toast('✓ Cliente asignado a tu cartera y activado')
      } else if (cliente && cliente.estado_cliente !== 'Activo') {
        // Activar cliente si estaba Pendiente/Inactivo
        await supabase.from('clientes').update({ estado_cliente: 'Activo' }).eq('id', form.clienteId)
      }

      toast(form.id ? 'Pedido actualizado' : 'Pedido creado')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      setItems([])
      loadPedidos()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== EDITAR PEDIDO =====
  async function editPedido(p) {
    if (p.estado !== 'pendiente') { toast('Solo se pueden editar pedidos en estado Pendiente', 'error'); return }
    try {
      const { data: its } = await supabase.from('pedido_items').select('producto_id,cantidad,bonificado,precio_unitario,productos(nombre,promo)').eq('pedido_id', p.id)
      setForm({ id: p.id, clienteId: p.cliente_id, fechaEntrega: p.fecha_entrega || '', notas: (p.notas || '').split('|').map(s => s.trim()).filter(s => s && !s.includes('Descuento') && !s.includes('bonificadas')).join(' | '), modalidad: 'sin_iva' })
      setItems((its || []).map(i => ({ producto_id: i.producto_id, nombre: i.productos?.nombre || '—', cantidad: i.cantidad, bonificado: i.bonificado || 0, precio_unitario: parseFloat(i.precio_unitario), promo: i.productos?.promo || '' })))
      setModalOpen(true)
    } catch (e) { toast('Error al cargar pedido', 'error') }
  }

  // ===== ELIMINAR PEDIDO =====
  async function deletePedido(p) {
    if (p.convertido_venta_id) { toast('Este pedido ya fue facturado. Anulá la venta desde Ventas.', 'error'); return }
    if (!confirm(`¿Borrar pedido de ${nombreCliente(p.clientes)}?`)) return
    try {
      await supabase.from('pedido_items').delete().eq('pedido_id', p.id)
      await supabase.from('pedidos').delete().eq('id', p.id)
      toast('Pedido eliminado')
      loadPedidos()
    } catch (e) { toast('Error al eliminar', 'error') }
  }

  // ===== ESTADO =====
  async function updateEstado(id, estado) {
    if (estado === 'entregado') {
      const p = pedidos.find(x => x.id === id)
      setModalFecha({ id, modo: 'estado', tabla: 'pedidos', fechaActual: p?.fecha_entrega_real || '' })
      setFechaInput(p?.fecha_entrega_real || new Date().toISOString().split('T')[0])
      return
    }
    try {
      await supabase.from('pedidos').update({ estado }).eq('id', id)
      toast('Estado actualizado')
      loadPedidos()
    } catch (e) { toast('Error', 'error') }
  }

  // ===== FECHA ENTREGA =====
  async function confirmarFecha(borrar = false) {
    if (!modalFecha) return
    const { id, modo, tabla } = modalFecha
    const fecha = borrar ? null : fechaInput
    if (!borrar && !fecha) { toast('Elegí una fecha', 'error'); return }
    try {
      const data = { fecha_entrega_real: fecha }
      if (modo === 'estado' && tabla === 'pedidos') data.estado = 'entregado'
      await supabase.from(tabla).update(data).eq('id', id)

      // Sincronizar pedido <-> venta
      if (tabla === 'pedidos') {
        const pedido = pedidos.find(p => p.id === id)
        if (pedido?.convertido_venta_id) {
          await supabase.from('ventas').update({ fecha_entrega_real: fecha }).eq('id', pedido.convertido_venta_id)
        }
      }

      toast(borrar ? 'Fecha borrada' : 'Fecha guardada')
      setModalFecha(null)
      loadPedidos()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  // ===== CONVERTIR A VENTA =====
  function abrirConvertir(p) {
    setModalConvertir(p)
    setYaEntregado(!!p.fecha_entrega_real)
    setFechaConvertir(p.fecha_entrega_real || new Date().toISOString().split('T')[0])
  }

  async function confirmarConvertir() {
    if (!modalConvertir) return
    const p = modalConvertir
    const fechaEntregaReal = yaEntregado ? fechaConvertir : null
    if (yaEntregado && !fechaConvertir) { toast('Elegí la fecha de entrega', 'error'); return }
    setConvirtiendo(true)
    try {
      const { data: its } = await supabase.from('pedido_items').select('producto_id,cantidad,bonificado,precio_unitario').eq('pedido_id', p.id)
      if (!its?.length) { toast('El pedido no tiene productos', 'error'); return }

      const hoy = new Date().toISOString().split('T')[0]
      const dataVenta = { cliente_id: p.cliente_id, fecha: hoy, notas: (p.notas || '') + ' | Generada desde pedido', total: p.total, vendedor_id: p.vendedor_id, estado_pago: 'pendiente' }
      if (fechaEntregaReal) dataVenta.fecha_entrega_real = fechaEntregaReal

      const { data: [venta] } = await supabase.from('ventas').insert(dataVenta).select()

      await Promise.all(its.map(item => {
        const cantTotal = item.cantidad + (item.bonificado || 0)
        return Promise.all([
          supabase.from('venta_items').insert({ venta_id: venta.id, producto_id: item.producto_id, cantidad: item.cantidad, bonificado: item.bonificado || 0, precio_unitario: item.precio_unitario }),
          supabase.from('stock_movimientos').insert({ producto_id: item.producto_id, tipo: 'salida', origen: 'venta', cantidad: -cantTotal, referencia_id: venta.id, notas: `Venta desde pedido`, fecha: hoy })
        ])
      }))

      const patchPedido = { convertido_venta_id: venta.id }
      if (fechaEntregaReal) { patchPedido.estado = 'entregado'; patchPedido.fecha_entrega_real = fechaEntregaReal }
      await supabase.from('pedidos').update(patchPedido).eq('id', p.id)

      toast('Pedido convertido en venta ✓')
      setModalConvertir(null)
      loadPedidos()
    } catch (e) { toast('Error al convertir: ' + e.message, 'error') } finally { setConvirtiendo(false) }
  }

  // ===== COMPROBANTE / REMITO =====
  async function verComprobante(pedidoId) {
    try { await verComprobantePedido(pedidoId) } catch(e) { toast('Error: ' + e.message, 'error') }
  }
  async function handleVerRemito(pedidoId) {
    try { await verRemito('pedido', pedidoId) } catch(e) { toast('Error: ' + e.message, 'error') }
  }
  async function handleImprimirRemito(pedidoId) {
    try { await imprimirRemito('pedido', pedidoId); loadPedidos() } catch(e) { toast('Error: ' + e.message, 'error') }
  }

  // ===== RENDER =====
  const misClientes = isAdmin ? clientes : clientes.filter(c =>
    (c.vendedor_id === user && c.estado_cliente === 'Activo') || // sus clientes activos
    (!c.vendedor_id) // sin asignar (cualquier estado)
  )

  const clienteDelForm = clientes.find(c => c.id === form.clienteId)
  const descPct = parseFloat(clienteDelForm?.descuento_pct || 0)
  const ivaFactor = (form.modalidad || clienteDelForm?.modalidad_factura || 'sin_iva') === 'con_iva' ? 1.21 : 1
  const total = items.reduce((s, item) => s + item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor, 0)

  const prodSelObj = productos.find(p => p.id === prodSel)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pedidos</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary hide-on-mobile" onClick={() => toast('Excel — próximamente', 'info')}>📥 Excel</button>
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setItems([]); setSearchCliente(''); setVersionId(''); setPromoInfo(null); setAplicarPromo(false); setModalOpen(true) }}>+ Nuevo pedido</button>
        </div>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ flex: 2, minWidth: 150 }}>
          <option value="">Todos los clientes</option>
          {misClientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
        </select>
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ flex: 1, minWidth: 130 }}>
          <option value="">Todos los estados</option>
          {ESTADOS.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
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
        ) : pedidos.length === 0 ? (
          <div className="empty"><div className="empty-icon">📋</div><p>No hay pedidos todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>N°</th>
                  <th>Cliente</th>
                  <th>Entrega</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pedidos.map(p => {
                  const yaConvertido = !!p.convertido_venta_id
                  const puedeConvertir = !yaConvertido && (p.estado === 'confirmado' || p.estado === 'entregado')
                  const puedeRemitir = p.estado === 'confirmado' || p.estado === 'entregado'
                  const tieneRemito = origenesConRemito.has(p.id) || (yaConvertido && origenesConRemito.has(p.convertido_venta_id))
                  return (
                    <tr key={p.id}>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>#{String(p.numero || 0).padStart(6, '0')}</td>
                      <td>{p.clientes ? nombreCliente(p.clientes) : '—'}</td>
                      <td style={{ fontSize: 12 }}>
                        <div>📅 {p.fecha_entrega || 'Sin programar'}</div>
                        <div style={{ color: p.fecha_entrega_real ? 'var(--success)' : 'var(--muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
                          {p.fecha_entrega_real ? `✓ Entregado: ${p.fecha_entrega_real}` : 'Sin entregar'}
                          <span style={{ cursor: 'pointer' }} onClick={() => { setModalFecha({ id: p.id, modo: 'editar', tabla: 'pedidos', fechaActual: p.fecha_entrega_real || '' }); setFechaInput(p.fecha_entrega_real || new Date().toISOString().split('T')[0]) }} title="Editar fecha">✏</span>
                        </div>
                      </td>
                      <td>
                        <span className={`badge ${{ pendiente: 'badge-yellow', confirmado: 'badge-blue', entregado: 'badge-green', cancelado: 'badge-red' }[p.estado] || 'badge-gray'}`}>
                          {p.estado}
                        </span>
                      </td>
                      <td>${parseFloat(p.total || 0).toLocaleString('es-AR')}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                          {yaConvertido
                            ? <span className="badge badge-green">✓ Facturado</span>
                            : p.estado === 'entregado'
                              ? <span className={`badge ${{ pendiente: 'badge-yellow', confirmado: 'badge-blue', entregado: 'badge-green', cancelado: 'badge-red' }[p.estado]}`}>{p.estado}</span>
                              : <select style={{ fontSize: 11, padding: '3px 4px', border: '1px solid var(--border)', borderRadius: 6, maxWidth: 108 }}
                                value={p.estado} onChange={e => updateEstado(p.id, e.target.value)}>
                                {ESTADOS.filter(e => {
                                    if (p.estado === 'pendiente') return e !== 'entregado' // pendiente → NO entregado directo
                                    if (p.estado === 'confirmado') return e === 'confirmado' || e === 'entregado' || e === 'cancelado' // confirmado → NO volver a pendiente
                                    return false // entregado → sin select (no llega aquí porque yaConvertido o select oculto)
                                  }).map(e => (
                                  <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                                ))}
                              </select>
                          }
                          {puedeConvertir && <button className="btn btn-sm btn-success" style={{ padding: '3px 6px', fontSize: 11 }} onClick={() => abrirConvertir(p)}>🧾 Conv.</button>}
                          {p.estado === 'pendiente' && !yaConvertido && <button className="btn btn-sm btn-secondary" style={{ padding: '3px 6px' }} onClick={() => editPedido(p)}>✏</button>}
                          <button className="btn btn-sm btn-secondary" style={{ padding: '3px 6px' }} onClick={() => verComprobante(p.id)}>📋</button>
                          {tieneRemito
                            ? <button className="btn btn-sm" style={{ padding: '3px 6px', background: '#F3F4F6', color: '#374151' }} onClick={() => handleVerRemito(p.id)}>👁</button>
                            : puedeRemitir && <button className="btn btn-sm" style={{ padding: '3px 6px', background: '#FEF3C7', color: '#92400E' }} onClick={() => handleImprimirRemito(p.id)}>🚚</button>
                          }
                          {isAdmin && !yaConvertido && <button className="btn btn-sm btn-danger" style={{ padding: '3px 6px', fontSize: 11 }} onClick={() => deletePedido(p)}>✕</button>}
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
        ) : pedidos.length === 0 ? (
          <div className="empty"><div className="empty-icon">📋</div><p>No hay pedidos todavía</p></div>
        ) : pedidos.map(p => {
          const yaConvertido = !!p.convertido_venta_id
          const puedeConvertir = !yaConvertido && (p.estado === 'confirmado' || p.estado === 'entregado')
          const puedeRemitir = p.estado === 'confirmado' || p.estado === 'entregado'
          const tieneRemito = origenesConRemito.has(p.id) || (yaConvertido && origenesConRemito.has(p.convertido_venta_id))
          return (
            <div key={p.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-num">#{String(p.numero || 0).padStart(6, '0')}</span>
                <span className={`badge ${{ pendiente: 'badge-yellow', confirmado: 'badge-blue', entregado: 'badge-green', cancelado: 'badge-red' }[p.estado] || 'badge-gray'}`}>{p.estado}</span>
                <span className="op-card-fecha">{p.fecha_entrega ? new Date(p.fecha_entrega + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : 'Sin fecha'}</span>
              </div>
              <div className="op-card-cliente">{p.clientes ? nombreCliente(p.clientes) : '—'}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div className="op-card-total">${parseFloat(p.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  {p.estado === 'pendiente' && !yaConvertido && <button className="btn btn-sm btn-secondary" onClick={() => editPedido(p)}>✏ Editar</button>}
                  {puedeConvertir && <button className="btn btn-sm btn-success" onClick={() => abrirConvertir(p)}>🧾 Convertir</button>}
                </div>
              </div>
              <div className="op-card-actions">
                <button className="btn btn-secondary" onClick={() => verComprobante(p.id)}>📋 Ver</button>
                {yaConvertido
                  ? <span className="badge badge-green" style={{ flex: 1, textAlign: 'center' }}>✓ Facturado</span>
                  : p.estado === 'entregado'
                    ? <span className="badge badge-green" style={{ flex: 1, textAlign: 'center' }}>Entregado</span>
                    : <select style={{ flex: 1, padding: '8px 6px', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
                        value={p.estado} onChange={e => updateEstado(p.id, e.target.value)}>
                        {ESTADOS.filter(e => {
                          if (p.estado === 'pendiente') return e !== 'entregado'
                          if (p.estado === 'confirmado') return e === 'confirmado' || e === 'entregado' || e === 'cancelado'
                          return false
                        }).map(e => (
                          <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>
                        ))}
                      </select>
                }
                {tieneRemito
                  ? <button className="btn btn-secondary" onClick={() => handleVerRemito(p.id)}>👁 Remito</button>
                  : puedeRemitir && <button className="btn btn-secondary" onClick={() => handleImprimirRemito(p.id)}>🚚 Remito</button>
                }
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
              <h2>{form.id ? 'Editar pedido' : 'Nuevo pedido'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {/* Cliente y fecha */}
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente *</label>
                  <input
                    type="text" placeholder="Buscar cliente..."
                    value={searchCliente} onChange={e => setSearchCliente(e.target.value)}
                    style={{ marginBottom: 4, borderRadius: 'var(--radius) var(--radius) 0 0', borderBottom: 'none' }}
                  />
                  <select value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}
                    style={{ borderRadius: '0 0 var(--radius) var(--radius)' }}>
                    <option value="">— Elegí un cliente —</option>
                    {misClientes
                      .filter(c => !searchCliente || nombreCliente(c).toLowerCase().includes(searchCliente.toLowerCase()))
                      .map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}{c.tipo ? ` — ${c.tipo}` : ''}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha programada</label>
                  <input type="date" value={form.fechaEntrega} onChange={e => setForm(f => ({ ...f, fechaEntrega: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Lista de precios</label>
                  <select value={versionId} onChange={e => cambiarVersion(e.target.value)}>
                    <option value="">Precios actuales</option>
                    {versiones.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                  </select>
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
                    {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre} — ${parseFloat(p.precio).toLocaleString('es-AR')}{p.promo ? ` 🎁${p.promo}` : ''}</option>)}
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
                      </span>
                      <span style={{ flex: 1, textAlign: 'right' }}>
                        {item.descuento_item > 0 && <span style={{ fontSize: 11, color: 'var(--success)', display: 'block' }}>-{item.descuento_item}% dcto</span>}
                        ${(item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      </span>
                      <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    {descPct > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Descuento {descPct}%</div>}
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Total: ${total.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</div>
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

      {/* ===== MODAL FECHA ENTREGA ===== */}
      {modalFecha && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 380 }}>
            <div className="modal-header">
              <h2>{modalFecha.modo === 'estado' ? 'Marcar como entregado' : 'Editar fecha de entrega'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalFecha(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>{modalFecha.modo === 'estado' ? '¿Qué fecha se entregó el pedido?' : 'Fecha real de entrega'}</label>
                <input type="date" value={fechaInput} onChange={e => setFechaInput(e.target.value)} />
              </div>
            </div>
            <div className="modal-footer">
              {modalFecha.modo === 'editar' && modalFecha.fechaActual && (
                <button className="btn btn-danger" onClick={() => confirmarFecha(true)}>Borrar fecha</button>
              )}
              <button className="btn btn-secondary" onClick={() => setModalFecha(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => confirmarFecha(false)}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL CONVERTIR ===== */}
      {modalConvertir && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Convertir en venta</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalConvertir(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ marginBottom: 16 }}>
                <strong>{nombreCliente(modalConvertir.clientes)}</strong><br />
                <span style={{ color: 'var(--muted)' }}>Total: ${parseFloat(modalConvertir.total || 0).toLocaleString('es-AR')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <input type="checkbox" id="yaEntregado" checked={yaEntregado} onChange={e => setYaEntregado(e.target.checked)} disabled={!!modalConvertir.fecha_entrega_real} />
                <label htmlFor="yaEntregado">Ya fue entregado</label>
              </div>
              {yaEntregado && (
                <div className="form-group">
                  <label>Fecha de entrega</label>
                  <input type="date" value={fechaConvertir} onChange={e => setFechaConvertir(e.target.value)} disabled={!!modalConvertir.fecha_entrega_real} />
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalConvertir(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarConvertir} disabled={convirtiendo}>
                {convirtiendo ? 'Convirtiendo...' : '✓ Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ComprobanteModal comp={comp} onClose={cerrarComp} onPrint={imprimir} onDownload={descargar} />

      {/* ===== MODAL PROMO COMBINADA ===== */}
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
                    <input type="radio" name="promoCombi" checked={promoCombiElegido === item.producto_id} onChange={() => setPromoCombiElegido(item.producto_id)} />
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
