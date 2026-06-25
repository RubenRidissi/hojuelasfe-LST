import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const MARKUP_COLS = [
  { key: 'markup_representante', precio: 'precio_representante', label: 'Representante' },
  { key: 'markup_distribuidor', precio: 'precio_distribuidor', label: 'Distribuidor' },
  { key: 'markup_mayorista', precio: 'precio_mayorista', label: 'Mayorista' },
  { key: 'markup_supermercado', precio: 'precio_supermercado', label: 'Supermercado' },
  { key: 'markup_almacen', precio: 'precio_almacen', label: 'Almacén' },
]

const EMPTY_FORM = {
  id: '',
  codigo: '',
  codigo_viejo: '',
  familia: '',
  variante: '',
  nombre: '',
  descripcion: '',
  costo: '',
  descuento_costo: '0',
  markup_representante: '0',
  markup_distribuidor: '0',
  markup_mayorista: '0',
  markup_supermercado: '0',
  markup_almacen: '0',
  unidad: 'unidad',
  stock: 0,
  stock_minimo: 0,
  promo: false,
  promo_paga: '',
  promo_lleva: '',
  precio_editable: false,
  activo: true,
}

function calcPrecio(costo, descuento_costo, markup) {
  const c = parseFloat(costo) || 0
  const d = parseFloat(descuento_costo) || 0
  const m = parseFloat(markup) || 0
  const costoNeto = c * (1 - d / 100)
  return costoNeto * (1 + m / 100)
}

