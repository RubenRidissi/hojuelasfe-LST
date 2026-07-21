import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { registrarComision, anularComision } from '../services/comisionesService'
import { hoyAR, formatMoney } from '../utils/helpers'

const MEDIOS = ['Transferencia', 'Efectivo', 'Cheque', 'Otro']

const EMPTY_FORM = { fecha: hoyAR(), vendedorId: '', monto: '', medio: 'Efectivo', notas: '' }

const fmt = formatMoney

export default function ComisionesPage() {
  const { toasts, toast } = useToast()

  const [comisiones, setComisiones] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)

  const [filtroVendedorId, setFiltroVendedorId] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre')
      .then(({ data }) => setVendedores(data || []))
    loadComisiones()
  }, [])

  async function loadComisiones() {
    setLoading(true)
    try {
      const { data } = await supabase.from('comisiones')
        .select('id,fecha,vendedor_id,monto,medio,notas')
        .order('fecha', { ascending: false })
      setComisiones(data || [])
    } finally { setLoading(false) }
  }

  function nombreVendedor(vendedorId) {
    return vendedores.find(v => v.user_id === vendedorId)?.nombre || 'Vendedor eliminado'
  }

  const comisionesFiltradas = filtroVendedorId
    ? comisiones.filter(c => c.vendedor_id === filtroVendedorId)
    : comisiones

  function abrirNuevaComision() {
    setForm({ ...EMPTY_FORM, fecha: hoyAR() })
    setModalOpen(true)
  }

  async function saveComision() {
    if (!form.vendedorId) { toast('Elegí un vendedor', 'error'); return }
    if (!form.fecha) { toast('Elegí la fecha', 'error'); return }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    setSaving(true)
    try {
      await registrarComision({
        fecha: form.fecha, vendedorId: form.vendedorId, monto: form.monto, medio: form.medio, notas: form.notas
      })
      toast('Comisión registrada ✓')
      setModalOpen(false)
      loadComisiones()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  async function handleAnular(c) {
    if (!confirm('¿Anular esta comisión?')) return
    try {
      await anularComision(c.id)
      toast('Comisión anulada')
      loadComisiones()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Comisiones</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={abrirNuevaComision}>+ Registrar comisión</button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={filtroVendedorId} onChange={e => setFiltroVendedorId(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">Todos los vendedores</option>
          {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
        </select>
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : comisionesFiltradas.length === 0 ? (
          <div className="empty"><div className="empty-icon">🤝</div><p>No hay comisiones registradas</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Vendedor</th>
                  <th>Monto</th>
                  <th>Medio</th>
                  <th>Notas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {comisionesFiltradas.map(c => (
                  <tr key={c.id}>
                    <td>{c.fecha}</td>
                    <td>{nombreVendedor(c.vendedor_id)}</td>
                    <td><strong>{fmt(c.monto)}</strong></td>
                    <td>{c.medio}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{c.notas || '—'}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => handleAnular(c)}>↩ Anular</button></td>
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
        ) : comisionesFiltradas.length === 0 ? (
          <div className="empty"><div className="empty-icon">🤝</div><p>No hay comisiones registradas</p></div>
        ) : comisionesFiltradas.map(c => {
          const fechaCorta = c.fecha ? new Date(c.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'
          return (
            <div key={c.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-fecha">{fechaCorta}</span>
                <span className="badge badge-blue">{c.medio}</span>
              </div>
              <div className="op-card-cliente">{nombreVendedor(c.vendedor_id)}</div>
              <div className="op-card-total" style={{ color: 'var(--danger)' }}>{fmt(c.monto)}</div>
              <div className="op-card-actions" style={{ marginTop: 8 }}>
                <button className="btn btn-danger" onClick={() => handleAnular(c)}>↩ Anular</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal registrar comisión */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Registrar comisión</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Vendedor *</label>
                <select value={form.vendedorId} onChange={e => setForm(f => ({ ...f, vendedorId: e.target.value }))}>
                  <option value="">— Elegí un vendedor —</option>
                  {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
                </select>
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
              <button className="btn btn-primary" onClick={saveComision} disabled={saving || !form.vendedorId}>{saving ? 'Guardando...' : 'Registrar comisión'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
