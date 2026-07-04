import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { registrarPagoProveedor, anularPagoProveedor } from '../services/proveedorPagosService'

const MEDIOS = ['Transferencia', 'Efectivo', 'Cheque', 'Otro']

const EMPTY_FORM = {
  proveedorId: '', recepcionId: '',
  fecha: new Date().toISOString().split('T')[0],
  monto: '', medio: 'Transferencia', notas: ''
}

function proveedorDeRecepcion(r) {
  return r?.proveedores?.nombre || 'Recepción suelta'
}

function fmt(valor) {
  return '$' + parseFloat(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export default function PagosProveedoresPage() {
  const { toasts, toast } = useToast()

  const [pagos, setPagos] = useState([])
  const [recepciones, setRecepciones] = useState([])
  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)

  const [filtroProveedorId, setFiltroProveedorId] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('proveedores').select('id,nombre').order('nombre')
      .then(({ data }) => setProveedores(data || []))
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      await Promise.all([loadPagos(), loadRecepciones()])
    } finally { setLoading(false) }
  }

  async function loadPagos() {
    const { data } = await supabase.from('pagos_proveedor')
      .select('id,fecha,monto,medio,notas,recepcion_id,recepciones(numero,remito_proveedor,proveedor_id,proveedores(nombre))')
      .order('fecha', { ascending: false })
    setPagos(data || [])
  }

  async function loadRecepciones() {
    const { data } = await supabase.from('recepciones')
      .select('id,numero,fecha,fecha_recepcion_real,total,monto_pagado_prov,estado_pago_prov,estado,remito_proveedor,proveedor_id,proveedores(nombre)')
      .neq('estado', 'borrador')
      .order('fecha_recepcion_real', { ascending: false })
    setRecepciones(data || [])
  }

  const pagosFiltrados = filtroProveedorId
    ? pagos.filter(p => p.recepciones?.proveedor_id === filtroProveedorId)
    : pagos

  const recepcionesPendientes = recepciones
    .filter(r => (r.estado_pago_prov || 'pendiente') !== 'pagado')
    .filter(r => !form.proveedorId || r.proveedor_id === form.proveedorId)

  function abrirNuevoPago() {
    setForm(EMPTY_FORM)
    setModalOpen(true)
  }

  function elegirRecepcion(r) {
    const saldo = parseFloat(r.total || 0) - parseFloat(r.monto_pagado_prov || 0)
    setForm(f => ({ ...f, recepcionId: r.id, monto: saldo.toFixed(2) }))
  }

  async function savePago() {
    if (!form.recepcionId) { toast('Elegí una recepción', 'error'); return }
    if (!form.fecha) { toast('Elegí la fecha', 'error'); return }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    setSaving(true)
    try {
      const { nuevoEstado } = await registrarPagoProveedor({
        recepcionId: form.recepcionId, fecha: form.fecha, monto: form.monto, medio: form.medio, notas: form.notas
      })
      toast(`Pago registrado ✓ — ${nuevoEstado === 'pagado' ? 'Factura cancelada' : 'Saldo pendiente actualizado'}`)
      setModalOpen(false)
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  async function handleAnular(p) {
    if (!confirm('¿Anular este pago a proveedor?')) return
    try {
      await anularPagoProveedor(p.id, p.recepcion_id)
      toast('Pago anulado')
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Pagos a Proveedores</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={abrirNuevoPago}>+ Registrar pago</button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={filtroProveedorId} onChange={e => setFiltroProveedorId(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">Todos los proveedores</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : pagosFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">💸</div><p>No hay pagos registrados</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Proveedor</th>
                  <th>Recepción</th>
                  <th>Monto</th>
                  <th>Medio</th>
                  <th>Notas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {pagosFiltrados.map(p => (
                  <tr key={p.id}>
                    <td>{p.fecha}</td>
                    <td>{proveedorDeRecepcion(p.recepciones)}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                      {p.recepciones ? `#${String(p.recepciones.numero).padStart(4, '0')}${p.recepciones.remito_proveedor ? ` (${p.recepciones.remito_proveedor})` : ''}` : '—'}
                    </td>
                    <td><strong>{fmt(p.monto)}</strong></td>
                    <td><span className="badge badge-blue">{p.medio}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.notas || '—'}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => handleAnular(p)}>↩ Anular</button></td>
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
        ) : pagosFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">💸</div><p>No hay pagos registrados</p></div>
        ) : pagosFiltrados.map(p => {
          const fechaCorta = p.fecha ? new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'
          return (
            <div key={p.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-fecha">{fechaCorta}</span>
                <span className="badge badge-blue">{p.medio}</span>
              </div>
              <div className="op-card-cliente">
                {proveedorDeRecepcion(p.recepciones)}{' '}
                <span style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 400 }}>
                  {p.recepciones ? `#${String(p.recepciones.numero).padStart(4, '0')}` : ''}
                </span>
              </div>
              <div className="op-card-total" style={{ color: 'var(--success)' }}>{fmt(p.monto)}</div>
              <div className="op-card-actions" style={{ marginTop: 8 }}>
                <button className="btn btn-danger" onClick={() => handleAnular(p)}>↩ Anular</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal registrar pago */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Registrar pago a proveedor</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Proveedor</label>
                <select value={form.proveedorId} onChange={e => setForm(f => ({ ...f, proveedorId: e.target.value, recepcionId: '', monto: '' }))}>
                  <option value="">— Elegí un proveedor —</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                  Recepciones con saldo pendiente
                </div>
                {!form.proveedorId ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Elegí un proveedor para ver sus recepciones pendientes.</div>
                ) : recepcionesPendientes.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--muted)' }}>Este proveedor no tiene recepciones con saldo pendiente.</div>
                ) : (
                  recepcionesPendientes.map(r => {
                    const saldo = parseFloat(r.total || 0) - parseFloat(r.monto_pagado_prov || 0)
                    const fechaStr = r.fecha_recepcion_real ? new Date(r.fecha_recepcion_real + 'T00:00:00').toLocaleDateString('es-AR') : '—'
                    return (
                      <label key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}>
                        <input type="radio" name="recepcionPago" checked={form.recepcionId === r.id} onChange={() => elegirRecepcion(r)} />
                        <span style={{ flex: 1 }}>
                          #{String(r.numero).padStart(4, '0')} · {fechaStr}{r.remito_proveedor ? ` · Remito ${r.remito_proveedor}` : ''}
                          <br />
                          Total: <strong>{fmt(r.total)}</strong>
                          {' · '}<span style={{ color: '#DC2626', fontWeight: 600 }}>Saldo: {fmt(saldo)}</span>
                        </span>
                      </label>
                    )
                  })
                )}
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Monto *</label>
                  <input type="number" min="0" step="0.01" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Medio</label>
                  <select value={form.medio} onChange={e => setForm(f => ({ ...f, medio: e.target.value }))}>
                    {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label>Notas</label>
                  <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={savePago} disabled={saving || !form.recepcionId}>{saving ? 'Guardando...' : 'Registrar pago'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