function money(value, digits = 2) {
  return parseFloat(value || 0).toLocaleString('es-AR', {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  })
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
  const [updatingPrices, setUpdatingPrices] = useState(false)

  useEffect(() => {
    loadProductos()
  }, [])

  async function loadProductos() {
    setLoading(true)
    try {
      const [{ data: prods, error: prodsError }, { data: stockData, error: stockError }] = await Promise.all([
        supabase.from('productos').select('*').order('codigo'),
        supabase.from('stock_actual').select('id,stock'),
      ])

      if (prodsError) throw prodsError
      if (stockError) throw stockError

      const stockMap = {}
      ;(stockData || []).forEach(s => {
        stockMap[s.id] = parseFloat(s.stock || 0)
      })

      setProductos((prods || []).map(p => ({ ...p, stock_real: stockMap[p.id] ?? 0 })))
    } catch (e) {
      console.error(e)
      toast('Error al cargar productos: ' + e.message, 'error')
    } finally {
      setLoading(false)
    }
  }

  const familias = useMemo(() => {
    return [...new Set(productos.map(p => p.familia).filter(Boolean))].sort()
  }, [productos])

  const productosFiltrados = useMemo(() => {
    let list = productos
    if (filtroFamilia) list = list.filter(p => p.familia === filtroFamilia)
    if (search) {
      const q = search.toLowerCase()
      list = list.filter(p => `${p.nombre || ''} ${p.codigo || ''}`.toLowerCase().includes(q))
    }
    return list
  }, [productos, filtroFamilia, search])

  const preciosPreview = useMemo(() => {
    return MARKUP_COLS.map(col => ({
      label: col.label,
      precio: calcPrecio(form.costo, form.descuento_costo, form[col.key]),
    }))
  }, [
    form.costo,
    form.descuento_costo,
    form.markup_representante,
    form.markup_distribuidor,
    form.markup_mayorista,
    form.markup_supermercado,
    form.markup_almacen,
  ])

  async function actualizarPrecios() {
    if (!isAdmin) return
    if (!productos.length) {
      toast('No hay productos para actualizar', 'error')
      return
    }

    const ok = confirm(`¿Actualizar precios de ${productos.length} productos según costo, descuento y markup?`)
    if (!ok) return

    setUpdatingPrices(true)

    try {
      const updates = productos.map(p => {
        const data = {}

        MARKUP_COLS.forEach(col => {
          data[col.precio] = Number(calcPrecio(p.costo, p.descuento_costo, p[col.key]).toFixed(2))
        })

        return supabase
          .from('productos')
          .update(data)
          .eq('id', p.id)
      })

      const results = await Promise.all(updates)
      const failed = results.find(r => r.error)
      if (failed) throw failed.error

      toast('Precios actualizados correctamente')
      await loadProductos()
    } catch (e) {
      console.error(e)
      toast('Error al actualizar precios: ' + e.message, 'error')
    } finally {
      setUpdatingPrices(false)
    }
  }

  async function saveProducto() {
    if (!form.nombre.trim()) {
      toast('El nombre es obligatorio', 'error')
      return
    }

    if (!form.codigo.trim()) {
      toast('El código es obligatorio', 'error')
      return
    }

    if (form.promo && (!form.promo_paga || !form.promo_lleva)) {
      toast('Completá los valores de la promoción', 'error')
      return
    }

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
        promo: form.promo ? `${parseInt(form.promo_paga) || 0}+${parseInt(form.promo_lleva) || 0}` : null,
        precio_editable: form.precio_editable,
        activo: form.activo,
      }

      MARKUP_COLS.forEach(col => {
        data[col.precio] = Number(calcPrecio(data.costo, data.descuento_costo, data[col.key]).toFixed(2))
      })

      if (form.id) {
        const { error } = await supabase.from('productos').update(data).eq('id', form.id)
        if (error) throw error
        toast('Producto actualizado')
      } else {
        const { error } = await supabase.from('productos').insert(data)
        if (error) throw error
        toast('Producto creado')
      }

      setModalOpen(false)
      setForm(EMPTY_FORM)
      await loadProductos()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function editProducto(p) {
    const [promoPaga, promoLleva] = p.promo ? String(p.promo).split('+') : ['', '']

    setForm({
      id: p.id,
      codigo: p.codigo || '',
      codigo_viejo: p.codigo_viejo || '',
      familia: p.familia || '',
      variante: p.variante || '',
      nombre: p.nombre || '',
      descripcion: p.descripcion || '',
      costo: p.costo || '',
      descuento_costo: p.descuento_costo ?? '0',
      markup_representante: p.markup_representante ?? '0',
      markup_distribuidor: p.markup_distribuidor ?? '0',
      markup_mayorista: p.markup_mayorista ?? '0',
      markup_supermercado: p.markup_supermercado ?? '0',
      markup_almacen: p.markup_almacen ?? '0',
      unidad: p.unidad || 'unidad',
      stock: p.stock || 0,
      stock_minimo: p.stock_minimo || 0,
      promo: !!p.promo,
      promo_paga: promoPaga || '',
      promo_lleva: promoLleva || '',
      precio_editable: !!p.precio_editable,
      activo: p.activo !== false,
    })

    setModalOpen(true)
  }

  async function deleteProducto() {
    if (!form.id) return
    if (!confirm(`¿Eliminar el producto "${form.nombre}"?`)) return

    try {
      const { error } = await supabase.from('productos').delete().eq('id', form.id)
      if (error) throw error
      toast('Producto eliminado')
      setModalOpen(false)
      setForm(EMPTY_FORM)
      await loadProductos()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    }
  }

  function stockBadge(p) {
    const stock = p.stock_real ?? 0
    const low = p.stock_minimo > 0 && stock <= p.stock_minimo
    const empty = stock <= 0
    return (
      <span className={empty || low ? 'badge badge-warning' : 'badge'}>
        {(empty || low) && '⚠ '}{stock}
      </span>
    )
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

  function costoNeto(p) {
    const c = parseFloat(p.costo || 0)
    const d = parseFloat(p.descuento_costo || 0)
    return c * (1 - d / 100)
  }

  return (
    <>
      <ToastContainer toasts={toasts} />

      <div className="page">
        <div className="page-header">
          <h1 className="page-title">Productos</h1>

          {isAdmin && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary"
                onClick={actualizarPrecios}
                disabled={updatingPrices || loading}
              >
                {updatingPrices ? 'Actualizando...' : '💲 Actualizar precios'}
              </button>

              <button
                className="btn btn-primary"
                onClick={() => {
                  setForm(EMPTY_FORM)
                  setModalOpen(true)
                }}
              >
                + Nuevo producto
              </button>
            </div>
          )}
        </div>

        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <input
              className="input"
              placeholder="Buscar por nombre o código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{ flex: 2, minWidth: 220 }}
            />

            <select
              className="input"
              value={filtroFamilia}
              onChange={e => setFiltroFamilia(e.target.value)}
              style={{ flex: 1, minWidth: 180 }}
            >
              <option value="">Todas las familias</option>
              {familias.map(f => (
                <option key={f} value={f}>{f}</option>
              ))}
            </select>
          </div>
        </div>

        {loading ? (
          <div className="card" style={{ textAlign: 'center', padding: 32 }}>
            <div style={{ fontSize: 32 }}>⏳</div>
            <div>Cargando...</div>
          </div>
        ) : (
          <>
            <div className="desktop-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Código</th>
                    <th>Nombre</th>
                    <th>Costo</th>
                    <th>Costo neto</th>
                    {MARKUP_COLS.map(c => (
                      <th key={c.key}>{c.label}</th>
                    ))}
                    <th>Stock</th>
                    {isAdmin && <th></th>}
                  </tr>
                </thead>

                <tbody>
                  {Object.entries(grupos).map(([fam, prods]) => (
                    <FragmentGroup
                      key={fam}
                      fam={fam}
                      prods={prods}
                      isAdmin={isAdmin}
                      editProducto={editProducto}
                      costoNeto={costoNeto}
                      stockBadge={stockBadge}
                    />
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mobile-cards">
              {Object.entries(grupos).map(([fam, prods]) => (
                <div key={fam} style={{ marginBottom: 16 }}>
                  <h3>{fam}</h3>
                  {prods.map(p => (
                    <div className="card" key={p.id} style={{ marginBottom: 12 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                        <div>
                          <strong>{p.nombre}</strong>
                          {p.codigo && <div><code>{p.codigo}</code></div>}
                          {p.variante && <small>{p.variante}</small>}
                        </div>
                        <div>{stockBadge(p)}</div>
                      </div>

                      <div style={{ marginTop: 8 }}>
                        Costo: ${money(p.costo)}
                        {parseFloat(p.descuento_costo || 0) > 0 && (
                          <span> (neto: ${money(costoNeto(p))})</span>
                        )}
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                        {MARKUP_COLS.map(col => (
                          <div key={col.key}>
                            <small>{col.label}</small>
                            <div><strong>${money(p[col.precio], 0)}</strong></div>
                          </div>
                        ))}
                      </div>

                      {isAdmin && (
                        <button className="btn btn-secondary" onClick={() => editProducto(p)} style={{ marginTop: 12 }}>
                          ✏ Editar
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>{form.id ? 'Editar producto' : 'Nuevo producto'}</h2>
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>✕</button>
            </div>

            <div className="form-grid">
              <label>
                Código *
                <input className="input" value={form.codigo} onChange={e => setForm(f => ({ ...f, codigo: e.target.value }))} />
              </label>

              <label>
                Código viejo
                <input className="input" value={form.codigo_viejo} onChange={e => setForm(f => ({ ...f, codigo_viejo: e.target.value }))} />
              </label>

              <label>
                Familia
                <input className="input" value={form.familia} onChange={e => setForm(f => ({ ...f, familia: e.target.value }))} list="familias-list" />
                <datalist id="familias-list">
                  {familias.map(f => <option key={f} value={f} />)}
                </datalist>
              </label>

              <label>
                Nombre *
                <input className="input" value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} />
              </label>

              <label>
                Variante
                <input className="input" value={form.variante} onChange={e => setForm(f => ({ ...f, variante: e.target.value }))} placeholder="Ej: 500g" />
              </label>

              <label>
                Unidad
                <input className="input" value={form.unidad} onChange={e => setForm(f => ({ ...f, unidad: e.target.value }))} />
              </label>
            </div>

            <label>
              Descripción
              <textarea className="input" value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))} />
            </label>

            <h3>Costos</h3>
            <div className="form-grid">
              <label>
                Costo de fábrica
                <input className="input" type="number" step="0.01" value={form.costo} onChange={e => setForm(f => ({ ...f, costo: e.target.value }))} />
              </label>

              <label>
                Descuento s/costo (%)
                <input className="input" type="number" step="0.01" value={form.descuento_costo} onChange={e => setForm(f => ({ ...f, descuento_costo: e.target.value }))} />
              </label>

              <label>
                Costo neto
                <input className="input" disabled value={`$${money(calcPrecio(form.costo, form.descuento_costo, 0))}`} />
              </label>
            </div>

            <h3>Markup por tipo de cliente</h3>
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Tipo</th>
                    <th>Markup %</th>
                    <th>Precio s/IVA</th>
                    <th>Precio c/IVA</th>
                  </tr>
                </thead>
                <tbody>
                  {MARKUP_COLS.map((col, i) => {
                    const precio = preciosPreview[i].precio
                    return (
                      <tr key={col.key}>
                        <td>{col.label}</td>
                        <td>
                          <input
                            className="input"
                            type="number"
                            step="0.01"
                            value={form[col.key]}
                            onChange={e => setForm(f => ({ ...f, [col.key]: e.target.value }))}
                            style={{ width: 90, textAlign: 'right', padding: '4px 6px' }}
                          />
                        </td>
                        <td>${money(precio)}</td>
                        <td>${money(precio * 1.21)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <h3>Stock y promoción</h3>
            <div className="form-grid">
              <label>
                Stock actual
                <input className="input" type="number" value={form.stock} onChange={e => setForm(f => ({ ...f, stock: e.target.value }))} />
              </label>

              <label>
                Stock mínimo
                <input className="input" type="number" value={form.stock_minimo} onChange={e => setForm(f => ({ ...f, stock_minimo: e.target.value }))} />
              </label>
            </div>

            <label style={{ display: 'block', marginTop: 12 }}>
              <input type="checkbox" checked={form.promo} onChange={e => setForm(f => ({ ...f, promo: e.target.checked }))} /> Tiene promoción
            </label>

            {form.promo && (
              <div className="form-grid">
                <label>
                  Paga
                  <input className="input" type="number" value={form.promo_paga} onChange={e => setForm(f => ({ ...f, promo_paga: e.target.value }))} />
                </label>

                <label>
                  Lleva bonificado
                  <input className="input" type="number" value={form.promo_lleva} onChange={e => setForm(f => ({ ...f, promo_lleva: e.target.value }))} />
                </label>
              </div>
            )}

            <div style={{ display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
              <label>
                <input type="checkbox" checked={form.precio_editable} onChange={e => setForm(f => ({ ...f, precio_editable: e.target.checked }))} /> Precio editable al cargar
              </label>

              <label>
                <input type="checkbox" checked={form.activo} onChange={e => setForm(f => ({ ...f, activo: e.target.checked }))} /> Activo
              </label>
            </div>

            <div className="modal-actions">
              {form.id && (
                <button className="btn btn-danger" onClick={deleteProducto}>Eliminar</button>
              )}
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveProducto} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

function FragmentGroup({ fam, prods, isAdmin, editProducto, costoNeto, stockBadge }) {
  return (
    <>
      <tr className="group-row">
        <td colSpan={9}>{fam}</td>
      </tr>
      {prods.map(p => (
        <tr key={p.id}>
          <td><code>{p.codigo || '—'}</code></td>
          <td>
            <strong>{p.nombre}</strong>
            {p.variante && <><br /><small>{p.variante}</small></>}
          </td>
          <td>${money(p.costo)}</td>
          <td>
            ${money(costoNeto(p))}
            {parseFloat(p.descuento_costo || 0) > 0 && <small> -{p.descuento_costo}%</small>}
          </td>
          {MARKUP_COLS.map(col => (
            <td key={col.key}>
              ${money(p[col.precio])}
              <br />
              <small>{p[col.key] || 0}%</small>
            </td>
          ))}
          <td>{stockBadge(p)}</td>
          {isAdmin && (
            <td>
              <button className="btn btn-secondary" onClick={() => editProducto(p)}>Editar</button>
            </td>
          )}
        </tr>
      ))}
    </>
  )
}
