import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { fmtMonto } from '../utils/money'

const TIPOS_CLIENTE = ['Representante', 'Distribuidor', 'Mayorista', 'Supermercado', 'Minorista']

const MARKUP_COLS = [
  { key: 'markup_representante', precio: 'precio_representante', label: 'Representante' },
  { key: 'markup_distribuidor', precio: 'precio_distribuidor', label: 'Distribuidor' },
  { key: 'markup_mayorista', precio: 'precio_mayorista', label: 'Mayorista' },
  { key: 'markup_supermercado', precio: 'precio_supermercado', label: 'Supermercado' },
  { key: 'markup_almacen', precio: 'precio_almacen', label: 'Minorista' },
]

const BULK_PRICE_FIELDS = ['descuento_costo', ...MARKUP_COLS.map(c => c.key)]

const EMPTY_FORM = {
  id: '', codigo: '', codigo_viejo: '', familia: '', variante: '',
  nombre: '', descripcion: '', costo: '', descuento_costo: '0',
  markup_representante: '0', markup_distribuidor: '0',
  markup_mayorista: '0', markup_supermercado: '0', markup_almacen: '0',
  unidad: 'unidad', stock: 0, stock_minimo: 0, pqxbj: 0, descuento_bandeja: '0',
  promo: false, promo_paga: '', promo_lleva: '',
  precio_editable: false, activo: true
}


const EMPTY_BULK_PRICE_FORM = {
  descuento_costo: '0',
  markup_representante: '0',
  markup_distribuidor: '0',
  markup_mayorista: '0',
  markup_supermercado: '0',
  markup_almacen: '0',
  familias: []
}

function calcPrecio(costo, descuento_costo, markup) {
  const c = parseFloat(costo) || 0
  const d = parseFloat(descuento_costo) || 0
  const m = parseFloat(markup) || 0
  const costoNeto = c * (1 - d / 100)
  return costoNeto * (1 + m / 100)
}

