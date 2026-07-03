import { useState, useEffect, useRef } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const COLORES = {
  Minorista: '#6B7280',
  Mayorista: '#3B82F6',
  Distribuidor: '#F59E0B',
  Institucional: '#10B981'
}

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'

export default function MapaPage() {
  const { user, isAdmin, isInvitado } = useAuth()
  const { toasts, toast } = useToast()

  const mapRef = useRef(null)
  const mapaInstanceRef = useRef(null)
  const markersRef = useRef([])

  const [clientes, setClientes] = useState([])
  const [vendedores, setVendedores] = useState([])
  const [loading, setLoading] = useState(true)

  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [filtroCliente, setFiltroCliente] = useState('')
  const [conCoords, setConCoords] = useState(0)
  const [sinCoords, setSinCoords] = useState(0)
  const [leafletCargado, setLeafletCargado] = useState(false)
  const [clienteAUbicar, setClienteAUbicar] = useState('')
  const pendingCoordsRef = useRef(null)

  // Cargar Leaflet dinámicamente
  useEffect(() => {
    if (window.L) { setLeafletCargado(true); return }

    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = LEAFLET_CSS
    document.head.appendChild(link)

    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.onload = () => setLeafletCargado(true)
    script.onerror = () => toast('Error cargando Leaflet', 'error')
    document.head.appendChild(script)

    return () => {
      // No remover Leaflet al desmontar — puede usarse en otra visita
    }
  }, [])

  // Cargar datos
  useEffect(() => {
    async function loadData() {
      setLoading(true)
      try {
        const [{ data: c }, { data: v }] = await Promise.all([
          supabase.from('clientes').select('id,nombre,nombre_fantasia,tipo,latitud,longitud,localidad,provincia,telefono,vendedor_id,modalidad_factura,estado_cliente').order('nombre'),
          supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor').order('nombre')
        ])
        setVendedores(v || [])
        // Vendedor solo ve sus clientes + sin asignar
        const lista = isAdmin ? (c || []) : (c || []).filter(x => x.vendedor_id === user || !x.vendedor_id)
        setClientes(lista)
      } catch (e) { toast('Error cargando clientes', 'error') } finally { setLoading(false) }
    }
    loadData()
  }, [isAdmin, user])

  async function guardarNuevaUbicacion(clienteId, lat, lng) {
    try {
      const { error } = await supabase
        .from('clientes')
        .update({ latitud: lat, longitud: lng })
        .eq('id', clienteId)
      if (error) throw error
      setClientes(prev => prev.map(c => c.id === clienteId ? { ...c, latitud: lat, longitud: lng } : c))
      toast('Ubicación actualizada')
    } catch (e) {
      toast('Error al guardar la ubicación: ' + e.message, 'error')
    }
  }

  // Inicializar mapa cuando Leaflet esté cargado y el contenedor visible
  useEffect(() => {
    if (!leafletCargado || loading) return

    const L = window.L
    const tryInit = (intentos) => {
      const container = mapRef.current
      if (container && container.offsetHeight > 0) {
        if (mapaInstanceRef.current) {
          mapaInstanceRef.current.remove()
          mapaInstanceRef.current = null
        }
        mapaInstanceRef.current = L.map(container).setView([-31.63, -60.70], 11)
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors', maxZoom: 19
        }).addTo(mapaInstanceRef.current)
        setTimeout(() => { if (mapaInstanceRef.current) mapaInstanceRef.current.invalidateSize() }, 300)
        renderMapa()
      } else if (intentos > 0) {
        setTimeout(() => tryInit(intentos - 1), 150)
      }
    }
    tryInit(10)

    return () => {
      if (mapaInstanceRef.current) {
        mapaInstanceRef.current.remove()
        mapaInstanceRef.current = null
      }
    }
  }, [leafletCargado, loading, clientes])

  // Re-renderizar cuando cambian filtros
  useEffect(() => {
    if (mapaInstanceRef.current) renderMapa()
  }, [filtroVendedor, filtroCliente, clienteAUbicar])

  function renderMapa() {
    const L = window.L
    if (!mapaInstanceRef.current || !L) return

    // Limpiar marcadores anteriores
    markersRef.current.forEach(m => mapaInstanceRef.current.removeLayer(m))
    markersRef.current = []

    let filtrados = clientes
    if (filtroVendedor) filtrados = filtrados.filter(c => c.vendedor_id === filtroVendedor)
    if (filtroCliente) filtrados = filtrados.filter(c => c.id === filtroCliente)

    const con = filtrados.filter(c => c.latitud && c.longitud)
    const sin = filtrados.filter(c => !c.latitud || !c.longitud)
    setConCoords(con.length)
    setSinCoords(sin.length)

    if (!con.length) return

    const bounds = []
    con.forEach(c => {
      const color = COLORES[c.tipo] || '#6B7280'
      const vendedorNombre = c.vendedor_id
        ? (vendedores.find(v => v.user_id === c.vendedor_id)?.nombre || 'Asignado')
        : 'Sin asignar'
      const factBadge = c.modalidad_factura === 'con_iva' ? 'c/IVA' : 's/IVA'

      const icon = L.divIcon({
        className: '',
        html: `<div style="width:14px;height:14px;border-radius:50%;background:${color};border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
        iconSize: [14, 14], iconAnchor: [7, 7], popupAnchor: [0, -10]
      })

      const waLink = c.telefono
        ? `<a href="https://wa.me/549${c.telefono.replace(/\D/g,'')}" target="_blank" style="color:#25D366;font-size:12px;font-weight:500;text-decoration:none">💬 ${c.telefono}</a>`
        : ''

      const estadoBadge = { Activo: '#16A34A', Pendiente: '#D97706', Inactivo: '#DC2626' }[c.estado_cliente] || '#78716C'

      const popup = `
        <div style="min-width:180px;font-family:sans-serif">
          <div style="font-weight:600;font-size:14px;margin-bottom:4px">${nombreCliente(c)}</div>
          <div style="font-size:12px;color:#6B7280;margin-bottom:6px">${c.localidad || ''}${c.localidad && c.provincia ? ', ' : ''}${c.provincia || ''}</div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:6px">
            <span style="background:${color}22;color:${color};padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${c.tipo || 'Minorista'}</span>
            <span style="background:#F3F4F6;color:#374151;padding:2px 8px;border-radius:12px;font-size:11px">${vendedorNombre}</span>
            <span style="background:#DBEAFE;color:#1D4ED8;padding:2px 8px;border-radius:12px;font-size:11px">${factBadge}</span>
            <span style="background:${estadoBadge}22;color:${estadoBadge};padding:2px 8px;border-radius:12px;font-size:11px">${c.estado_cliente || '—'}</span>
          </div>
          ${waLink}
          <div style="margin-top:6px">
            <a href="https://www.google.com/maps?q=${c.latitud},${c.longitud}" target="_blank" style="font-size:11px;color:#6B7280">📍 Ver en Google Maps</a>
          </div>
          ${!isInvitado ? '<div style="margin-top:4px;font-size:11px;color:#9CA3AF">↕ Arrastrá el pin para corregir la ubicación</div>' : ''}
        </div>`

      const marker = L.marker([parseFloat(c.latitud), parseFloat(c.longitud)], { icon, draggable: !isInvitado })
        .bindPopup(popup)
        .addTo(mapaInstanceRef.current)

      if (!isInvitado) {
        marker.on('dragend', () => {
          const { lat, lng } = marker.getLatLng()
          guardarNuevaUbicacion(c.id, lat, lng)
        })
      }

      markersRef.current.push(marker)
      bounds.push([parseFloat(c.latitud), parseFloat(c.longitud)])
    })

    if (bounds.length > 0) {
      mapaInstanceRef.current.fitBounds(bounds, { padding: [30, 30], maxZoom: 14 })
    }

    if (clienteAUbicar) {
      const clientePendiente = clientes.find(c => c.id === clienteAUbicar)
      if (clientePendiente) {
        const centro = bounds.length ? mapaInstanceRef.current.getCenter() : { lat: -31.63, lng: -60.70 }
        pendingCoordsRef.current = { lat: centro.lat, lng: centro.lng }

        const iconPendiente = L.divIcon({
          className: '',
          html: `<div style="width:20px;height:20px;border-radius:50% 50% 50% 0;background:#DC2626;border:2px solid white;box-shadow:0 2px 6px rgba(0,0,0,.5);transform:rotate(-45deg)"></div>`,
          iconSize: [20, 20], iconAnchor: [10, 20], popupAnchor: [0, -20]
        })

        const markerPendiente = L.marker([centro.lat, centro.lng], { icon: iconPendiente, draggable: true, zIndexOffset: 1000 })
          .bindPopup(`<div style="font-size:12px;max-width:170px"><strong>${nombreCliente(clientePendiente)}</strong><br/>Arrastrá este pin a su ubicación real y tocá "Guardar ubicación".</div>`)
          .addTo(mapaInstanceRef.current)
          .openPopup()

        markerPendiente.on('dragend', () => {
          const { lat, lng } = markerPendiente.getLatLng()
          pendingCoordsRef.current = { lat, lng }
        })

        markersRef.current.push(markerPendiente)
        if (!bounds.length) mapaInstanceRef.current.setView([centro.lat, centro.lng], 13)
      }
    }
  }

  async function confirmarUbicacionPendiente() {
    if (!clienteAUbicar || !pendingCoordsRef.current) return
    await guardarNuevaUbicacion(clienteAUbicar, pendingCoordsRef.current.lat, pendingCoordsRef.current.lng)
    setClienteAUbicar('')
    pendingCoordsRef.current = null
  }

  const TIPOS = ['Minorista', 'Distribuidor', 'Mayorista', 'Institucional']

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Mapa de clientes</h1>
        <div style={{ fontSize: 13, color: 'var(--muted)' }}>
          {conCoords > 0 && `${conCoords} cliente${conCoords !== 1 ? 's' : ''} en el mapa`}
          {sinCoords > 0 && ` · ${sinCoords} sin coordenadas`}
        </div>
      </div>

      {/* Filtros */}
      <div className="filter-bar" style={{ marginBottom: 12 }}>
        {isAdmin && (
          <select value={filtroVendedor} onChange={e => setFiltroVendedor(e.target.value)} style={{ flex: 1 }}>
            <option value="">Todos los vendedores</option>
            {vendedores.map(v => <option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
          </select>
        )}
        {!isAdmin && (
          <select value={filtroCliente} onChange={e => setFiltroCliente(e.target.value)} style={{ flex: 2 }}>
            <option value="">Todos mis clientes + sin asignar</option>
            {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
          </select>
        )}

      </div>

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
        {TIPOS.map(t => (
          <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
            <span style={{ width: 10, height: 10, borderRadius: '50%', background: COLORES[t], display: 'inline-block', border: '1.5px solid white', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }} />
            {t}
          </span>
        ))}
      </div>

      {/* Contenedor del mapa */}
      <div className="card" style={{ overflow: 'hidden' }}>
        {loading ? (
          <div className="empty"><div className="empty-icon">⏳</div><p>Cargando clientes...</p></div>
        ) : !leafletCargado ? (
          <div className="empty"><div className="empty-icon">🗺️</div><p>Cargando mapa...</p></div>
        ) : (
          <div ref={mapRef} style={{ height: 520, width: '100%' }} />
        )}
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  )
}
