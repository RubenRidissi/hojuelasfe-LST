import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const EMPTY_FORM = {
  id: '', codigo: '', codigo_viejo: '', familia: '', variante: '',
  nombre: '', descripcion: '', costo: '', margen_pct: '', precio: '',
  margen_mayorista: '', precio_mayorista: '', unidad: 'unidad',
  stock: 0, stock_minimo: 0, promo: false, promo_paga: '', promo_lleva: '',
  precio_editable: false, activo: true
}

export default function ProductosPage() {
  const { isAdmin } = useAuth()
  const { toasts, toast } = useToast()

  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroFamilia, setFiltroFamilia] = useState('')
  const [search, setSearch] = useState('')

  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  useEffect(() => { loadProductos() }, [])

  async function loadProductos() {
    setLoading(true)
    try {
      const [{ data: prods }, { data: stockData }] = await Promise.all([
        supabase.from('productos').select('*').order('codigo'),
        supabase.from('stock_actual').select('id,stock')
      ])
      const stockMap = {}
      ;(stockData || []).forEach(s => { stockMap[s.id] = parseFloat(s.stock || 0) })
      setProductos((prods || []).map(p => ({ ...p, stock_real: stockMap[p.id] ?? 0 })))
    } catch (e) { console.error(e) } finally { setLoading(false) }
  }

  const familias = useMemo(() => [...new Set(productos.map(p => p.familia).filter(Boolean))].sort(), [productos])

  const productosFiltrados = useMemo(() => {
    let list = productos
    if (filtroFamilia) list = list.filter(p => p.familia === filtroFamilia)
    if (search) list = list.filter(p => (p.nombre + ' ' + (p.codigo || '')).toLowerCase().includes(search.toLowerCase()))
    return list
  }, [productos, filtroFamilia, search])

  // Calcular precio desde margen
  function calcPrecio(costo, margen) {
    const c = parseFloat(costo) || 0
    const m = parseFloat(margen) || 0
    return m > 0 ? c / (1 - m / 100) : c
  }

  function handleCostoMargenChange(field, value) {
    const newForm = { ...form, [field]: value }
    const precio = calcPrecio(
      field === 'costo' ? value : newForm.costo,
      field === 'margen_pct' ? value : newForm.margen_pct
    )
    const precioMay = calcPrecio(
      field === 'costo' ? value : newForm.costo,
      field === 'margen_mayorista' ? value : newForm.margen_mayorista
    )
    setForm({ ...newForm, precio: precio.toFixed(2), precio_mayorista: precioMay.toFixed(2) })
  }

  async function saveProducto() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio', 'error'); return }
    if (!form.codigo.trim()) { toast('El código es obligatorio', 'error'); return }
    if (form.promo && (!form.promo_paga || !form.promo_lleva)) { toast('Completá los valores de la promoción', 'error'); return }
    setSaving(true)
    try {
      const data = {
        codigo: form.codigo.trim().toUpperCase(),
        codigo_viejo: form.codigo_viejo.trim(),
        familia: form.familia.trim(),
        variante: form.variante.trim(),
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim(),
        costo: parseFloat(form.costo) || 0,
        margen_pct: parseFloat(form.margen_pct) || 0,
        precio: parseFloat(form.precio) || 0,
        margen_mayorista: parseFloat(form.margen_mayorista) || 0,
        precio_mayorista: parseFloat(form.precio_mayorista) || 0,
        unidad: form.unidad.trim() || 'unidad',
        stock: parseInt(form.stock) || 0,
        stock_minimo: parseInt(form.stock_minimo) || 0,
        promo: form.promo ? `${parseInt(form.promo_paga) || 0}+${parseInt(form.promo_lleva) || 0}` : null,
        precio_editable: form.precio_editable,
        activo: form.activo
      }
      if (form.id) {
        await supabase.from('productos').update(data).eq('id', form.id)
        toast('Producto actualizado')
      } else {
        await supabase.from('productos').insert(data)
        toast('Producto creado')
      }
      setModalOpen(false)
      setForm(EMPTY_FORM)
      loadProductos()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  function editProducto(p) {
    const [promoPaga, promoLleva] = p.promo ? p.promo.split('+') : ['', '']
    setForm({
      id: p.id, codigo: p.codigo || '', codigo_viejo: p.codigo_viejo || '',
      familia: p.familia || '', variante: p.variante || '',
      nombre: p.nombre || '', descripcion: p.descripcion || '',
      costo: p.costo || '', margen_pct: p.margen_pct || '',
      precio: p.precio || '', margen_mayorista: p.margen_mayorista || '',
      precio_mayorista: p.precio_mayorista || '', unidad: p.unidad || 'unidad',
      stock: p.stock || 0, stock_minimo: p.stock_minimo || 0,
      promo: !!p.promo, promo_paga: promoPaga || '', promo_lleva: promoLleva || '',
      precio_editable: !!p.precio_editable, activo: p.activo !== false
    })
    setModalOpen(true)
  }

  async function deleteProducto() {
    if (!form.id) return
    if (!confirm(`¿Eliminar el producto "${form.nombre}"? Esta acción no se puede deshacer.`)) return
    try {
      await supabase.from('productos').delete().eq('id', form.id)
      toast('Producto eliminado')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      loadProductos()
    } catch (e) { toast('Error al eliminar: ' + e.message, 'error') }
  }

  function stockBadge(p) {
    const stock = p.stock_real ?? 0
    if (stock <= 0) return <span className="badge badge-red">⚠ {stock}</span>
    if (p.stock_minimo > 0 && stock <= p.stock_minimo) return <span className="badge badge-yellow">⚠ {stock}</span>
    return <span className="badge badge-green">{stock}</span>
  }

  // Agrupar por familia
  const grupos = useMemo(() => {
    const g = {}
    productosFiltrados.forEach(p => {
      const fam = p.familia || 'Sin familia'
      if (!g[fam]) g[fam] = []
      g[fam].push(p)
    })
    return g
  }, [productosFiltrados])

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Productos</h1>
        {isAdmin && (
          <div className="page-header-actions">
            <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setModalOpen(true) }}>+ Nuevo producto</button>
          </div>
        )}
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 2 }} />
        <select value={filtroFamilia} onChange={e => setFiltroFamilia(e.target.value)} style={{ flex: 1 }}>
          <option value="">Todas las familias</option>
          {familias.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : productosFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">📦</div><p>No hay productos todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Nombre</th><th>Precio Dist.</th><th>Precio May.</th><th>Stock</th><th>Estado</th><th></th></tr></thead>
              <tbody>
                {Object.entries(grupos).map(([fam, prods]) => [
                  <tr key={`fam-${fam}`} style={{ background: 'var(--primary-light)' }}>
                    <td colSpan={7} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--primary-dark)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{fam}</td>
                  </tr>,
                  ...prods.map(p => (
                    <tr key={p.id}>
                      <td>
                        <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{p.codigo || '—'}</code>
                        {p.codigo_viejo && <span style={{ fontSize: 11, color: 'var(--muted)', marginLeft: 4 }}>({p.codigo_viejo})</span>}
                      </td>
                      <td>
                        <strong>{p.nombre}</strong>
                        {p.promo_costo_activa && <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 10, padding: '2px 6px', borderRadius: 10, marginLeft: 4 }}>📉 Costo promo</span>}
                        {p.descripcion && <><br /><span style={{ color: 'var(--muted)', fontSize: 12 }}>{p.descripcion}</span></>}
                        {p.variante && <><br /><span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.variante}</span></>}
                      </td>
                      <td style={{ fontWeight: 600 }}>${parseFloat(p.precio || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                      <td style={{ color: '#2563EB', fontWeight: 600 }}>
                        {parseFloat(p.precio_mayorista || 0) > 0
                          ? `$${parseFloat(p.precio_mayorista).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
                          : <span style={{ color: 'var(--muted)' }}>—</span>}
                      </td>
                      <td>{stockBadge(p)} <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unidad || ''}</span></td>
                      <td>{p.activo !== false ? <span className="badge badge-green">Activo</span> : <span className="badge badge-gray">Inactivo</span>}</td>
                      <td>{isAdmin && <button className="btn btn-sm btn-secondary" onClick={() => editProducto(p)}>Editar</button>}</td>
                    </tr>
                  ))
                ])}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Cards mobile */}
      <div className="mobile-cards">
        {Object.entries(grupos).map(([fam, prods]) => (
          <div key={fam} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 4px 4px' }}>{fam}</div>
            {prods.map(p => {
              const stock = p.stock_real ?? 0
              const stockColor = stock <= 0 ? '#DC2626' : (p.stock_minimo > 0 && stock <= p.stock_minimo) ? '#D97706' : '#16A34A'
              return (
                <div key={p.id} className="op-card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{p.nombre}</div>
                      {p.variante && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.variante}</div>}
                      {p.codigo && <code style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>{p.codigo}</code>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Dist: ${parseFloat(p.precio || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                      {parseFloat(p.precio_mayorista || 0) > 0 && <div style={{ fontSize: 12, color: '#2563EB' }}>May: ${parseFloat(p.precio_mayorista).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>}
                      <div style={{ fontSize: 12, color: stockColor, fontWeight: 600 }}>Stock: {stock} {p.unidad || ''}</div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="op-card-actions" style={{ marginTop: 10 }}>
                      <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => editProducto(p)}>✏ Editar</button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* ===== MODAL PRODUCTO ===== */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 600 }}>
            <div className="modal-header">
              <h2>{form.id ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Código *</label>
                  <input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} placeholder="Ej: 108" />
                </div>
                <div className="form-group">
                  <label>Código viejo</label>
                  <input value={form.codigo_viejo} onChange={e => setForm(f => ({ ...f, codigo_viejo: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Familia</label>
                  <input value={form.familia} onChange={e => setForm(f => ({ ...f, familia: e.target.value }))} placeholder="Ej: Granola" list="familias-list" />
                  <datalist id="familias-list">{familias.map(f => <option key={f} value={f} />)}</datalist>
                </div>
                <div className="form-group">
                  <label>Variante</label>
                  <input value={form.variante} onChange={e => setForm(f => ({ ...f, variante: e.target.value }))} placeholder="Ej: 500g" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre del producto" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Descripción</label>
                  <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
              </div>

              {/* Precios */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Precios — Distribuidor</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Costo</label>
                    <input type="number" min="0" step="0.01" value={form.costo} onChange={e => handleCostoMargenChange('costo', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Margen %</label>
                    <input type="number" min="0" max="100" step="0.1" value={form.margen_pct} onChange={e => handleCostoMargenChange('margen_pct', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Precio Dist.</label>
                    <input type="number" min="0" step="0.01" value={form.precio} onChange={e => setForm(f => ({ ...f, precio: e.target.value }))} />
                  </div>
                </div>
                <div style={{ fontWeight: 600, fontSize: 12, color: 'var(--muted)', marginBottom: 8, textTransform: 'uppercase' }}>Precios — Mayorista</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Margen May. %</label>
                    <input type="number" min="0" max="100" step="0.1" value={form.margen_mayorista} onChange={e => handleCostoMargenChange('margen_mayorista', e.target.value)} />
                  </div>
                  <div className="form-group">
                    <label>Precio May.</label>
                    <input type="number" min="0" step="0.01" value={form.precio_mayorista} onChange={e => setForm(f => ({ ...f, precio_mayorista: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Unidad</label>
                  <input value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} placeholder="unidad" />
                </div>
                <div className="form-group">
                  <label>Stock actual</label>
                  <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Stock mínimo</label>
                  <input type="number" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} />
                </div>
              </div>

              {/* Promo */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                  <input type="checkbox" checked={form.promo} onChange={e => setForm(f => ({ ...f, promo: e.target.checked }))} />
                  Tiene promoción
                </label>
              </div>
              {form.promo && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Paga</label>
                    <input type="number" min="1" value={form.promo_paga} onChange={e => setForm(f => ({ ...f, promo_paga: e.target.value }))} placeholder="Ej: 6" />
                  </div>
                  <div className="form-group">
                    <label>Lleva (bonificado)</label>
                    <input type="number" min="1" value={form.promo_lleva} onChange={e => setForm(f => ({ ...f, promo_lleva: e.target.value }))} placeholder="Ej: 1" />
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 16, marginBottom: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                  <input type="checkbox" checked={form.precio_editable} onChange={e => setForm(f => ({ ...f, precio_editable: e.target.checked }))} />
                  Precio editable al cargar
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
                  <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} />
                  Activo
                </label>
              </div>
            </div>
            <div className="modal-footer">
              {form.id && <button className="btn btn-danger" onClick={deleteProducto} style={{ marginRight: 'auto' }}>🗑 Eliminar</button>}
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveProducto} disabled={saving}>{saving ? 'Guardando...' : 'Guardar'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
