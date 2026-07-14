import { useState, useEffect } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente, hoyAR } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { useComprobante, ComprobanteModal } from '../hooks/useComprobante.jsx'
import { fmtMonto } from '../utils/money'
import { recalcularEstadoVenta, recalcularEstadoVentas } from '../services/ventasService'

const MEDIOS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'transferencia', label: 'Transferencia' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'otro', label: 'Otro' }
]

const medioLabel = (value) => MEDIOS.find(m => m.value === value)?.label || value || '—'

function numeroVentaLabel(pago) {
  const numeros = (pago.pago_ventas || [])
    .map(pv => pv.ventas?.numero)
    .filter(Boolean)
  if (!numeros.length) return '—'
  return numeros.map(n => `#${String(n).padStart(6, '0')}`).join(', ')
}

function getEstadoCobro(pago) {
  const imputaciones = pago.pago_ventas || []
  const totalImputado = imputaciones.reduce((s, x) => s + parseFloat(x.monto_aplicado || 0), 0)
  const monto = parseFloat(pago.monto || 0)

  if (imputaciones.length === 0 || totalImputado <= 0.01) {
    return { key: 'cuenta', label: 'A cuenta', badge: 'badge-yellow', icon: '○', totalImputado }
  }

  if (totalImputado >= monto - 0.01) {
    return { key: 'imputado', label: 'Imputado', badge: 'badge-green', icon: '✓', totalImputado }
  }

  return { key: 'parcial', label: 'Con saldo a cuenta', badge: 'badge-blue', icon: '◐', totalImputado }
}

const EMPTY_FORM = {
  clienteId: '', fecha: hoyAR(),
  monto: '', medio: 'efectivo', notas: '', centroCosto: 'CC2'
}

const EMPTY_EDIT = {
  id: '', clienteId: '', fecha: '', monto: '', medio: 'efectivo', notas: ''
}

