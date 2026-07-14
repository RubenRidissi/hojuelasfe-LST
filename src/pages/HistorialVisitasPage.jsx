import { useState, useEffect } from 'react'
import { supabase } from '../services/supabase'
import { nombreCliente, resultadoVisitaInfo, RESULTADOS_VISITA, hoyAR } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

function primerDiaMes() {
  const hoy = new Date()
  return `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-01`
}

export default function HistorialVisitasPage() {
  const { toasts, toast } = useToast()

  const [visitas, setVisitas] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)

  const [desde, setDesde] = useState(primerDiaMes())
  const [hasta, setHasta] = useState(hoyAR())
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroResultado, setFiltroResultado] = useState('')
  const [buscarCliente, setBuscarCliente] = useState('')

  useEffect(() => {
    supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre')
      .then(({ data }) => setVendedores(data || []))
    cargar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function cargar() {
    if (!desde || !hasta) { toast('Seleccioná un período', 'error'); return }
    setLoading(true)
    try {
      let q = supabase.from('visitas')
        .select('id,fecha,resultado,notas,vendedor_id,clientes(nombre,nombre_fantasia)')
        .gte('fecha', desde).lte('fecha', hasta)
        .order('fecha', { ascending: false })
      if (filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      if (filtroResultado) q = q.eq('resultado', filtroResultado)
      const { data, error } = await q
      if (error) throw error
      setVisitas(data || [])
    } catch (e) { toast('Error cargando el historial: ' + e.message, 'error') } finally { setLoading(false) }
  }

  const visitasFiltradas = buscarCliente.trim()
    ? visitas.filter(v => nombreCliente(v.clientes).toLowerCase().includes(buscarCliente.trim().toLowerCase()))
    : visitas

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Historial de Visitas</h1>
      </div>

      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
          <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
            <label>Desde</label>
            <input type="date" value={desde} onChange={e => setDesde(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 140 }}>
            <label>Hasta</label>
            <input type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
            <label>Vendedor</label>
            <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)}>
              <option value="">Todos</option>
              {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ flex: 1, minWidth: 160 }}>
            <label>Resultado</label>
            <select value={filtroResultado} onChange={e => setFiltroResultado(e.target.value)}>
              <option value="">Todos</option>
              {RESULTADOS_VISITA.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end' }}>
            <button className="btn btn-primary" onClick={cargar} disabled={loading}>{loading ? 'Cargando...' : 'Buscar'}</button>
          </div>
        </div>
        <input
          value={buscarCliente}
          onChange={e => setBuscarCliente(e.target.value)}
          placeholder="Buscar por cliente..."
          style={{ marginTop: 10 }}
        />
      </div>

      {loading ? (
        <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
      ) : visitasFiltradas.length === 0 ? (
        <div className="card"><div className="empty"><div className="empty-icon">🗓</div><p>No hay visitas registradas en ese período.</p></div></div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>{visitasFiltradas.length} visita{visitasFiltradas.length !== 1 ? 's' : ''}</div>

          {/* Desktop */}
          <div className="card desktop-table">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>Fecha</th><th>Cliente</th><th>Vendedor</th><th>Resultado</th><th>Notas</th></tr>
                </thead>
                <tbody>
                  {visitasFiltradas.map(v => {
                    const info = resultadoVisitaInfo(v.resultado)
                    const vendedorNombre = vendedores.find(vd => vd.user_id === v.vendedor_id)?.nombre || '—'
                    return (
                      <tr key={v.id}>
                        <td style={{ fontSize: 12 }}>{new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR')}</td>
                        <td>{nombreCliente(v.clientes)}</td>
                        <td style={{ fontSize: 12 }}>{vendedorNombre}</td>
                        <td><span className={`badge ${info.badge}`}>{info.label}</span></td>
                        <td style={{ fontSize: 12, color: 'var(--muted)' }}>{v.notas || '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Mobile */}
          <div className="mobile-cards cards-grid">
            {visitasFiltradas.map(v => {
              const info = resultadoVisitaInfo(v.resultado)
              const vendedorNombre = vendedores.find(vd => vd.user_id === v.vendedor_id)?.nombre || '—'
              return (
                <div key={v.id} className="op-card">
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ fontWeight: 600 }}>{nombreCliente(v.clientes)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>{new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR')} · {vendedorNombre}</div>
                    </div>
                    <span className={`badge ${info.badge}`}>{info.label}</span>
                  </div>
                  {v.notas && <div style={{ fontSize: 13, color: 'var(--muted)', marginTop: 6 }}>{v.notas}</div>}
                </div>
              )
            })}
          </div>
        </>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
