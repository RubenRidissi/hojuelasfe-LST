import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const MEDIOS = ['Efectivo', 'Transferencia', 'Cheque', 'Tarjeta', 'Otro']

const EMPTY_FORM = {
  clienteId: '', fecha: new Date().toISOString().split('T')[0],
  monto: '', medio: 'Efectivo', notas: '', centroCosto: 'CC2'
}

const EMPTY_EDIT = {
  id: '', clienteId: '', fecha: '', monto: '', medio: 'Efectivo', notas: ''
}

export default function PagosPage() {
  const { user, isAdmin } = useAuth()
  const { toasts, toast } = useToast()

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

  useEffect(() => { loadAll() }, [])

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
        .select('id,numero,fecha,monto,medio,notas,vendedor_id,centro_costo,clientes(id,nombre,nombre_fantasia)')
        .order('created_at', { ascending: false })

      if (!isAdmin) q = q.eq('vendedor_id', user)
      if (isAdmin && filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      if (filtroCliente) q = q.eq('cliente_id', filtroCliente)

      const { data } = await q
      setPagos(data || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  useEffect(() => { loadPagos() }, [filtroCliente, filtroVendedor])

  // ===== CARGAR VENTAS PENDIENTES AL SELECCIONAR CLIENTE =====
  async function cargarVentasPendientes(clienteId) {
    if (!clienteId) { setVentasPendientes([]); setImputaciones({}); return }
    try {
      const { data } = await supabase.from('ventas')
        .select('id,fecha,total,monto_pagado,estado_pago,notas')
        .eq('cliente_id', clienteId)
        .neq('estado_pago', 'pagado')
        .order('fecha', { ascending: true })

      setVentasPendientes(data || [])
      // Pre-cargar montos de imputación con el saldo de cada venta
      const imp = {}
      ;(data || []).forEach(v => {
        const saldo = parseFloat(v.total || 0) - parseFloat(v.monto_pagado || 0)
        imp[v.id] = { checked: false, monto: saldo.toFixed(2), saldo }
      })
      setImputaciones(imp)
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
  const mostrarCC = saldoCuenta > 0.01

  // ===== GUARDAR PAGO =====
  async function savePago() {
    if (!form.clienteId) { toast('Seleccioná un cliente', 'error'); return }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    if (totalImputado > montoCobrado + 0.01) { toast('El total imputado supera el monto cobrado', 'error'); return }

    setSaving(true)
    try {
      // Determinar centro de costo
      let centroCosto = form.centroCosto
      if (imputacionesActivas.length > 0) {
        const ventaIds = imputacionesActivas.map(([id]) => id)
        const { data: vents } = await supabase.from('ventas').select('modalidad_factura').in('id', ventaIds)
        const tieneBlanco = (vents || []).some(v => v.modalidad_factura === 'con_iva')
        const tieneNegro = (vents || []).some(v => v.modalidad_factura === 'sin_iva' || !v.modalidad_factura)
        centroCosto = tieneBlanco ? 'CC1' : 'CC2'
        if (tieneBlanco && tieneNegro) toast('⚠ Pago mixto (blanco y negro) — asignado a CC1', 'info')
      }

      const cliente = clientes.find(c => c.id === form.clienteId)
      const vendedorId = cliente?.vendedor_id || user

      const { data: [pago] } = await supabase.from('pagos').insert({
        cliente_id: form.clienteId, fecha: form.fecha,
        monto: parseFloat(form.monto), medio: form.medio,
        notas: form.notas, vendedor_id: vendedorId, centro_costo: centroCosto
      }).select()

      // Registrar imputaciones y actualizar estado de cada venta
      await Promise.all(imputacionesActivas.map(async ([ventaId, imp]) => {
        const montoAplicado = parseFloat(imp.monto || 0)
        if (montoAplicado <= 0) return

        await supabase.from('pago_ventas').insert({ pago_id: pago.id, venta_id: ventaId, monto_aplicado: montoAplicado })

        const { data: pagosVenta } = await supabase.from('pago_ventas').select('monto_aplicado').eq('venta_id', ventaId)
        const totalPagado = (pagosVenta || []).reduce((s, p) => s + parseFloat(p.monto_aplicado || 0), 0)
        const { data: [venta] } = await supabase.from('ventas').select('total').eq('id', ventaId)
        const totalVenta = parseFloat(venta?.total || 0)
        const nuevoEstado = totalPagado >= totalVenta - 0.01 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente'
        await supabase.from('ventas').update({ monto_pagado: totalPagado, estado_pago: nuevoEstado }).eq('id', ventaId)
      }))

      toast(imputacionesActivas.length
        ? `Cobro registrado (${centroCosto}) e imputado a ${imputacionesActivas.length} factura(s) ✓`
        : `Cobro registrado como pago a cuenta (${centroCosto}) ✓`)

      setModalOpen(false)
      setForm(EMPTY_FORM)
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

  // ===== ELIMINAR PAGO =====
  async function deletePago(id) {
    if (!confirm('¿Borrar este cobro?\n\nEsta acción no se puede deshacer.')) return
    try {
      await supabase.from('pagos').delete().eq('id', id)
      toast('Cobro eliminado')
      loadPagos()
    } catch (e) { toast('Error al eliminar', 'error') }
  }

  const misClientes = isAdmin ? clientes : clientes.filter(c => c.vendedor_id === user)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cobros</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setVentasPendientes([]); setImputaciones({}); setModalOpen(true) }}>
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
                  <th>Cliente</th>
                  <th>Monto</th>
                  <th>Medio</th>
                  <th>CC</th>
                  <th>Notas</th>
                  {isAdmin && <th>Vendedor</th>}
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map(p => {
                  const ccBadge = p.centro_costo === 'CC1'
                    ? <span className="badge badge-blue">CC1</span>
                    : <span className="badge badge-gray">CC2</span>
                  const vendedorNombre = vendedores.find(v => v.user_id === p.vendedor_id)?.nombre || '—'
                  return (
                    <tr key={p.id}>
                      <td>{p.fecha}</td>
                      <td>{p.clientes ? nombreCliente(p.clientes) : '—'}</td>
                      <td><strong>${parseFloat(p.monto || 0).toLocaleString('es-AR')}</strong></td>
                      <td><span className="badge badge-blue">{p.medio}</span></td>
                      <td>{ccBadge}</td>
                      <td style={{ color: 'var(--muted)', fontSize: 12 }}>{p.notas || '—'}</td>
                      {isAdmin && <td style={{ fontSize: 12, color: 'var(--muted)' }}>{vendedorNombre}</td>}
                      <td style={{ whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn btn-sm btn-secondary" onClick={() => toast('Recibo — próximamente', 'info')}>🧾 Recibo</button>
                          {isAdmin && <>
                            <button className="btn btn-sm btn-secondary" onClick={() => abrirEdit(p)}>✏</button>
                            <button className="btn btn-sm btn-danger" onClick={() => deletePago(p.id)}>🗑</button>
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
          return (
            <div key={p.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-fecha">{fechaCorta}</span>
                <span className="badge badge-blue">{p.medio}</span>
                {ccBadge}
              </div>
              <div className="op-card-cliente">{p.clientes ? nombreCliente(p.clientes) : '—'}</div>
              <div className="op-card-total" style={{ color: 'var(--success)' }}>${parseFloat(p.monto || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
              {p.notas && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>{p.notas}</div>}
              <div className="op-card-actions" style={{ marginTop: 8 }}>
                <button className="btn btn-secondary" onClick={() => toast('Recibo — próximamente', 'info')}>🧾 Recibo</button>
                {isAdmin && <>
                  <button className="btn btn-secondary" onClick={() => abrirEdit(p)}>✏ Editar</button>
                  <button className="btn btn-danger" onClick={() => deletePago(p.id)}>🗑 Borrar</button>
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
                    {misClientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
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
                  <select value={form.medio} onChange={e => setForm(f => ({ ...f, medio: e.target.value }))}>
                    {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
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
                    const saldo = parseFloat(v.total || 0) - parseFloat(v.monto_pagado || 0)
                    const imp = imputaciones[v.id] || { checked: false, monto: saldo.toFixed(2), saldo }
                    const fechaStr = new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR')
                    return (
                      <div key={v.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                        <input type="checkbox" checked={imp.checked} onChange={() => toggleImputacion(v.id)} />
                        <label style={{ flex: 1, cursor: 'pointer', fontWeight: 'normal' }} onClick={() => toggleImputacion(v.id)}>
                          <span style={{ color: 'var(--muted)', fontSize: 11 }}>{fechaStr}</span>
                          {v.notas && <span style={{ color: 'var(--muted)', fontSize: 11 }}> · {v.notas.split('|')[0].trim()}</span>}
                          <br />
                          Total: <strong>${parseFloat(v.total || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong>
                          {parseFloat(v.monto_pagado || 0) > 0 && ` · Pagado: $${parseFloat(v.monto_pagado).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`}
                          {' · '}<span style={{ color: '#DC2626', fontWeight: 600 }}>Saldo: ${saldo.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span>
                        </label>
                        <input type="number" min="0" max={saldo} step="0.01"
                          value={imp.monto}
                          onChange={e => setMontoImputacion(v.id, e.target.value)}
                          style={{ width: 110, padding: '4px 6px', border: '1px solid var(--border)', borderRadius: 6, fontSize: 12 }} />
                      </div>
                    )
                  })}
                  <div style={{ marginTop: 8, fontSize: 13, display: 'flex', justifyContent: 'space-between' }}>
                    <span>Imputado: <strong>${totalImputado.toLocaleString('es-AR', { maximumFractionDigits: 2 })}</strong></span>
                    <span style={{ color: saldoCuenta < -0.01 ? 'var(--danger)' : 'var(--muted)' }}>
                      {saldoCuenta < -0.01 ? '⚠ Excede el cobro' : `A cuenta: $${saldoCuenta.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`}
                    </span>
                  </div>
                </div>
              )}

              {/* Centro de costo manual (solo si hay saldo a cuenta sin imputar) */}
              {(ventasPendientes.length === 0 || mostrarCC) && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Centro de costo (pago a cuenta)
                  </div>
                  <div style={{ display: 'flex', gap: 16 }}>
                    {['CC1', 'CC2'].map(cc => (
                      <label key={cc} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                        <input type="radio" name="centroCosto" value={cc}
                          checked={form.centroCosto === cc}
                          onChange={() => setForm(f => ({ ...f, centroCosto: cc }))} />
                        {cc} {cc === 'CC1' ? '(con IVA / blanco)' : '(sin IVA / negro)'}
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePago} disabled={saving}>
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
                    {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
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

      <ToastContainer toasts={toasts} />
    </div>
  )
}
