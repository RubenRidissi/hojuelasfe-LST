import { useState, useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const EMPTY_FORM = {
  pedidoProveedorId: '', fecha: new Date().toISOString().split('T')[0],
  remitoProveedor: '', notas: '',
  adicionalDesc: '', adicionalMonto: '', adicionalDescTipo: 'pct', adicionalDescValor: ''
}

const EMPTY_AJUSTE = {
  tipo: 'NC', fecha: new Date().toISOString().split('T')[0],
  numero: '', monto: '', recepcionId: '', concepto: ''
}

export default function RecepcionesPage() {
  const { isAdmin } = useAuth()
  const location = useLocation()
  const { toasts, toast } = useToast()

  const [recepciones, setRecepciones] = useState([])
  const [productos, setProductos] = useState([])
  const [ajustes, setAjustes] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal recepción
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [editandoId, setEditandoId] = useState(null)
  const [items, setItems] = useState([])
  const [faltantes, setFaltantes] = useState([])
  const [pedidoInfo, setPedidoInfo] = useState('')
  const [saving, setSaving] = useState(false)

  // Modal fecha confirmación

  // Selector producto en recepción
  const [prodSel, setProdSel] = useState('')
  const [cantInput, setCantInput] = useState('')
  const [bonifInput, setBonifInput] = useState('0')
  const [descTipo, setDescTipo] = useState('pct')
  const [descValor, setDescValor] = useState('')

  // Modal pago proveedor
  const [modalPago, setModalPago] = useState(null) // { recepcionId, total, montoPagado, remito }
  const [pagoCampos, setPagoCampos] = useState({ fecha: new Date().toISOString().split('T')[0], monto: '', medio: 'Transferencia', notas: '' })
  const [savingPago, setSavingPago] = useState(false)

  // Modal ajuste NC/ND proveedor
  const [modalAjuste, setModalAjuste] = useState(false)
  const [ajusteForm, setAjusteForm] = useState(EMPTY_AJUSTE)
  const [savingAjuste, setSavingAjuste] = useState(false)

  // Abrir modal automáticamente si se navega desde ProveedorPage con un pedidoId
  useEffect(() => {
    if (location.state?.pedidoProveedorId) {
      abrirNuevaRecepcion(location.state.pedidoProveedorId)
    }
  }, [location.state])

  useEffect(() => {
    supabase.from('productos').select('id,codigo,nombre,costo').order('codigo')
      .then(({ data }) => setProductos(data || []))
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      await Promise.all([loadRecepciones(), loadAjustes()])
    } finally { setLoading(false) }
  }

  async function loadRecepciones() {
    const { data } = await supabase.from('recepciones')
      .select('*,pedidos_proveedor(numero)')
      .order('created_at', { ascending: false })
    setRecepciones(data || [])
  }

  async function loadAjustes() {
    const { data } = await supabase.from('ajustes_proveedor')
      .select('*,recepciones(numero)')
      .order('fecha', { ascending: false })
    setAjustes(data || [])
  }

  // ===== ABRIR NUEVA RECEPCIÓN =====
  async function abrirNuevaRecepcion(pedidoProveedorId = '') {
    setEditandoId(null)
    setItems([])
    setFaltantes([])
    setForm({ ...EMPTY_FORM, pedidoProveedorId })
    setPedidoInfo('')

    if (pedidoProveedorId) {
      try {
        const { data: pedido } = await supabase.from('pedidos_proveedor').select('numero,proveedor').eq('id', pedidoProveedorId).single()
        setPedidoInfo(`Pedido #${String(pedido.numero).padStart(4, '0')} — ${pedido.proveedor}`)

        // Calcular faltantes
        const { data: itemsPedido } = await supabase.from('pedido_proveedor_items')
          .select('producto_id,cantidad,productos(nombre)')
          .eq('pedido_proveedor_id', pedidoProveedorId)

        const { data: recepsPrevias } = await supabase.from('recepciones').select('id').eq('pedido_proveedor_id', pedidoProveedorId)
        let recibido = {}
        if (recepsPrevias?.length) {
          const ids = recepsPrevias.map(r => r.id)
          const { data: itsRecibidos } = await supabase.from('recepcion_items').select('producto_id,cantidad').in('recepcion_id', ids)
          ;(itsRecibidos || []).forEach(i => { recibido[i.producto_id] = (recibido[i.producto_id] || 0) + i.cantidad })
        }

        setFaltantes((itemsPedido || []).map(item => ({
          nombre: item.productos?.nombre || '—',
          pedido: item.cantidad,
          recibido: recibido[item.producto_id] || 0,
          falta: item.cantidad - (recibido[item.producto_id] || 0)
        })))
      } catch (e) { console.error(e) }
    } else {
      setPedidoInfo('Sin pedido asociado (recepción suelta)')
    }
    setModalOpen(true)
  }

  // ===== EDITAR BORRADOR =====
  async function editarRecepcion(r) {
    try {
      const { data: its } = await supabase.from('recepcion_items')
        .select('*,productos(nombre,codigo,costo)')
        .eq('recepcion_id', r.id)

      setEditandoId(r.id)
      setForm({
        pedidoProveedorId: r.pedido_proveedor_id || '',
        fecha: r.fecha || '',
        remitoProveedor: r.remito_proveedor || '',
        notas: r.notas || '',
        adicionalDesc: r.costo_adicional_desc || '',
        adicionalMonto: r.costo_adicional_monto_bruto || '',
        adicionalDescTipo: 'pct',
        adicionalDescValor: ''
      })
      setItems((its || []).map(i => ({
        producto_id: i.producto_id,
        nombre: i.productos?.nombre || '—',
        cantidad: i.cantidad,
        bonificado: i.bonificado || 0,
        costo_unitario: parseFloat(i.costo_unitario || 0),
        costo_lista: parseFloat(i.costo_lista || i.costo_unitario || 0),
        desc_label: i.desc_label || null
      })))
      setPedidoInfo(r.pedidos_proveedor ? `Pedido #${String(r.pedidos_proveedor.numero).padStart(4, '0')}` : 'Sin pedido asociado')
      setFaltantes([])
      setModalOpen(true)
    } catch (e) { toast('Error al cargar: ' + e.message, 'error') }
  }

  // ===== AGREGAR ITEM =====
  function addItem() {
    if (!prodSel) { toast('Elegí un producto', 'error'); return }
    const cant = parseInt(cantInput)
    const bonif = parseInt(bonifInput) || 0
    if (!cant || cant <= 0) { toast('Ingresá una cantidad válida', 'error'); return }
    if (bonif > cant) { toast('El bonificado no puede superar la cantidad facturada', 'error'); return }
    const prod = productos.find(p => p.id === prodSel)
    if (!prod) return
    const costoLista = prod.costo || 0
    const dv = parseFloat(descValor) || 0
    const costoConDesc = dv > 0
      ? (descTipo === 'pct' ? costoLista * (1 - dv / 100) : Math.max(0, costoLista - dv))
      : costoLista
    const descLabel = dv > 0 ? (descTipo === 'pct' ? `-${dv}%` : `-$${dv}`) : null

    setItems(prev => {
      const existing = prev.find(i => i.producto_id === prodSel)
      if (existing) return prev.map(i => i.producto_id === prodSel
        ? { ...i, cantidad: i.cantidad + cant, bonificado: (i.bonificado || 0) + bonif }
        : i)
      return [...prev, { producto_id: prodSel, nombre: prod.nombre, cantidad: cant, bonificado: bonif, costo_lista: costoLista, costo_unitario: costoConDesc, desc_label: descLabel }]
    })
    setProdSel(''); setCantInput(''); setBonifInput('0'); setDescValor('')
  }

  function removeItem(pid) { setItems(prev => prev.filter(i => i.producto_id !== pid)) }
  function updateCant(pid, val) { setItems(prev => prev.map(i => i.producto_id === pid ? { ...i, cantidad: parseInt(val) || 1 } : i)) }
  function updateBonif(pid, val) {
    const bonif = parseInt(val) || 0
    const item = items.find(i => i.producto_id === pid)
    if (item && bonif > item.cantidad) { toast('El bonificado no puede superar la cantidad', 'error'); return }
    setItems(prev => prev.map(i => i.producto_id === pid ? { ...i, bonificado: bonif } : i))
  }

  // ===== CALCULAR TOTALES =====
  function calcTotales() {
    const subtotal = items.reduce((s, i) => s + i.costo_unitario * (i.cantidad - (i.bonificado || 0)), 0)
    const montoFlete = parseFloat(form.adicionalMonto) || 0
    const dv = parseFloat(form.adicionalDescValor) || 0
    const fleteNeto = montoFlete > 0 && dv > 0
      ? (form.adicionalDescTipo === 'pct' ? montoFlete * (1 - dv / 100) : Math.max(0, montoFlete - dv))
      : montoFlete
    return { subtotal, fleteNeto, total: subtotal + fleteNeto }
  }

  // ===== GUARDAR RECEPCIÓN (borrador) =====
  async function guardarRecepcion(fechaRecepcionReal) {
    if (!items.length) { toast('Agregá al menos un producto recibido', 'error'); return }
    setSaving(true)
    const { subtotal, fleteNeto, total } = calcTotales()
    const montoFlete = parseFloat(form.adicionalMonto) || 0
    try {
      let recepcionId = editandoId
      if (editandoId) {
        await supabase.from('recepcion_items').delete().eq('recepcion_id', editandoId)
        await supabase.from('recepciones').update({
          pedido_proveedor_id: form.pedidoProveedorId || null,
          fecha: form.fecha, fecha_recepcion_real: fechaRecepcionReal,
          remito_proveedor: form.remitoProveedor || null,
          notas: form.notas, total,
          costo_adicional_desc: form.adicionalDesc || null,
          costo_adicional_monto: fleteNeto || 0,
          costo_adicional_monto_bruto: montoFlete || 0
        }).eq('id', editandoId)
      } else {
        const { data: [r] } = await supabase.from('recepciones').insert({
          pedido_proveedor_id: form.pedidoProveedorId || null,
          fecha: form.fecha, fecha_recepcion_real: fechaRecepcionReal,
          remito_proveedor: form.remitoProveedor || null,
          notas: form.notas, total, estado: 'borrador',
          costo_adicional_desc: form.adicionalDesc || null,
          costo_adicional_monto: fleteNeto || 0,
          costo_adicional_monto_bruto: montoFlete || 0
        }).select()
        recepcionId = r.id
      }
      await Promise.all(items.map(item =>
        supabase.from('recepcion_items').insert({
          recepcion_id: recepcionId, producto_id: item.producto_id,
          cantidad: item.cantidad, bonificado: item.bonificado || 0,
          costo_unitario: item.costo_unitario,
          costo_lista: item.costo_lista || item.costo_unitario,
          desc_label: item.desc_label || null
        })
      ))
      toast(editandoId ? 'Borrador actualizado ✓' : 'Recepción guardada como borrador ✓ — confirmala para impactar el stock')
      setModalOpen(false)
      setModalFechaConf(null)
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== CONFIRMAR RECEPCIÓN =====
  async function confirmarRecepcion(id) {
    if (!confirm('¿Confirmar esta recepción? Se va a impactar el stock y no podrás editarla después.')) return
    try {
      const { data: r } = await supabase.from('recepciones').select('*').eq('id', id).single()
      const { data: its } = await supabase.from('recepcion_items').select('*').eq('recepcion_id', id)

      await Promise.all((its || []).map(async item => {
        const bonif = item.bonificado || 0
        await supabase.from('stock_movimientos').insert({
          producto_id: item.producto_id, tipo: 'entrada', origen: 'reposicion',
          cantidad: item.cantidad, referencia_id: id,
          notas: `Recepción #${String(r.numero).padStart(4, '0')}${bonif > 0 ? ` (${bonif} bonif.)` : ''}${r.remito_proveedor ? ` (remito ${r.remito_proveedor})` : ''}`,
          fecha: r.fecha_recepcion_real || r.fecha
        })
        if (bonif > 0) {
          await supabase.from('lotes_muestra').insert({
            producto_id: item.producto_id, recepcion_item_id: item.id,
            cantidad_original: bonif, cantidad_disponible: bonif,
            fecha_ingreso: r.fecha_recepcion_real || r.fecha
          })
        }
      }))

      await supabase.from('recepciones').update({ estado: 'confirmada' }).eq('id', id)

      // Recalcular estado del pedido proveedor
      if (r.pedido_proveedor_id) await recalcularEstadoPedido(r.pedido_proveedor_id)

      toast('Recepción confirmada y stock actualizado ✓')
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setConfirmando(false) }
  }

  async function recalcularEstadoPedido(pedidoId) {
    try {
      const { data: itemsPedido } = await supabase.from('pedido_proveedor_items').select('producto_id,cantidad').eq('pedido_proveedor_id', pedidoId)
      const { data: receps } = await supabase.from('recepciones').select('id').eq('pedido_proveedor_id', pedidoId)
      let recibido = {}
      if (receps?.length) {
        const ids = receps.map(r => r.id)
        const { data: itsRecibidos } = await supabase.from('recepcion_items').select('producto_id,cantidad').in('recepcion_id', ids)
        ;(itsRecibidos || []).forEach(i => { recibido[i.producto_id] = (recibido[i.producto_id] || 0) + i.cantidad })
      }
      const completo = (itemsPedido || []).every(item => (recibido[item.producto_id] || 0) >= item.cantidad)
      await supabase.from('pedidos_proveedor').update({ estado: completo ? 'recibido_completo' : 'recibido_incompleto' }).eq('id', pedidoId)
    } catch (e) { console.error('No se pudo recalcular estado del pedido:', e.message) }
  }

  // ===== ELIMINAR BORRADOR =====
  async function deleteRecepcion(id) {
    if (!confirm('¿Borrar este borrador de recepción?')) return
    try {
      await supabase.from('recepcion_items').delete().eq('recepcion_id', id)
      await supabase.from('recepciones').delete().eq('id', id)
      toast('Borrador eliminado')
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  // ===== PAGO PROVEEDOR =====
  async function savePagoProveedor() {
    if (!pagoCampos.fecha) { toast('Elegí la fecha', 'error'); return }
    if (!pagoCampos.monto || parseFloat(pagoCampos.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    setSavingPago(true)
    try {
      await supabase.from('pagos_proveedor').insert({
        recepcion_id: modalPago.recepcionId, fecha: pagoCampos.fecha,
        monto: parseFloat(pagoCampos.monto), medio: pagoCampos.medio, notas: pagoCampos.notas
      })
      const { data: pagos } = await supabase.from('pagos_proveedor').select('monto').eq('recepcion_id', modalPago.recepcionId)
      const totalPagado = (pagos || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0)
      const { data: r } = await supabase.from('recepciones').select('total').eq('id', modalPago.recepcionId).single()
      const totalRecep = parseFloat(r?.total || 0)
      const nuevoEstado = totalPagado >= totalRecep - 0.01 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente'
      await supabase.from('recepciones').update({ monto_pagado_prov: totalPagado, estado_pago_prov: nuevoEstado }).eq('id', modalPago.recepcionId)
      toast(`Pago registrado ✓ — ${nuevoEstado === 'pagado' ? 'Factura cancelada' : 'Saldo pendiente actualizado'}`)
      setModalPago(null)
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSavingPago(false) }
  }

  // ===== AJUSTE NC/ND PROVEEDOR =====
  async function saveAjusteProveedor() {
    if (!ajusteForm.fecha) { toast('Elegí la fecha', 'error'); return }
    if (!ajusteForm.monto || parseFloat(ajusteForm.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    setSavingAjuste(true)
    try {
      await supabase.from('ajustes_proveedor').insert({
        tipo: ajusteForm.tipo, fecha: ajusteForm.fecha,
        numero_comprobante: ajusteForm.numero || null,
        monto: parseFloat(ajusteForm.monto),
        recepcion_id: ajusteForm.recepcionId || null,
        concepto: ajusteForm.concepto || null
      })
      toast(`${ajusteForm.tipo} registrada ✓`)
      setModalAjuste(false)
      setAjusteForm(EMPTY_AJUSTE)
      loadAjustes()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSavingAjuste(false) }
  }

  async function deleteAjusteProveedor(id) {
    if (!confirm('¿Eliminar este ajuste?')) return
    try {
      await supabase.from('ajustes_proveedor').delete().eq('id', id)
      toast('Ajuste eliminado')
      loadAjustes()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  // ===== RENDER HELPERS =====
  function buildPago(r) {
    if (r.estado === 'borrador') return null
    const saldo = parseFloat(r.total || 0) - parseFloat(r.monto_pagado_prov || 0)
    if (r.estado_pago_prov === 'pagado') return { label: 'Pagado', badge: 'badge-green', saldo: 0 }
    if (r.estado_pago_prov === 'parcial') return { label: 'Parcial', badge: 'badge-yellow', saldo }
    return { label: 'Pendiente', badge: 'badge-red', saldo }
  }

  const { subtotal, fleteNeto, total: totalRecep } = calcTotales()
  const costoPreview = (() => {
    const prod = productos.find(p => p.id === prodSel)
    if (!prod) return null
    const dv = parseFloat(descValor) || 0
    return dv > 0
      ? (descTipo === 'pct' ? prod.costo * (1 - dv / 100) : Math.max(0, prod.costo - dv))
      : prod.costo
  })()

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Recepciones</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => { setAjusteForm(EMPTY_AJUSTE); setModalAjuste(true) }}>± NC/ND Proveedor</button>
          <button className="btn btn-primary" onClick={() => abrirNuevaRecepcion()}>+ Nueva recepción</button>
        </div>
      </div>

      {/* Tabla recepciones desktop */}
      <div className="card desktop-table" style={{ marginBottom: 16 }}>
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : recepciones.length === 0 ? (
          <div className="empty"><div className="empty-icon">📥</div><p>No hay recepciones registradas todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>N°</th><th>Fecha</th><th>Pedido</th><th>Remito</th><th>Total</th><th>Estado</th><th>Pago prov.</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {recepciones.map(r => {
                  const esBorrador = r.estado === 'borrador'
                  const pago = buildPago(r)
                  return (
                    <tr key={r.id}>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>#{String(r.numero).padStart(4, '0')}</td>
                      <td style={{ fontSize: 12 }}>{r.fecha_recepcion_real ? new Date(r.fecha_recepcion_real + 'T00:00:00').toLocaleDateString('es-AR') : '—'}</td>
                      <td>{r.pedidos_proveedor ? `Pedido #${String(r.pedidos_proveedor.numero).padStart(4, '0')}` : <span style={{ color: 'var(--muted)' }}>Suelta</span>}</td>
                      <td style={{ fontSize: 12 }}>{r.remito_proveedor || '—'}</td>
                      <td>${parseFloat(r.total || 0).toLocaleString('es-AR')}</td>
                      <td><span className={`badge ${esBorrador ? 'badge-yellow' : 'badge-green'}`}>{esBorrador ? 'Borrador' : 'Confirmada'}</span></td>
                      <td>
                        {pago ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className={`badge ${pago.badge}`}>{pago.label}</span>
                            {pago.saldo > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Saldo ${pago.saldo.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</span>}
                            {pago.saldo > 0 && (
                              <button className="btn btn-sm btn-success" onClick={() => {
                                setModalPago({ recepcionId: r.id, total: r.total, montoPagado: r.monto_pagado_prov || 0, remito: r.remito_proveedor })
                                setPagoCampos({ fecha: new Date().toISOString().split('T')[0], monto: pago.saldo.toFixed(2), medio: 'Transferencia', notas: '' })
                              }}>💸 Pagar</button>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {esBorrador ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-sm btn-success" onClick={() => confirmarRecepcion(r.id)}>✓ Confirmar</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => editarRecepcion(r)}>✏ Editar</button>
                            <button className="btn btn-sm btn-secondary" onClick={() => toast('Ver — próximamente', 'info')}>👁 Ver</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deleteRecepcion(r.id)}>✕</button>
                          </div>
                        ) : (
                          <button className="btn btn-sm btn-secondary" onClick={() => toast('Ver — próximamente', 'info')}>👁 Ver</button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards mobile recepciones */}
      <div className="mobile-cards cards-grid" style={{ marginBottom: 16 }}>
        {recepciones.map(r => {
          const esBorrador = r.estado === 'borrador'
          const fecha = r.fecha_recepcion_real ? new Date(r.fecha_recepcion_real + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
          const pago = buildPago(r)
          return (
            <div key={r.id} className="op-card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 14 }}>#{String(r.numero).padStart(4, '0')} · {fecha}</div>
                  {r.remito_proveedor && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Remito: {r.remito_proveedor}</div>}
                  {r.pedidos_proveedor ? <div style={{ fontSize: 12, color: 'var(--muted)' }}>Pedido #{String(r.pedidos_proveedor.numero).padStart(4, '0')}</div> : <div style={{ fontSize: 12, color: 'var(--muted)' }}>Recepción suelta</div>}
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>${parseFloat(r.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                  <span className={`badge ${esBorrador ? 'badge-yellow' : 'badge-green'}`} style={{ display: 'inline-block', marginTop: 2 }}>{esBorrador ? 'Borrador' : 'Confirmada'}</span>
                  {pago && <><br /><span className={`badge ${pago.badge}`} style={{ display: 'inline-block', marginTop: 2 }}>{pago.label}</span></>}
                </div>
              </div>
              <div className="op-card-actions" style={{ marginTop: 10 }}>
                {esBorrador ? (
                  <>
                    <button className="btn btn-success" style={{ flex: 1 }} onClick={() => confirmarRecepcion(r.id)}>✓ Confirmar</button>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => editarRecepcion(r)}>✏ Editar</button>
                    <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => deleteRecepcion(r.id)}>✕</button>
                  </>
                ) : (
                  <>
                    {pago?.saldo > 0 && <button className="btn btn-success" style={{ flex: 1 }} onClick={() => {
                      setModalPago({ recepcionId: r.id, total: r.total, montoPagado: r.monto_pagado_prov || 0, remito: r.remito_proveedor })
                      setPagoCampos({ fecha: new Date().toISOString().split('T')[0], monto: pago.saldo.toFixed(2), medio: 'Transferencia', notas: '' })
                    }}>💸 Pagar</button>}
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => toast('Ver — próximamente', 'info')}>👁 Ver</button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Ajustes NC/ND proveedor */}
      {(true && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>± Notas de Crédito / Débito del Proveedor</div>
          <div className="table-wrap desktop-table">
            <table>
              <thead><tr><th>Tipo</th><th>Fecha</th><th>N° Comp.</th><th>Recepción</th><th>Monto</th><th>Concepto</th><th></th></tr></thead>
              <tbody>
                {ajustes.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:16, color:'var(--muted)' }}>Sin ajustes registrados</td></tr>
                ) : ajustes.map(a => (
                  <tr key={a.id}>
                    <td><span className={`badge ${a.tipo === 'NC' ? 'badge-green' : 'badge-red'}`}>{a.tipo}</span></td>
                    <td style={{ fontSize: 12 }}>{new Date(a.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.numero_comprobante || '—'}</td>
                    <td style={{ fontSize: 12 }}>{a.recepciones ? `#${String(a.recepciones.numero).padStart(4, '0')}` : '—'}</td>
                    <td><strong style={{ color: a.tipo === 'NC' ? 'var(--success)' : '#DC2626' }}>{a.tipo === 'NC' ? '-' : '+'}${parseFloat(a.monto).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{a.concepto || '—'}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => deleteAjusteProveedor(a.id)}>🗑</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mobile-cards cards-grid" style={{ padding: 12 }}>
            {ajustes.map(a => {
              const esNC = a.tipo === 'NC'
              return (
                <div key={a.id} className="op-card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                        <span className={`badge ${esNC ? 'badge-green' : 'badge-red'}`}>{a.tipo}</span>
                        <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(a.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' })}</span>
                      </div>
                      {a.recepciones && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Recepción #{String(a.recepciones.numero).padStart(4, '0')}</div>}
                      {a.concepto && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{a.concepto}</div>}
                    </div>
                    <div style={{ fontSize: 20, fontWeight: 700, color: esNC ? 'var(--success)' : '#DC2626' }}>
                      {esNC ? '−' : '+'}${parseFloat(a.monto).toLocaleString('es-AR', { maximumFractionDigits: 0 })}
                    </div>
                  </div>
                  <div className="op-card-actions" style={{ marginTop: 8 }}>
                    <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => deleteAjusteProveedor(a.id)}>🗑 Eliminar</button>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ===== MODAL RECEPCIÓN ===== */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 760 }}>
            <div className="modal-header">
              <h2>{editandoId ? 'Editar borrador de recepción' : 'Nueva recepción'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              {pedidoInfo && <div style={{ background: 'var(--bg)', padding: '8px 12px', borderRadius: 8, marginBottom: 12, fontSize: 13, color: 'var(--muted)' }}>{pedidoInfo}</div>}

              {/* Faltantes */}
              {faltantes.length > 0 && (
                <div style={{ background: '#FEF9C3', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8 }}>Pendiente de recibir:</div>
                  <table style={{ width: '100%', fontSize: 12 }}>
                    <thead><tr><th style={{ textAlign: 'left', color: 'var(--muted)' }}>Producto</th><th style={{ textAlign: 'center', color: 'var(--muted)' }}>Pedido</th><th style={{ textAlign: 'center', color: 'var(--muted)' }}>Recibido</th><th style={{ textAlign: 'center', color: 'var(--muted)' }}>Falta</th></tr></thead>
                    <tbody>
                      {faltantes.map((f, i) => (
                        <tr key={i}>
                          <td>{f.nombre}</td>
                          <td style={{ textAlign: 'center' }}>{f.pedido}</td>
                          <td style={{ textAlign: 'center' }}>{f.recibido}</td>
                          <td style={{ textAlign: 'center', fontWeight: 600, color: f.falta > 0 ? '#B91C1C' : '#15803D' }}>{f.falta > 0 ? f.falta : '✓ completo'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Fecha programada</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Remito del proveedor</label>
                  <input value={form.remitoProveedor} onChange={e => setForm(f => ({ ...f, remitoProveedor: e.target.value }))} placeholder="Ej: 0001-00001234" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Notas</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
              </div>

              {/* Agregar producto */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Agregar producto recibido</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                  <select value={prodSel} onChange={e => setProdSel(e.target.value)} style={{ flex: 3, minWidth: 180 }}>
                    <option value="">Elegí un producto</option>
                    {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</option>)}
                  </select>
                  <input type="number" min="1" value={cantInput} onChange={e => setCantInput(e.target.value)} style={{ width: 80 }} placeholder="Cant." />
                  <input type="number" min="0" value={bonifInput} onChange={e => setBonifInput(e.target.value)} style={{ width: 80 }} placeholder="Bonif." />
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <select value={descTipo} onChange={e => setDescTipo(e.target.value)} style={{ width: 100 }}>
                    <option value="pct">% desc.</option>
                    <option value="monto">$ desc.</option>
                  </select>
                  <input type="number" min="0" value={descValor} onChange={e => setDescValor(e.target.value)} style={{ width: 80 }} placeholder="Valor" />
                  {costoPreview !== null && <span style={{ fontSize: 12, color: 'var(--muted)' }}>Costo final: ${costoPreview.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>}
                  <button className="btn btn-primary" onClick={addItem}>+ Agregar</button>
                </div>
              </div>

              {/* Items */}
              {items.length > 0 && (
                <div className="table-wrap" style={{ marginBottom: 12 }}>
                  <table>
                    <thead><tr><th>Producto</th><th style={{ textAlign: 'center' }}>Cant.</th><th style={{ textAlign: 'center' }}>Bonif.</th><th style={{ textAlign: 'center' }}>Total físico</th><th style={{ textAlign: 'right' }}>Costo lista</th><th style={{ textAlign: 'center' }}>Desc.</th><th style={{ textAlign: 'right' }}>Costo final</th><th></th></tr></thead>
                    <tbody>
                      {items.map(i => {
                        const totalFisico = i.cantidad
                        return (
                          <tr key={i.producto_id}>
                            <td style={{ fontSize: 13 }}>{i.nombre}</td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="number" value={i.cantidad} min="1" style={{ width: 65, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6 }} onChange={e => updateCant(i.producto_id, e.target.value)} />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <input type="number" value={i.bonificado || 0} min="0" style={{ width: 65, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, color: '#15803D' }} onChange={e => updateBonif(i.producto_id, e.target.value)} />
                            </td>
                            <td style={{ textAlign: 'center', fontSize: 13 }}>{totalFisico}{i.bonificado > 0 && <span style={{ color: '#15803D', fontSize: 11 }}> 🎁{i.bonificado} bonif.</span>}</td>
                            <td style={{ textAlign: 'right', fontSize: 13, color: 'var(--muted)' }}>${(i.costo_lista || i.costo_unitario).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                            <td style={{ textAlign: 'center', fontSize: 12 }}>{i.desc_label || '—'}</td>
                            <td style={{ textAlign: 'right', fontSize: 13, fontWeight: 600, color: '#15803D' }}>${i.costo_unitario.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                            <td><button className="btn btn-sm btn-danger" onClick={() => removeItem(i.producto_id)}>✕</button></td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Costo adicional (flete) */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Costo adicional (flete, etc.)</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <input value={form.adicionalDesc} onChange={e => setForm(f => ({ ...f, adicionalDesc: e.target.value }))} placeholder="Descripción (ej: Flete)" style={{ flex: 2 }} />
                  <input type="number" min="0" value={form.adicionalMonto} onChange={e => setForm(f => ({ ...f, adicionalMonto: e.target.value }))} placeholder="Monto bruto" style={{ width: 110 }} />
                  <select value={form.adicionalDescTipo} onChange={e => setForm(f => ({ ...f, adicionalDescTipo: e.target.value }))} style={{ width: 100 }}>
                    <option value="pct">% desc.</option>
                    <option value="monto">$ desc.</option>
                  </select>
                  <input type="number" min="0" value={form.adicionalDescValor} onChange={e => setForm(f => ({ ...f, adicionalDescValor: e.target.value }))} placeholder="Desc." style={{ width: 80 }} />
                  <span style={{ fontSize: 13, alignSelf: 'center' }}>Neto: ${fleteNeto.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                </div>
              </div>

              <div style={{ textAlign: 'right', fontSize: 16, fontWeight: 700 }}>
                Total: ${totalRecep.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                if (!items.length) { toast('Agregá al menos un producto', 'error'); return }
                const fecha = form.fecha || new Date().toISOString().split('T')[0]
                guardarRecepcion(fecha)
              }} disabled={saving}>{saving ? 'Guardando...' : 'Guardar borrador'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL PAGO PROVEEDOR ===== */}
      {modalPago && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalPago(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Pago a proveedor</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalPago(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 16, fontSize: 13 }}>
                Total factura: <strong>${parseFloat(modalPago.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
                {parseFloat(modalPago.montoPagado || 0) > 0 && <> · Ya pagado: <strong>${parseFloat(modalPago.montoPagado).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong></>}
                {' · '}<span style={{ color: '#DC2626', fontWeight: 600 }}>Saldo: ${(parseFloat(modalPago.total || 0) - parseFloat(modalPago.montoPagado || 0)).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                {modalPago.remito && <><br /><span style={{ fontSize: 11, color: 'var(--muted)' }}>Remito: {modalPago.remito}</span></>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={pagoCampos.fecha} onChange={e => setPagoCampos(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Monto *</label>
                  <input type="number" min="0" step="0.01" value={pagoCampos.monto} onChange={e => setPagoCampos(f => ({ ...f, monto: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Medio</label>
                  <select value={pagoCampos.medio} onChange={e => setPagoCampos(f => ({ ...f, medio: e.target.value }))}>
                    {['Transferencia','Efectivo','Cheque','Otro'].map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notas</label>
                  <input value={pagoCampos.notas} onChange={e => setPagoCampos(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalPago(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePagoProveedor} disabled={savingPago}>{savingPago ? 'Guardando...' : 'Registrar pago'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL AJUSTE NC/ND PROVEEDOR ===== */}
      {modalAjuste && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalAjuste(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{ajusteForm.tipo === 'NC' ? 'Nueva Nota de Crédito' : 'Nueva Nota de Débito'} — Proveedor</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalAjuste(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Tipo</label>
                <select value={ajusteForm.tipo} onChange={e => setAjusteForm(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="NC">NC — Nota de Crédito (reduce deuda)</option>
                  <option value="ND">ND — Nota de Débito (aumenta deuda)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Recepción asociada</label>
                <select value={ajusteForm.recepcionId} onChange={e => setAjusteForm(f => ({ ...f, recepcionId: e.target.value }))}>
                  <option value="">Sin recepción asociada</option>
                  {recepciones.filter(r => r.estado === 'confirmada').map(r => (
                    <option key={r.id} value={r.id}>#{String(r.numero).padStart(4, '0')} — {r.fecha_recepcion_real || ''}{r.remito_proveedor ? ` (${r.remito_proveedor})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={ajusteForm.fecha} onChange={e => setAjusteForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Monto *</label>
                  <input type="number" min="0" step="0.01" value={ajusteForm.monto} onChange={e => setAjusteForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>N° Comprobante</label>
                <input value={ajusteForm.numero} onChange={e => setAjusteForm(f => ({ ...f, numero: e.target.value }))} placeholder="Ej: NC-0001-00012345" />
              </div>
              <div className="form-group">
                <label>Concepto</label>
                <input value={ajusteForm.concepto} onChange={e => setAjusteForm(f => ({ ...f, concepto: e.target.value }))} placeholder="Motivo del ajuste..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalAjuste(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAjusteProveedor} disabled={savingAjuste}>{savingAjuste ? 'Registrando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
