import { useState, useEffect } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useComprobante, ComprobanteModal } from '../hooks/useComprobante.jsx'
import { ToastContainer } from '../components/Toast'
import { MODALIDADES_ENTREGA } from '../services/logisticaService'
import { fmtMonto } from '../utils/money'

const EMPTY_FORM = {
  clienteId: '', fecha: new Date().toISOString().split('T')[0], notas: '', modalidad: 'sin_iva'
}

function badgePago(estado) {
  const map = { pendiente: 'badge-yellow', parcial: 'badge-blue', pagado: 'badge-green' }
  return <span className={`badge ${map[estado] || 'badge-gray'}`}>{estado}</span>
}

export default function VentasPage() {
  const { user, isAdmin, puedeVerMontos } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const ventaIdParam = searchParams.get('venta')
  const { toasts, toast } = useToast()
  const { comp, cerrarComp, imprimir, descargar, verComprobanteVenta, verRemito, confirmarDespachoVenta } = useComprobante()
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

  // Modal edición venta
  const [modalOpen, setModalOpen] = useState(false)
  const [editingVenta, setEditingVenta] = useState(null)
  const [despachoVenta, setDespachoVenta] = useState(null)
  const [modalidadEntregaVenta, setModalidadEntregaVenta] = useState('')
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
        .select('id,numero,fecha,created_at,fecha_entrega_real,fecha_anulacion,total,estado,estado_pago,vendedor_id,cliente_id,notas,clientes(nombre,nombre_fantasia)')
        .order('created_at', { ascending: false })

      if (!isAdmin) q = q.eq('vendedor_id', user)
      if (ventaIdParam) {
        q = q.eq('id', ventaIdParam)
      } else {
        if (isAdmin && filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
        if (filtroCliente) q = q.eq('cliente_id', filtroCliente)
      }

      const { data: vents } = await q

      // Buscar remitos — incluye pedidos relacionados
      const ventaIds = (vents || []).map(v => v.id)
      if (ventaIds.length) {
        const { data: pedRel } = await supabase.from('pedidos').select('id,convertido_venta_id').in('convertido_venta_id', ventaIds)
        const idsRelevantes = [...ventaIds, ...(pedRel || []).map(p => p.id)]
        const { data: remitos } = await supabase
          .from('remitos')
          .select('origen_tipo,origen_id')
          .in('origen_id', idsRelevantes)

        const pedRelMap = {}
        ;(pedRel || []).forEach(p => { pedRelMap[p.convertido_venta_id] = p.id })

        const origenSet = new Set(
          (remitos || [])
            .filter(r => r.origen_tipo && r.origen_id)
            .map(r => `${r.origen_tipo}:${r.origen_id}`)
        )
        setOrigenesConRemito(origenSet)
        // guardar pedRelMap para uso en render
        setPedRelMap(pedRelMap)
      } else {
        setOrigenesConRemito(new Set())
        setPedRelMap({})
      }

      setVentas(vents || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { loadVentas() }, [filtroCliente, filtroVendedor, ventaIdParam])

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

  function estadoFuncional(v, tieneRemito) {
    const estado = (v.estado || '').toLowerCase()
    if (estado === 'anulada') return 'anulada'
    if (v.fecha_entrega_real || estado === 'entregada') return 'entregada'
    if (tieneRemito || estado === 'remitida') return 'remitida'
    return 'abierta'
  }

  function badgeEstado(estado) {
    const map = {
      abierta: ['badge-yellow', 'Abierta'],
      remitida: ['badge-blue', 'Remitida'],
      entregada: ['badge-green', 'Entregada'],
      anulada: ['badge-gray', 'Anulada'],
    }
    const [cls, label] = map[estado] || ['badge-gray', estado || '—']
    return <span className={`badge ${cls}`}>{label}</span>
  }

  function resetEditor() {
    setForm(EMPTY_FORM)
    setItems([])
    setEditingVenta(null)
    setSearchCliente('')
    setProdSel('')
    setCantidad(1)
    setPrecioEditable('')
    setDescuentoItem('')
    setPromoInfo(null)
    setAplicarPromo(false)
    setUsarListaHistorica(false)
    setVersionId('')
  }

  async function abrirDespachoVenta(v) {
    const tieneRemito = origenesConRemito.has(`venta:${v.id}`) || (pedRelMap[v.id] && origenesConRemito.has(`pedido:${pedRelMap[v.id]}`))
    if (estadoFuncional(v, tieneRemito) !== 'abierta') {
      toast('Solo puede despacharse una venta abierta.', 'error')
      return
    }
    try {
      const { data, error } = await supabase.from('ventas')
        .select('id,numero,fecha,total,notas,clientes(nombre,nombre_fantasia),venta_items(producto_id,cantidad,bonificado,precio_unitario,productos(id,nombre,codigo,unidad))')
        .eq('id', v.id)
        .single()
      if (error) throw error
      setModalidadEntregaVenta('')
      setDespachoVenta(data)
    } catch (e) {
      toast('Error al preparar despacho: ' + e.message, 'error')
    }
  }

  async function abrirEditarVenta(v) {
    const tieneRemito = origenesConRemito.has(`venta:${v.id}`) || (pedRelMap[v.id] && origenesConRemito.has(`pedido:${pedRelMap[v.id]}`))
    if (estadoFuncional(v, tieneRemito) !== 'abierta') {
      toast('La venta ya tiene remito o está cerrada; no puede editarse.', 'error')
      return
    }

    try {
      const { data, error } = await supabase.from('ventas')
        .select('id,fecha,cliente_id,notas,modalidad_factura,total,venta_items(producto_id,cantidad,bonificado,precio_unitario,productos(id,nombre,costo,familia,promo,precio_editable))')
        .eq('id', v.id)
        .single()
      if (error) throw error
      setEditingVenta(data)
      setForm({
        clienteId: data.cliente_id || '',
        fecha: data.fecha || new Date().toISOString().split('T')[0],
        notas: (data.notas || '').split('|').map(x => x.trim()).filter(x => x && !x.includes('Descuento aplicado') && !x.includes('Con IVA') && !x.includes('bonificadas') && !x.includes('muestras')).join(' | '),
        modalidad: data.modalidad_factura || 'sin_iva'
      })
      setItems((data.venta_items || []).map(i => ({
        producto_id: i.producto_id,
        nombre: i.productos?.nombre || '—',
        costo: i.productos?.costo || 0,
        familia: i.productos?.familia || '',
        cantidad: i.cantidad || 0,
        bonificado: i.bonificado || 0,
        precio_unitario: parseFloat(i.precio_unitario || 0),
        descuento_item: 0,
        promo: i.productos?.promo || ''
      })))
      setModalOpen(true)
    } catch (e) {
      toast('Error al abrir edición: ' + e.message, 'error')
    }
  }

  // ===== GUARDAR VENTA =====
  async function saveVenta() {
    if (!editingVenta?.id) { toast('Las ventas nuevas se generan desde Pedidos confirmados.', 'error'); return }
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

      const { error: ventaError } = await supabase.from('ventas')
        .update({
          cliente_id: form.clienteId,
          fecha,
          notas,
          total,
          vendedor_id: vendedorId,
          modalidad_factura: form.modalidad,
          estado: 'abierta'
        })
        .eq('id', editingVenta.id)

      if (ventaError) throw ventaError

      const { error: delItemsError } = await supabase.from('venta_items').delete().eq('venta_id', editingVenta.id)
      if (delItemsError) throw delItemsError

      const nuevosItems = items.map(item => {
        const precioConDesc = item.precio_unitario * (1 - descPct / 100) * ivaFactor
        return {
          venta_id: editingVenta.id,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          bonificado: item.bonificado || 0,
          precio_unitario: precioConDesc
        }
      })

      const { error: insItemsError } = await supabase.from('venta_items').insert(nuevosItems)
      if (insItemsError) throw insItemsError

      if (cliente && cliente.estado_cliente !== 'Activo') {
        await supabase.from('clientes').update({ estado_cliente: 'Activo' }).eq('id', form.clienteId)
      }

      toast('Venta actualizada')
      setModalOpen(false)
      resetEditor()
      loadVentas()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== ANULAR VENTA =====
  async function deleteVenta(v) {
    if (!isAdmin) {
      toast('Solo el administrador puede anular ventas.', 'error')
      return
    }

    const tieneRemito = origenesConRemito.has(`venta:${v.id}`) || (pedRelMap[v.id] && origenesConRemito.has(`pedido:${pedRelMap[v.id]}`))
    const estado = estadoFuncional(v, tieneRemito)

    if (estado === 'remitida' || estado === 'entregada') {
      toast('Esta venta ya tiene remito. La anulación mediante devoluciones/remitos inversos será implementada en una futura versión del ERP.', 'info')
      return
    }

    if (estado === 'anulada') {
      toast('La venta ya se encuentra anulada.', 'info')
      return
    }

    const nombre = v.clientes ? nombreCliente(v.clientes) : 'este cliente'
    const ok = confirm(
      `¿Anular la venta #${String(v.numero || 0).padStart(6, '0')} de ${nombre}?\n\n` +
      'La venta quedará como antecedente histórico. No se eliminarán registros, no se moverá stock y no se modificará el pedido origen.'
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

      const { error: ventaError } = await supabase
        .from('ventas')
        .update({ estado: 'anulada', fecha_anulacion: new Date().toISOString() })
        .eq('id', v.id)

      if (ventaError) throw ventaError

      toast('Venta anulada. El pedido origen no fue modificado.')
      loadVentas()
    } catch (e) {
      toast('Error al anular venta: ' + e.message, 'error')
    }
  }

  function irACobrar(v) {
    navigate('/pagos', { state: { clienteId: v.cliente_id, ventaId: v.id } })
  }

  async function confirmarDespacho() {
    if (!despachoVenta) return
    if (!modalidadEntregaVenta) {
      toast('Seleccioná cómo se entrega la mercadería.', 'error')
      return
    }
    setSaving(true)
    try {
      await confirmarDespachoVenta(despachoVenta.id, modalidadEntregaVenta)
      toast('Despacho confirmado. Remito generado y stock actualizado.')
      setDespachoVenta(null)
      loadVentas()
    } catch (e) {
      toast('Error al confirmar despacho: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  // ===== FECHA ENTREGA =====
  async function confirmarFecha(borrar = false) {
    if (!modalFecha) return
    const fecha = borrar ? null : fechaInput
    if (!borrar && !fecha) { toast('Elegí una fecha', 'error'); return }
    try {
      await supabase.from('ventas').update({
        fecha_entrega_real: fecha,
        estado: fecha ? 'entregada' : 'remitida'
      }).eq('id', modalFecha.id)
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
      <style data-rc1-mobile-hide>{`@media (max-width: 768px){ .mobile-hide{ display:none !important; } }`}</style>
      <div className="page-header">
        <h1 className="page-title">Ventas</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary hide-on-mobile" onClick={() => toast('Excel — próximamente', 'info')}>📥 Excel</button>
        </div>
      </div>

      {ventaIdParam ? (
        <div className="card" style={{ padding: '10px 14px', marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 13 }}>
          <span>Mostrando solo la venta vinculada al pedido.</span>
          <button className="btn btn-sm btn-secondary" onClick={() => setSearchParams({})}>Ver todas las ventas</button>
        </div>
      ) : (
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
      )}

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
                  <th>Nº Venta</th>
                  <th>Fecha creación</th>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Total</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {ventas.map(v => {
                  const tieneRemito = origenesConRemito.has(`venta:${v.id}`) || (pedRelMap[v.id] && origenesConRemito.has(`pedido:${pedRelMap[v.id]}`))
                  const estado = estadoFuncional(v, tieneRemito)
                  return (
                    <tr key={v.id}>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>#{String(v.numero || 0).padStart(6, '0')}</td>
                      <td>{v.fecha || (v.created_at ? v.created_at.slice(0, 10) : '—')}</td>
                      <td>{v.clientes ? nombreCliente(v.clientes) : '—'}</td>
                      <td>{badgeEstado(estado)}</td>
                      <td>{fmtMonto(v.total, puedeVerMontos)}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                          {puedeVerMontos && <button className="btn btn-sm btn-secondary" onClick={async () => { try { await verComprobanteVenta(v.id) } catch(e) { toast('Error', 'error') } }}>👁 Ver comprobante</button>}
                          {estado === 'abierta' && (
                            <>
                              <button className="btn btn-sm btn-secondary" onClick={() => abrirEditarVenta(v)}>✏️ Editar</button>
                              <button className="btn btn-sm" style={{ background: '#DBEAFE', color: '#1D4ED8' }} onClick={() => abrirDespachoVenta(v)}>🚚 Despachar</button>
                              {isAdmin && <button className="btn btn-sm btn-danger" onClick={() => deleteVenta(v)}>❌ Anular</button>}
                            </>
                          )}
                          {estado === 'remitida' && (
                            <>
                              {puedeVerMontos && <button className="btn btn-sm btn-secondary" onClick={async () => { try { await verRemito('venta', v.id) } catch(e) { toast('Error', 'error') } }}>👁 Ver remito</button>}
                              <button className="btn btn-sm" style={{ background: '#DCFCE7', color: '#15803D' }}
                                onClick={() => { setModalFecha({ id: v.id, fechaActual: '' }); setFechaInput(new Date().toISOString().split('T')[0]) }}>
                                ✅ Confirmar entrega
                              </button>
                            </>
                          )}
                          {estado === 'entregada' && puedeVerMontos && (
                            <button className="btn btn-sm btn-secondary" onClick={async () => { try { await verRemito('venta', v.id) } catch(e) { toast('Error', 'error') } }}>👁 Ver remito</button>
                          )}
                          {(estado === 'remitida' || estado === 'entregada') && (
                            v.estado_pago === 'pagado' ? (
                              <span className="badge badge-green">✅ Pagada</span>
                            ) : v.estado_pago === 'parcial' ? (
                              <button className="btn btn-sm" style={{ background: '#DBEAFE', color: '#1D4ED8' }} onClick={() => irACobrar(v)}>◐ Pago parcial</button>
                            ) : (
                              <button className="btn btn-sm" style={{ background: '#FEF3C7', color: '#92400E' }} onClick={() => irACobrar(v)}>💰 Cobrar</button>
                            )
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
          const tieneRemito = origenesConRemito.has(`venta:${v.id}`) || (pedRelMap[v.id] && origenesConRemito.has(`pedido:${pedRelMap[v.id]}`))
          const estado = estadoFuncional(v, tieneRemito)
          const fechaCorta = v.fecha ? new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'
          return (
            <div key={v.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-num">#{String(v.numero || 0).padStart(6, '0')} · {fechaCorta}</span>
                {badgeEstado(estado)}
              </div>
              <div className="op-card-cliente">{v.clientes ? nombreCliente(v.clientes) : '—'}</div>
              <div className="op-card-total">{fmtMonto(v.total, puedeVerMontos)}</div>
              <div className="op-card-actions">
                {puedeVerMontos && <button className="btn btn-secondary" onClick={async () => { try { await verComprobanteVenta(v.id) } catch(e) { toast('Error', 'error') } }}>👁 Ver</button>}
                {estado === 'abierta' && (
                  <>
                    <button className="btn btn-secondary" onClick={() => abrirEditarVenta(v)}>✏️ Editar</button>
                    <button className="btn btn-secondary" onClick={() => abrirDespachoVenta(v)}>🚚 Despachar</button>
                    {isAdmin && <button className="btn btn-danger" onClick={() => deleteVenta(v)}>❌ Anular</button>}
                  </>
                )}
                {estado === 'remitida' && (
                  <>
                    {puedeVerMontos && <button className="btn btn-secondary" onClick={async () => { try { await verRemito('venta', v.id) } catch(e) { toast('Error', 'error') } }}>👁 Remito</button>}
                    <button className="btn btn-secondary" onClick={() => { setModalFecha({ id: v.id, fechaActual: '' }); setFechaInput(new Date().toISOString().split('T')[0]) }}>✅ Confirmar entrega</button>
                  </>
                )}
                {estado === 'entregada' && puedeVerMontos && (
                  <button className="btn btn-secondary" onClick={async () => { try { await verRemito('venta', v.id) } catch(e) { toast('Error', 'error') } }}>👁 Remito</button>
                )}
                {(estado === 'remitida' || estado === 'entregada') && (
                  v.estado_pago === 'pagado' ? (
                    <span className="badge badge-green">✅ Pagada</span>
                  ) : v.estado_pago === 'parcial' ? (
                    <button className="btn" style={{ background: '#DBEAFE', color: '#1D4ED8' }} onClick={() => irACobrar(v)}>◐ Pago parcial</button>
                  ) : (
                    <button className="btn" style={{ background: '#FEF3C7', color: '#92400E' }} onClick={() => irACobrar(v)}>💰 Cobrar</button>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== MODAL EDITAR VENTA ===== */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && (setModalOpen(false), resetEditor())}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>Editar venta</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => { setModalOpen(false); resetEditor() }}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente</label>
                  <input
                    readOnly
                    value={(() => {
                      const c = clientes.find(x => x.id === form.clienteId)
                      return c ? `${nombreCliente(c)}${c.tipo ? ` — ${c.tipo}` : ''}` : '—'
                    })()}
                    style={{ background: 'var(--bg)', color: 'var(--muted)' }}
                    title="El cliente no se puede cambiar acá. Si está mal, anulá la venta y rehacé el pedido con el cliente correcto."
                  />
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
                            {p.codigo ? `${p.codigo} — ` : ''}{p.nombre} — {fmtMonto(precio, puedeVerMontos)}{p.promo ? ` 🎁${p.promo}` : ''}
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
                        {descPct > 0 && <span style={{ textDecoration: 'line-through', color: 'var(--muted)', fontSize: 11 }}>{fmtMonto(item.cantidad * item.precio_unitario, puedeVerMontos)}<br /></span>}
                        {fmtMonto(item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor, puedeVerMontos, { maximumFractionDigits: 2 })}
                      </span>
                      <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    {descPct > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Descuento {descPct}%</div>}
                    {items.reduce((s, i) => s + (i.bonificado || 0), 0) > 0 && (
                      <div style={{ fontSize: 12, color: 'var(--success)' }}>Unidades bonificadas: {items.reduce((s, i) => s + (i.bonificado || 0), 0)}</div>
                    )}
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Total: {fmtMonto(total, puedeVerMontos, { maximumFractionDigits: 2 })}</div>
                    {isAdmin && items.length > 0 && (
                      <div style={{ fontSize: 12, marginTop: 4, color: margenColor }}>
                        Ganancia estimada: {fmtMonto(ganancia, puedeVerMontos)} ({margen.toFixed(1)}% margen)
                        {margen < 10 && margen > 0 && <div style={{ color: 'var(--danger)', fontWeight: 500 }}>⚠ Margen bajo — revisá el descuento aplicado</div>}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => { setModalOpen(false); resetEditor() }}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveVenta} disabled={saving}>{saving ? 'Guardando...' : 'Guardar cambios'}</button>
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

      {/* ===== MODAL DESPACHO ===== */}
      {despachoVenta && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDespachoVenta(null)}>
          <div className="modal" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <h2>Despachar venta #{String(despachoVenta.numero || 0).padStart(6, '0')}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setDespachoVenta(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="comp-datos" style={{ marginBottom: 12 }}>
                <div><span>Cliente</span><strong>{despachoVenta.clientes ? nombreCliente(despachoVenta.clientes) : '—'}</strong></div>
                <div><span>Fecha creación</span><strong>{despachoVenta.fecha || '—'}</strong></div>
                <div><span>Total</span><strong>{fmtMonto(despachoVenta.total, puedeVerMontos)}</strong></div>
                <div><span>Observaciones</span><strong>{despachoVenta.notas || '—'}</strong></div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Código</th>
                      <th>Producto</th>
                      <th style={{ textAlign: 'center' }}>Cant.</th>
                      <th style={{ textAlign: 'center' }}>Bonif.</th>
                      <th style={{ textAlign: 'right' }}>P. Unit.</th>
                      <th style={{ textAlign: 'right' }}>Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(despachoVenta.venta_items || []).map(item => (
                      <tr key={item.producto_id}>
                        <td>{item.productos?.codigo || '—'}</td>
                        <td>{item.productos?.nombre || '—'}</td>
                        <td style={{ textAlign: 'center' }}>{item.cantidad}</td>
                        <td style={{ textAlign: 'center' }}>{item.bonificado || 0}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMonto(item.precio_unitario, puedeVerMontos)}</td>
                        <td style={{ textAlign: 'right' }}>{fmtMonto(parseFloat(item.cantidad || 0) * parseFloat(item.precio_unitario || 0), puedeVerMontos)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div style={{ marginTop: 16 }}>
                <label>¿Cómo se entrega la mercadería?</label>
                <div style={{ display: 'flex', gap: 16, marginTop: 6 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                    <input
                      type="radio"
                      name="modalidadEntregaVenta"
                      checked={modalidadEntregaVenta === MODALIDADES_ENTREGA.RETIRO_DEPOSITO}
                      onChange={() => setModalidadEntregaVenta(MODALIDADES_ENTREGA.RETIRO_DEPOSITO)}
                    />
                    Retira en depósito
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                    <input
                      type="radio"
                      name="modalidadEntregaVenta"
                      checked={modalidadEntregaVenta === MODALIDADES_ENTREGA.REPARTO}
                      onChange={() => setModalidadEntregaVenta(MODALIDADES_ENTREGA.REPARTO)}
                    />
                    Enviamos por flete/reparto
                  </label>
                </div>
              </div>
              <p style={{ marginTop: 12, color: 'var(--muted)', fontSize: 13 }}>
                Al confirmar se generará el remito, se moverá stock y la venta quedará bloqueada para edición.
              </p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDespachoVenta(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarDespacho} disabled={saving || !modalidadEntregaVenta}>{saving ? 'Confirmando...' : 'Confirmar despacho'}</button>
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
