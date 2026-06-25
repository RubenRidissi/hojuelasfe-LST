import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente, formatMoney } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const PROVINCIAS = ['Santa Fe','Buenos Aires','Córdoba','Entre Ríos','Mendoza','Tucumán','Salta','Misiones','Chaco','Corrientes','Santiago del Estero','San Juan','Jujuy','Río Negro','Neuquén','Formosa','San Luis','Catamarca','La Pampa','Chubut','La Rioja','Santa Cruz','Tierra del Fuego']
const CONDICION_IVA = ['Responsable Inscripto','Monotributista','Exento','Consumidor Final','No Responsable']

const EMPTY_FORM = {
  id: '', nombre: '', nombre_fantasia: '', telefono: '', email: '',
  localidad: '', provincia: 'Santa Fe', direccion: '',
  tipo: 'Minorista', descuento_pct: 0,
  modalidad_factura: 'sin_iva', cuit: '', condicion_iva: '',
  estado_cliente: 'Pendiente', notas: '', latitud: '', longitud: ''
}

export default function ClientesPage() {
  const { user, isAdmin } = useAuth()
  const { toasts, toast } = useToast()

  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [solicitudes, setSolicitudes] = useState([])
  const [saldos, setSaldos] = useState({})
  const [loading, setLoading] = useState(true)

  // Filtros
  const [search, setSearch] = useState('')
  const [filtroEstado, setFiltroEstado] = useState('')
  const [filtroCartera, setFiltroCartera] = useState('')

  // Modal cliente
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [saving, setSaving] = useState(false)

  // Modal asignar vendedor
  const [modalAsignar, setModalAsignar] = useState(null) // { cliente }
  const [vendedorSel, setVendedorSel] = useState('')

  useEffect(() => { load() }, [])

  async function load() {
    setLoading(true)
    try {
      const [{ data: v }, { data: c }, { data: s }] = await Promise.all([
        supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre'),
        supabase.from('clientes').select('*').order('nombre'),
        supabase.from('solicitudes_clientes').select('id,cliente_id,vendedor_id,created_at').eq('estado', 'pendiente')
      ])
      setVendedores(v || [])
      setClientes(c || [])
      setSolicitudes(s || [])
      loadSaldos(c || [])
    } catch (e) {
      toast('Error cargando clientes', 'error')
    } finally {
      setLoading(false)
    }
  }

  async function loadSaldos(lista) {
    try {
      const [{ data: ventas }, { data: pagos }] = await Promise.all([
        supabase.from('ventas').select('cliente_id,total,estado_pago'),
        supabase.from('pagos').select('cliente_id,monto')
      ])
      const s = {}
      lista.forEach(c => s[c.id] = 0)
      ventas?.forEach(v => {
        if (v.estado_pago !== 'pagado') s[v.cliente_id] = (s[v.cliente_id] || 0) + parseFloat(v.total || 0)
      })
      pagos?.forEach(p => {
        s[p.cliente_id] = (s[p.cliente_id] || 0) - parseFloat(p.monto || 0)
      })
      setSaldos(s)
    } catch (e) { console.error(e) }
  }

  // Filtrado
  const clientesFiltrados = useMemo(() => {
    return clientes.filter(c => {
      const q = search.toLowerCase()
      const matchSearch = !q || (nombreCliente(c) + ' ' + (c.email || '') + ' ' + (c.localidad || '')).toLowerCase().includes(q)
      const matchEstado = !filtroEstado || c.estado_cliente === filtroEstado
      let matchCartera = true
      if (filtroCartera === 'mis') matchCartera = c.vendedor_id === user
      else if (filtroCartera === 'sinasignar') matchCartera = !c.vendedor_id
      else if (filtroCartera === 'solicitados') matchCartera = solicitudes.some(s => s.cliente_id === c.id && s.vendedor_id === user)
      else if (filtroCartera) matchCartera = c.vendedor_id === filtroCartera
      return matchSearch && matchEstado && matchCartera
    })
  }, [clientes, search, filtroEstado, filtroCartera, solicitudes, user])

  // Guardar cliente
  async function saveCliente() {
    if (!form.nombre.trim()) { toast('El nombre es obligatorio', 'error'); return }
    setSaving(true)
    try {
      const data = {
        nombre: form.nombre.trim(),
        nombre_fantasia: form.nombre_fantasia.trim() || null,
        telefono: form.telefono.trim(),
        email: form.email.trim(),
        localidad: form.localidad.trim(),
        provincia: form.provincia,
        direccion: form.direccion.trim(),
        tipo: form.tipo,
        descuento_pct: parseFloat(form.descuento_pct) || 0,
        modalidad_factura: form.modalidad_factura || 'sin_iva',
        cuit: form.cuit.trim() || null,
        condicion_iva: form.condicion_iva || null,
        estado_cliente: form.estado_cliente,
        notas: form.notas.trim(),
        latitud: form.latitud ? parseFloat(form.latitud) : null,
        longitud: form.longitud ? parseFloat(form.longitud) : null,
      }

      if (form.id) {
        // Editar
        if (!isAdmin) {
          const cliente = clientes.find(c => c.id === form.id)
          if (!cliente || cliente.vendedor_id !== user) {
            toast('No tenés permiso para editar este cliente', 'error'); return
          }
          const { error } = await supabase.from('clientes').update({
            telefono: data.telefono, email: data.email,
            direccion: data.direccion, localidad: data.localidad,
            provincia: data.provincia, notas: data.notas,
            latitud: data.latitud, longitud: data.longitud,
            cuit: data.cuit, condicion_iva: data.condicion_iva
          }).eq('id', form.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('clientes').update(data).eq('id', form.id)
          if (error) throw error
        }
        toast('Cliente actualizado')
      } else {
        // Nuevo
        if (!isAdmin) {
          data.estado_cliente = 'Activo'
          data.vendedor_id = user
        }
        const { error } = await supabase.from('clientes').insert(data)
        if (error) throw error
        toast(isAdmin ? 'Cliente creado' : 'Cliente creado y asignado a tu cartera')
      }
      setModalOpen(false)
      setForm(EMPTY_FORM)
      load()
    } catch (e) {
      toast('Error: ' + e.message, 'error')
    } finally {
      setSaving(false)
    }
  }

  function editCliente(c) {
    setForm({
      id: c.id, nombre: c.nombre || '', nombre_fantasia: c.nombre_fantasia || '',
      telefono: c.telefono || '', email: c.email || '',
      localidad: c.localidad || '', provincia: c.provincia || 'Santa Fe',
      direccion: c.direccion || '', tipo: c.tipo || 'Minorista',
      descuento_pct: c.descuento_pct || 0,
      modalidad_factura: c.modalidad_factura || 'sin_iva',
      cuit: c.cuit || '', condicion_iva: c.condicion_iva || '',
      estado_cliente: c.estado_cliente || 'Pendiente',
      notas: c.notas || '', latitud: c.latitud || '', longitud: c.longitud || ''
    })
    setModalOpen(true)
  }

  async function deleteCliente(c) {
    if (!confirm(`¿Eliminar a ${nombreCliente(c)}?`)) return
    try {
      const { error } = await supabase.from('clientes').delete().eq('id', c.id)
      if (error) throw error
      toast('Cliente eliminado')
      load()
    } catch (e) { toast('Error al eliminar', 'error') }
  }

  async function toggleEstado(c) {
    const nuevo = c.estado_cliente === 'Activo' ? 'Inactivo' : 'Activo'
    try {
      const { error } = await supabase.from('clientes').update({ estado_cliente: nuevo }).eq('id', c.id)
      if (error) throw error
      toast(`Cliente marcado como ${nuevo}`)
      load()
    } catch (e) { toast('Error', 'error') }
  }

  async function solicitarCliente(clienteId) {
    if (!confirm('¿Enviar solicitud al admin para que te asigne este cliente?')) return
    try {
      const { error } = await supabase.from('solicitudes_clientes').insert({ cliente_id: clienteId, vendedor_id: user })
      if (error) throw error
      toast('Solicitud enviada al administrador')
      load()
    } catch (e) { toast('Error al enviar solicitud', 'error') }
  }

  async function guardarAsignacion() {
    if (!modalAsignar) return
    try {
      const { error } = await supabase.from('clientes')
        .update({ vendedor_id: vendedorSel || null })
        .eq('id', modalAsignar.id)
      if (error) throw error
      const nombre = vendedorSel
        ? (vendedores.find(v => v.user_id === vendedorSel)?.nombre || 'vendedor')
        : 'Sin asignar'
      toast(vendedorSel ? `Cliente asignado a ${nombre}` : 'Asignación removida')
      setModalAsignar(null)
      load()
    } catch (e) { toast('Error', 'error') }
  }

  async function responderSolicitud(s, decision) {
    try {
      await supabase.from('solicitudes_clientes').update({ estado: decision }).eq('id', s.id)
      if (decision === 'aprobada') {
        await supabase.from('clientes').update({ vendedor_id: s.vendedor_id }).eq('id', s.cliente_id)
        const nombre = vendedores.find(v => v.user_id === s.vendedor_id)?.nombre || 'el vendedor'
        toast(`Cliente asignado a ${nombre}`)
      } else {
        toast('Solicitud rechazada')
      }
      load()
    } catch (e) { toast('Error', 'error') }
  }

  // ===== RENDER =====
  const estadoBadge = { Activo: 'badge-green', Pendiente: 'badge-yellow', Inactivo: 'badge-red' }
  const estadoIcon  = { Activo: '✅', Pendiente: '⏳', Inactivo: '❌' }
  const tipoBadge   = { Minorista: 'badge-gray', Distribuidor: 'badge-blue', Mayorista: 'badge-yellow', Institucional: 'badge-green' }

  function carteraBadge(c) {
    if (!c.vendedor_id) return <span className="badge badge-gray">Sin asignar</span>
    if (c.vendedor_id === user) return <span className="badge badge-green">✓ Mío</span>
    const nombre = vendedores.find(v => v.user_id === c.vendedor_id)?.nombre || 'Vendedor'
    return <span className="badge badge-blue">{nombre}</span>
  }

  function accionesDesktop(c) {
    const tieneSolicitud = solicitudes.some(s => s.cliente_id === c.id && s.vendedor_id === user)
    if (isAdmin) return (
      <div style={{ display:'flex', gap:4 }}>
        <button className="btn btn-sm btn-success" onClick={() => toggleEstado(c)} title="Activar/Desactivar">✅</button>
        <button className="btn btn-sm btn-secondary" onClick={() => editCliente(c)} title="Editar">✏</button>
        <button className="btn btn-sm btn-danger" onClick={() => deleteCliente(c)} title="Borrar">🗑</button>
        <button className="btn btn-sm" style={{ background:'#EDE9FE', color:'#6D28D9' }}
          onClick={() => { setModalAsignar(c); setVendedorSel(c.vendedor_id || '') }} title="Asignar vendedor">👤</button>
      </div>
    )
    if (c.vendedor_id === user) return <button className="btn btn-sm btn-secondary" onClick={() => editCliente(c)}>✏</button>
    if (tieneSolicitud) return <span style={{ fontSize:11, color:'var(--muted)' }}>Solicitud enviada</span>
    return <button className="btn btn-sm" style={{ background:'#FEF3DC', color:'#92400E' }} onClick={() => solicitarCliente(c.id)}>📬 Solicitar</button>
  }

  function accionesMobile(c) {
    const tieneSolicitud = solicitudes.some(s => s.cliente_id === c.id && s.vendedor_id === user)
    if (isAdmin) return (
      <>
        <button className="btn btn-secondary" onClick={() => editCliente(c)}>✏ Editar</button>
        <button className="btn btn-secondary" onClick={() => { setModalAsignar(c); setVendedorSel(c.vendedor_id || '') }}>👤 Asignar</button>
      </>
    )
    if (c.vendedor_id === user) return <button className="btn btn-secondary" onClick={() => editCliente(c)}>✏ Editar</button>
    if (tieneSolicitud) return <span style={{ fontSize:12, color:'var(--muted)', padding:8 }}>📬 Solicitud enviada</span>
    return <button className="btn btn-secondary" style={{ background:'#FEF3DC', color:'#92400E' }} onClick={() => solicitarCliente(c.id)}>📬 Solicitar</button>
  }

  const opcionesCartera = isAdmin
    ? [
        <option key="" value="">Toda la cartera</option>,
        <option key="sinasignar" value="sinasignar">Sin asignar</option>,
        ...vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)
      ]
    : [
        <option key="" value="">Toda la cartera</option>,
        <option key="mis" value="mis">Mis clientes</option>,
        <option key="solicitados" value="solicitados">Solicitados</option>,
        <option key="sin_asignar" value="sinasignar">Sin asignar</option>,
      ]

  return (
    <div>
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Clientes</h1>
        <div className="page-header-actions">
          {clientesFiltrados.length > 0 && (
            <span style={{ fontSize:13, color:'var(--muted)' }}>{clientesFiltrados.length} cliente{clientesFiltrados.length !== 1 ? 's' : ''}</span>
          )}
          <button className="btn btn-primary" onClick={() => { setForm(EMPTY_FORM); setModalOpen(true) }}>
            + Nuevo cliente
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="filter-bar">
        <input
          type="text" placeholder="Buscar cliente..."
          value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex:2, minWidth:160 }}
        />
        <select value={filtroEstado} onChange={e => setFiltroEstado(e.target.value)} style={{ flex:1, minWidth:130 }}>
          <option value="">Todos los estados</option>
          <option value="Activo">Activo</option>
          <option value="Pendiente">Pendiente</option>
          <option value="Inactivo">Inactivo</option>
        </select>
        <select value={filtroCartera} onChange={e => setFiltroCartera(e.target.value)} style={{ flex:1, minWidth:140 }}>
          {opcionesCartera}
        </select>
      </div>

      {/* Solicitudes pendientes (solo admin) */}
      {isAdmin && solicitudes.length > 0 && (
        <div className="card" style={{ marginBottom:16, padding:16 }}>
          <div style={{ fontWeight:700, marginBottom:12, color:'var(--primary-dark)' }}>
            📬 Solicitudes de cartera — {solicitudes.length} pendiente{solicitudes.length !== 1 ? 's' : ''}
          </div>
          <table>
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Vendedor</th>
                <th>Fecha</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {solicitudes.map(s => {
                const cliente = clientes.find(c => c.id === s.cliente_id)
                const vendedor = vendedores.find(v => v.user_id === s.vendedor_id)?.nombre || '—'
                return (
                  <tr key={s.id}>
                    <td><strong>{cliente ? nombreCliente(cliente) : '—'}</strong></td>
                    <td>{vendedor}</td>
                    <td style={{ fontSize:12, color:'var(--muted)' }}>{new Date(s.created_at).toLocaleDateString('es-AR')}</td>
                    <td style={{ whiteSpace:'nowrap' }}>
                      <button className="btn btn-sm btn-success" onClick={() => responderSolicitud(s, 'aprobada')}>✓ Aprobar</button>
                      <button className="btn btn-sm btn-danger" style={{ marginLeft:4 }} onClick={() => responderSolicitud(s, 'rechazada')}>✕ Rechazar</button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Tabla desktop */}
      <div className="card desktop-table">
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">👥</div><p>No hay clientes todavía</p></div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Estado</th>
                  <th>Tipo</th>
                  <th>Cartera</th>
                  <th>Factura</th>
                  <th>Saldo</th>
                  <th>Localidad</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {clientesFiltrados.map(c => (
                  <tr key={c.id}>
                    <td>
                      <strong>{nombreCliente(c)}</strong>
                      {c.email && <><br /><span style={{ fontSize:12, color:'var(--muted)' }}>{c.email}</span></>}
                    </td>
                    <td><span className={`badge ${estadoBadge[c.estado_cliente] || 'badge-yellow'}`}>{estadoIcon[c.estado_cliente] || '⏳'} {c.estado_cliente || 'Pendiente'}</span></td>
                    <td><span className={`badge ${tipoBadge[c.tipo] || 'badge-gray'}`}>{c.tipo || 'Minorista'}</span></td>
                    <td>{carteraBadge(c)}</td>
                    <td>
                      <span className={`badge ${c.modalidad_factura === 'con_iva' ? 'badge-blue' : 'badge-gray'}`}>
                        {c.modalidad_factura === 'con_iva' ? 'c/IVA' : 's/IVA'}
                      </span>
                    </td>
                    <td>
                      {saldos[c.id] === undefined
                        ? <span style={{ color:'var(--muted)', fontSize:12 }}>...</span>
                        : saldos[c.id] <= 0
                          ? <span style={{ color:'var(--success)', fontSize:12 }}>Al día</span>
                          : <span style={{ color:'var(--danger)', fontWeight:600, fontSize:12 }}>{formatMoney(saldos[c.id])}</span>
                      }
                    </td>
                    <td>
                      {c.localidad || '—'}
                      {c.latitud && c.longitud && (
                        <a href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`} target="_blank" rel="noreferrer" style={{ marginLeft:4, textDecoration:'none' }}>📍</a>
                      )}
                    </td>
                    <td style={{ whiteSpace:'nowrap' }}>{accionesDesktop(c)}</td>
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
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div>
        ) : clientesFiltrados.length === 0 ? (
          <div className="empty"><div className="empty-icon">👥</div><p>No hay clientes</p></div>
        ) : clientesFiltrados.map(c => {
          const inicial = (c.nombre_fantasia || c.nombre || '?').charAt(0).toUpperCase()
          const estadoColor = { Activo:'var(--success)', Pendiente:'#D97706', Inactivo:'#DC2626' }[c.estado_cliente] || '#D97706'
          return (
            <div key={c.id} className="op-card">
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ width:44, height:44, borderRadius:'50%', background:'var(--honey-light)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, fontWeight:700, color:'var(--primary-dark)', flexShrink:0 }}>
                  {inicial}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:15, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{nombreCliente(c)}</div>
                  <div style={{ fontSize:12, color:'var(--muted)', marginTop:2 }}>
                    {c.tipo || 'Minorista'} · <span style={{ color:estadoColor, fontWeight:600 }}>{c.estado_cliente || 'Pendiente'}</span>
                  </div>
                </div>
                {c.latitud && c.longitud && (
                  <a href={`https://www.google.com/maps?q=${c.latitud},${c.longitud}`} target="_blank" rel="noreferrer" style={{ fontSize:20, textDecoration:'none' }}>📍</a>
                )}
              </div>
              {c.telefono && (
                <a href={`https://wa.me/549${c.telefono.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                  style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', color:'#25D366', fontSize:14, fontWeight:500, textDecoration:'none', borderTop:'1px solid var(--border)', marginTop:8 }}>
                  💬 {c.telefono}
                </a>
              )}
              {c.localidad && <div style={{ fontSize:12, color:'var(--muted)' }}>📍 {c.localidad}</div>}
              <div className="op-card-actions" style={{ marginTop:8 }}>
                {accionesMobile(c)}
              </div>
            </div>
          )
        })}
      </div>

      {/* Modal cliente */}
      {modalOpen && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalOpen(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2>{form.id ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalOpen(false)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group">
                  <label>Nombre / Razón social *</label>
                  <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))} placeholder="Nombre" />
                </div>
                <div className="form-group">
                  <label>Nombre fantasía</label>
                  <input value={form.nombre_fantasia} onChange={e => setForm(f => ({ ...f, nombre_fantasia: e.target.value }))} placeholder="Nombre comercial" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Teléfono / WhatsApp</label>
                  <input value={form.telefono} onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))} placeholder="3412345678" />
                </div>
                <div className="form-group">
                  <label>Email</label>
                  <input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="email@ejemplo.com" />
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>CUIT</label>
                  <input value={form.cuit} onChange={e => setForm(f => ({ ...f, cuit: e.target.value }))} placeholder="20-12345678-9" />
                </div>
                <div className="form-group">
                  <label>Condición IVA</label>
                  <select value={form.condicion_iva} onChange={e => setForm(f => ({ ...f, condicion_iva: e.target.value }))}>
                    <option value="">— Seleccionar —</option>
                    {CONDICION_IVA.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Localidad</label>
                  <input value={form.localidad} onChange={e => setForm(f => ({ ...f, localidad: e.target.value }))} placeholder="Ciudad" />
                </div>
                <div className="form-group">
                  <label>Provincia</label>
                  <select value={form.provincia} onChange={e => setForm(f => ({ ...f, provincia: e.target.value }))}>
                    {PROVINCIAS.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group" style={{ gridColumn:'1/-1' }}>
                  <label>Dirección</label>
                  <input value={form.direccion} onChange={e => setForm(f => ({ ...f, direccion: e.target.value }))} placeholder="Calle 123" />
                </div>
              </div>
              {isAdmin && (
                <div className="form-row">
                  <div className="form-group">
                    <label>Tipo</label>
                    <select value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}>
                      {['Representante','Distribuidor','Mayorista','Supermercado','Almacén'].map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Estado</label>
                    <select value={form.estado_cliente} onChange={e => setForm(f => ({ ...f, estado_cliente: e.target.value }))}>
                      {['Activo','Pendiente','Inactivo'].map(e => <option key={e} value={e}>{e}</option>)}
                    </select>
                  </div>
                </div>
              )}
              <div className="form-row">
                <div className="form-group">
                  <label>% Descuento</label>
                  <input type="number" min="0" max="100" value={form.descuento_pct} onChange={e => setForm(f => ({ ...f, descuento_pct: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label>Modalidad factura</label>
                  <select value={form.modalidad_factura} onChange={e => setForm(f => ({ ...f, modalidad_factura: e.target.value }))}>
                    <option value="sin_iva">Sin IVA</option>
                    <option value="con_iva">Con IVA</option>
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group">
                  <label>Latitud</label>
                  <input value={form.latitud} onChange={e => setForm(f => ({ ...f, latitud: e.target.value }))} placeholder="-31.6333" />
                </div>
                <div className="form-group">
                  <label>Longitud</label>
                  <input value={form.longitud} onChange={e => setForm(f => ({ ...f, longitud: e.target.value }))} placeholder="-60.7000" />
                </div>
              </div>
              <div className="form-group">
                <label>Notas</label>
                <textarea rows={3} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))} placeholder="Observaciones..." style={{ resize:'vertical' }} />
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={saveCliente} disabled={saving}>
                {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal asignar vendedor */}
      {modalAsignar && (
        <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && setModalAsignar(null)}>
          <div className="modal" style={{ maxWidth:400 }}>
            <div className="modal-header">
              <h2>Asignar vendedor</h2>
              <button className="btn btn-secondary btn-sm" onClick={() => setModalAsignar(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ marginBottom:12 }}><strong>{nombreCliente(modalAsignar)}</strong></p>
              <div className="form-group">
                <label>Vendedor</label>
                <select value={vendedorSel} onChange={e => setVendedorSel(e.target.value)}>
                  <option value="">Sin asignar</option>
                  {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setModalAsignar(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarAsignacion}>Guardar</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} />
    </div>
  )
}
