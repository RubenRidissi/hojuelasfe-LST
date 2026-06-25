import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const TIPO_COLORS = { Minorista: 'badge-gray', Distribuidor: 'badge-blue', Mayorista: 'badge-yellow', Institucional: 'badge-green' }
const HONEY_COLOR = '#D4860A'

function semanaKey(fechaStr) {
  const d = new Date(fechaStr + 'T00:00:00')
  const day = d.getDay()
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)
  const lunes = new Date(d.setDate(diff))
  return lunes.toISOString().split('T')[0]
}

function semanaLabel(lunesStr) {
  const lunes = new Date(lunesStr + 'T00:00:00')
  const viernes = new Date(lunesStr + 'T00:00:00'); viernes.setDate(viernes.getDate() + 4)
  return lunes.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' }) + ' – ' + viernes.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

export default function ReportesPage() {
  const { user, isAdmin } = useAuth()
  const { toasts, toast } = useToast()

  const today = new Date()
  const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)

  const [desde, setDesde] = useState(firstDay.toISOString().split('T')[0])
  const [hasta, setHasta] = useState(today.toISOString().split('T')[0])
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(false)

  // Resultados admin
  const [resAdmin, setResAdmin] = useState(null)

  // Resultados vendedor
  const [resVendedor, setResVendedor] = useState(null)

  useEffect(() => {
    if (isAdmin) {
      supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre')
        .then(({ data }) => setVendedores(data || []))
    }
    cargar()
  }, [])

  async function cargar() {
    if (!desde || !hasta) { toast('Seleccioná un período', 'error'); return }
    setLoading(true)
    try {
      if (isAdmin) await cargarAdmin()
      else await cargarVendedor()
    } catch (e) { console.error(e); toast('Error cargando reportes', 'error') } finally { setLoading(false) }
  }

  async function cargarAdmin() {
    let q = supabase.from('ventas')
      .select('id,fecha,total,estado_pago,clientes(nombre,tipo,descuento_pct),venta_items(cantidad,bonificado,precio_unitario,producto_id,productos(costo,nombre,codigo))')
      .gte('fecha', desde).lte('fecha', hasta).order('fecha')
    if (filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
    const { data: ventas } = await q

    if (!ventas?.length) { setResAdmin({ vacio: true }); return }

    let totalIngresos = 0, totalCostos = 0
    const semanas = {}, tipos = {}, productos = {}, muestras = {}

    ventas.forEach(v => {
      const key = semanaKey(v.fecha)
      if (!semanas[key]) semanas[key] = { ventas: 0, total: 0, ganancia: 0 }
      semanas[key].ventas++
      semanas[key].total += parseFloat(v.total || 0)

      const tipo = v.clientes?.tipo || 'Minorista'
      if (!tipos[tipo]) tipos[tipo] = { ventas: 0, total: 0 }
      tipos[tipo].ventas++; tipos[tipo].total += parseFloat(v.total || 0)

      ;(v.venta_items || []).forEach(item => {
        const precio = parseFloat(item.precio_unitario)
        const costo = parseFloat(item.productos?.costo || 0)
        if (precio > 0) {
          totalIngresos += precio * item.cantidad
          totalCostos += costo * item.cantidad
          semanas[key].ganancia += (precio - costo) * item.cantidad
          const nombre = item.productos?.nombre || '—'
          if (!productos[nombre]) productos[nombre] = { cant: 0, ingresos: 0, ganancia: 0 }
          productos[nombre].cant += item.cantidad
          productos[nombre].ingresos += precio * item.cantidad
          productos[nombre].ganancia += (precio - costo) * item.cantidad
        }
      })
    })

    // Muestras del período
    const { data: movsMuestra } = await supabase.from('stock_movimientos')
      .select('cantidad,productos(nombre,codigo)')
      .eq('origen', 'muestra').eq('tipo', 'salida')
      .gte('fecha', desde).lte('fecha', hasta)

    ;(movsMuestra || []).forEach(m => {
      const nombre = m.productos?.nombre || '—'
      muestras[nombre] = (muestras[nombre] || 0) + Math.abs(parseFloat(m.cantidad || 0))
    })

    const totalGanancia = totalIngresos - totalCostos
    const margenProm = totalIngresos > 0 ? totalGanancia / totalIngresos * 100 : 0

    setResAdmin({ vacio: false, totalIngresos, totalGanancia, margenProm, cantVentas: ventas.length, semanas, tipos, productos, muestras })
  }

  async function cargarVendedor() {
    const { data: ventas } = await supabase.from('ventas')
      .select('id,fecha,total,clientes(nombre,tipo),venta_items(cantidad,precio_unitario)')
      .gte('fecha', desde).lte('fecha', hasta)
      .eq('vendedor_id', user).order('fecha')

    if (!ventas?.length) { setResVendedor({ vacio: true }); return }

    let totalIngresos = 0
    const semanas = {}, tipos = {}

    ventas.forEach(v => {
      totalIngresos += parseFloat(v.total || 0)
      const key = semanaKey(v.fecha)
      if (!semanas[key]) semanas[key] = { ventas: 0, total: 0 }
      semanas[key].ventas++; semanas[key].total += parseFloat(v.total || 0)

      const tipo = v.clientes?.tipo || 'Minorista'
      if (!tipos[tipo]) tipos[tipo] = { ventas: 0, total: 0 }
      tipos[tipo].ventas++; tipos[tipo].total += parseFloat(v.total || 0)
    })

    setResVendedor({ vacio: false, totalIngresos, cantVentas: ventas.length, semanas, tipos })
  }

  const res = isAdmin ? resAdmin : resVendedor

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Reportes</h1>
      </div>

      {/* Filtros */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="filter-bar">
          <div className="form-group" style={{ flex: 1 }}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1 }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          {isAdmin && (
            <div className="form-group" style={{ flex: 1 }}>
              <label>Vendedor</label>
              <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
                <option value="">Todos</option>
                {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={cargar} disabled={loading}>{loading ? 'Cargando...' : 'Ver reporte'}</button>
          </div>
        </div>
      </div>

      {loading && <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>}

      {res && !loading && (
        res.vacio ? (
          <div className="card"><div className="empty"><div className="empty-icon">📊</div><p>Sin datos en este período</p></div></div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 16 }}>
              <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Total ventas</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>${(res.totalIngresos || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
              </div>
              <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Cantidad</div>
                <div style={{ fontSize: 22, fontWeight: 700 }}>{res.cantVentas}</div>
              </div>
              {isAdmin && res.totalGanancia !== undefined && (
                <>
                  <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Ganancia</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--success)' }}>${res.totalGanancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</div>
                  </div>
                  <div className="card" style={{ padding: 16, textAlign: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 6 }}>Margen</div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: res.margenProm >= 20 ? 'var(--success)' : res.margenProm >= 10 ? '#F59E0B' : 'var(--danger)' }}>
                      {res.margenProm.toFixed(1)}%
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Ventas por semana */}
            <div style={{ display: 'grid', gridTemplateColumns: isAdmin ? '1fr 1fr' : '1fr', gap: 16, marginBottom: 16 }}>
              <div className="card">
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Ventas por semana</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Semana</th><th>Ventas</th><th>Total</th>{isAdmin && <th>Ganancia</th>}</tr></thead>
                    <tbody>
                      {Object.entries(res.semanas || {}).map(([lunes, d]) => (
                        <tr key={lunes}>
                          <td style={{ fontSize: 12 }}>{semanaLabel(lunes)}</td>
                          <td>{d.ventas}</td>
                          <td>${d.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                          {isAdmin && <td style={{ color: 'var(--success)' }}>${(d.ganancia || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Por tipo de cliente */}
              <div className="card">
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Por tipo de cliente</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Tipo</th><th>Ventas</th><th>Total</th><th>%</th></tr></thead>
                    <tbody>
                      {Object.entries(res.tipos || {}).sort((a, b) => b[1].total - a[1].total).map(([tipo, d]) => {
                        const pct = res.totalIngresos > 0 ? (d.total / res.totalIngresos * 100).toFixed(1) : 0
                        return (
                          <tr key={tipo}>
                            <td><span className={`badge ${TIPO_COLORS[tipo] || 'badge-gray'}`}>{tipo}</span></td>
                            <td>{d.ventas}</td>
                            <td>${d.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                            <td>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 60, height: 8, background: 'var(--border)', borderRadius: 4, overflow: 'hidden' }}>
                                  <div style={{ width: `${pct}%`, height: '100%', background: HONEY_COLOR, borderRadius: 4 }} />
                                </div>
                                <span style={{ fontSize: 12 }}>{pct}%</span>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* Admin: margen por semana y ganancia por producto */}
            {isAdmin && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
                <div className="card">
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Margen por semana</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Semana</th><th>Ingresos</th><th>Ganancia</th><th>Margen</th></tr></thead>
                      <tbody>
                        {Object.entries(res.semanas || {}).map(([lunes, d]) => {
                          const margenSem = d.total > 0 ? d.ganancia / d.total * 100 : 0
                          const mColor = margenSem >= 20 ? 'var(--success)' : margenSem >= 10 ? '#F59E0B' : 'var(--danger)'
                          return (
                            <tr key={lunes}>
                              <td style={{ fontSize: 12 }}>{semanaLabel(lunes)}</td>
                              <td>${d.total.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                              <td style={{ color: 'var(--success)' }}>${(d.ganancia || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                              <td style={{ color: mColor, fontWeight: 600 }}>{margenSem.toFixed(1)}%</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="card">
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Ganancia por producto</div>
                  <div className="table-wrap">
                    <table>
                      <thead><tr><th>Producto</th><th>Cant.</th><th>Ingresos</th><th>Ganancia</th></tr></thead>
                      <tbody>
                        {Object.entries(res.productos || {}).sort((a, b) => b[1].ganancia - a[1].ganancia).slice(0, 10).map(([nombre, d]) => (
                          <tr key={nombre}>
                            <td style={{ fontSize: 12 }}>{nombre}</td>
                            <td>{d.cant}</td>
                            <td>${d.ingresos.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                            <td style={{ color: 'var(--success)', fontWeight: 600 }}>${d.ganancia.toLocaleString('es-AR', { maximumFractionDigits: 0 })}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Admin: muestras */}
            {isAdmin && res.muestras && Object.keys(res.muestras).length > 0 && (
              <div className="card" style={{ marginBottom: 16 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Muestras entregadas</div>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Producto</th><th>Cantidad</th></tr></thead>
                    <tbody>
                      {Object.entries(res.muestras).sort((a, b) => b[1] - a[1]).map(([nombre, cant]) => (
                        <tr key={nombre}><td>{nombre}</td><td>{cant}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
