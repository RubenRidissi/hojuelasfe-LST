import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente, hoyAR, RESULTADOS_VISITA, resultadoVisitaInfo, distanciaKm } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado']
const RESULTADOS = RESULTADOS_VISITA

function getISOWeek(d) {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = date.getUTCDay() || 7
  date.setUTCDate(date.getUTCDate() + 4 - dayNum)
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1))
  return Math.ceil((((date - yearStart) / 86400000) + 1) / 7)
}

function tocaEstaSemana(cliente, fecha) {
  const frecuencia = cliente.frecuencia_visita || 'semanal'
  if (frecuencia === 'quincenal') return getISOWeek(fecha) % 2 === 0
  if (frecuencia === 'mensual') return fecha.getDate() <= 7
  return true
}

function getMonday(fecha) {
  const d = new Date(fecha)
  const dia = d.getDay()
  d.setDate(d.getDate() + (dia === 0 ? -6 : 1 - dia))
  d.setHours(0, 0, 0, 0)
  return d
}

function fmtCorta(d) {
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
}

// Ordena por vecino más cercano (greedy) a partir de un punto de origen.
// Los clientes sin coordenadas quedan al final, en el orden en que llegaron.
function ordenarPorCercania(clientes, origen) {
  const conCoords = clientes.filter(c => c.latitud && c.longitud)
  const sinCoords = clientes.filter(c => !(c.latitud && c.longitud))
  const restantes = [...conCoords]
  const ordenados = []
  let actual = origen
  while (restantes.length) {
    let idxMin = 0
    let distMin = Infinity
    restantes.forEach((c, i) => {
      const d = distanciaKm(actual.lat, actual.lng, c.latitud, c.longitud)
      if (d < distMin) { distMin = d; idxMin = i }
    })
    const [next] = restantes.splice(idxMin, 1)
    ordenados.push(next)
    actual = { lat: next.latitud, lng: next.longitud }
  }
  return [...ordenados, ...sinCoords]
}

