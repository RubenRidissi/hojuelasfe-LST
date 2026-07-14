import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente, hoyAR } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { fmtMonto } from '../utils/money'
import { recalcularEstadoVenta } from '../services/ventasService'

const EMPTY_AJUSTE = {
  tipo: 'NC', clienteId: '', ventaId: '',
  fecha: hoyAR(),
  numero: '', monto: '', concepto: ''
}

export default function CtaCorrientePage() {
  const { user, isAdmin, puedeVerMontos } = useAuth()
  const { toasts, toast } = useToast()

  const [clientes, setClientes] = useState([])
  const [clienteId, setClienteId] = useState('')
  const [loading, setLoading] = useState(false)

  // Resumen
  const [resumen, setResumen] = useState(null) // { facturado, cobrado, saldo, ultima }
  const [movimientos, setMovimientos] = useState([])

  // Modal ajuste NC/ND (solo admin)
  const [modalAjuste, setModalAjuste] = useState(false)
  const [ajuste, setAjuste] = useState(EMPTY_AJUSTE)
  const [ventasCliente, setVentasCliente] = useState([])
  const [savingAjuste, setSavingAjuste] = useState(false)

  useEffect(() => {
    supabase.from('clientes').select('id,nombre,nombre_fantasia,tipo,vendedor_id').order('nombre')
      .then(({ data }) => setClientes(data || []))
  }, [])

  const misClientes = isAdmin ? clientes : clientes.filter(c => c.vendedor_id === user)

  useEffect(() => {
    if (clienteId) loadCtaCte()
    else { setResumen(null); setMovimientos([]) }
  }, [clienteId])

  async function loadCtaCte() {
    setLoading(true)
    try {
      const [{ data: ventas }, { data: pagos }, { data: ajustes }] = await Promise.all([
        supabase.from('ventas').select('id,fecha,total,estado,estado_pago,notas').eq('cliente_id', clienteId).order('fecha'),
        supabase.from('pagos').select('id,fecha,monto,medio,notas').eq('cliente_id', clienteId).order('fecha'),
        supabase.from('ajustes_cliente').select('id,fecha,tipo,monto,concepto,numero_comprobante').eq('cliente_id', clienteId).order('fecha')
      ])

      const ventasVigentes = (ventas || []).filter(v => v.estado !== 'anulada')
      const totalFacturado = ventasVigentes.reduce((s, v) => s + parseFloat(v.total || 0), 0)
      const totalCobrado = (pagos || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0)
      const totalNC = (ajustes || []).filter(a => a.tipo === 'NC').reduce((s, a) => s + parseFloat(a.monto || 0), 0)
      const totalND = (ajustes || []).filter(a => a.tipo === 'ND').reduce((s, a) => s + parseFloat(a.monto || 0), 0)
      const saldo = totalFacturado - totalCobrado - totalNC + totalND

      // Combinar y ordenar por fecha. Las ventas anuladas quedan como antecedente
      // (monto 0 para no afectar el saldo), el resto de movimientos sin cambios.
      const movs = [
        ...(ventas || []).map(v => ({
          fecha: v.fecha, tipo: 'venta', id: v.id,
          monto: v.estado === 'anulada' ? 0 : parseFloat(v.total || 0),
          montoOriginal: parseFloat(v.total || 0),
          anulada: v.estado === 'anulada',
          estado: v.estado_pago, notas: v.notas
        })),
        ...(pagos || []).map(p => ({ fecha: p.fecha, tipo: 'pago', id: p.id, monto: parseFloat(p.monto || 0), medio: p.medio, notas: p.notas })),
        ...(ajustes || []).map(a => ({ fecha: a.fecha, tipo: a.tipo === 'NC' ? 'nc' : 'nd', id: a.id, monto: parseFloat(a.monto || 0), notas: a.concepto, numero: a.numero_comprobante }))
      ].sort((a, b) => a.fecha.localeCompare(b.fecha))

      const ultima = movs.length ? new Date(movs[movs.length - 1].fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—'

      setResumen({ facturado: totalFacturado, cobrado: totalCobrado, saldo, ultima })
      setMovimientos(movs)
    } catch (e) {
      console.error(e)
      toast('Error cargando cuenta corriente', 'error')
    } finally { setLoading(false) }
  }

  // ===== AJUSTE NC/ND =====
  async function cargarVentasCliente(cliId) {
    if (!cliId) { setVentasCliente([]); return }
    const { data } = await supabase.from('ventas').select('id,fecha,total,notas').eq('cliente_id', cliId).neq('estado', 'anulada').order('fecha', { ascending: false })
    setVentasCliente(data || [])
  }

  async function saveAjuste() {
    if (!ajuste.clienteId) { toast('Seleccioná un cliente', 'error'); return }
    if (!ajuste.ventaId) { toast('Seleccioná una venta', 'error'); return }
    if (!ajuste.fecha) { toast('Elegí la fecha', 'error'); return }
    if (!ajuste.monto || parseFloat(ajuste.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    setSavingAjuste(true)
    try {
      await supabase.from('ajustes_cliente').insert({
        tipo: ajuste.tipo,
        cliente_id: ajuste.clienteId,
        venta_id: ajuste.ventaId,
        fecha: ajuste.fecha,
        numero_comprobante: ajuste.numero || null,
        monto: parseFloat(ajuste.monto),
        concepto: ajuste.concepto || null
      })
      await recalcularEstadoVenta(ajuste.ventaId)
      toast(`${ajuste.tipo} registrada ✓`)
      setModalAjuste(false)
      setAjuste({ ...EMPTY_AJUSTE, fecha: hoyAR() })
      setVentasCliente([])
      if (clienteId) loadCtaCte()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSavingAjuste(false) }
  }

  // ===== RENDER =====
  let saldoAcum = 0

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Cta. Corriente</h1>
        {isAdmin && (
          <div className="page-header-actions">
            <button className="btn btn-secondary" onClick={() => {
              setAjuste({ ...EMPTY_AJUSTE, fecha: hoyAR() })
              setVentasCliente([])
              setModalAjuste(true)
            }}>± NC/ND Cliente</button>
          </div>
        )}
      </div>

      {/* Selector de cliente */}
      <div style={{ marginBottom: 16 }}>
        <select value={clienteId} onChange={e => setClienteId(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--radius)', fontSize: 14, background: 'var(--surface)' }}>
          <option value="">— Elegí un cliente —</option>
          {misClientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}{c.tipo ? ` — ${c.tipo}` : ''}</option>)}
        </select>
      </div>

      {/* Estado vacío */}
      {!clienteId && (
        <div className="card">
          <div className="empty">
            <div className="empty-icon">📒</div>
            <p>Seleccioná un cliente para ver su cuenta corriente</p>
          </div>
        </div>
      )}

      {/* Resumen */}
      {clienteId && loading && (
        <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
      )}

      {clienteId && resumen && !loading && (
        <>
          {/* Cards de resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Total facturado</div>
              <div style={{ fontSize: 24, fontWeight: 700 }}>{fmtMonto(resumen.facturado, puedeVerMontos, { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="card" style={{ padding: 16, textAlign: 'center' }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>Total cobrado</div>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--success)' }}>{fmtMonto(resumen.cobrado, puedeVerMontos, { maximumFractionDigits: 2 })}</div>
            </div>
            <div className="card" style={{ padding: 16, textAlign: 'center', borderTop: `3px solid ${resumen.saldo <= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>
                {resumen.saldo < 0 ? 'Saldo a favor' : resumen.saldo === 0 ? 'Sin deuda' : 'Saldo pendiente'}
              </div>
              <div style={{ fontSize: 24, fontWeight: 700, color: resumen.saldo <= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmtMonto(Math.abs(resumen.saldo), puedeVerMontos, { maximumFractionDigits: 2 })}
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
                    </tr>
                  </thead>
                  <tbody>
                    {movimientos.map((m, i) => {
                      let debe = 0, haber = 0, tipoBadge = '', tipoLabel = '', detalle = ''

                      if (m.tipo === 'venta') {
                        debe = m.monto
                        if (m.anulada) {
                          tipoBadge = 'badge-gray'; tipoLabel = 'Venta anulada'
                          detalle = `Anulada · no afecta el saldo (${fmtMonto(m.montoOriginal, puedeVerMontos, { maximumFractionDigits: 2 })})`
                        } else {
                          tipoBadge = m.estado === 'pagado' ? 'badge-green' : m.estado === 'parcial' ? 'badge-yellow' : 'badge-gray'
                          tipoLabel = m.estado === 'pagado' ? 'Venta pagada' : m.estado === 'parcial' ? 'Venta parcial' : 'Venta'
                          detalle = m.notas ? m.notas.split('|')[0].trim() : '—'
                        }
                      } else if (m.tipo === 'nc') {
                        haber = m.monto; tipoBadge = 'badge-green'; tipoLabel = 'NC'
                        detalle = (m.numero ? m.numero + ' · ' : '') + (m.notas || '—')
                      } else if (m.tipo === 'nd') {
                        debe = m.monto; tipoBadge = 'badge-red'; tipoLabel = 'ND'
                        detalle = (m.numero ? m.numero + ' · ' : '') + (m.notas || '—')
                      } else {
                        haber = m.monto; tipoBadge = 'badge-blue'; tipoLabel = 'Cobro'
                        detalle = m.medio + (m.notas ? ' · ' + m.notas : '')
                      }

                      saldoAcum += debe - haber
                      const saldoColor = saldoAcum <= 0 ? 'var(--success)' : 'var(--danger)'

                      return (
                        <tr key={`${m.tipo}-${m.id}`}>
                          <td style={{ fontSize: 12 }}>{new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</td>
                          <td><span className={`badge ${tipoBadge}`}>{tipoLabel}</span></td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>{detalle}</td>
                          <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{debe > 0 ? fmtMonto(debe, puedeVerMontos, { maximumFractionDigits: 2 }) : '—'}</td>
                          <td style={{ textAlign: 'right', color: 'var(--success)' }}>{haber > 0 ? fmtMonto(haber, puedeVerMontos, { maximumFractionDigits: 2 }) : '—'}</td>
                          <td style={{ textAlign: 'right', fontWeight: 600, color: saldoColor }}>
                            {fmtMonto(Math.abs(saldoAcum), puedeVerMontos, { maximumFractionDigits: 2 })}{saldoAcum < 0 ? ' ✓' : ''}
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
          <div className="mobile-cards" style={{ marginTop: 12 }}>
            {(() => {
              let saldoMob = 0
              return movimientos.map((m, i) => {
                let debe = 0, haber = 0, tipoBadge = '', tipoLabel = '', detalle = ''
                if (m.tipo === 'venta') {
                  debe = m.monto
                  if (m.anulada) {
                    tipoBadge = 'badge-gray'; tipoLabel = 'Venta anulada'
                    detalle = `Anulada · no afecta el saldo (${fmtMonto(m.montoOriginal, puedeVerMontos, { maximumFractionDigits: 2 })})`
                  } else {
                    tipoBadge = m.estado === 'pagado' ? 'badge-green' : m.estado === 'parcial' ? 'badge-yellow' : 'badge-gray'
                    tipoLabel = m.estado === 'pagado' ? 'Venta pagada' : m.estado === 'parcial' ? 'Venta parcial' : 'Venta'
                    detalle = m.notas ? m.notas.split('|')[0].trim() : ''
                  }
                } else if (m.tipo === 'nc') {
                  haber = m.monto; tipoBadge = 'badge-green'; tipoLabel = 'NC'
                  detalle = (m.numero ? m.numero + ' · ' : '') + (m.notas || '')
                } else if (m.tipo === 'nd') {
                  debe = m.monto; tipoBadge = 'badge-red'; tipoLabel = 'ND'
                  detalle = (m.numero ? m.numero + ' · ' : '') + (m.notas || '')
                } else {
                  haber = m.monto; tipoBadge = 'badge-blue'; tipoLabel = 'Cobro'
                  detalle = m.medio + (m.notas ? ' · ' + m.notas : '')
                }
                saldoMob += debe - haber
                const saldoColor = saldoMob <= 0 ? 'var(--success)' : 'var(--danger)'

                return (
                  <div key={`mob-${m.tipo}-${m.id}`} className="op-card" style={{ marginBottom: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(m.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })}</span>
                      <span className={`badge ${tipoBadge}`}>{tipoLabel}</span>
                    </div>
                    {detalle && <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 6 }}>{detalle}</div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: 13 }}>
                        {debe > 0 && <span style={{ color: 'var(--danger)' }}>Debe: {fmtMonto(debe, puedeVerMontos, { maximumFractionDigits: 2 })}</span>}
                        {haber > 0 && <span style={{ color: 'var(--success)' }}>Haber: {fmtMonto(haber, puedeVerMontos, { maximumFractionDigits: 2 })}</span>}
                      </div>
                      <div style={{ fontWeight: 700, color: saldoColor }}>
                        Saldo: {fmtMonto(Math.abs(saldoMob), puedeVerMontos, { maximumFractionDigits: 2 })}{saldoMob < 0 ? ' ✓' : ''}
                      </div>
                    </div>
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
              <h2>{ajuste.tipo === 'NC' ? 'Nueva Nota de Crédito' : 'Nueva Nota de Débito'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalAjuste(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Tipo</label>
                <select value={ajuste.tipo} onChange={e => setAjuste(f => ({ ...f, tipo: e.target.value }))}>
                  <option value="NC">NC — Nota de Crédito (reduce deuda del cliente)</option>
                  <option value="ND">ND — Nota de Débito (aumenta deuda del cliente)</option>
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Cliente *</label>
                <select value={ajuste.clienteId} onChange={e => {
                  setAjuste(f => ({ ...f, clienteId: e.target.value, ventaId: '' }))
                  cargarVentasCliente(e.target.value)
                }}>
                  <option value="">Seleccioná un cliente</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
                </select>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Venta asociada *</label>
                <select value={ajuste.ventaId} onChange={e => setAjuste(f => ({ ...f, ventaId: e.target.value }))}>
                  <option value="">{ajuste.clienteId ? 'Seleccioná una venta' : 'Primero seleccioná un cliente'}</option>
                  {ventasCliente.map(v => {
                    const fecha = new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR')
                    const desc = v.notas ? v.notas.split('|')[0].trim() : ''
                    return <option key={v.id} value={v.id}>{fecha} — ${parseFloat(v.total).toLocaleString('es-AR', { maximumFractionDigits: 0 })}{desc ? ` · ${desc}` : ''}</option>
                  })}
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
                <input value={ajuste.numero} onChange={e => setAjuste(f => ({ ...f, numero: e.target.value }))} placeholder="Ej: NC-0001-00000001" />
              </div>
              <div className="form-group">
                <label>Concepto</label>
                <input value={ajuste.concepto} onChange={e => setAjuste(f => ({ ...f, concepto: e.target.value }))} placeholder="Motivo del ajuste..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalAjuste(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAjuste} disabled={savingAjuste}>
                {savingAjuste ? 'Registrando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
