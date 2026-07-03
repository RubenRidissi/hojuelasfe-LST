import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { useComprobante, ComprobanteModal } from '../hooks/useComprobante.jsx'
import { ToastContainer } from '../components/Toast'
import { fmtMonto } from '../utils/money'

const ESTADOS = ['pendiente', 'confirmado', 'cancelado']

const EMPTY_FORM = {
  id: '',
  clienteId: '',
  notas: '',
  modalidad: 'sin_iva'
}

export default function PedidosPage() {
  const { user, isAdmin, puedeVerMontos } = useAuth()
  const navigate = useNavigate()
  const { toasts, toast } = useToast()
  const { comp, cerrarComp, imprimir, descargar, verComprobantePedido } = useComprobante()

  const [pedidos, setPedidos] = useState([])
  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)

  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [items, setItems] = useState([])
  const [saving, setSaving] = useState(false)

  const [prodSel, setProdSel] = useState('')
  const [cantidad, setCantidad] = useState(1)
  const [versionId, setVersionId] = useState('')
  const [usarListaHistorica, setUsarListaHistorica] = useState(false)
  const [precioEditable, setPrecioEditable] = useState('')
  const [descuentoItem, setDescuentoItem] = useState('')
  const [promoInfo, setPromoInfo] = useState(null)
  const [aplicarPromo, setAplicarPromo] = useState(false)
  const [versiones, setVersiones] = useState([])
  const [searchCliente, setSearchCliente] = useState('')
  const [modalPromoCombi, setModalPromoCombi] = useState(null)
  const [promoCombiElegido, setPromoCombiElegido] = useState(null)

  const [modalConvertir, setModalConvertir] = useState(null)
  const [convirtiendo, setConvirtiendo] = useState(false)

  useEffect(() => { loadAll() }, [])

  useEffect(() => {
    const abrirDesdeFab = () => abrirNuevoPedido()
    window.addEventListener('fab:nuevo-pedido', abrirDesdeFab)
    return () => window.removeEventListener('fab:nuevo-pedido', abrirDesdeFab)
  }, [])

  useEffect(() => { loadPedidos() }, [filtroEstado, filtroCliente, filtroVendedor])

  async function loadAll() {
    try {
      const [{ data: v }, { data: c }, { data: p }, { data: vers }] = await Promise.all([
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('clientes').select('id,nombre,nombre_fantasia,tipo,vendedor_id,descuento_pct,modalidad_factura,estado_cliente').order('nombre'),
        supabase.from('productos').select('id,codigo,nombre,costo,descuento_costo,markup_representante,markup_distribuidor,markup_mayorista,markup_supermercado,markup_almacen,precio_representante,precio_distribuidor,precio_mayorista,precio_supermercado,precio_almacen,promo,precio_editable,familia').order('codigo'),
        supabase.from('listas_precios_repo').select('id,nombre,created_at').order('created_at', { ascending: false })
      ])
      setVendedores(v || [])
      setClientes(c || [])
      setProductos(p || [])
      setVersiones(vers || [])
    } catch (e) {
      console.error(e)
      toast('Error al cargar datos base', 'error')
    }
    loadPedidos()
  }

  async function loadPedidos() {
    setLoading(true)
    try {
      let q = supabase.from('pedidos')
        .select('id,numero,fecha,created_at,fecha_confirmacion,fecha_cancelacion,estado,total,vendedor_id,convertido_venta_id,cliente_id,notas,modalidad_factura,clientes(nombre,nombre_fantasia)')
        .order('created_at', { ascending: false })

      if (filtroEstado === 'convertido') {
        q = q.not('convertido_venta_id', 'is', null)
      } else if (filtroEstado) {
        q = q.eq('estado', filtroEstado)
      }
      if (filtroCliente) q = q.eq('cliente_id', filtroCliente)
      if (isAdmin && filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      if (!isAdmin) q = q.eq('vendedor_id', user)

      const { data, error } = await q
      if (error) throw error
      setPedidos(data || [])
    } catch (e) {
      console.error(e)
      toast('Error al cargar pedidos: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const PRECIO_POR_TIPO = {
    'Representante': 'precio_representante',
    'Distribuidor': 'precio_distribuidor',
    'Mayorista': 'precio_mayorista',
    'Supermercado': 'precio_supermercado',
    'Almacén': 'precio_almacen'
  }

  function getTipoClienteActual() {
    const cliente = clientes.find(c => c.id === form.clienteId)
    return cliente?.tipo || 'Distribuidor'
  }

  function getPrecio(productoId) {
    const p = productos.find(x => x.id === productoId)
    if (!p) return 0
    const tipoCliente = getTipoClienteActual()
    const colPrecio = PRECIO_POR_TIPO[tipoCliente] || 'precio_distribuidor'
    return parseFloat(p[colPrecio] || 0)
  }

  function cambiarVersion(nuevaVersionId) {
    setVersionId(nuevaVersionId)
    if (nuevaVersionId) {
      toast('Lista histórica seleccionada. En esta etapa los pedidos siguen usando precios actuales.', 'info')
    }
  }

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

  function addItem() {
    if (!prodSel) { toast('Elegí un producto', 'error'); return }
    const prod = productos.find(p => p.id === prodSel)
    if (!prod) return

    const cant = parseInt(cantidad) || 1
    const esEditable = prod.precio_editable
    const precioBase = esEditable ? (parseFloat(precioEditable) || 0) : getPrecio(prodSel)
    const descItem = parseFloat(descuentoItem) || 0
    const precio = descItem > 0 ? precioBase * (1 - descItem / 100) : precioBase

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
      return [...items, {
        producto_id: prodSel,
        nombre: prod.nombre,
        familia: prod.familia || '',
        cantidad: cant,
        bonificado,
        precio_unitario: precio,
        descuento_item: descItem,
        promo: prod.promo || ''
      }]
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
      : i
    ))
    toast('✓ ' + modalPromoCombi.bonifPosible + ' unidad(es) bonificada(s) agregada(s)')
    setModalPromoCombi(null)
    setPromoCombiElegido(null)
  }

  function removeItem(idx) {
    setItems(prev => prev.filter((_, i) => i !== idx))
  }

  function calcTotal(itemsArr, clienteId, modalidadForzada = null) {
    const cliente = clientes.find(c => c.id === clienteId)
    const descPct = parseFloat(cliente?.descuento_pct || 0)
    const modalidad = modalidadForzada || form.modalidad || cliente?.modalidad_factura || 'sin_iva'
    const ivaFactor = modalidad === 'con_iva' ? 1.21 : 1
    return itemsArr.reduce((s, item) => s + item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor, 0)
  }

  function limpiarNotasUsuario(notas = '') {
    return notas
      .split('|')
      .map(s => s.trim())
      .filter(s => s && !s.includes('Descuento aplicado') && !s.includes('Con IVA') && !s.includes('Incluye unidades bonificadas'))
      .join(' | ')
  }

  function abrirNuevoPedido() {
    setForm(EMPTY_FORM)
    setItems([])
    setProdSel('')
    setCantidad(1)
    setSearchCliente('')
    setModalOpen(true)
  }

  async function savePedido() {
    if (!form.clienteId) { toast('Seleccioná un cliente', 'error'); return }
    if (!items.length) { toast('Agregá al menos un producto', 'error'); return }
    setSaving(true)

    try {
      const cliente = clientes.find(c => c.id === form.clienteId)
      const descPct = parseFloat(cliente?.descuento_pct || 0)
      const modalidad = form.modalidad || cliente?.modalidad_factura || 'sin_iva'
      const ivaFactor = modalidad === 'con_iva' ? 1.21 : 1
      const total = calcTotal(items, form.clienteId, modalidad)
      const notas = [
        form.notas,
        descPct > 0 ? `Descuento aplicado: ${descPct}%` : '',
        modalidad === 'con_iva' ? 'Con IVA 21%' : '',
        items.some(i => i.bonificado > 0) ? 'Incluye unidades bonificadas por promo' : ''
      ].filter(Boolean).join(' | ')

      let pedidoId = form.id

      if (form.id) {
        const pedidoActual = pedidos.find(p => p.id === form.id)
        if (pedidoActual?.estado !== 'pendiente' || pedidoActual?.convertido_venta_id) {
          toast('Solo se pueden editar pedidos Pendientes', 'error')
          return
        }

        const { error: pedidoError } = await supabase
          .from('pedidos')
          .update({ cliente_id: form.clienteId, notas, total, modalidad_factura: modalidad })
          .eq('id', form.id)
        if (pedidoError) throw pedidoError

        const { error: deleteError } = await supabase.from('pedido_items').delete().eq('pedido_id', form.id)
        if (deleteError) throw deleteError
      } else {
        const vendedorId = cliente?.vendedor_id || user
        const hoy = new Date().toISOString().split('T')[0]
        const { data, error: insertError } = await supabase
          .from('pedidos')
          .insert({
            cliente_id: form.clienteId,
            fecha: hoy,
            estado: 'pendiente',
            notas,
            total,
            vendedor_id: vendedorId,
            modalidad_factura: modalidad
          })
          .select()
        if (insertError) throw insertError
        pedidoId = data?.[0]?.id
      }

      const { error: itemsError } = await supabase.from('pedido_items').insert(
        items.map(item => {
          const precioConDesc = item.precio_unitario * (1 - descPct / 100) * ivaFactor
          return {
            pedido_id: pedidoId,
            producto_id: item.producto_id,
            cantidad: item.cantidad,
            bonificado: item.bonificado || 0,
            precio_unitario: precioConDesc
          }
        })
      )
      if (itemsError) throw itemsError

      if (cliente && !cliente.vendedor_id && !isAdmin) {
        await supabase.from('clientes').update({ vendedor_id: user, estado_cliente: 'Activo' }).eq('id', form.clienteId)
        toast('✓ Cliente asignado a tu cartera y activado')
      } else if (cliente && cliente.estado_cliente !== 'Activo') {
        await supabase.from('clientes').update({ estado_cliente: 'Activo' }).eq('id', form.clienteId)
      }

      toast(form.id ? 'Pedido actualizado' : 'Pedido creado')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      setItems([])
      loadPedidos()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  async function editPedido(p) {
    if (p.estado !== 'pendiente' || p.convertido_venta_id) {
      toast('Solo se pueden editar pedidos Pendientes', 'error')
      return
    }
    if (!isAdmin && p.vendedor_id !== user) {
      toast('No podés editar pedidos de otro vendedor', 'error')
      return
    }

    try {
      const { data: its, error } = await supabase
        .from('pedido_items')
        .select('producto_id,cantidad,bonificado,precio_unitario,productos(nombre,promo,familia)')
        .eq('pedido_id', p.id)
      if (error) throw error

      setForm({
        id: p.id,
        clienteId: p.cliente_id,
        notas: limpiarNotasUsuario(p.notas || ''),
        modalidad: p.modalidad_factura || 'sin_iva'
      })
      setItems((its || []).map(i => ({
        producto_id: i.producto_id,
        nombre: i.productos?.nombre || '—',
        familia: i.productos?.familia || '',
        cantidad: i.cantidad,
        bonificado: i.bonificado || 0,
        precio_unitario: parseFloat(i.precio_unitario || 0),
        descuento_item: 0,
        promo: i.productos?.promo || ''
      })))
      setModalOpen(true)
    } catch (e) {
      toast('Error al cargar pedido: ' + e.message, 'error')
    }
  }

  async function confirmarPedido(p) {
    if (p.estado !== 'pendiente' || p.convertido_venta_id) {
      toast('Solo se pueden confirmar pedidos Pendientes', 'error')
      return
    }
    if (!isAdmin && p.vendedor_id !== user) {
      toast('No podés confirmar pedidos de otro vendedor', 'error')
      return
    }
    if (!confirm(`¿Confirmar pedido Nº ${p.numero || '—'}?`)) return

    try {
      const hoy = new Date().toISOString().split('T')[0]
      const { error } = await supabase
        .from('pedidos')
        .update({ estado: 'confirmado', fecha_confirmacion: hoy })
        .eq('id', p.id)
      if (error) throw error
      toast('Pedido confirmado')
      loadPedidos()
    } catch (e) {
      toast('Error al confirmar: ' + e.message, 'error')
    }
  }

  async function cancelarPedido(p) {
    if (p.convertido_venta_id) {
      toast('No se puede cancelar un pedido convertido', 'error')
      return
    }
    if (!['pendiente', 'confirmado'].includes(p.estado)) {
      toast('Este pedido no puede cancelarse', 'error')
      return
    }
    if (!isAdmin && p.vendedor_id !== user) {
      toast('No podés cancelar pedidos de otro vendedor', 'error')
      return
    }
    if (!confirm(`¿Cancelar pedido Nº ${p.numero || '—'}?`)) return

    try {
      const hoy = new Date().toISOString().split('T')[0]
      const { error } = await supabase
        .from('pedidos')
        .update({ estado: 'cancelado', fecha_cancelacion: hoy })
        .eq('id', p.id)
      if (error) throw error
      toast('Pedido cancelado')
      loadPedidos()
    } catch (e) {
      toast('Error al cancelar: ' + e.message, 'error')
    }
  }

  function abrirConvertir(p) {
    if (p.estado !== 'confirmado') {
      toast('Solo se pueden convertir pedidos Confirmados', 'error')
      return
    }
    if (p.convertido_venta_id) {
      toast('Este pedido ya fue convertido', 'error')
      return
    }
    if (!isAdmin && p.vendedor_id !== user) {
      toast('No podés convertir pedidos de otro vendedor', 'error')
      return
    }
    setModalConvertir(p)
  }

  async function confirmarConvertir() {
    if (!modalConvertir) return
    const p = modalConvertir
    setConvirtiendo(true)

    try {
      const { data: its, error: itemsError } = await supabase
        .from('pedido_items')
        .select('producto_id,cantidad,bonificado,precio_unitario')
        .eq('pedido_id', p.id)

      if (itemsError) throw itemsError
      if (!its?.length) {
        toast('El pedido no tiene productos', 'error')
        return
      }

      const hoy = new Date().toISOString().split('T')[0]
      const dataVenta = {
        cliente_id: p.cliente_id,
        fecha: hoy,
        notas: (p.notas || '') + ' | Generada desde pedido',
        total: p.total,
        vendedor_id: p.vendedor_id,
        estado_pago: 'pendiente'
      }

      const { data: ventaData, error: ventaError } = await supabase
        .from('ventas')
        .insert(dataVenta)
        .select()
      if (ventaError) throw ventaError

      const venta = ventaData?.[0]
      if (!venta?.id) throw new Error('No se pudo crear la venta')

      const { error: itemsVentaError } = await supabase
        .from('venta_items')
        .insert(its.map(item => ({
          venta_id: venta.id,
          producto_id: item.producto_id,
          cantidad: item.cantidad,
          bonificado: item.bonificado || 0,
          precio_unitario: item.precio_unitario
        })))
      if (itemsVentaError) throw itemsVentaError

      const { error: pedidoError } = await supabase
        .from('pedidos')
        .update({ convertido_venta_id: venta.id })
        .eq('id', p.id)
      if (pedidoError) throw pedidoError

      toast('Pedido convertido en venta ✓')
      setModalConvertir(null)
      loadPedidos()
    } catch (e) {
      toast('Error al convertir: ' + e.message, 'error')
    } finally {
      setConvirtiendo(false)
    }
  }

  async function verComprobante(pedidoId) {
    try { await verComprobantePedido(pedidoId) } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  function irAVenta(ventaId) {
    if (!ventaId) return
    navigate(`/ventas?venta=${ventaId}`)
  }

  function estadoVisualPedido(p) {
    return p.convertido_venta_id ? 'convertido' : p.estado
  }

  function fechaCreacionPedido(p) {
    return p.fecha || (p.created_at ? p.created_at.split('T')[0] : '')
  }

  function estadoLabel(estado) {
    const labels = {
      pendiente: 'Pendiente',
      confirmado: 'Confirmado',
      cancelado: 'Cancelado',
      convertido: 'Convertido'
    }
    return labels[estado] || estado
  }

  function estadoBadgeClass(estado) {
    if (estado === 'convertido') return 'badge badge-blue'
    if (estado === 'confirmado') return 'badge badge-green'
    if (estado === 'cancelado') return 'badge badge-red'
    return 'badge badge-yellow'
  }

  const misClientes = isAdmin ? clientes : clientes.filter(c =>
    (c.vendedor_id === user && c.estado_cliente === 'Activo') || !c.vendedor_id
  )

  const clientesFiltrados = misClientes.filter(c => {
    const s = searchCliente.trim().toLowerCase()
    if (!s) return true
    return [c.nombre, c.nombre_fantasia].filter(Boolean).some(v => v.toLowerCase().includes(s))
  })

  const clienteDelForm = clientes.find(c => c.id === form.clienteId)
  const descPct = parseFloat(clienteDelForm?.descuento_pct || 0)
  const ivaFactor = (form.modalidad || clienteDelForm?.modalidad_factura || 'sin_iva') === 'con_iva' ? 1.21 : 1
  const total = items.reduce((s, item) => s + item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor, 0)
  const prodSelObj = productos.find(p => p.id === prodSel)

  return (
    <div>
      <style>{`
        .show-mobile {
          display: none;
        }

        @media (max-width: 768px) {
          .hide-mobile {
            display: none !important;
          }

          .show-mobile {
            display: block !important;
          }
        }
      `}</style>
      <div className="page-header">
        <h1 className="page-title">Pedidos</h1>
        <button className="btn btn-primary hide-mobile" onClick={abrirNuevoPedido}>+ Nuevo pedido</button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ minWidth: 150 }}>
            <option value="">Todos los estados</option>
            {ESTADOS.map(e => <option key={e} value={e}>{estadoLabel(e)}</option>)}
            <option value="convertido">Convertido</option>
          </select>

          <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ minWidth: 220 }}>
            <option value="">Todos los clientes</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
          </select>

          {isAdmin && (
            <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ minWidth: 180 }}>
              <option value="">Todos los vendedores</option>
              {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre || v.user_id}</option>)}
            </select>
          )}
        </div>
      </div>

      <div className="card">
        {loading ? (
          <p>Cargando...</p>
        ) : pedidos.length === 0 ? (
          <p style={{ color: 'var(--muted)', textAlign: 'center', padding: 24 }}>No hay pedidos.</p>
        ) : (
          <>
            <div className="hide-mobile">
              <table className="table">
                <thead>
                  <tr>
                    <th>Nº Pedido</th>
                    <th>Fecha creación</th>
                    <th>Cliente</th>
                    <th>Estado</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map(p => {
                    const visual = estadoVisualPedido(p)
                    return (
                      <tr key={p.id}>
                        <td><strong>{p.numero || '—'}</strong></td>
                        <td>{fechaCreacionPedido(p)}</td>
                        <td>{nombreCliente(p.clientes)}</td>
                        <td><span className={estadoBadgeClass(visual)}>{estadoLabel(visual)}</span></td>
                        <td style={{ textAlign: 'right' }}>{fmtMonto(p.total, puedeVerMontos, { maximumFractionDigits: 2 })}</td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                            {puedeVerMontos && <button className="btn btn-sm btn-secondary" onClick={() => verComprobante(p.id)}>Ver</button>}

                            {visual === 'pendiente' && (
                              <>
                                <button className="btn btn-sm btn-secondary" onClick={() => editPedido(p)}>Editar</button>
                                <button className="btn btn-sm btn-primary" onClick={() => confirmarPedido(p)}>Confirmar</button>
                                <button className="btn btn-sm btn-danger" onClick={() => cancelarPedido(p)}>Cancelar</button>
                              </>
                            )}

                            {visual === 'confirmado' && (
                              <>
                                <button className="btn btn-sm btn-primary" onClick={() => abrirConvertir(p)}>Convertir</button>
                                <button className="btn btn-sm btn-danger" onClick={() => cancelarPedido(p)}>Cancelar</button>
                              </>
                            )}

                            {visual === 'convertido' && (
                              <button className="btn btn-sm btn-primary" onClick={() => irAVenta(p.convertido_venta_id)}>Ver venta</button>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="show-mobile">
              {pedidos.map(p => {
                const visual = estadoVisualPedido(p)
                return (
                  <div key={p.id} className="mobile-card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontWeight: 700 }}>Pedido Nº {p.numero || '—'}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 13 }}>{fechaCreacionPedido(p)}</div>
                      </div>
                      <span className={estadoBadgeClass(visual)}>{estadoLabel(visual)}</span>
                    </div>
                    <div style={{ marginTop: 8 }}>{nombreCliente(p.clientes)}</div>
                    <div style={{ marginTop: 6, fontWeight: 700 }}>{fmtMonto(p.total, puedeVerMontos, { maximumFractionDigits: 2 })}</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                      <button className="btn btn-sm btn-secondary" onClick={() => verComprobante(p.id)}>Ver</button>

                      {visual === 'pendiente' && (
                        <>
                          <button className="btn btn-sm btn-secondary" onClick={() => editPedido(p)}>Editar</button>
                          <button className="btn btn-sm btn-primary" onClick={() => confirmarPedido(p)}>Confirmar</button>
                          <button className="btn btn-sm btn-danger" onClick={() => cancelarPedido(p)}>Cancelar</button>
                        </>
                      )}

                      {visual === 'confirmado' && (
                        <>
                          <button className="btn btn-sm btn-primary" onClick={() => abrirConvertir(p)}>Convertir</button>
                          <button className="btn btn-sm btn-danger" onClick={() => cancelarPedido(p)}>Cancelar</button>
                        </>
                      )}

                      {visual === 'convertido' && (
                        <button className="btn btn-sm btn-primary" onClick={() => irAVenta(p.convertido_venta_id)}>Ver venta</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <div className="modal-backdrop">
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <h2>{form.id ? 'Editar pedido' : 'Nuevo pedido'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-grid" style={{ marginBottom: 12 }}>
                <div className="form-group">
                  <label>Cliente</label>
                  <input value={searchCliente} onChange={e => setSearchCliente(e.target.value)} placeholder="Buscar cliente..." style={{ marginBottom: 6 }} />
                  <select value={form.clienteId} onChange={e => setForm(f => ({ ...f, clienteId: e.target.value }))}>
                    <option value="">— Elegí un cliente —</option>
                    {clientesFiltrados.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}{c.tipo ? ` (${c.tipo})` : ''}</option>)}
                  </select>
                </div>

                <div className="form-group">
                  <label>Lista de precios</label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, marginBottom: 6, color: 'var(--muted)' }}>
                    <input type="checkbox" checked={usarListaHistorica} onChange={e => setUsarListaHistorica(e.target.checked)} />
                    Usar lista histórica
                  </label>
                  {usarListaHistorica ? (
                    <select value={versionId} onChange={e => cambiarVersion(e.target.value)}>
                      <option value="">Precios actuales</option>
                      {versiones.map(v => <option key={v.id} value={v.id}>{v.nombre}</option>)}
                    </select>
                  ) : (
                    <input readOnly value={`Actual automática: ${getTipoClienteActual()}`} style={{ background: 'var(--bg)', color: 'var(--muted)' }} />
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

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Agregar producto</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <select value={prodSel} onChange={e => onProdSelChange(e.target.value)} style={{ flex: 3, minWidth: 180 }}>
                    <option value="">— Elegí un producto —</option>
                    {productos.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.codigo ? `${p.codigo} — ` : ''}{p.nombre} — {fmtMonto(getPrecio(p.id), puedeVerMontos, { maximumFractionDigits: 2 })}{p.promo ? ` 🎁${p.promo}` : ''}
                      </option>
                    ))}
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
                        {fmtMonto(item.cantidad * item.precio_unitario * (1 - descPct / 100) * ivaFactor, puedeVerMontos, { maximumFractionDigits: 2 })}
                      </span>
                      <button className="btn btn-sm btn-danger" onClick={() => removeItem(i)}>✕</button>
                    </div>
                  ))}
                  <div style={{ marginTop: 8, textAlign: 'right' }}>
                    {descPct > 0 && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Descuento {descPct}%</div>}
                    <div style={{ fontSize: 16, fontWeight: 600 }}>Total: {fmtMonto(total, puedeVerMontos, { maximumFractionDigits: 2 })}</div>
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
                <span style={{ color: 'var(--muted)' }}>Total: {fmtMonto(modalConvertir.total, puedeVerMontos)}</span>
              </div>
              <p>Se creará una <strong>Venta</strong> a partir de este pedido.</p>
              <p style={{ color: 'var(--muted)' }}>La logística comenzará posteriormente desde la Venta.</p>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalConvertir(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarConvertir} disabled={convirtiendo}>
                {convirtiendo ? 'Convirtiendo...' : '✓ Convertir'}
              </button>
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