export default function MiRutaPage() {
  const { user, isAdmin } = useAuth()
  const { toasts, toast } = useToast()

  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [visitasSel, setVisitasSel] = useState([])
  const [loading, setLoading] = useState(true)
  const [filtroVendedor, setFiltroVendedor] = useState('')

  const [modalVisita, setModalVisita] = useState(null) // cliente
  const [resultado, setResultado] = useState('venta')
  const [notas, setNotas] = useState('')
  const [saving, setSaving] = useState(false)
  const [verVisita, setVerVisita] = useState(null) // { cliente, visita }

  const [ordenGps, setOrdenGps] = useState(null) // array de cliente.id en el orden optimizado, o null = orden por defecto
  const [primerClienteId, setPrimerClienteId] = useState('')
  const [ubicando, setUbicando] = useState(false)

  const hoy = new Date()
  const hoyStr = hoyAR()
  const mondayHoy = getMonday(hoy)

  const [weekOffset, setWeekOffset] = useState(0)
  const [selectedDow, setSelectedDow] = useState(() => (hoy.getDay() === 0 ? 0 : hoy.getDay() - 1))

  const mondaySel = new Date(mondayHoy)
  mondaySel.setDate(mondaySel.getDate() + weekOffset * 7)
  const saturdaySel = new Date(mondaySel)
  saturdaySel.setDate(saturdaySel.getDate() + 5)

  const fechaSel = new Date(mondaySel)
  fechaSel.setDate(fechaSel.getDate() + selectedDow)
  const fechaSelStr = fechaSel.toISOString().split('T')[0]
  const diaSel = DIAS_SEMANA[selectedDow]
  const esHoy = fechaSelStr === hoyStr

  function irAHoy() {
    setWeekOffset(0)
    setSelectedDow(hoy.getDay() === 0 ? 0 : hoy.getDay() - 1)
  }

  useEffect(() => { load() }, [diaSel, fechaSelStr])
  useEffect(() => { setOrdenGps(null); setPrimerClienteId('') }, [diaSel, fechaSelStr, filtroVendedor])

  async function load() {
    setLoading(true)
    try {
      const [{ data: c }, { data: v }, { data: vis }] = await Promise.all([
        supabase.from('clientes')
          .select('id,nombre,nombre_fantasia,direccion,localidad,zona_lst,tipo,telefono,vendedor_id,dia_visita,frecuencia_visita,estado_cliente,latitud,longitud')
          .eq('dia_visita', diaSel).eq('estado_cliente', 'Activo'),
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('visitas').select('cliente_id,resultado,notas').eq('fecha', fechaSelStr)
      ])
      setClientes(c || [])
      setVendedores(v || [])
      setVisitasSel(vis || [])
    } catch (e) { toast('Error cargando la ruta', 'error') } finally { setLoading(false) }
  }

  const rutaSel = useMemo(() => {
    return clientes
      .filter(c => tocaEstaSemana(c, fechaSel))
      .filter(c => isAdmin ? (!filtroVendedor || c.vendedor_id === filtroVendedor) : c.vendedor_id === user)
  }, [clientes, isAdmin, filtroVendedor, user, fechaSelStr])

  function visitaDe(clienteId) { return visitasSel.find(v => v.cliente_id === clienteId) }

  function abrirVisita(c) {
    setModalVisita(c); setResultado('venta'); setNotas('')
  }

  async function saveVisita() {
    if (!modalVisita) return
    setSaving(true)
    try {
      await supabase.from('visitas').insert({
        cliente_id: modalVisita.id, vendedor_id: modalVisita.vendedor_id || user,
        fecha: fechaSelStr, resultado, notas: notas || null
      })
      toast('Visita registrada ✓')
      setModalVisita(null)
      load()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setSaving(false) }
  }

  const pendientes = rutaSel.filter(c => !visitaDe(c.id))
  const hechas = rutaSel.filter(c => visitaDe(c.id))
  const sinCoords = pendientes.filter(c => !(c.latitud && c.longitud)).length

  const pendientesOrdenados = useMemo(() => {
    if (!ordenGps) return pendientes
    const porId = new Map(pendientes.map(c => [c.id, c]))
    const ordenados = ordenGps.map(id => porId.get(id)).filter(Boolean)
    const faltantes = pendientes.filter(c => !ordenGps.includes(c.id))
    return [...ordenados, ...faltantes]
  }, [pendientes, ordenGps])

  function ordenarDesdeUbicacion() {
    if (!navigator.geolocation) { toast('Tu navegador no soporta geolocalización', 'error'); return }
    setUbicando(true)
    navigator.geolocation.getCurrentPosition(
      pos => {
        const origen = { lat: pos.coords.latitude, lng: pos.coords.longitude }
        setOrdenGps(ordenarPorCercania(pendientes, origen).map(c => c.id))
        setPrimerClienteId('')
        setUbicando(false)
      },
      err => { toast('No se pudo obtener tu ubicación: ' + err.message, 'error'); setUbicando(false) },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  function ordenarDesdeCliente(id) {
    setPrimerClienteId(id)
    if (!id) { setOrdenGps(null); return }
    const cliente = pendientes.find(c => c.id === id)
    if (!cliente?.latitud || !cliente?.longitud) { toast('Ese cliente no tiene coordenadas cargadas', 'error'); return }
    const resto = pendientes.filter(c => c.id !== id)
    const ordenResto = ordenarPorCercania(resto, { lat: cliente.latitud, lng: cliente.longitud })
    setOrdenGps([cliente.id, ...ordenResto.map(c => c.id)])
  }

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mi Ruta — {diaSel}{esHoy ? ' (Hoy)' : ''}</h1>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
        <button className="btn btn-secondary btn-sm" onClick={() => setWeekOffset(w => w - 1)}>◀</button>
        <div style={{ fontSize: 13, color: 'var(--muted)', textAlign: 'center', display: 'flex', alignItems: 'center', gap: 8 }}>
          Semana del {fmtCorta(mondaySel)} al {fmtCorta(saturdaySel)}
          {!esHoy && <button className="btn btn-secondary btn-sm" onClick={irAHoy}>Hoy</button>}
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setWeekOffset(w => w + 1)}>▶</button>
      </div>

      <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
        {DIAS_SEMANA.map((d, i) => (
          <button
            key={d}
            className={`btn btn-sm ${i === selectedDow ? 'btn-primary' : 'btn-secondary'}`}
            style={{ flex: 1, minWidth: 44 }}
            onClick={() => setSelectedDow(i)}
          >
            {d.slice(0, 3)}
          </button>
        ))}
      </div>

      {isAdmin && (
        <div className="filter-bar">
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
          </select>
        </div>
      )}

      {loading ? (
        <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
      ) : rutaSel.length === 0 ? (
        <div className="empty"><div className="empty-icon">🗓</div><p>No hay clientes asignados a {diaSel}.</p></div>
      ) : (
        <>
          {pendientes.length > 1 && (
            <div className="card" style={{ padding: 12, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={ordenarDesdeUbicacion} disabled={ubicando}>
                  {ubicando ? '📍 Ubicando...' : '📍 Ordenar desde mi ubicación'}
                </button>
                <select value={primerClienteId} onChange={e => ordenarDesdeCliente(e.target.value)} style={{ flex: 1, minWidth: 180 }}>
                  <option value="">...o elegí el primer cliente</option>
                  {pendientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
                </select>
                {ordenGps && <button className="btn btn-secondary btn-sm" onClick={() => { setOrdenGps(null); setPrimerClienteId('') }}>✕ Quitar orden</button>}
              </div>
              {sinCoords > 0 && (
                <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 6 }}>
                  {sinCoords} cliente{sinCoords !== 1 ? 's' : ''} sin coordenadas cargadas — quedan al final, sin optimizar.
                </div>
              )}
            </div>
          )}

          <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 8 }}>
            {pendientes.length} pendiente{pendientes.length !== 1 ? 's' : ''} · {hechas.length} visitado{hechas.length !== 1 ? 's' : ''}
          </div>
          <div className="cards-grid">
            {[...pendientesOrdenados, ...hechas].map((c, idx) => {
              const visita = visitaDe(c.id)
              const resultadoInfo = RESULTADOS.find(r => r.value === visita?.resultado)
              const numero = ordenGps && idx < pendientesOrdenados.length ? idx + 1 : null
              return (
                <div key={c.id} className="op-card" style={{ opacity: visita ? 0.6 : 1 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 600, fontSize: 15 }}>{numero ? `${numero}. ` : ''}{nombreCliente(c)}</div>
                      <div style={{ fontSize: 12, color: 'var(--muted)' }}>
                        {c.tipo || '—'}{c.zona_lst ? ` · ${c.zona_lst}` : ''}
                      </div>
                      {c.direccion && <div style={{ fontSize: 12, color: 'var(--muted)' }}>📍 {c.direccion}{c.localidad ? `, ${c.localidad}` : ''}</div>}
                    </div>
                    {visita && <span className={`badge ${resultadoInfo?.badge || 'badge-gray'}`}>{resultadoInfo?.label || 'Visitado'}</span>}
                  </div>
                  <div className="op-card-actions" style={{ marginTop: 10 }}>
                    {c.telefono && (
                      <a href={`https://wa.me/549${c.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>💬 WhatsApp</a>
                    )}
                    {c.latitud && c.longitud && (
                      <a href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`} target="_blank" rel="noreferrer" className="btn btn-secondary" style={{ flex: 1, textDecoration: 'none', textAlign: 'center' }}>🗺 Mapa</a>
                    )}
                    {!visita && esHoy && <button className="btn btn-success" style={{ flex: 1 }} onClick={() => abrirVisita(c)}>✓ Visitado</button>}
                    {visita && <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setVerVisita({ cliente: c, visita })}>👁 Ver detalle</button>}
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {modalVisita && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalVisita(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Registrar visita</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalVisita(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}><strong>{nombreCliente(modalVisita)}</strong></p>
              <div className="form-group" style={{ marginBottom: 12 }}>
                <label>Resultado</label>
                <select value={resultado} onChange={e => setResultado(e.target.value)}>
                  {RESULTADOS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <input value={notas} onChange={e => setNotas(e.target.value)} placeholder="Observaciones..." />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalVisita(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveVisita} disabled={saving}>{saving ? 'Guardando...' : 'Registrar'}</button>
            </div>
          </div>
        </div>
      )}

      {verVisita && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setVerVisita(null)}>
          <div className="modal" style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h2>Detalle de la visita</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setVerVisita(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom: 12 }}><strong>{nombreCliente(verVisita.cliente)}</strong></p>
              <div style={{ marginBottom: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Resultado</div>
                {(() => {
                  const info = RESULTADOS.find(r => r.value === verVisita.visita.resultado)
                  return <span className={`badge ${info?.badge || 'badge-gray'}`}>{info?.label || verVisita.visita.resultado}</span>
                })()}
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: 'var(--muted)', marginBottom: 4 }}>Notas</div>
                <p style={{ color: verVisita.visita.notas ? 'var(--text)' : 'var(--muted)' }}>{verVisita.visita.notas || 'Sin observaciones'}</p>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setVerVisita(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