export default function PagosPage() {
  const { user, isAdmin, puedeVerMontos } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const { toasts, toast } = useToast()
  const { comp, cerrarComp, imprimir, descargar, verReciboPago } = useComprobante()

  const [pagos, setPagos] = useState([])
  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros
  const [filtroCliente, setFiltroCliente] = useState('')
  const [filtroVendedor, setFiltroVendedor] = useState('')

  // Modal nuevo pago
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [ventasPendientes, setVentasPendientes] = useState([])
  const [imputaciones, setImputaciones] = useState({}) // { venta_id: monto }
  const [saving, setSaving] = useState(false)

  // Modal editar pago (solo admin)
  const [modalEdit, setModalEdit] = useState(false)
  const [editForm, setEditForm] = useState(EMPTY_EDIT)
  const [savingEdit, setSavingEdit] = useState(false)

  // Modal detalle de imputaciones
  const [detallePago, setDetallePago] = useState(null)

  // Modal imputar cobro existente (a cuenta / con saldo) a una venta
  const [modalImputar, setModalImputar] = useState(null) // pago
  const [ventasParaImputar, setVentasParaImputar] = useState([])
  const [nuevasImputaciones, setNuevasImputaciones] = useState({}) // { venta_id: { checked, monto, saldo } }
  const [imputando, setImputando] = useState(false)

  useEffect(() => { loadAll() }, [])

  // Llegada desde "💰 Cobrar" en Ventas: abre el modal con el cliente y la venta preseleccionados
  useEffect(() => {
    const { clienteId, ventaId } = location.state || {}
    if (!clienteId) return
    setForm(f => ({ ...EMPTY_FORM, fecha: hoyAR(), clienteId }))
    cargarVentasPendientes(clienteId, ventaId)
    setModalOpen(true)
    navigate(location.pathname, { replace: true, state: null })
  }, [location.state])

  useEffect(() => {
    const abrirDesdeFab = () => {
      setForm({ ...EMPTY_FORM, fecha: hoyAR() })
      setVentasPendientes([])
      setImputaciones({})
      setModalOpen(true)
    }
    window.addEventListener('fab:nuevo-cobro', abrirDesdeFab)
    return () => window.removeEventListener('fab:nuevo-cobro', abrirDesdeFab)
  }, [])


  async function loadAll() {
    try {
      const [{ data: v }, { data: c }] = await Promise.all([
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('clientes').select('id,nombre,nombre_fantasia,vendedor_id,estado_cliente').order('nombre'),
      ])
      setVendedores(v || [])
      setClientes(c || [])
    } catch (e) { console.error(e) }
    loadPagos()
  }

  async function loadPagos() {
    setLoading(true)
    try {
      let q = supabase.from('pagos')
        .select('id,numero,fecha,monto,medio,notas,vendedor_id,centro_costo,clientes(id,nombre,nombre_fantasia),pago_ventas(venta_id,monto_aplicado,ventas(numero,fecha,total))')
        .order('created_at', { ascending: false })

      if (!isAdmin) q = q.eq('vendedor_id', user)
      if (isAdmin && filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      if (filtroCliente) q = q.eq('cliente_id', filtroCliente)

      const { data } = await q
      setPagos(data || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { loadPagos() }, [filtroCliente, filtroVendedor])

  // Neteo de NC/ND por venta: NC resta al saldo adeudado, ND suma.
  async function fetchAjustesNetos(clienteId) {
    const { data } = await supabase.from('ajustes_cliente').select('venta_id,tipo,monto').eq('cliente_id', clienteId)
    const map = {}
    ;(data || []).forEach(a => {
      const signo = a.tipo === 'NC' ? -1 : 1
      map[a.venta_id] = (map[a.venta_id] || 0) + signo * parseFloat(a.monto || 0)
    })
    return map
  }

  // ===== CARGAR VENTAS PENDIENTES AL SELECCIONAR CLIENTE =====
  async function cargarVentasPendientes(clienteId, preseleccionarVentaId = null) {
    if (!clienteId) { setVentasPendientes([]); setImputaciones({}); return }
    try {
      const [{ data }, ajustesNetos] = await Promise.all([
        supabase.from('ventas')
          .select('id,fecha,total,monto_pagado,estado_pago,notas,modalidad_factura')
          .eq('cliente_id', clienteId)
          .neq('estado_pago', 'pagado')
          .neq('estado', 'anulada')
          .order('fecha', { ascending: true }),
        fetchAjustesNetos(clienteId)
      ])

      const ventas = (data || []).map(v => ({ ...v, ajusteNeto: ajustesNetos[v.id] || 0 }))
      setVentasPendientes(ventas)
      // Pre-cargar montos de imputación con el saldo de cada venta (neto de NC/ND)
      const imp = {}
      ventas.forEach(v => {
        const saldo = parseFloat(v.total || 0) + v.ajusteNeto - parseFloat(v.monto_pagado || 0)
        imp[v.id] = { checked: v.id === preseleccionarVentaId, monto: Math.max(0, saldo).toFixed(2), saldo }
      })
      setImputaciones(imp)

      if (preseleccionarVentaId && imp[preseleccionarVentaId]) {
        setForm(f => ({ ...f, monto: imp[preseleccionarVentaId].monto }))
      }
    } catch (e) { console.error(e) }
  }

  function toggleImputacion(ventaId) {
    setImputaciones(prev => ({
      ...prev,
      [ventaId]: { ...prev[ventaId], checked: !prev[ventaId].checked }
    }))
  }

  function setMontoImputacion(ventaId, monto) {
    setImputaciones(prev => ({
      ...prev,
      [ventaId]: { ...prev[ventaId], monto }
    }))
  }

  // Cálculos de imputación
  const totalImputado = Object.values(imputaciones)
    .filter(i => i.checked)
    .reduce((s, i) => s + parseFloat(i.monto || 0), 0)
  const montoCobrado = parseFloat(form.monto || 0)
  const saldoCuenta = montoCobrado - totalImputado
  const imputacionesActivas = Object.entries(imputaciones).filter(([, v]) => v.checked)
  const ventasImputadas = imputacionesActivas
    .map(([id]) => ventasPendientes.find(v => v.id === id))
    .filter(Boolean)

  const tieneVentasConFactura = ventasImputadas.some(v => v.modalidad_factura === 'con_iva')
  const tieneVentasSinFactura = ventasImputadas.some(v => v.modalidad_factura === 'sin_iva' || !v.modalidad_factura)
  const pagoMixto = tieneVentasConFactura && tieneVentasSinFactura
  const soloSinFactura = ventasImputadas.length > 0 && tieneVentasSinFactura && !tieneVentasConFactura
  const pagoACuentaSinFactura = imputacionesActivas.length === 0 && form.centroCosto === 'CC2'
  const medioPagoForzadoEfectivo = soloSinFactura || pagoACuentaSinFactura

  const mostrarCC = saldoCuenta > 0.01

  // ===== GUARDAR PAGO =====
  async function savePago() {
    if (!form.clienteId) { toast('Seleccioná un cliente', 'error'); return }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    if (totalImputado > montoCobrado + 0.01) { toast('El total imputado supera el monto cobrado', 'error'); return }

    setSaving(true)
    try {
      // Determinar centro de costo y reglas de medio de pago
      let centroCosto = form.centroCosto
      let medioPago = form.medio

      if (imputacionesActivas.length > 0) {
        const ventaIds = imputacionesActivas.map(([id]) => id)

        const { data: vents, error: ventasError } = await supabase
          .from('ventas')
          .select('id,modalidad_factura')
          .in('id', ventaIds)

        if (ventasError) throw ventasError

        const tieneBlanco = (vents || []).some(v => v.modalidad_factura === 'con_iva')
        const tieneNegro = (vents || []).some(v => v.modalidad_factura === 'sin_iva' || !v.modalidad_factura)

        if (tieneBlanco && tieneNegro) {
          toast('No mezcles ventas con factura y sin factura en el mismo cobro. Registrá dos cobros separados.', 'error')
          setSaving(false)
          return
        }

        if (tieneNegro) {
          centroCosto = 'CC2'
          medioPago = 'efectivo'
        } else {
          centroCosto = 'CC1'
        }
      } else if (centroCosto === 'CC2') {
        // Pago a cuenta sin factura: solo efectivo.
        medioPago = 'efectivo'
      }

      const cliente = clientes.find(c => c.id === form.clienteId)
      const vendedorId = cliente?.vendedor_id || user

      const { data, error } = await supabase.from('pagos').insert({
        cliente_id: form.clienteId,
        fecha: form.fecha,
        monto: parseFloat(form.monto),
        medio: medioPago,
        notas: form.notas,
        vendedor_id: vendedorId,
        centro_costo: centroCosto
      }).select()

      if (error) throw error

      const pago = data?.[0]
      if (!pago) throw new Error('No se pudo registrar el cobro.')

      // Registrar imputaciones y actualizar estado de cada venta
      const imputacionesValidas = imputacionesActivas.filter(([, imp]) => parseFloat(imp.monto || 0) > 0)
      if (imputacionesValidas.length) {
        const { error: impError } = await supabase.from('pago_ventas').insert(
          imputacionesValidas.map(([ventaId, imp]) => ({ pago_id: pago.id, venta_id: ventaId, monto_aplicado: parseFloat(imp.monto || 0) }))
        )
        if (impError) throw impError

        await recalcularEstadoVentas(imputacionesValidas.map(([ventaId]) => ventaId))
      }

      toast(imputacionesActivas.length
        ? `Cobro registrado (${centroCosto}) e imputado a ${imputacionesActivas.length} venta(s) ✓`
        : `Cobro registrado como pago a cuenta (${centroCosto}) ✓`)

      setModalOpen(false)
      setForm({ ...EMPTY_FORM, fecha: hoyAR() })
      setVentasPendientes([])
      setImputaciones({})
      loadPagos()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== EDITAR PAGO (admin) =====
  function abrirEdit(p) {
    setEditForm({
      id: p.id,
      clienteId: p.clientes?.id || '',
      fecha: p.fecha,
      monto: p.monto,
      medio: p.medio,
      notas: p.notas || ''
    })
    setModalEdit(true)
  }

  async function updatePago() {
    if (!editForm.fecha || !editForm.monto || parseFloat(editForm.monto) <= 0) {
      toast('Completá fecha y monto', 'error'); return
    }
    setSavingEdit(true)
    try {
      await supabase.from('pagos').update({
        cliente_id: editForm.clienteId || null,
        fecha: editForm.fecha,
        monto: parseFloat(editForm.monto),
        medio: editForm.medio,
        notas: editForm.notas.trim()
      }).eq('id', editForm.id)
      toast('Cobro actualizado')
      setModalEdit(false)
      loadPagos()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSavingEdit(false) }
  }

  // ===== ANULAR COBRO =====
  async function deletePago(id) {
    if (!isAdmin) { toast('Solo un administrador puede anular cobros.', 'error'); return }
    if (!confirm('¿Anular este cobro?\n\nSe deshará la imputación y se actualizará el estado de pago de la venta asociada.')) return

    try {
      // Buscar imputaciones del cobro
      const { data: imputacionesPago, error: impReadError } = await supabase
        .from('pago_ventas')
        .select('venta_id,monto_aplicado')
        .eq('pago_id', id)

      if (impReadError) throw impReadError

      // Caso 1: pago imputado a varias ventas. No anulamos en RC1.
      if ((imputacionesPago || []).length > 1) {
        toast('Este cobro está imputado a varias ventas. Anulación múltiple pendiente para RC2.', 'error')
        return
      }

      const ventaId = imputacionesPago?.[0]?.venta_id || null

      // Caso 2: pago imputado a una venta
      if (ventaId) {
        const { error: delImpError } = await supabase
          .from('pago_ventas')
          .delete()
          .eq('pago_id', id)

        if (delImpError) throw delImpError

        await recalcularEstadoVenta(ventaId)
      }

      // Caso 3: pago a cuenta sin imputación, o ya desimputado arriba.
      const { error: delPagoError } = await supabase
        .from('pagos')
        .delete()
        .eq('id', id)

      if (delPagoError) throw delPagoError

      toast(ventaId ? 'Cobro anulado y venta actualizada.' : 'Pago a cuenta anulado.')
      loadPagos()
    } catch (e) {
      toast('Error al anular cobro: ' + e.message, 'error')
    }
  }

  async function handleReciboPago(id) {
    try { await verReciboPago(id) } catch (e) { toast('Error al generar recibo: ' + e.message, 'error') }
  }

  // ===== IMPUTAR COBRO EXISTENTE A UNA VENTA =====
  async function abrirImputar(p) {
    const clienteId = p.clientes?.id
    if (!clienteId) { toast('Este cobro no tiene cliente asociado.', 'error'); return }

    try {
      const [{ data }, ajustesNetos] = await Promise.all([
        supabase.from('ventas')
          .select('id,fecha,total,monto_pagado,estado_pago,notas,modalidad_factura')
          .eq('cliente_id', clienteId)
          .neq('estado_pago', 'pagado')
          .neq('estado', 'anulada')
          .order('fecha', { ascending: true }),
        fetchAjustesNetos(clienteId)
      ])

      // El cobro ya tiene un centro de costo fijo (CC1=con factura, CC2=sin factura/efectivo);
      // solo se puede seguir imputando a ventas del mismo tipo para no mezclar.
      const modalidadEsperada = p.centro_costo === 'CC1' ? 'con_iva' : 'sin_iva'
      const filtradas = (data || [])
        .map(v => ({ ...v, ajusteNeto: ajustesNetos[v.id] || 0 }))
        .filter(v => (v.modalidad_factura || 'sin_iva') === modalidadEsperada)

      const imp = {}
      filtradas.forEach(v => {
        const saldo = parseFloat(v.total || 0) + v.ajusteNeto - parseFloat(v.monto_pagado || 0)
        imp[v.id] = { checked: false, monto: Math.max(0, saldo).toFixed(2), saldo }
      })

      setVentasParaImputar(filtradas)
      setNuevasImputaciones(imp)
      setModalImputar(p)
    } catch (e) {
      toast('Error al buscar ventas pendientes: ' + e.message, 'error')
    }
  }

  const disponibleImputar = modalImputar ? parseFloat(modalImputar.monto || 0) - getEstadoCobro(modalImputar).totalImputado : 0
  const nuevasImputacionesActivas = Object.entries(nuevasImputaciones).filter(([, v]) => v.checked)
  const totalNuevasImputaciones = nuevasImputacionesActivas.reduce((s, [, v]) => s + parseFloat(v.monto || 0), 0)
  const excedeDisponible = totalNuevasImputaciones > disponibleImputar + 0.01

  function toggleNuevaImputacion(ventaId) {
    setNuevasImputaciones(prev => ({ ...prev, [ventaId]: { ...prev[ventaId], checked: !prev[ventaId].checked } }))
  }

  function setMontoNuevaImputacion(ventaId, monto) {
    setNuevasImputaciones(prev => ({ ...prev, [ventaId]: { ...prev[ventaId], monto } }))
  }

  async function confirmarImputar() {
    if (!modalImputar) return
    if (!nuevasImputacionesActivas.length) { toast('Seleccioná al menos una venta', 'error'); return }
    if (excedeDisponible) { toast('El total a imputar supera el saldo disponible del cobro', 'error'); return }

    setImputando(true)
    try {
      const imputacionesValidas = nuevasImputacionesActivas.filter(([, imp]) => parseFloat(imp.monto || 0) > 0)
      if (imputacionesValidas.length) {
        const { error } = await supabase.from('pago_ventas').insert(
          imputacionesValidas.map(([ventaId, imp]) => ({ pago_id: modalImputar.id, venta_id: ventaId, monto_aplicado: parseFloat(imp.monto || 0) }))
        )
        if (error) throw error

        await recalcularEstadoVentas(imputacionesValidas.map(([ventaId]) => ventaId))
      }

      toast('Imputación registrada ✓')
      setModalImputar(null)
      loadPagos()
    } catch (e) {
      toast('Error al imputar: ' + e.message, 'error')
    } finally {
      setImputando(false)
    }
  }

  const misClientes = isAdmin ? clientes : clientes.filter(c => c.vendedor_id === user)
  const misClientesActivos = isAdmin ? clientes : clientes.filter(c => c.vendedor_id === user && c.estado_cliente === 'Activo')

  return (
    <div>
      <style data-rc1-mobile-hide>{`@media (max-width: 768px){ .mobile-hide{ display:none !important; } }`}</style>
      <div className="page-header">
        <h1 className="page-title">Cobros</h1>
        <div className="page-header-actions">
          <button className="mobile-hide btn btn-primary" onClick={() => { setForm({ ...EMPTY_FORM, fecha: hoyAR() }); setVentasPendientes([]); setImputaciones({}); setModalOpen(true) }}>
            + Registrar cobro
          </button>
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
        ) : pagos.length === 0 ? (
          <div className="empty"><div className="empty-icon">💰</div><p>No hay cobros registrados</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Nº Venta</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'right' }}>Monto</th>
                  <th>Estado</th>
                  <th>Medio</th>
                  <th>CC</th>
                  {isAdmin && <th>Vendedor</th>}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => {
                  const ccBadge = p.centro_costo === 'CC1'
                    ? <span className="badge badge-blue">CC1</span>
                    : <span className="badge badge-gray">CC2</span>
                  const estadoCobro = getEstadoCobro(p)
                  const vendedorNombre = vendedores.find(v => v.user_id === p.vendedor_id)?.nombre || '—'
                  return (
                    <tr key={p.id}>
                      <td>{p.fecha}</td>
                      <td style={{ fontSize: 12, color: 'var(--muted)' }}>{numeroVentaLabel(p)}</td>
                      <td>{p.clientes ? nombreCliente(p.clientes) : '—'}</td>
                      <td style={{ textAlign: 'right' }}><strong>{fmtMonto(p.monto, puedeVerMontos, { maximumFractionDigits: 2 })}</strong></td>
                      <td>
                        <button
                          className={`badge ${estadoCobro.badge}`}
                          onClick={() => setDetallePago(p)}
                          style={{ border: 0, cursor: 'pointer' }}
                          title="Ver detalle"
                        >
                          {estadoCobro.icon} {estadoCobro.label}
                        </button>
                      </td>
                      <td><span className="badge badge-blue">{medioLabel(p.medio)}</span></td>
                      <td>{ccBadge}</td>
                      {isAdmin && <td style={{ fontSize: 12, color: 'var(--muted)' }}>{vendedorNombre}</td>}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => handleReciboPago(p.id)}>🧾 Recibo</button>
                          {estadoCobro.key !== 'imputado' && (
                            <button className="btn btn-sm" style={{ background: '#E0E7FF', color: '#4338CA' }} onClick={() => abrirImputar(p)}>🔗 Imputar</button>
                          )}
                          {isAdmin && <>
                            {estadoCobro.key === 'cuenta' && (
                              <button className="btn btn-sm btn-secondary" onClick={() => abrirEdit(p)}>✏</button>
                            )}
                            <button className="btn btn-sm btn-danger" onClick={() => deletePago(p.id)}>↩ Anular</button>
                          </>}
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
        ) : pagos.length === 0 ? (
          <div className="empty"><div className="empty-icon">💰</div><p>No hay cobros registrados</p></div>
        ) : pagos.map(p => {
          const fechaCorta = p.fecha ? new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'
          const ccBadge = p.centro_costo === 'CC1'
            ? <span className="badge badge-blue">CC1</span>
            : <span className="badge badge-gray">CC2</span>
          const estadoCobro = getEstadoCobro(p)
          return (
            <div key={p.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-fecha">{fechaCorta}</span>
                <span className="badge badge-blue">{medioLabel(p.medio)}</span>
                <button
                  className={`badge ${estadoCobro.badge}`}
                  onClick={() => setDetallePago(p)}
                  style={{ border: 0, cursor: 'pointer' }}
                >
                  {estadoCobro.icon} {estadoCobro.label}
                </button>
                {ccBadge}
              </div>
              <div className="op-card-cliente">{p.clientes ? nombreCliente(p.clientes) : '—'} <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>{numeroVentaLabel(p)}</span></div>
              <div className="op-card-total" style={{ color: 'var(--success)' }}>{fmtMonto(p.monto, puedeVerMontos, { maximumFractionDigits: 2 })}</div>
              <div className="op-card-actions" style={{ marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => handleReciboPago(p.id)}>🧾 Recibo</button>
                {estadoCobro.key !== 'imputado' && (
                  <button className="btn" style={{ background: '#E0E7FF', color: '#4338CA' }} onClick={() => abrirImputar(p)}>🔗 Imputar</button>
                )}
                {isAdmin && <>
                  {estadoCobro.key === 'cuenta' && (
                    <button className="btn btn-secondary" onClick={() => abrirEdit(p)}>✏ Editar</button>
                  )}
                  <button className="btn btn-danger" onClick={() => deletePago(p.id)}>↩ Anular</button>
                </>}
              </div>
            </div>
          )
        })}
      </div>

      {/* ===== MODAL NUEVO COBRO ===== */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Registrar cobro</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente *</label>
                  <select value={form.clienteId} onChange={e => {
                    setForm(f => ({ ...f, clienteId: e.target.value }))
                    cargarVentasPendientes(e.target.value)
                  }}>
                    <option value="">— Elegí un cliente —</option>
                    {misClientesActivos.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Monto *</label>
                  <input type="number" min="0" step="0.01" value={form.monto}
                    onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
                </div>
                <div className="form-group">
                  <label>Medio de pago</label>
                  <select
                    value={medioPagoForzadoEfectivo ? 'efectivo' : form.medio}
                    disabled={medioPagoForzadoEfectivo}
                    onChange={e => setForm(f => ({ ...f, medio: e.target.value }))}
                  >
                    {(medioPagoForzadoEfectivo ? [{ value: 'efectivo', label: 'Efectivo' }] : MEDIOS).map(m => (
                      <option key={m.value} value={m.value}>{m.label}</option>
                    ))}
                  </select>
                  {medioPagoForzadoEfectivo && (
                    <div style={{ fontSize: 11, color: 'var(--muted)', marginTop: 4 }}>
                      Sin factura: solo efectivo.
                    </div>
                  )}
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Notas</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
              </div>

              {/* Ventas pendientes para imputar */}
              {ventasPendientes.length > 0 && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Imputar a facturas pendientes
                  </div>
                  {ventasPendientes.map(v => {
                    const imp = imputaciones[v.id] || { checked: false, monto: '0.00', saldo: 0 }
                    const saldo = imp.saldo
                    const fechaStr = new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR')
                    return (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <input type="checkbox" checked={imp.checked} onChange={() => toggleImputacion(v.id)} />
                        <label style={{ flex: 1, cursor: 'pointer', fontWeight: 'normal' }} onClick={() => toggleImputacion(v.id)}>
                          <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fechaStr}</span>
                          {v.notas && <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {v.notas.split('|')[0].trim()}</span>}
                          <br />
                          Total: <strong>{fmtMonto(v.total, puedeVerMontos, { maximumFractionDigits: 2 })}</strong>
                          {parseFloat(v.monto_pagado || 0) > 0 && ` · Pagado: ${fmtMonto(v.monto_pagado, puedeVerMontos, { maximumFractionDigits: 2 })}`}
                          {v.ajusteNeto < 0 && ` · NC: ${fmtMonto(Math.abs(v.ajusteNeto), puedeVerMontos, { maximumFractionDigits: 2 })}`}
                          {v.ajusteNeto > 0 && ` · ND: ${fmtMonto(v.ajusteNeto, puedeVerMontos, { maximumFractionDigits: 2 })}`}
                          {' · '}<span style={{ color: '#DC2626', fontWeight: 600 }}>Saldo: {fmtMonto(saldo, puedeVerMontos, { maximumFractionDigits: 2 })}</span>
                        </label>
                        <input type="number" min="0" max={saldo} step="0.01"
                          value={imp.monto}
                          onChange={e => setMontoImputacion(v.id, e.target.value)}
                          style={{ width: 110, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                      </div>
                    )
                  })}
                  {pagoMixto && (
                    <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: '#FEE2E2', color: '#991B1B', fontSize: 12, fontWeight: 600 }}>
                      No mezcles ventas con factura y sin factura en el mismo cobro. Registrá dos cobros separados.
                    </div>
                  )}
                  {soloSinFactura && (
                    <div style={{ marginTop: 8, padding: '6px 8px', borderRadius: 6, background: '#FEF3C7', color: '#92400E', fontSize: 12 }}>
                      Las ventas sin factura se cobran únicamente en efectivo e impactan en CC2.
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Imputado: <strong>{fmtMonto(totalImputado, puedeVerMontos, { maximumFractionDigits: 2 })}</strong></span>
                    <span style={{ color: saldoCuenta < -0.01 ? 'var(--danger)' : 'var(--muted)' }}>
                      {saldoCuenta < -0.01 ? '⚠ Excede el cobro' : `A cuenta: ${fmtMonto(saldoCuenta, puedeVerMontos, { maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Centro de costo manual (solo si hay saldo a cuenta sin imputar) */}
              {(ventasPendientes.length === 0 || mostrarCC) && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Destino del pago a cuenta
                  </div>
                  <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                    {[
                      { value: 'CC1', label: 'Con factura' },
                      { value: 'CC2', label: 'Sin factura / efectivo' }
                    ].map(cc => (
                      <label key={cc.value} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="centroCosto" value={cc.value}
                          checked={form.centroCosto === cc.value}
                          onChange={() => setForm(f => ({
                            ...f,
                            centroCosto: cc.value,
                            medio: cc.value === 'CC2' ? 'efectivo' : f.medio
                          }))} />
                        {cc.label}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePago} disabled={saving || pagoMixto}>
                {saving ? 'Guardando...' : 'Registrar cobro'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL EDITAR PAGO (admin) ===== */}
      {modalEdit && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalEdit(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Editar cobro</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalEdit(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Cliente</label>
                  <select value={editForm.clienteId} onChange={e => setEditForm(f => ({ ...f, clienteId: e.target.value }))}>
                    <option value="">— Seleccioná un cliente —</option>
                    {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={editForm.fecha} onChange={e => setEditForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Monto *</label>
                  <input type="number" min="0" step="0.01" value={editForm.monto}
                    onChange={e => setEditForm(f => ({ ...f, monto: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Medio</label>
                  <select value={editForm.medio} onChange={e => setEditForm(f => ({ ...f, medio: e.target.value }))}>
                    {MEDIOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input value={editForm.notas} onChange={e => setEditForm(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalEdit(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={updatePago} disabled={savingEdit}>
                {savingEdit ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ===== MODAL DETALLE IMPUTACIONES ===== */}
      {detallePago && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setDetallePago(null)}>
          <div className="modal" style={{ maxWidth: 460 }}>
            <div className="modal-header">
              <h2>Detalle del cobro</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setDetallePago(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 4 }}>Cliente</div>
                <div style={{ fontWeight: 600 }}>{detallePago.clientes ? nombreCliente(detallePago.clientes) : '—'}</div>
                <div style={{ marginTop: 8, display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Total cobrado</span>
                  <strong>{fmtMonto(detallePago.monto, puedeVerMontos, { maximumFractionDigits: 2 })}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Total imputado</span>
                  <strong>{fmtMonto(getEstadoCobro(detallePago).totalImputado, puedeVerMontos, { maximumFractionDigits: 2 })}</strong>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                  <span>Saldo a cuenta</span>
                  <strong>{fmtMonto(Math.max(0, parseFloat(detallePago.monto || 0) - getEstadoCobro(detallePago).totalImputado), puedeVerMontos, { maximumFractionDigits: 2 })}</strong>
                </div>
              </div>

              {(detallePago.pago_ventas || []).length === 0 ? (
                <div className="empty" style={{ padding: 16 }}>
                  <p>Este cobro no está imputado a ventas. Queda como pago a cuenta.</p>
                </div>
              ) : (
                <div>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Imputaciones
                  </div>
                  {(detallePago.pago_ventas || []).map((imp, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>Venta #{String(imp.ventas?.numero || 0).padStart(6, '0')}</div>
                        <div style={{ color: 'var(--muted)', fontSize: 12 }}>{imp.ventas?.fecha || '—'}</div>
                      </div>
                      <strong>{fmtMonto(imp.monto_aplicado, puedeVerMontos, { maximumFractionDigits: 2 })}</strong>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setDetallePago(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL IMPUTAR COBRO EXISTENTE ===== */}
      {modalImputar && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalImputar(null)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Imputar cobro a ventas</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalImputar(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12, fontSize: 13 }}>
                <div><strong>{modalImputar.clientes ? nombreCliente(modalImputar.clientes) : '—'}</strong></div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span>Disponible para imputar</span>
                  <strong>{fmtMonto(disponibleImputar, puedeVerMontos, { maximumFractionDigits: 2 })}</strong>
                </div>
              </div>

              {ventasParaImputar.length === 0 ? (
                <div className="empty" style={{ padding: 16 }}>
                  <p>No hay ventas pendientes compatibles con este cobro (mismo tipo con/sin factura) para imputar.</p>
                </div>
              ) : (
                <div>
                  {ventasParaImputar.map(v => {
                    const imp = nuevasImputaciones[v.id] || { checked: false, monto: '0.00', saldo: 0 }
                    const fechaStr = new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR')
                    return (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <input type="checkbox" checked={imp.checked} onChange={() => toggleNuevaImputacion(v.id)} />
                        <label style={{ flex: 1, cursor: 'pointer', fontWeight: 'normal' }} onClick={() => toggleNuevaImputacion(v.id)}>
                          <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fechaStr}</span>
                          <br />
                          Total: <strong>{fmtMonto(v.total, puedeVerMontos, { maximumFractionDigits: 2 })}</strong>
                          {v.ajusteNeto < 0 && ` · NC: ${fmtMonto(Math.abs(v.ajusteNeto), puedeVerMontos, { maximumFractionDigits: 2 })}`}
                          {v.ajusteNeto > 0 && ` · ND: ${fmtMonto(v.ajusteNeto, puedeVerMontos, { maximumFractionDigits: 2 })}`}
                          {' · '}<span style={{ color: '#DC2626', fontWeight: 600 }}>Saldo: {fmtMonto(imp.saldo, puedeVerMontos, { maximumFractionDigits: 2 })}</span>
                        </label>
                        <input type="number" min="0" max={imp.saldo} step="0.01"
                          value={imp.monto}
                          onChange={e => setMontoNuevaImputacion(v.id, e.target.value)}
                          style={{ width: 110, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                      </div>
                    )
                  })}
                  <div style={{ marginTop: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                    <span>A imputar: <strong>{fmtMonto(totalNuevasImputaciones, puedeVerMontos, { maximumFractionDigits: 2 })}</strong></span>
                    {excedeDisponible && <span style={{ color: 'var(--danger)' }}>⚠ Supera el disponible</span>}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalImputar(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={confirmarImputar} disabled={imputando || excedeDisponible || !nuevasImputacionesActivas.length}>
                {imputando ? 'Imputando...' : 'Confirmar imputación'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ComprobanteModal comp={comp} onClose={cerrarComp} onPrint={imprimir} onDownload={descargar} />
      <ToastContainer toasts={toasts} />
    </div>
  )
}
