import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { hoyAR } from '../utils/helpers'

const EMPTY_AJUSTE = {
  tipo: 'NC', proveedorId: '', recepcionId: '',
  fecha: hoyAR(),
  numero: '', monto: '', concepto: ''
}

function fmt(valor) {
  return '$' + parseFloat(valor || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export default function CtaCorrienteProveedoresPage() {
  const { toasts, toast } = useToast()

  const [proveedores, setProveedores] = useState([])
  const [proveedorId, setProveedorId] = useState('')
  const [loading, setLoading] = useState(false)

  const [resumen, setResumen] = useState(null) // { recibido, pagado, saldo, ultima }
  const [movimientos, setMovimientos] = useState([])

  // Modal ajuste NC/ND (independiente del proveedor seleccionado arriba)
  const [modalAjuste, setModalAjuste] = useState(false)
  const [ajuste, setAjuste] = useState(EMPTY_AJUSTE)
  const [recepcionesProveedor, setRecepcionesProveedor] = useState([])
  const [savingAjuste, setSavingAjuste] = useState(false)

  useEffect(() => {
    supabase.from('proveedores').select('id,nombre').order('nombre')
      .then(({ data }) => setProveedores(data || []))
  }, [])

  useEffect(() => {
    if (proveedorId) loadCtaCte()
    else { setResumen(null); setMovimientos([]) }
  }, [proveedorId])

  async function loadCtaCte() {
    setLoading(true)
    try {
      const [{ data: recepciones }, { data: pagos }, { data: ajustes }] = await Promise.all([
        supabase.from('recepciones').select('id,numero,fecha_recepcion_real,total,estado_pago_prov,notas').eq('proveedor_id', proveedorId).eq('estado', 'confirmada').order('fecha_recepcion_real'),
        supabase.from('pagos_proveedor').select('id,fecha,monto,medio,notas,recepciones!inner(proveedor_id,numero)').eq('recepciones.proveedor_id', proveedorId).order('fecha'),
        supabase.from('ajustes_proveedor').select('id,fecha,tipo,monto,concepto,numero_comprobante,recepciones(numero)').eq('proveedor_id', proveedorId).order('fecha')
      ])

      const totalRecibido = (recepciones || []).reduce((s, r) => s + parseFloat(r.total || 0), 0)
      const totalPagado = (pagos || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0)
      const totalNC = (ajustes || []).filter(a => a.tipo === 'NC').reduce((s, a) => s + parseFloat(a.monto || 0), 0)
      const totalND = (ajustes || []).filter(a => a.tipo === 'ND').reduce((s, a) => s + parseFloat(a.monto || 0), 0)
      const saldo = totalRecibido - totalPagado - totalNC + totalND

      const movs = [
        ...(recepciones || []).map(r => ({ fecha: r.fecha_recepcion_real, tipo: 'recepcion', id: r.id, monto: parseFloat(r.total || 0), numero: r.numero, estado: r.estado_pago_prov, notas: r.notas })),
        ...(pagos || []).map(p => ({ fecha: p.fecha, tipo: 'pago', id: p.id, monto: parseFloat(p.monto || 0), medio: p.medio, notas: p.notas })),
        ...(ajustes || []).map(a => ({ fecha: a.fecha, tipo: a.tipo === 'NC' ? 'nc' : 'nd', id: a.id, monto: parseFloat(a.monto || 0), notas: a.concepto, numero: a.numero_comprobante, recepcionNumero: a.recepciones?.numero }))
      ].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || ''))

      const ultima = movs.length ? new Date(movs[movs.length - 1].fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

      setResumen({ recibido: totalRecibido, pagado: totalPagado, saldo, ultima })
      setMovimientos(movs)
    } catch (e) {
      console.error(e)
      toast('Error cargando cuenta corriente', 'error')
    } finally { setLoading(false) }
  }

  // ===== AJUSTE NC/ND =====
  async function cargarRecepcionesProveedor(provId) {
    if (!provId) { setRecepcionesProveedor([]); return }
    const { data } = await supabase.from('recepciones')
      .select('id,numero,fecha_recepcion_real,remito_proveedor')
      .eq('proveedor_id', provId).eq('estado', 'confirmada')
      .order('fecha_recepcion_real', { ascending: false })
    setRecepcionesProveedor(data || [])
  }

  async function saveAjuste() {
    if (!ajuste.proveedorId) { toast('Seleccioná un proveedor', 'error'); return }
    if (!ajuste.fecha) { toast('Elegí la fecha', 'error'); return }
    if (!ajuste.monto || parseFloat(ajuste.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    setSavingAjuste(true)
    try {
      await supabase.from('ajustes_proveedor').insert({
        tipo: ajuste.tipo,
        proveedor_id: ajuste.proveedorId,
        recepcion_id: ajuste.recepcionId || null,
        fecha: ajuste.fecha,
        numero_comprobante: ajuste.numero || null,
        monto: parseFloat(ajuste.monto),
        concepto: ajuste.concepto || null
      })
      toast(`${ajuste.tipo} registrada ✓`)
      setModalAjuste(false)
      setAjuste({ ...EMPTY_AJUSTE, fecha: hoyAR() })
      setRecepcionesProveedor([])
      if (proveedorId) loadCtaCte()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSavingAjuste(false) }
  }

  async function deleteAjuste(id) {
    if (!confirm('¿Eliminar este ajuste?')) return
    try {
      await supabase.from('ajustes_proveedor').delete().eq('id', id)
      toast('Ajuste eliminado')
      loadCtaCte()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  // ===== RENDER =====
  let saldoAcum = 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cta. Cte. Proveedores</h1>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={() => {
            setAjuste({ ...EMPTY_AJUSTE, fecha: hoyAR(), proveedorId })
            cargarRecepcionesProveedor(proveedorId)
            setModalAjuste(true)
          }}>± NC/ND Proveedor</button>
        </div>
      </div>

      {/* Selector de proveedor */}
      <div style={{ marginBottom: 16 }}>
        <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--surface)' }}>
          <option value="">— Elegí un proveedor —</option>
          {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
      </div>

      {!proveedorId && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">📒</div>
            <p>Seleccioná un proveedor para ver su cuenta corriente</p>
          </div>
        </div>
      )}

      {proveedorId && loading && (
        <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
      )}

      {proveedorId && resumen && !loading && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Total recibido</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmt(resumen.recibido)}</div>
            </div>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Total pagado</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{fmt(resumen.pagado)}</div>
            </div>
            <div className="card" style={{ padding: 16, textAlign: 'center', borderTop: `3px solid ${resumen.saldo <= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>
                {resumen.saldo < 0 ? 'Saldo a favor' : resumen.saldo === 0 ? 'Sin deuda' : 'Saldo pendiente'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: resumen.saldo <= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmt(Math.abs(resumen.saldo))}
              </div>
            </div>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Último movimiento</div>
              <div style={{ fontSize: 16, fontWeight: 600 }}>{resumen.ultima}</div>
            </div>
          </div>

          {/* Tabla de movimientos */}
          <div className="card">
            {movimientos.length === 0 ? (
              <div className="empty"><p>Sin movimientos</p></div>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Fecha</th>
                      <th>Tipo</th>
                      <th>Detalle</th>
                      <th style={{ textAlign: 'right', color: 'var(--danger)' }}>Debe</th>
                      <th style={{ textAlign: 'right', color: 'var(--success)' }}>Haber</th>
                      <th style={{ textAlign: 'right' }}>Saldo</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m, i) => {
                      let debe = 0, haber = 0, tipoBadge = '', tipoLabel = '', detalle = ''

                      if (m.tipo === 'recepcion') {
                        debe = m.monto
                        tipoBadge = m.estado === 'pagado' ? 'badge-green' : m.estado === 'parcial' ? 'badge-yellow' : 'badge-gray'
                        tipoLabel = `Recepción #${String(m.numero).padStart(4, '0')}`
                        detalle = m.notas || '—'
                      } else if (m.tipo === 'nc') {
                        haber = m.monto; tipoBadge = 'badge-green'; tipoLabel = 'NC'
                        detalle = (m.numero ? m.numero + ' · ' : '') + (m.recepcionNumero ? `Recepción #${String(m.recepcionNumero).padStart(4, '0')} · ` : '') + (m.notas || '—')
                      } else if (m.tipo === 'nd') {
                        debe = m.monto; tipoBadge = 'badge-red'; tipoLabel = 'ND'
                        detalle = (m.numero ? m.numero + ' · ' : '') + (m.recepcionNumero ? `Recepción #${String(m.recepcionNumero).padStart(4, '0')} · ` : '') + (m.notas || '—')
                      } else {
                        haber = m.monto; tipoBadge = 'badge-blue'; tipoLabel = 'Pago'
                        detalle = m.medio + (m.notas ? ' · ' + m.notas : '')
                      }

                      saldoAcum += debe - haber
                      const saldoColor = saldoAcum <= 0 ? 'var(--success)' : 'var(--danger)'

                      return (
                        <tr key={`${m.tipo}-${m.id}`}>
                          <td style={{ fontSize: 12 }}>{m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'}</td>
                          <td><span className={`badge ${tipoBadge}`}>{tipoLabel}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{detalle}</td>
                          <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{debe > 0 ? fmt(debe) : '—'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)' }}>{haber > 0 ? fmt(haber) : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: saldoColor }}>
                            {fmt(Math.abs(saldoAcum))}{saldoAcum < 0 ? ' ✓' : ''}
                          </td>
                          <td>{(m.tipo === 'nc' || m.tipo === 'nd') && <button className="btn btn-sm btn-danger" onClick={() => deleteAjuste(m.id)}>🗑</button>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Cards mobile */}
          <div className="mobile-cards" style={{ marginTop: 12 }}>
            {(() => {
              let saldoMob = 0
              return movimientos.map((m, i) => {
                let debe = 0, haber = 0, tipoBadge = '', tipoLabel = '', detalle = ''
                if (m.tipo === 'recepcion') {
                  debe = m.monto
                  tipoBadge = m.estado === 'pagado' ? 'badge-green' : m.estado === 'parcial' ? 'badge-yellow' : 'badge-gray'
                  tipoLabel = `Recepción #${String(m.numero).padStart(4, '0')}`
                  detalle = m.notas || ''
                } else if (m.tipo === 'nc') {
                  haber = m.monto; tipoBadge = 'badge-green'; tipoLabel = 'NC'
                  detalle = (m.numero ? m.numero + ' · ' : '') + (m.notas || '')
                } else if (m.tipo === 'nd') {
                  debe = m.monto; tipoBadge = 'badge-red'; tipoLabel = 'ND'
                  detalle = (m.numero ? m.numero + ' · ' : '') + (m.notas || '')
                } else {
                  haber = m.monto; tipoBadge = 'badge-blue'; tipoLabel = 'Pago'
                  detalle = m.medio + (m.notas ? ' · ' + m.notas : '')
                }
                saldoMob += debe - haber
                const saldoColor = saldoMob <= 0 ? 'var(--success)' : 'var(--danger)'

                return (
                  <div key={`mob-${m.tipo}-${m.id}`} className="op-card" style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{m.fecha ? new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'}</span>
                      <span className={`badge ${tipoBadge}`}>{tipoLabel}</span>
                    </div>
                    {detalle && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{detalle}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13 }}>
                        {debe > 0 && <span style={{ color: 'var(--danger)' }}>Debe: {fmt(debe)}</span>}
                        {haber > 0 && <span style={{ color: 'var(--success)' }}>Haber: {fmt(haber)}</span>}
                      </div>
                      <div style={{ fontWeight: 700, color: saldoColor }}>
                        Saldo: {fmt(Math.abs(saldoMob))}{saldoMob < 0 ? ' ✓' : ''}
                      </div>
                    </div>
                    {(m.tipo === 'nc' || m.tipo === 'nd') && (
                      <div className="op-card-actions" style={{ marginTop: 8 }}>
                        <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => deleteAjuste(m.id)}>🗑 Eliminar</button>
                      </div>
                    )}
                  </div>
                )
              })
            })()}
          </div>
        </>
      )}

      {/* ===== MODAL AJUSTE NC/ND ===== */}
      {modalAjuste && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalAjuste(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{ajuste.tipo === 'NC' ? 'Nueva Nota de Crédito' : 'Nueva Nota de Débito'} — Proveedor</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalAjuste(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Tipo</label>
                <select value={ajuste.tipo} onChange={e => setAjuste(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="NC">NC — Nota de Crédito (reduce deuda)</option>
                  <option value="ND">ND — Nota de Débito (aumenta deuda)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Proveedor *</label>
                <select value={ajuste.proveedorId} onChange={e => {
                  setAjuste(f => ({ ...f, proveedorId: e.target.value, recepcionId: '' }))
                  cargarRecepcionesProveedor(e.target.value)
                }}>
                  <option value="">Seleccioná un proveedor</option>
                  {proveedores.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Recepción asociada</label>
                <select value={ajuste.recepcionId} onChange={e => setAjuste(f => ({ ...f, recepcionId: e.target.value }))}>
                  <option value="">Sin recepción asociada</option>
                  {recepcionesProveedor.map(r => (
                    <option key={r.id} value={r.id}>#{String(r.numero).padStart(4, '0')} — {r.fecha_recepcion_real || ''}{r.remito_proveedor ? ` (${r.remito_proveedor})` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={ajuste.fecha} onChange={e => setAjuste(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Monto *</label>
                  <input type="number" min="0" step="0.01" value={ajuste.monto} onChange={e => setAjuste(f => ({ ...f, monto: e.target.value }))} placeholder="0.00" />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>N° Comprobante</label>
                <input value={ajuste.numero} onChange={e => setAjuste(f => ({ ...f, numero: e.target.value }))} placeholder="Ej: NC-0001-00012345" />
              </div>
              <div className="form-group">
                <label>Concepto</label>
                <input value={ajuste.concepto} onChange={e => setAjuste(f => ({ ...f, concepto: e.target.value }))} placeholder="Motivo del ajuste..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalAjuste(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAjuste} disabled={savingAjuste}>{savingAjuste ? 'Registrando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