export default function ProductosPage() {
  const { isAdmin, puedeVerMontos } = useAuth()
  const { toasts, toast } = useToast()

  const [productos, setProductos] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroFamilia, setFiltroFamilia] = useState('')
  const [filtroActivo, setFiltroActivo] = useState('activos')
  const [search, setSearch] = useState('')
  const [modalOpen, setModalOpen] = useState(false)
  const [priceModalOpen, setPriceModalOpen] = useState(false)
  const [verProducto, setVerProducto] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [bulkPriceForm, setBulkPriceForm] = useState(EMPTY_BULK_PRICE_FORM)
  const [saving, setSaving] = useState(false)
  const [savingPrices, setSavingPrices] = useState(false)

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
    if (!isAdmin) {
      list = list.filter(p => p.activo !== false)
    } else if (filtroActivo === 'activos') {
      list = list.filter(p => p.activo !== false)
    } else if (filtroActivo === 'inactivos') {
      list = list.filter(p => p.activo === false)
    }
    if (filtroFamilia) list = list.filter(p => p.familia === filtroFamilia)
    if (search) list = list.filter(p => (p.nombre + ' ' + (p.codigo || '')).toLowerCase().includes(search.toLowerCase()))
    return list
  }, [productos, filtroFamilia, filtroActivo, search, isAdmin])

  // Valor común de cada campo entre los productos objetivo (familias seleccionadas, o todos)
  // Si todos comparten el mismo valor, se prellena; si son distintos, queda vacío ("varios valores")
  const valoresComunesBulk = useMemo(() => {
    const target = bulkPriceForm.familias.length
      ? productos.filter(p => bulkPriceForm.familias.includes(p.familia))
      : productos

    const result = {}
    BULK_PRICE_FIELDS.forEach(key => {
      if (!target.length) { result[key] = '' ; return }
      const primero = Number(target[0][key] ?? 0)
      const uniforme = target.every(p => Number(p[key] ?? 0) === primero)
      result[key] = uniforme ? String(primero) : ''
    })
    return result
  }, [productos, bulkPriceForm.familias])

  useEffect(() => {
    setBulkPriceForm(f => ({ ...f, ...valoresComunesBulk }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bulkPriceForm.familias.join(',')])

  // Precios calculados en tiempo real para el formulario
  const preciosPreview = useMemo(() => {
    return MARKUP_COLS.map(col => ({
      label: col.label,
      precio: calcPrecio(form.costo, form.descuento_costo, form[col.key])
    }))
  }, [form.costo, form.descuento_costo, form.markup_representante, form.markup_distribuidor, form.markup_mayorista, form.markup_supermercado, form.markup_almacen])

  async function aplicarPoliticaPrecios() {
    const familiasSel = bulkPriceForm.familias
    const productosObjetivo = familiasSel.length
      ? productos.filter(p => familiasSel.includes(p.familia))
      : productos

    if (!productosObjetivo.length) {
      toast('No hay productos para actualizar', 'error')
      return
    }

    const payload = {}
    BULK_PRICE_FIELDS.forEach(key => {
      const val = bulkPriceForm[key]
      if (val !== '' && val !== null && val !== undefined) payload[key] = parseFloat(val) || 0
    })

    if (!Object.keys(payload).length) {
      toast('No definiste ningún valor para aplicar (todos los campos están en "varios valores")', 'error')
      return
    }

    const alcance = familiasSel.length
      ? `${productosObjetivo.length} productos (familias: ${familiasSel.join(', ')})`
      : `todos los productos (${productosObjetivo.length})`
    if (!confirm(`¿Aplicar esta política de precios a ${alcance}?`)) return

    setSavingPrices(true)
    try {
      const ids = productosObjetivo.map(p => p.id).filter(Boolean)
      const { error } = await supabase
        .from('productos')
        .update(payload)
        .in('id', ids)

      if (error) throw error

      toast('Política de precios aplicada')
      setPriceModalOpen(false)
      await loadProductos()
    } catch (e) {
      toast('Error al actualizar precios: ' + e.message, 'error')
    } finally {
      setSavingPrices(false)
    }
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
        descuento_costo: parseFloat(form.descuento_costo) || 0,
        markup_representante: parseFloat(form.markup_representante) || 0,
        markup_distribuidor: parseFloat(form.markup_distribuidor) || 0,
        markup_mayorista: parseFloat(form.markup_mayorista) || 0,
        markup_supermercado: parseFloat(form.markup_supermercado) || 0,
        markup_almacen: parseFloat(form.markup_almacen) || 0,
        unidad: form.unidad.trim() || 'unidad',
        stock: parseInt(form.stock) || 0,
        stock_minimo: parseInt(form.stock_minimo) || 0,
        pqxbj: parseInt(form.pqxbj) || 0,
        descuento_bandeja: parseFloat(form.descuento_bandeja) || 0,
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
      costo: p.costo || '', descuento_costo: p.descuento_costo ?? '0',
      markup_representante: p.markup_representante ?? '0',
      markup_distribuidor: p.markup_distribuidor ?? '0',
      markup_mayorista: p.markup_mayorista ?? '0',
      markup_supermercado: p.markup_supermercado ?? '0',
      markup_almacen: p.markup_almacen ?? '0',
      unidad: p.unidad || 'unidad',
      stock: p.stock || 0, stock_minimo: p.stock_minimo || 0, pqxbj: p.pqxbj || 0,
      descuento_bandeja: p.descuento_bandeja ?? '0',
      promo: !!p.promo, promo_paga: promoPaga || '', promo_lleva: promoLleva || '',
      precio_editable: !!p.precio_editable, activo: p.activo !== false
    })
    setModalOpen(true)
  }

  async function deleteProducto() {
    if (!form.id) return
    if (!confirm(`¿Eliminar el producto "${form.nombre}"?`)) return
    try {
      await supabase.from('productos').delete().eq('id', form.id)
      toast('Producto eliminado')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      loadProductos()
    } catch (e) { toast('Error: ' + e.message, 'error') }
  }

  function stockBadge(p) {
    const stock = p.stock_real ?? 0
    if (stock <= 0) return <span className="badge badge-red">⚠ {stock}</span>
    if (p.stock_minimo > 0 && stock <= p.stock_minimo) return <span className="badge badge-yellow">⚠ {stock}</span>
    return <span className="badge badge-green">{stock}</span>
  }

  function stockAccentColor(p) {
    const stock = p.stock_real ?? 0
    if (stock <= 0) return '#991B1B'
    if (p.stock_minimo > 0 && stock <= p.stock_minimo) return '#92400E'
    return '#15803D'
  }

  const grupos = useMemo(() => {
    const g = {}
    productosFiltrados.forEach(p => {
      const fam = p.familia || 'Sin familia'
      if (!g[fam]) g[fam] = []
      g[fam].push(p)
    })
    return g
  }, [productosFiltrados])

  const costoNeto = (p) => {
    const c = parseFloat(p.costo || 0)
    const d = parseFloat(p.descuento_costo || 0)
    return c * (1 - d / 100)
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Productos</h1>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" onClick={() => setPriceModalOpen(true)}>💲 Actualizar precios</button>
            <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setModalOpen(true) }}>+ Nuevo producto</button>
          </div>
        )}
      </div>

      <div className="filter-bar">
        <input type="text" placeholder="Buscar producto..." value={search} onChange={e => setSearch(e.target.value)} style={{ flex: 2 }} />
        <select value={filtroFamilia} onChange={e => setFiltroFamilia(e.target.value)} style={{ flex: 1 }}>
          <option value="">Todas las familias</option>
          {familias.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        {isAdmin && (
          <select value={filtroActivo} onChange={e => setFiltroActivo(e.target.value)} style={{ flex: 1 }}>
            <option value="activos">Solo activos</option>
            <option value="inactivos">Solo inactivos</option>
            <option value="todos">Todos</option>
          </select>
        )}
      </div>

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Código</th><th>Nombre</th><th style={{ textAlign: 'center' }}>Pq x band.</th>{isAdmin && <><th>Costo</th><th>Costo neto</th></>}
                  {MARKUP_COLS.map(c => <th key={c.key} style={{ textAlign: 'right' }}>{c.label}</th>)}
                  <th>Stock</th>{isAdmin && <th></th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(grupos).map(([fam, prods]) => [
                  <tr key={`fam-${fam}`} style={{ background: 'var(--primary-light)' }}>
                    <td colSpan={4 + (isAdmin ? 3 : 0) + MARKUP_COLS.length} style={{ padding: '6px 12px', fontSize: 11, fontWeight: 700, color: 'var(--primary-dark)', textTransform: 'uppercase' }}>{fam}</td>
                  </tr>,
                  ...prods.map(p => (
                    <tr key={p.id}>
                      <td><code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4 }}>{p.codigo || '—'}</code></td>
                      <td>
                        <strong>{p.nombre}</strong>
                        {p.variante && <><br /><span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.variante}</span></>}
                      </td>
                      <td style={{ textAlign: 'center', fontSize: 12 }}>{p.pqxbj || '—'}</td>
                      {isAdmin && (
                        <>
                          <td style={{ fontSize: 12 }}>${parseFloat(p.costo || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
                          <td style={{ fontSize: 12, color: 'var(--muted)' }}>
                            ${costoNeto(p).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                            {parseFloat(p.descuento_costo || 0) > 0 && <span style={{ fontSize: 10, color: 'var(--success)', marginLeft: 4 }}>-{p.descuento_costo}%</span>}
                          </td>
                        </>
                      )}
                      {MARKUP_COLS.map(col => (
                        <td key={col.key} style={{ textAlign: 'right', fontSize: 12, fontWeight: 600 }}>
                          {fmtMonto(p[col.precio], puedeVerMontos, { maximumFractionDigits: 2 })}
                          {isAdmin && <span style={{ fontSize: 10, color: 'var(--muted)', display: 'block' }}>{p[col.key] || 0}%</span>}
                        </td>
                      ))}
                      <td>{stockBadge(p)}</td>
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
          <div key={fam}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', padding: '8px 4px 4px' }}>{fam}</div>
            {prods.map(p => (
              <div key={p.id} className="op-card op-card-elevated" style={{ marginBottom: 8, borderLeftColor: stockAccentColor(p), cursor: 'pointer' }} onClick={() => setVerProducto(p)}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{p.nombre}</div>
                    {p.variante && <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.variante}</div>}
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 4 }}>
                      {p.codigo && <code style={{ fontSize: 11 }}>{p.codigo}</code>}
                      {p.pqxbj > 0 && <span style={{ fontSize: 11, color: 'var(--muted)' }}>Pq x bandeja: {p.pqxbj}</span>}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', fontSize: 12, flexShrink: 0, marginLeft: 8 }}>{stockBadge(p)}</div>
                </div>
                {isAdmin && (
                  <div className="op-card-actions" style={{ marginTop: 8 }}>
                    <button className="btn btn-secondary" style={{ flex: 1 }} onClick={e => { e.stopPropagation(); editProducto(p) }}>✏ Editar</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Modal detalle producto (mobile) */}
      {verProducto && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setVerProducto(null)}>
          <div className="modal" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <h2>{verProducto.nombre}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setVerProducto(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                {verProducto.codigo && <code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 8px', borderRadius: 6 }}>{verProducto.codigo}</code>}
                {verProducto.familia && <span className="badge badge-gray">{verProducto.familia}</span>}
                {verProducto.variante && <span className="badge badge-gray">{verProducto.variante}</span>}
                {verProducto.promo && <span className="badge badge-green">🎁 {verProducto.promo}</span>}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 12 }}>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Stock</div>
                  <div style={{ marginTop: 2 }}>{stockBadge(verProducto)}</div>
                </div>
                <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                  <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Unidad</div>
                  <div style={{ marginTop: 2, fontWeight: 600 }}>{verProducto.unidad || '—'}</div>
                </div>
                {verProducto.pqxbj > 0 && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Pq x bandeja</div>
                    <div style={{ marginTop: 2, fontWeight: 600 }}>{verProducto.pqxbj}</div>
                  </div>
                )}
                {verProducto.pqxbj > 0 && parseFloat(verProducto.descuento_bandeja || 0) > 0 && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Dcto. bandeja</div>
                    <div style={{ marginTop: 2, fontWeight: 600 }}>{verProducto.descuento_bandeja}%</div>
                  </div>
                )}
                {isAdmin && (
                  <div style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px' }}>
                    <div style={{ fontSize: 10, color: 'var(--muted)', textTransform: 'uppercase' }}>Costo</div>
                    <div style={{ marginTop: 2, fontWeight: 600 }}>
                      ${parseFloat(verProducto.costo || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                      {parseFloat(verProducto.descuento_costo || 0) > 0 && (
                        <span style={{ fontSize: 11, color: 'var(--success)', display: 'block', fontWeight: 400 }}>
                          neto: ${costoNeto(verProducto).toLocaleString('es-AR', { maximumFractionDigits: 2 })} (-{verProducto.descuento_costo}%)
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Precios por tipo de cliente</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {MARKUP_COLS.map(col => (
                  <div key={col.key} style={{ background: 'var(--bg)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                    <div style={{ fontSize: 11, color: 'var(--muted)' }}>{col.label}</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary-dark)' }}>{fmtMonto(verProducto[col.precio], puedeVerMontos, { maximumFractionDigits: 2 })}</div>
                    {isAdmin && <div style={{ fontSize: 10, color: 'var(--muted)' }}>markup {verProducto[col.key] || 0}%</div>}
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setVerProducto(null)}>Cerrar</button>
              {isAdmin && <button className="btn btn-primary" onClick={() => { editProducto(verProducto); setVerProducto(null) }}>✏ Editar</button>}
            </div>
          </div>
        </div>
      )}

      {/* Modal política de precios */}
      {priceModalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setPriceModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 620 }}>
            <div className="modal-header">
              <h2>Actualizar precios</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setPriceModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 13 }}>
                Esta acción actualiza solamente el descuento y los markups. Los precios finales los recalcula Supabase automáticamente.
              </p>

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <label style={{ margin: 0 }}>Alcance (familias)</label>
                  {bulkPriceForm.familias.length > 0 && (
                    <button
                      type="button"
                      className="btn btn-sm btn-secondary"
                      onClick={() => setBulkPriceForm(f => ({ ...f, familias: [] }))}
                    >
                      Limpiar (todo el listado)
                    </button>
                  )}
                </div>
                <select
                  multiple
                  size={Math.min(Math.max(familias.length, 1), 6)}
                  value={bulkPriceForm.familias}
                  onChange={e => setBulkPriceForm(f => ({ ...f, familias: Array.from(e.target.selectedOptions, o => o.value) }))}
                  style={{ width: '100%' }}
                >
                  {familias.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--muted)' }}>
                  {bulkPriceForm.familias.length === 0
                    ? `Sin selección: se aplica a todo el listado (${productos.length} productos). Ctrl/Cmd + click para elegir una o varias familias.`
                    : `Se aplica a ${productos.filter(p => bulkPriceForm.familias.includes(p.familia)).length} productos de ${bulkPriceForm.familias.length} familia(s) seleccionada(s).`}
                </p>
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div className="form-row">
                  <div className="form-group">
                    <label>Descuento s/costo global (%)</label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      placeholder="Varios valores"
                      value={bulkPriceForm.descuento_costo}
                      onChange={e => setBulkPriceForm(f => ({ ...f, descuento_costo: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                  Markups por tipo de cliente
                </div>
                <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--muted)' }}>
                  Los campos ya cargados con un valor son iguales en todos los productos del alcance elegido — no hace falta retipearlos, solo cambiá el que quieras ajustar. "Varios valores" significa que difieren entre productos y, si lo dejás vacío, no se tocan.
                </p>
                <div className="form-row">
                  {MARKUP_COLS.map(col => (
                    <div className="form-group" key={col.key}>
                      <label>{col.label} (%)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.1"
                        placeholder="Varios valores"
                        value={bulkPriceForm[col.key]}
                        onChange={e => setBulkPriceForm(f => ({ ...f, [col.key]: e.target.value }))}
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setPriceModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={aplicarPoliticaPrecios} disabled={savingPrices}>
                {savingPrices ? 'Actualizando...' : 'Aplicar política'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal producto */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal" style={{ maxWidth: 680 }}>
            <div className="modal-header">
              <h2>{form.id ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Código *</label>
                  <input value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Código viejo</label>
                  <input value={form.codigo_viejo} onChange={e => setForm(f => ({ ...f, codigo_viejo: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Familia</label>
                  <input value={form.familia} onChange={e => setForm(f => ({ ...f, familia: e.target.value }))} list="familias-list" />
                  <datalist id="familias-list">{familias.map(f => <option key={f} value={f} />)}</datalist>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ gridColumn: '1/-1' }}>
                  <label>Nombre *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Variante</label>
                  <input value={form.variante} onChange={e => setForm(f => ({ ...f, variante: e.target.value }))} placeholder="Ej: 500g" />
                </div>
                <div className="form-group">
                  <label>Descripción</label>
                  <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
                </div>
              </div>

              {/* Costos */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Costo</div>
                <div className="form-row">
                  <div className="form-group">
                    <label>Costo de fábrica</label>
                    <input type="number" min="0" step="0.01" value={form.costo} onChange={e => setForm(f => ({ ...f, costo: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Descuento s/costo (%)</label>
                    <input type="number" min="0" max="100" step="0.1" value={form.descuento_costo} onChange={e => setForm(f => ({ ...f, descuento_costo: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Costo neto</label>
                    <input readOnly value={`$${calcPrecio(form.costo, form.descuento_costo, 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })}`}
                      style={{ background: 'var(--bg)', color: 'var(--muted)', fontWeight: 600 }} />
                  </div>
                </div>
              </div>

              {/* Markups y precios */}
              <div style={{ background: 'var(--bg)', borderRadius: 8, padding: 12, marginBottom: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 12, color: 'var(--muted)', textTransform: 'uppercase', marginBottom: 8 }}>Markup por tipo de cliente</div>
                <table style={{ width: '100%', fontSize: 13 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign: 'left', padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Tipo</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Markup %</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Precio s/IVA</th>
                      <th style={{ textAlign: 'right', padding: '4px 8px', color: 'var(--muted)', fontWeight: 600, fontSize: 11 }}>Precio c/IVA</th>
                    </tr>
                  </thead>
                  <tbody>
                    {MARKUP_COLS.map((col, i) => {
                      const precio = preciosPreview[i].precio
                      return (
                        <tr key={col.key}>
                          <td style={{ padding: '6px 8px', fontWeight: 600 }}>{col.label}</td>
                          <td style={{ padding: '6px 8px', textAlign: 'right' }}>
                            <input type="number" min="0" step="0.1" value={form[col.key]}
                              onChange={e => setForm(f => ({ ...f, [col.key]: e.target.value }))}
                              style={{ width: 80, textAlign: 'right', padding: '4px 6px' }} />
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', fontWeight: 600, color: 'var(--primary-dark)' }}>
                            ${precio.toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                          </td>
                          <td style={{ padding: '6px 8px', textAlign: 'right', color: '#1D4ED8', fontSize: 12 }}>
                            ${(precio * 1.21).toLocaleString('es-AR', { maximumFractionDigits: 2 })}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              <div className="form-row">
                <div className="form-group">
                  <label>Unidad</label>
                  <input value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Stock actual</label>
                  <input type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Stock mínimo</label>
                  <input type="number" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Paquetes x bandeja</label>
                  <input type="number" min="0" value={form.pqxbj} onChange={e => setForm(f => ({ ...f, pqxbj: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Descuento por bandeja (%)</label>
                  <input type="number" min="0" max="100" step="0.1" value={form.descuento_bandeja} onChange={e => setForm(f => ({ ...f, descuento_bandeja: e.target.value }))} title="Se aplica sobre el precio del tipo de cliente cuando se carga por bandeja en un pedido" />
                </div>
              </div>

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
                    <input type="number" min="1" value={form.promo_paga} onChange={e => setForm(f => ({ ...f, promo_paga: e.target.value }))} />
                  </div>
                  <div className="form-group">
                    <label>Lleva (bonificado)</label>
                    <input type="number" min="1" value={form.promo_lleva} onChange={e => setForm(f => ({ ...f, promo_lleva: e.target.value }))} />
                  </div>
                </div>
              )}
              <div style={{ display: 'flex', gap: 16 }}>
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
