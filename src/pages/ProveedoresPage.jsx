import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const EMPTY_FORM = { id: '', nombre: '', cuit: '', telefono: '', direccion: '', notas: '' }

export default function ProveedoresPage() {
  const { toasts, toast } = useToast()

  const [proveedores, setProveedores] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadProveedores() }, [])

  async function loadProveedores() {
    setLoading(true)
    try {
      const { data } = await supabase.from('proveedores').select('*').order('nombre')
      setProveedores(data || [])
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const proveedoresFiltrados = search
    ? proveedores.filter(p => p.nombre.toLowerCase().includes(search.toLowerCase()))
    : proveedores

  function abrirNuevo() { setForm(EMPTY_FORM); setModalOpen(true) }

  function abrirEditar(p) {
    setForm({
      id: p.id, nombre: p.nombre || '', cuit: p.cuit || '',
      telefono: p.telefono || '', direccion: p.direccion || '', notas: p.notas || ''
    })
    setModalOpen(true)
  }

  async function saveProveedor() {
    if (!form.nombre.trim()) { toast('Ingresá el nombre del proveedor', 'error'); return }
    setSaving(true)
    try {
      const data = {
        nombre: form.nombre.trim(), cuit: form.cuit.trim() || null,
        telefono: form.telefono.trim() || null, direccion: form.direccion.trim() || null,
        notas: form.notas.trim() || null
      }
      if (form.id) {
        await supabase.from('proveedores').update(data).eq('id', form.id)
        toast('Proveedor actualizado')
      } else {
        await supabase.from('proveedores').insert(data)
        toast('Proveedor creado')
      }
      setModalOpen(false)
      loadProveedores()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  async function deleteProveedor(p) {
    try {
      const [{ count: pedidosCount }, { count: recepCount }] = await Promise.all([
        supabase.from('pedidos_proveedor').select('id', { count: 'exact', head: true }).eq('proveedor_id', p.id),
        supabase.from('recepciones').select('id', { count: 'exact', head: true }).eq('proveedor_id', p.id)
      ])
      if (pedidosCount || recepCount) {
        toast('Este proveedor tiene pedidos o recepciones asociadas y no se puede borrar.', 'error')
        return
      }
    } catch (e) { toast('Error al validar: ' + e.message, 'error'); return }

    if (!confirm(`¿Borrar el proveedor "${p.nombre}"?`)) return
    try {
      await supabase.from('proveedores').delete().eq('id', p.id)
      toast('Proveedor eliminado')
      loadProveedores()
    } catch (e) { toast('Error al eliminar: ' + e.message, 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Proveedores</h1>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={abrirNuevo}>+ Nuevo proveedor</button>
        </div>
      </div>

      <div className="filter-bar">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nombre..." style={{ flex: 1, minWidth: 180 }} />
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : proveedoresFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏭</div><p>No hay proveedores cargados todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Nombre</th><th>CUIT</th><th>Teléfono</th><th>Dirección</th><th>Acciones</th></tr>
              </thead>
              <tbody>
                {proveedoresFiltrados.map(p => (
                  <tr key={p.id}>
                    <td><strong>{p.nombre}</strong></td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.cuit || '—'}</td>
                    <td style={{ fontSize: 12 }}>{p.telefono || '—'}</td>
                    <td style={{ fontSize: 12, color: 'var(--muted)' }}>{p.direccion || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-sm btn-secondary" onClick={() => abrirEditar(p)}>✏</button>
                        <button className="btn btn-sm btn-danger" onClick={() => deleteProveedor(p)}>✕</button>
                      </div>
                    </td>
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
        ) : proveedoresFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">🏭</div><p>No hay proveedores cargados todavía</p></div>
        ) : proveedoresFiltrados.map(p => (
          <div key={p.id} className="op-card">
            <div style={{ fontWeight: 600, fontSize: 15 }}>{p.nombre}</div>
            {p.cuit && <div style={{ fontSize: 12, color: 'var(--muted)' }}>CUIT: {p.cuit}</div>}
            {p.telefono && <div style={{ fontSize: 12, color: 'var(--muted)' }}>Tel: {p.telefono}</div>}
            {p.direccion && <div style={{ fontSize: 12, color: 'var(--muted)' }}>{p.direccion}</div>}
            <div className="op-card-actions" style={{ marginTop: 10 }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => abrirEditar(p)}>✏ Editar</button>
              <button className="btn btn-danger" style={{ flex: 1 }} onClick={() => deleteProveedor(p)}>✕</button>
            </div>
          </div>
        ))}
      </div>

      {/* ===== MODAL PROVEEDOR ===== */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{form.id ? 'Editar proveedor' : 'Nuevo proveedor'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Nombre *</label>
                <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del proveedor" />
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CUIT</label>
                  <input value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} placeholder="20-12345678-9" />
                </div>
                <div className="form-group">
                  <label>Teléfono</label>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Dirección</label>
                <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} />
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveProveedor} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
