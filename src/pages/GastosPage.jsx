import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { registrarGasto, anularGasto } from '../services/gastosService'
import { hoyAR, formatMoney } from '../utils/helpers'

const MEDIOS = ['Transferencia', 'Efectivo', 'Cheque', 'Otro']
const CATEGORIAS = ['Alquiler', 'Combustible', 'Logística', 'Otro']

const EMPTY_FORM = {
  fecha: hoyAR(), categoria: 'Alquiler',
  monto: '', medio: 'Efectivo', notas: '', recepcionId: ''
}

const fmt = formatMoney

export default function GastosPage() {
  const { toasts, toast } = useToast()

  const [gastos, setGastos] = useState([])
  const [recepciones, setRecepciones] = useState([])
  const [loading, setLoading] = useState(true)

  const [filtroCategoria, setFiltroCategoria] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadAll() }, [])

  async function loadAll() {
    setLoading(true)
    try {
      await Promise.all([loadGastos(), loadRecepciones()])
    } finally { setLoading(false) }
  }

  async function loadGastos() {
    const { data } = await supabase.from('gastos')
      .select('id,fecha,categoria,monto,medio,notas,recepcion_id,recepciones(numero,remito_proveedor)')
      .order('fecha', { ascending: false })
    setGastos(data || [])
  }

  async function loadRecepciones() {
    const { data } = await supabase.from('recepciones')
      .select('id,numero,fecha_recepcion_real,remito_proveedor,proveedores(nombre)')
      .neq('estado', 'borrador')
      .order('fecha_recepcion_real', { ascending: false })
      .limit(50)
    setRecepciones(data || [])
  }

  const gastosFiltrados = filtroCategoria
    ? gastos.filter(g => g.categoria === filtroCategoria)
    : gastos

  function abrirNuevoGasto() {
    setForm({ ...EMPTY_FORM, fecha: hoyAR() })
    setModalOpen(true)
  }

  async function saveGasto() {
    if (!form.fecha) { toast('Elegí la fecha', 'error'); return }
    if (!form.monto || parseFloat(form.monto) <= 0) { toast('Ingresá un monto válido', 'error'); return }
    setSaving(true)
    try {
      await registrarGasto({
        fecha: form.fecha, categoria: form.categoria, monto: form.monto, medio: form.medio,
        notas: form.notas, recepcionId: form.categoria === 'Logística' ? (form.recepcionId || null) : null
      })
      toast('Gasto registrado ✓')
      setModalOpen(false)
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  async function handleAnular(g) {
    if (!confirm('¿Anular este gasto?')) return
    try {
      await anularGasto(g.id)
      toast('Gasto anulado')
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  function recepcionLabel(r) {
    if (!r) return '—'
    return `#${String(r.numero).padStart(4, '0')}${r.remito_proveedor ? ` (${r.remito_proveedor})` : ''}`
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Gastos</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={abrirNuevoGasto}>+ Registrar gasto</button>
        </div>
      </div>

      <div className="filter-bar">
        <select value={filtroCategoria} onChange={e => setFiltroCategoria(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
          <option value="">Todas las categorías</option>
          {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : gastosFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">🧾</div><p>No hay gastos registrados</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Categoría</th>
                  <th>Recepción</th>
                  <th>Monto</th>
                  <th>Medio</th>
                  <th>Notas</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {gastosFiltrados.map(g => (
                  <tr key={g.id}>
                    <td>{g.fecha}</td>
                    <td><span className="badge badge-blue">{g.categoria}</span></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{recepcionLabel(g.recepciones)}</td>
                    <td><strong>{fmt(g.monto)}</strong></td>
                    <td>{g.medio}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{g.notas || '—'}</td>
                    <td><button className="btn btn-sm btn-danger" onClick={() => handleAnular(g)}>↩ Anular</button></td>
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
        ) : gastosFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">🧾</div><p>No hay gastos registrados</p></div>
        ) : gastosFiltrados.map(g => {
          const fechaCorta = g.fecha ? new Date(g.fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) : '—'
          return (
            <div key={g.id} className="op-card">
              <div className="op-card-header">
                <span className="op-card-fecha">{fechaCorta}</span>
                <span className="badge badge-blue">{g.categoria}</span>
              </div>
              <div className="op-card-cliente">
                {g.notas || recepcionLabel(g.recepciones)}
              </div>
              <div className="op-card-total" style={{ color: 'var(--danger)' }}>{fmt(g.monto)}</div>
              <div className="op-card-actions" style={{ marginTop: 8 }}>
                <button className="btn btn-danger" onClick={() => handleAnular(g)}>↩ Anular</button>
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal registrar gasto */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 560 }}>
            <div className="modal-header">
              <h2>Registrar gasto</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Fecha *</label>
                  <input type="date" value={form.fecha} onChange={e => setForm(f => ({ ...f, fecha: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Categoría *</label>
                  <select value={form.categoria} onChange={e => setForm(f => ({ ...f, categoria: e.target.value, recepcionId: '' }))}>
                    {CATEGORIAS.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>

              {form.categoria === 'Logística' && (
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                  <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>
                    Asociar a una recepción (opcional)
                  </div>
                  <select value={form.recepcionId} onChange={e => setForm(f => ({ ...f, recepcionId: e.target.value }))}>
                    <option value="">— Sin asociar —</option>
                    {recepciones.map(r => (
                      <option key={r.id} value={r.id}>{recepcionLabel(r)} · {r.proveedores?.nombre || 'Recepción suelta'}</option>
                    ))}
                  </select>
                </div>
              )}

              <div className="form-row">
                <div className="form-group">
                  <label>Monto *</label>
                  <input type="number" min="0" step="0.01" value={form.monto} onChange={e => setForm(f => ({ ...f, monto: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Medio</label>
                  <select value={form.medio} onChange={e => setForm(f => ({ ...f, medio: e.target.value }))}>
                    {MEDIOS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveGasto} disabled={saving}>{saving ? 'Guardando...' : 'Registrar gasto'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
