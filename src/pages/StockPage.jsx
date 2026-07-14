import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente, hoyAR } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const ORIGENES_BADGE = {
  reposicion: 'badge-green', venta: 'badge-blue', muestra: 'badge-yellow',
  devolucion: 'badge-green', ajuste_manual: 'badge-gray', pedido: 'badge-blue'
}
const ORIGENES_COLOR = {
  reposicion: '#16A34A', venta: '#2563EB', muestra: '#D97706',
  devolucion: '#16A34A', ajuste_manual: '#6B7280', pedido: '#2563EB'
}

export default function StockPage() {
  const { isAdmin } = useAuth()
  const { toasts, toast } = useToast()

  const [stockActual, setStockActual] = useState([])
  const [movimientos, setMovimientos] = useState([])
  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [loading, setLoading] = useState(true)

  // Filtros movimientos
  const [filtroOrigen, setFiltroOrigen] = useState('')
  const [filtroProducto, setFiltroProducto] = useState('')

  // Modal entrada
  const [modalEntrada, setModalEntrada] = useState(false)
  const [entrada, setEntrada] = useState({ producto: '', cantidad: '', fecha: hoyAR(), origen: 'reposicion', notas: '' })

  // Modal muestra
  const [modalMuestra, setModalMuestra] = useState(false)
  const [muestra, setMuestra] = useState({ producto: '', cantidad: '', cliente: '', fecha: hoyAR(), notas: '' })

  // Modal ajuste
  const [modalAjuste, setModalAjuste] = useState(false)
  const [ajuste, setAjuste] = useState({ producto: '', cantidad: '', fecha: hoyAR(), notas: '' })
  const [stockActualProd, setStockActualProd] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('productos').select('id,codigo,nombre').order('codigo'),
      supabase.from('clientes').select('id,nombre,nombre_fantasia').order('nombre')
    ]).then(([{ data: p }, { data: c }]) => {
      setProductos(p || [])
      setClientes(c || [])
    })
    loadAll()
  }, [])

  async function loadAll() {
    setLoading(true)
    try {
      await Promise.all([loadStockActual(), loadMovimientos()])
    } finally { setLoading(false) }
  }

  async function loadStockActual() {
    const { data } = await supabase.from('stock_actual').select('*').order('familia').order('nombre')
    setStockActual(data || [])
  }

  async function loadMovimientos() {
    let q = supabase.from('stock_movimientos')
      .select('id,fecha,tipo,origen,cantidad,notas,productos(nombre,codigo),clientes(nombre,nombre_fantasia)')
      .order('created_at', { ascending: false })
      .limit(100)
    if (filtroOrigen) q = q.eq('origen', filtroOrigen)
    if (filtroProducto) q = q.eq('producto_id', filtroProducto)
    const { data } = await q
    setMovimientos(data || [])
  }

  useEffect(() => { loadMovimientos() }, [filtroOrigen, filtroProducto])

  // Agrupar stock por familia
  const stockGrupos = useMemo(() => {
    const g = {}
    stockActual.forEach(p => {
      const fam = p.familia || 'Otros'
      if (!g[fam]) g[fam] = []
      g[fam].push(p)
    })
    return g
  }, [stockActual])

  // ===== ENTRADA =====
  async function saveEntrada() {
    if (!entrada.producto) { toast('Seleccioná un producto', 'error'); return }
    if (!parseFloat(entrada.cantidad) || parseFloat(entrada.cantidad) <= 0) { toast('Ingresá una cantidad válida', 'error'); return }
    setSaving(true)
    try {
      await supabase.from('stock_movimientos').insert({ producto_id: entrada.producto, tipo: 'entrada', origen: entrada.origen, cantidad: parseFloat(entrada.cantidad), fecha: entrada.fecha, notas: entrada.notas })
      toast('Entrada registrada')
      setModalEntrada(false)
      setEntrada({ producto: '', cantidad: '', fecha: hoyAR(), origen: 'reposicion', notas: '' })
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== MUESTRA =====
  async function saveMuestra() {
    if (!muestra.producto) { toast('Seleccioná un producto', 'error'); return }
    if (!parseFloat(muestra.cantidad) || parseFloat(muestra.cantidad) <= 0) { toast('Ingresá una cantidad válida', 'error'); return }
    setSaving(true)
    try {
      await supabase.from('stock_movimientos').insert({ producto_id: muestra.producto, tipo: 'salida', origen: 'muestra', cantidad: -parseFloat(muestra.cantidad), cliente_id: muestra.cliente || null, fecha: muestra.fecha, notas: muestra.notas })
      toast('Muestra registrada')
      setModalMuestra(false)
      setMuestra({ producto: '', cantidad: '', cliente: '', fecha: hoyAR(), notas: '' })
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  // ===== AJUSTE =====
  async function onAjusteProdChange(prodId) {
    setAjuste(f => ({ ...f, producto: prodId }))
    if (!prodId) { setStockActualProd(null); return }
    const { data } = await supabase.from('stock_actual').select('stock').eq('id', prodId).single()
    setStockActualProd(data?.stock ?? null)
  }

  async function saveAjuste() {
    if (!ajuste.producto) { toast('Seleccioná un producto', 'error'); return }
    const cant = parseFloat(ajuste.cantidad)
    if (isNaN(cant) || cant === 0) { toast('Ingresá una cantidad distinta de 0', 'error'); return }
    if (!ajuste.notas.trim()) { toast('El motivo es obligatorio para un ajuste', 'error'); return }
    setSaving(true)
    try {
      await supabase.from('stock_movimientos').insert({ producto_id: ajuste.producto, tipo: 'ajuste', origen: 'ajuste_manual', cantidad: cant, fecha: ajuste.fecha, notas: ajuste.notas })
      toast('Ajuste guardado')
      setModalAjuste(false)
      setAjuste({ producto: '', cantidad: '', fecha: hoyAR(), notas: '' })
      setStockActualProd(null)
      loadAll()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  async function deleteMov(id) {
    if (!confirm('Borrar este movimiento?\n\nEl stock se recalculará automáticamente.')) return
    try {
      await supabase.from('stock_movimientos').delete().eq('id', id)
      toast('Movimiento eliminado')
      loadAll()
    } catch (e) { toast('Error', 'error') }
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Stock</h1>
        {isAdmin && (
          <div className="page-header-actions">
            <button className="btn btn-secondary" onClick={() => setModalEntrada(true)}>⬆ Entrada</button>
            <button className="btn btn-secondary" onClick={() => setModalMuestra(true)}>🎁 Muestra</button>
            <button className="btn btn-secondary" onClick={() => { setAjuste({ producto: '', cantidad: '', fecha: hoyAR(), notas: '' }); setStockActualProd(null); setModalAjuste(true) }}>↔ Ajuste</button>
          </div>
        )}
      </div>

      {/* Stock actual desktop */}
      <div className="card desktop-table" style={{ marginBottom: 16 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Stock actual</div>
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Código</th><th>Producto</th><th>Familia</th><th>Stock</th><th>Mínimo</th><th>Estado</th></tr></thead>
              <tbody>
                {stockActual.map(p => {
                  const stock = parseFloat(p.stock)
                  const min = parseFloat(p.stock_minimo)
                  const badge = stock <= 0 ? 'badge-red' : stock <= min ? 'badge-yellow' : 'badge-green'
                  const label = stock <= 0 ? 'Sin stock' : stock <= min ? 'Stock bajo' : 'OK'
                  return (
                    <tr key={p.id}>
                      <td><code style={{ fontSize: 12, background: 'var(--bg)', padding: '2px 6px', borderRadius: 4, fontWeight: 600 }}>{p.codigo || '—'}</code></td>
                      <td><strong>{p.nombre}</strong></td>
                      <td>{p.familia ? <span className="badge badge-blue">{p.familia}</span> : '—'}</td>
                      <td><strong>{stock}</strong> <span style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unidad || ''}</span></td>
                      <td style={{ color: 'var(--muted)' }}>{min}</td>
                      <td><span className={`badge ${badge}`}>{label}</span></td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Stock actual mobile — agrupado por familia */}
      <div className="mobile-cards" style={{ marginBottom: 16 }}>
        {Object.entries(stockGrupos).map(([fam, prods]) => (
          <div key={fam} style={{ marginBottom: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)', textTransform: 'uppercase', letterSpacing: '.05em', padding: '8px 4px 4px' }}>{fam}</div>
            {prods.map(p => {
              const stock = parseFloat(p.stock)
              const min = parseFloat(p.stock_minimo)
              const color = stock <= 0 ? '#DC2626' : stock <= min ? '#D97706' : '#16A34A'
              const label = stock <= 0 ? 'Sin stock' : stock <= min ? 'Stock bajo' : 'OK'
              return (
                <div key={p.id} className="op-card" style={{ marginBottom: 8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{p.nombre}</div>
                      {p.codigo && <code style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>{p.codigo}</code>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color }}>{stock}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{p.unidad || ''} · mín. {min}</div>
                      <div style={{ fontSize: 11, fontWeight: 600, color }}>{label}</div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* Movimientos */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Movimientos de stock</div>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
          <select value={filtroOrigen} onChange={e => setFiltroOrigen(e.target.value)} style={{ flex: 1 }}>
            <option value="">Todos los orígenes</option>
            {['reposicion','venta','muestra','devolucion','ajuste_manual'].map(o => (
              <option key={o} value={o}>{o.replace('_', ' ')}</option>
            ))}
          </select>
          <select value={filtroProducto} onChange={e => setFiltroProducto(e.target.value)} style={{ flex: 2 }}>
            <option value="">Todos los productos</option>
            {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</option>)}
          </select>
        </div>

        {/* Tabla desktop */}
        <div className="desktop-table">
          <div className="table-wrap">
            <table>
              <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Origen</th><th>Cantidad</th><th>Cliente</th><th>Notas</th><th></th></tr></thead>
              <tbody>
                {movimientos.length === 0
                  ? <tr><td colSpan={8} style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Sin movimientos</td></tr>
                  : movimientos.map(m => {
                    const cant = parseFloat(m.cantidad)
                    const cantColor = cant > 0 ? 'var(--success)' : 'var(--danger)'
                    return (
                      <tr key={m.id}>
                        <td>{m.fecha}</td>
                        <td>{m.productos?.codigo && <code style={{ fontSize: 11 }}>{m.productos.codigo}</code>} {m.productos?.nombre || '—'}</td>
                        <td>{m.tipo === 'entrada' ? '⬆ Entrada' : m.tipo === 'salida' ? '⬇ Salida' : '↔ Ajuste'}</td>
                        <td><span className={`badge ${ORIGENES_BADGE[m.origen] || 'badge-gray'}`}>{m.origen.replace('_', ' ')}</span></td>
                        <td style={{ fontWeight: 600, color: cantColor }}>{cant > 0 ? '+' : ''}{cant}</td>
                        <td>{m.clientes ? nombreCliente(m.clientes) : '—'}</td>
                        <td style={{ color: 'var(--muted)', fontSize: 12 }}>{m.notas || '—'}</td>
                        <td>{isAdmin && <button className="btn btn-sm btn-danger" onClick={() => deleteMov(m.id)}>✕</button>}</td>
                      </tr>
                    )
                  })
                }
              </tbody>
            </table>
          </div>
        </div>

        {/* Cards mobile */}
        <div className="mobile-cards" style={{ padding: 12 }}>
          {movimientos.length === 0
            ? <div style={{ textAlign: 'center', padding: 24, color: 'var(--muted)' }}>Sin movimientos</div>
            : movimientos.map(m => {
              const cant = parseFloat(m.cantidad)
              const cantColor = cant > 0 ? '#16A34A' : '#DC2626'
              const origenColor = ORIGENES_COLOR[m.origen] || '#6B7280'
              const tipoIcon = m.tipo === 'entrada' ? '⬆' : m.tipo === 'salida' ? '⬇' : '↔'
              const tipoLabel = m.tipo === 'entrada' ? 'Entrada' : m.tipo === 'salida' ? 'Salida' : 'Ajuste'
              return (
                <div key={m.id} className="op-card" style={{ marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 14 }}>{m.productos?.nombre || '—'}</div>
                      {m.productos?.codigo && <code style={{ fontSize: 11, background: 'var(--bg)', padding: '1px 5px', borderRadius: 4 }}>{m.productos.codigo}</code>}
                      {m.clientes && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>👤 {nombreCliente(m.clientes)}</div>}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 20, fontWeight: 700, color: cantColor }}>{cant > 0 ? '+' : ''}{cant}</div>
                      <div style={{ fontSize: 11, color: 'var(--muted)' }}>{m.fecha}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
                    <span style={{ background: `${origenColor}22`, color: origenColor, padding: '2px 8px', borderRadius: 12, fontSize: 11, fontWeight: 600 }}>{tipoIcon} {tipoLabel}</span>
                    <span style={{ background: 'var(--bg)', color: 'var(--muted)', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{m.origen.replace('_', ' ')}</span>
                    {m.notas && <span style={{ fontSize: 11, color: 'var(--muted)' }}>📝 {m.notas}</span>}
                  </div>
                  {isAdmin && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => deleteMov(m.id)}>✕ Eliminar</button>
                    </div>
                  )}
                </div>
              )
            })
          }
        </div>
      </div>

      {/* ===== MODAL ENTRADA ===== */}
      {modalEntrada && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalEntrada(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Registrar entrada de stock</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalEntrada(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Producto *</label>
                <select value={entrada.producto} onChange={e => setEntrada(f => ({ ...f, producto: e.target.value }))}>
                  <option value="">Seleccioná un producto</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cantidad *</label>
                  <input type="number" min="0" step="1" value={entrada.cantidad} onChange={e => setEntrada(f => ({ ...f, cantidad: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={entrada.fecha} onChange={e => setEntrada(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Origen</label>
                <select value={entrada.origen} onChange={e => setEntrada(f => ({ ...f, origen: e.target.value }))}>
                  <option value="reposicion">Reposición</option>
                  <option value="devolucion">Devolución</option>
                  <option value="ajuste_manual">Ajuste manual</option>
                </select>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input value={entrada.notas} onChange={e => setEntrada(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalEntrada(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveEntrada} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL MUESTRA ===== */}
      {modalMuestra && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalMuestra(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Registrar muestra</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalMuestra(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Producto *</label>
                <select value={muestra.producto} onChange={e => setMuestra(f => ({ ...f, producto: e.target.value }))}>
                  <option value="">Seleccioná un producto</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</option>)}
                </select>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cantidad *</label>
                  <input type="number" min="0" step="1" value={muestra.cantidad} onChange={e => setMuestra(f => ({ ...f, cantidad: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={muestra.fecha} onChange={e => setMuestra(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Cliente</label>
                <select value={muestra.cliente} onChange={e => setMuestra(f => ({ ...f, cliente: e.target.value }))}>
                  <option value="">Sin cliente específico</option>
                  {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input value={muestra.notas} onChange={e => setMuestra(f => ({ ...f, notas: e.target.value }))} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalMuestra(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveMuestra} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL AJUSTE ===== */}
      {modalAjuste && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalAjuste(false)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Ajuste de stock</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalAjuste(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Producto *</label>
                <select value={ajuste.producto} onChange={e => onAjusteProdChange(e.target.value)}>
                  <option value="">Seleccioná un producto</option>
                  {productos.map(p => <option key={p.id} value={p.id}>{p.codigo ? `${p.codigo} — ` : ''}{p.nombre}</option>)}
                </select>
                {stockActualProd !== null && <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 4 }}>Stock actual: <strong>{stockActualProd}</strong></div>}
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Cantidad (+ o -)</label>
                  <input type="number" value={ajuste.cantidad} onChange={e => setAjuste(f => ({ ...f, cantidad: e.target.value }))} placeholder="Ej: -5 o +10" />
                </div>
                <div className="form-group">
                  <label>Fecha</label>
                  <input type="date" value={ajuste.fecha} onChange={e => setAjuste(f => ({ ...f, fecha: e.target.value }))} />
                </div>
              </div>
              <div className="form-group">
                <label>Motivo * (obligatorio)</label>
                <input value={ajuste.notas} onChange={e => setAjuste(f => ({ ...f, notas: e.target.value }))} placeholder="Motivo del ajuste..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalAjuste(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveAjuste} disabled={saving}>{saving ? 'Guardando...' : 'Guardar ajuste'}</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
