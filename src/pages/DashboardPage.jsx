import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const ESTADO_BADGE = { pendiente: 'badge-yellow', confirmado: 'badge-blue', entregado: 'badge-green', cancelado: 'badge-red' }
const fmt = (n, puedeVer = true) => puedeVer ? '$' + parseFloat(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 }) : '•••'

function hoyStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`
}
function mananaStr() {
  const d = new Date(); d.setDate(d.getDate()+1)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function hace7diasStr() {
  const d = new Date(); d.setDate(d.getDate()-7)
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function horaArgentina() {
  return new Date().toLocaleString('es-AR', { timeZone:'America/Argentina/Buenos_Aires', hour:'2-digit', minute:'2-digit', weekday:'long', day:'2-digit', month:'long' })
}
function timeTone() {
  const h = Number(new Date().toLocaleString('es-AR', { timeZone:'America/Argentina/Buenos_Aires', hour:'2-digit', hour12:false }))
  if (h < 6) return { saludo:'Buenas noches', icono:'🌙', texto:'Resumen de la jornada' }
  if (h < 12) return { saludo:'Buen día', icono:'☀️', texto:'Listo para comenzar la jornada' }
  if (h < 20) return { saludo:'Buenas tardes', icono:'🌤️', texto:'Seguimos con la jornada' }
  return { saludo:'Buenas noches', icono:'🌙', texto:'Resumen de la jornada' }
}
function saludoDelDia() { return timeTone().saludo }

function userNameFromEmail(user) {
  if (!user) return 'Rubén'
  if (typeof user === 'string') return 'Rubén'
  const email = user.email || ''
  if (email.toLowerCase().includes('rridissi')) return 'Rubén'
  return email ? email.split('@')[0] : 'Rubén'
}

const VERSICULOS = [
  { ref:'Salmo 118:24', texto:'Este es el día que hizo Jehová; nos gozaremos y alegraremos en él.' },
  { ref:'Proverbios 16:3', texto:'Encomienda a Jehová tus obras, y tus pensamientos serán afirmados.' },
  { ref:'Colosenses 3:23', texto:'Todo lo que hagáis, hacedlo de corazón, como para el Señor.' },
  { ref:'Isaías 41:10', texto:'No temas, porque yo estoy contigo; no desmayes, porque yo soy tu Dios.' },
  { ref:'Filipenses 4:13', texto:'Todo lo puedo en Cristo que me fortalece.' }
]


const SANTA_FE = { latitude: -31.6333, longitude: -60.7000, city: 'Santa Fe' }
const WEATHER_CODE = {
  0: '☀️', 1: '🌤️', 2: '⛅', 3: '☁️', 45: '🌫️', 48: '🌫️',
  51: '🌦️', 53: '🌦️', 55: '🌦️', 61: '🌧️', 63: '🌧️', 65: '🌧️',
  71: '❄️', 73: '❄️', 75: '❄️', 80: '🌦️', 81: '🌦️', 82: '🌧️',
  95: '⛈️', 96: '⛈️', 99: '⛈️'
}

async function fetchWeatherByCoords(latitude, longitude) {
  const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,weather_code&timezone=auto`
  const weatherRes = await fetch(weatherUrl)
  if (!weatherRes.ok) throw new Error('No se pudo obtener el clima')
  const weatherData = await weatherRes.json()

  let city = SANTA_FE.city
  try {
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/reverse?latitude=${latitude}&longitude=${longitude}&language=es&format=json&count=1`
    const geoRes = await fetch(geoUrl)
    if (geoRes.ok) {
      const geoData = await geoRes.json()
      city = geoData?.results?.[0]?.name || city
    }
  } catch (_) {}

  return {
    city,
    temp: Math.round(weatherData?.current?.temperature_2m),
    icon: WEATHER_CODE[weatherData?.current?.weather_code] || '🌤️'
  }
}

function versiculoDelMomento() {
  const d = new Date()
  const idx = (d.getDate() + d.getHours()) % VERSICULOS.length
  return VERSICULOS[idx]
}

function PedidoCard({ p }) {
  const fechaCorta = p.fecha ? new Date(p.fecha+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : '—'
  const entregaCorta = p.fecha_entrega ? new Date(p.fecha_entrega+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : null
  return (
    <div className="op-card" style={{marginBottom:10, borderRadius:16, boxShadow:'0 10px 24px rgba(28,25,23,0.06)'}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14}}>{p.clientes ? nombreCliente(p.clientes) : '—'}</div>
          <div style={{fontSize:12,color:'var(--muted)'}}>Pedido: {fechaCorta}{entregaCorta ? ` · Entrega: ${entregaCorta}` : ''}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
          <div style={{fontWeight:800,fontSize:15,color:'var(--primary-dark)'}}>{fmt(p.total)}</div>
          <span className={`badge ${ESTADO_BADGE[p.estado]||'badge-gray'}`} style={{marginTop:4,display:'inline-block'}}>{p.estado}</span>
        </div>
      </div>
    </div>
  )
}

function VerseModal({ verse, onClose }) {
  if (!verse) return null
  return (
    <div style={{position:'fixed', inset:0, background:'rgba(28,25,23,0.42)', zIndex:9998, display:'flex', alignItems:'center', justifyContent:'center', padding:18}}>
      <div style={{width:'100%', maxWidth:420, background:'rgba(255,255,255,0.96)', borderRadius:24, border:'1px solid rgba(232,226,216,0.95)', boxShadow:'0 24px 80px rgba(28,25,23,0.28)', overflow:'hidden'}}>
        <div style={{background:'linear-gradient(135deg,#B91C1C,#DC2626)', color:'white', padding:'20px 22px'}}>
          <div style={{fontSize:12, fontWeight:800, letterSpacing:'.08em', textTransform:'uppercase', opacity:.86}}>Hojuelas · palabra para la jornada</div>
          <div style={{fontSize:32, marginTop:8}}>📖</div>
        </div>
        <div style={{padding:'22px 22px 20px'}}>
          <div style={{fontSize:19, lineHeight:1.45, color:'var(--text)', fontWeight:700, marginBottom:14}}>“{verse.texto}”</div>
          <div style={{fontSize:14, color:'var(--primary-dark)', fontWeight:800, marginBottom:20}}>{verse.ref}</div>
          <button onClick={onClose} className="btn btn-primary" style={{width:'100%', justifyContent:'center', borderRadius:14, padding:'12px 16px'}}>Comenzar</button>
        </div>
      </div>
    </div>
  )
}

function HeroHeader({ user, nombre, hora, weather }) {
  const navigate = useNavigate()
  const nombreMostrar = nombre || userNameFromEmail(user)
  const tone = timeTone()
  const weatherLabel = weather?.temp !== null && weather?.temp !== undefined ? `${weather.temp}°` : 'Clima no disponible'
  const cityLabel = weather?.city || SANTA_FE.city
  const weatherIcon = weather?.icon || '📍'

  const infoCard = {
    flex: 1,
    minWidth: 0,
    background:'rgba(255,255,255,0.14)',
    border:'1px solid rgba(255,255,255,0.22)',
    borderRadius:16,
    padding:'10px 12px',
    backdropFilter:'blur(10px)'
  }

 return (
  <div style={{
    position:'relative', overflow:'hidden', borderRadius:22, padding:'14px 18px 14px', marginBottom:18,
    background:'linear-gradient(135deg, #B91C1C 0%, #DC2626 52%, #9F1239 100%)',
    color:'white', boxShadow:'0 16px 38px rgba(185,28,28,0.20)'
  }}>
    <div style={{position:'absolute', right:-74, top:-96, width:210, height:210, borderRadius:'999px', background:'rgba(251,191,36,0.18)', filter:'blur(4px)'}} />
    <div style={{position:'absolute', right:20, bottom:16, fontSize:62, opacity:0.10, lineHeight:1}}>🥖</div>

    <div style={{position:'relative', zIndex:1}}>
      <div style={{
        display:'flex',
        alignItems:'center',
        gap:14,
        marginBottom:14,
        width:'100%'
      }}>
        <button onClick={() => navigate('/')} aria-label="Ir al inicio" style={{
          border:0, background:'transparent', padding:0, cursor:'pointer', flexShrink:0
        }}>
          <img
            src="/branding/logo-principal.png"
            alt="Hojuelas"
            style={{
              width:58, height:58, objectFit:'contain', background:'white',
              borderRadius:4, padding:4, display:'block',
              filter:'drop-shadow(0 5px 12px rgba(0,0,0,.22))'
            }}
          />
        </button>

        <button onClick={() => navigate('/config')} aria-label="Ir a mi cuenta" style={{
          border:0, background:'transparent', color:'white', padding:0, margin:0,
          cursor:'pointer', textAlign:'left', minWidth:0
        }}>
          <h1 style={{fontSize:25, lineHeight:1.08, margin:0, fontWeight:900, letterSpacing:'-0.04em'}}>
            {tone.icono} {tone.saludo}, {nombreMostrar}
          </h1>
        </button>
      </div>

      <div style={{
        display:'grid',
        gridTemplateColumns:'1fr 1fr',
        gap:0,
        borderTop:'1px solid rgba(255,255,255,0.22)',
        paddingTop:12
      }}>
        <div style={{display:'flex', alignItems:'center', gap:10, paddingRight:12}}>
          <div style={{fontSize:26, lineHeight:1}}>📅</div>
          <div>
            <div style={{fontSize:13, fontWeight:700, lineHeight:1.25}}>{hora}</div>
          </div>
        </div>

        <div style={{
          display:'flex',
          alignItems:'center',
          justifyContent:'space-between',
          gap:10,
          borderLeft:'1px solid rgba(255,255,255,0.24)',
          paddingLeft:14
        }}>
          <div style={{fontSize:25, lineHeight:1}}>{weatherIcon}</div>
          <div style={{textAlign:'right', minWidth:0}}>
            <div style={{fontSize:13, opacity:0.92, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>📍 {cityLabel}</div>
            <div style={{fontSize:24, fontWeight:900, lineHeight:1.05}}>{weatherLabel}</div>
          </div>
        </div>
      </div>
    </div>
  </div>
)
}

function StatCard({ item, onClick }) {
  return (
    <div className="card" onClick={onClick} style={{
      padding:14, cursor:'pointer', borderRadius:18, border:'1px solid rgba(232,226,216,0.95)',
      boxShadow:'0 10px 24px rgba(28,25,23,0.055)', transition:'transform .16s ease, box-shadow .16s ease',
      minHeight:92, display:'flex', alignItems:'center', justifyContent:'space-between', flexDirection:'row', gap:14
    }}>
      <div style={{display:'flex', alignItems:'center', gap:12, minWidth:0}}>
        <div style={{width:46, height:46, borderRadius:999, background:item.color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0}}>{item.icon}</div>
        <div style={{minWidth:0}}>
          <div style={{fontSize:12,fontWeight:800,textTransform:'uppercase',letterSpacing:'.055em',color:'var(--muted)', marginBottom:4}}>{item.label}</div>
          <div style={{fontSize:21,fontWeight:900,color:item.color,letterSpacing:'-0.04em'}}>{item.valor}</div>
        </div>
      </div>
      <div style={{fontSize:26, color:item.color, fontWeight:800}}>›</div>
    </div>
  )
}

export default function DashboardPage() {
 const { user, isAdmin, nombre, puedeVerMontos } = useAuth()
  const { toasts } = useToast()
  const navigate = useNavigate()

  const [vendedores, setVendedores] = useState([])
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [statsAdmin, setStatsAdmin] = useState(null)
  const [pedidosAdmin, setPedidosAdmin] = useState([])
  const [statsVend, setStatsVend] = useState(null)
  const [pedidosVend, setPedidosVend] = useState([])
  const [loading, setLoading] = useState(true)
  const [hora, setHora] = useState(horaArgentina())
  const [verse, setVerse] = useState(null)
  const [weather, setWeather] = useState({ city: SANTA_FE.city, temp: null, icon: '📍' })

  useEffect(() => {
    const interval = setInterval(() => setHora(horaArgentina()), 60000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function loadWeather(position) {
      try {
        const coords = position?.coords || SANTA_FE
        const data = await fetchWeatherByCoords(coords.latitude, coords.longitude)
        if (!cancelled) setWeather(data)
      } catch (e) {
        try {
          const data = await fetchWeatherByCoords(SANTA_FE.latitude, SANTA_FE.longitude)
          if (!cancelled) setWeather({ ...data, city: data.city || SANTA_FE.city })
        } catch (_) {
          if (!cancelled) setWeather({ city: SANTA_FE.city, temp: null, icon: '📍' })
        }
      }
    }

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(loadWeather, () => loadWeather({ coords: SANTA_FE }), {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 30 * 60 * 1000
      })
    } else {
      loadWeather({ coords: SANTA_FE })
    }

    return () => { cancelled = true }
  }, [])


  useEffect(() => {
  const yaMostrado = sessionStorage.getItem('hojuelas_versiculo_mostrado')

  if (!yaMostrado) {
    setVerse(versiculoDelMomento())
    sessionStorage.setItem('hojuelas_versiculo_mostrado', 'true')
  }
}, [])

  function cerrarVersiculo() {
    setVerse(null)
  }

  useEffect(() => {
    if (isAdmin) {
      supabase.from('user_roles').select('user_id,nombre').eq('rol','vendedor').order('nombre')
        .then(({data}) => setVendedores(data||[]))
    }
    cargar()
  }, [isAdmin])

  useEffect(() => { if (isAdmin) cargar() }, [filtroVendedor])

  async function cargar() {
    setLoading(true)
    try { if (isAdmin) await cargarAdmin(); else await cargarVendedor() }
    catch(e) { console.error(e) } finally { setLoading(false) }
  }

  async function cargarAdmin() {
    const today = hoyStr()
    const manana = mananaStr()

    const buildQ = (base, extra=[]) => {
      let q = base
      if (filtroVendedor) q = q.eq('vendedor_id', filtroVendedor)
      extra.forEach(fn => { q = fn(q) })
      return q
    }

    const [
      {count: cntPed},
      {data: pagos},
      {data: ventas},
      {data: ventasHoy},
      {count: cntEntHoy},
      {count: cntEntManana}
    ] = await Promise.all([
      buildQ(supabase.from('pedidos').select('id',{count:'exact',head:true}), [q=>q.eq('estado','pendiente')]),
      buildQ(supabase.from('pagos').select('monto'), [q=>q.eq('fecha',today)]),
      buildQ(supabase.from('ventas').select('total,monto_pagado'), [q=>q.neq('estado_pago','pagado')]),
      buildQ(supabase.from('ventas').select('total'), [q=>q.eq('fecha',today)]),
      buildQ(supabase.from('pedidos').select('id',{count:'exact',head:true}), [q=>q.eq('fecha_entrega',today),q=>q.eq('estado','pendiente')]),
      buildQ(supabase.from('pedidos').select('id',{count:'exact',head:true}), [q=>q.eq('fecha_entrega',manana),q=>q.eq('estado','pendiente')])
    ])

    const cobrado = (pagos||[]).reduce((s,p)=>s+parseFloat(p.monto||0),0)
    const deuda = (ventas||[]).reduce((s,v)=>s+parseFloat(v.total||0)-parseFloat(v.monto_pagado||0),0)
    const totalVentasHoy = (ventasHoy||[]).reduce((s,v)=>s+parseFloat(v.total||0),0)

    setStatsAdmin({ pedidosPend:cntPed||0, cobradoHoy:cobrado, deudaTotal:deuda, cantVentasHoy:(ventasHoy||[]).length, totalVentasHoy, entregasHoy:cntEntHoy||0, entregasManana:cntEntManana||0 })

    let qUlt = supabase.from('pedidos').select('id,total,estado,fecha,fecha_entrega,clientes(nombre,nombre_fantasia)').eq('estado','pendiente').order('created_at',{ascending:false}).limit(8)
    if (filtroVendedor) qUlt = qUlt.eq('vendedor_id',filtroVendedor)
    const {data: ultPed} = await qUlt
    setPedidosAdmin(ultPed||[])
  }

  async function cargarVendedor() {
    const today = hoyStr()
    const desde7 = hace7diasStr()

    const [{data:pedidosPend},{data:ventasAbiertas},{data:ventasPend},{count:cntCli}] = await Promise.all([
      supabase.from('pedidos').select('id,total').eq('vendedor_id',user).in('estado',['pendiente','confirmado']).is('convertido_venta_id',null),
      supabase.from('ventas').select('id,total').eq('vendedor_id',user).eq('estado','abierta'),
      supabase.from('ventas').select('id,total,monto_pagado').eq('vendedor_id',user).in('estado',['remitida','entregada']).neq('estado_pago','pagado'),
      supabase.from('clientes').select('id',{count:'exact',head:true}).eq('estado_cliente','Activo').eq('vendedor_id',user)
])

    const totalPedidosPend = (pedidosPend||[]).reduce((s,p)=>s+parseFloat(p.total||0),0)
    const totalVentasAbiertas = (ventasAbiertas||[]).reduce((s,v)=>s+parseFloat(v.total||0),0)
    const cobranzasPend = (ventasPend||[]).reduce((s,v)=>s+parseFloat(v.total||0)-parseFloat(v.monto_pagado||0),0)
    setStatsVend({
      pedidosPend:(pedidosPend||[]).length,
      totalPedidosPend,
      ventasAbiertas:(ventasAbiertas||[]).length,
      totalVentasAbiertas,
      cobranzasPend,
      cobranzasCount:(ventasPend||[]).length,
      clientesActivos:cntCli||0
    })

    const {data:ultPed} = await supabase.from('pedidos').select('id,total,estado,fecha,fecha_entrega,clientes(nombre,nombre_fantasia)').eq('vendedor_id',user).gte('fecha',desde7).order('created_at',{ascending:false}).limit(20)
    setPedidosVend(ultPed||[])
  }

  if (isAdmin) return (
    <div>
      <HeroHeader user={user} nombre={nombre} hora={hora} weather={weather} />
      <div style={{marginBottom:16,display:'flex',gap:8,alignItems:'center', flexWrap:'wrap'}}>
        <select value={filtroVendedor} onChange={e=>setFiltroVendedor(e.target.value)}
          style={{padding:'10px 14px',border:'1px solid var(--border)',borderRadius:14,fontSize:13,background:'var(--surface)', minWidth:220}}>
          <option value="">Todos los vendedores</option>
          {vendedores.map(v=><option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
        </select>
        {filtroVendedor && <span style={{fontSize:12,color:'var(--muted)'}}>Mostrando: {vendedores.find(v=>v.user_id===filtroVendedor)?.nombre}</span>}
      </div>
      {loading ? <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div> : statsAdmin && (<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(170px,1fr))',gap:14,marginBottom:22}}>
          {[
            {label:'Pedidos',valor:`${statsAdmin.pedidosPend} pendientes`,color:'#D97706',icon:'📋',route:'/pedidos'},
            {label:'Cobrado hoy',valor:fmt(statsAdmin.cobradoHoy),color:'var(--success)',icon:'💰',route:'/pagos'},
            {label:'Deuda clientes',valor:fmt(statsAdmin.deudaTotal),color:'var(--danger)',icon:'📒',route:'/ctacte'},
            {label:'Ventas hoy',valor:`${statsAdmin.cantVentasHoy} · ${fmt(statsAdmin.totalVentasHoy)}`,color:'var(--primary-dark)',icon:'🧾',route:'/ventas'},
            {label:'Entregas hoy',valor:statsAdmin.entregasHoy,color:'#1D4ED8',icon:'🚚',route:'/pedidos'},
            {label:'Mañana',valor:`${statsAdmin.entregasManana} entregas`,color:'#6D28D9',icon:'📅',route:'/pedidos'},
          ].map((item,i)=><StatCard key={i} item={item} onClick={()=>navigate(item.route)} />)}
        </div>
        <div className="card" style={{borderRadius:20, overflow:'hidden', boxShadow:'0 12px 30px rgba(28,25,23,0.06)'}}>
          <div style={{padding:'14px 18px',borderBottom:'1px solid var(--border)',fontWeight:800,fontSize:14,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <span>Pedidos pendientes</span>
            <button className="btn btn-sm btn-secondary" onClick={()=>navigate('/pedidos')}>Ver todos →</button>
          </div>
          {pedidosAdmin.length===0 ? <div className="empty"><p>Sin pedidos pendientes</p></div> : (<>
            <div className="desktop-table"><div className="table-wrap"><table>
              <thead><tr><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead>
              <tbody>{pedidosAdmin.map(p=>(
                <tr key={p.id} style={{cursor:'pointer'}} onClick={()=>navigate('/pedidos')}>
                  <td>{p.clientes ? nombreCliente(p.clientes) : '—'}</td>
                  <td style={{fontSize:12}}>{p.fecha}</td>
                  <td><span className={`badge ${ESTADO_BADGE[p.estado]||'badge-gray'}`}>{p.estado}</span></td>
                  <td>{fmt(p.total)}</td>
                </tr>
              ))}</tbody>
            </table></div></div>
            <div className="mobile-cards" style={{padding:12}}>{pedidosAdmin.map(p=><PedidoCard key={p.id} p={p}/>)}</div>
          </>)}
        </div>
      </>)}
      <VerseModal verse={verse} onClose={cerrarVersiculo} />
      <ToastContainer toasts={toasts}/>
    </div>
  )

  return (
    <div>
      <HeroHeader user={user} nombre={nombre} hora={hora} weather={weather} />
      {loading ? <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div> : statsVend && (<>
        <div style={{marginBottom:22}}>

  <div style={{marginBottom:22}}>
  <div style={{
    display:'flex',
    alignItems:'center',
    gap:10,
    marginBottom:4
  }}>
    <div style={{fontSize:28}}>🚀</div>
    <div style={{
      fontSize:24,
      fontWeight:900,
      color:'var(--text)'
    }}>
      ¡Avancemos juntos!
    </div>
  </div>

  <div style={{
    color:'var(--muted)',
    fontSize:14,
    lineHeight:1.4
  }}>
    Aquí están las prioridades para organizar tu jornada.
  </div>
</div>

  {[
    {
      color:'#D97706',
      bg:'rgba(217,119,6,0.12)',
      icon:'📋',
      titulo:'Concretemos oportunidades',
      valor: statsVend.pedidosPend === 0
        ? 'Sin pendientes. ¡A vender!'
        : statsVend.pedidosPend === 1
          ? '1 por concretar'
          : `${statsVend.pedidosPend} por concretar`,
      meta: statsVend.pedidosPend === 0 ? '' : `≈ ${fmt(statsVend.totalPedidosPend, puedeVerMontos)}`,
      route:'/pedidos'
    },
    {
      color:'#2563EB',
      bg:'rgba(37,99,235,0.12)',
      icon:'🚚',
      titulo:'Honremos compromisos',
      valor: statsVend.ventasAbiertas === 0
        ? 'Todo despachado. ¡Buen trabajo!'
        : statsVend.ventasAbiertas === 1
          ? '1 por despachar'
          : `${statsVend.ventasAbiertas} por despachar`,
      meta: statsVend.ventasAbiertas === 0 ? '' : `≈ ${fmt(statsVend.totalVentasAbiertas, puedeVerMontos)}`,
      route:'/ventas'
    },
    {
      color:'#DC2626',
      bg:'rgba(220,38,38,0.12)',
      icon:'💰',
      titulo:'Completemos ciclos',
      valor: statsVend.cobranzasPend === 0
        ? '¡Excelente gestión de Cobranza!'
        : fmt(statsVend.cobranzasPend, puedeVerMontos),
      meta: statsVend.cobranzasPend === 0
        ? ''
        : `${statsVend.cobranzasCount} ${statsVend.cobranzasCount === 1 ? 'venta' : 'ventas'}`,
      route:'/pagos'
    }
  ].map((item,i)=>

    <div
      key={i}
      onClick={()=>navigate(item.route)}
      className="card"
      style={{
        cursor:'pointer',
        marginBottom:14,
        padding:16,
        borderRadius:18,
        borderLeft:`6px solid ${item.color}`,
        transition:'all .18s ease'
      }}
    >

      <div style={{
        display:'flex',
        justifyContent:'space-between',
        alignItems:'center',
        marginBottom:10
      }}>

        <div style={{
          display:'flex',
          alignItems:'center',
          gap:10
        }}>
          <div style={{
            width:40,
            height:40,
            borderRadius:'999px',
            background:item.color,
            display:'flex',
            alignItems:'center',
            justifyContent:'center',
            fontSize:22,
            flexShrink:0,
          }}>
            {item.icon}
          </div>

          <div style={{
            fontWeight:900,
            fontSize:21,
             lineHeight:1.2,
            letterSpacing:'-0.02em'
          }}>
            {item.titulo}
          </div>
        </div>

        

      </div>

      {!item.meta ? (
        <div style={{
          color:'var(--success)',
          fontSize:18,
          fontWeight:900,
          width:'100%',
          textAlign:'right',
          marginTop:10
        }}>
          {item.valor}
        </div>
      ) : (
        <div style={{
          display:'flex',
          justifyContent:'space-between',
          alignItems:'center',
          gap:12,
          width:'100%',
          marginTop:10
        }}>
          <div style={{
            color:item.color,
            fontSize:20,
            fontWeight:900,
            whiteSpace:'nowrap'
          }}>
            {item.valor}
          </div>

          <div style={{
            color:'var(--muted)',
            fontSize:13,
            fontWeight:700,
            whiteSpace:'nowrap',
            overflow:'hidden',
            textOverflow:'ellipsis',
            textAlign:'right'
          }}>
            {item.meta}
          </div>
        </div>
      )}

    </div>

  )}

</div>
        
      </>)}
      <VerseModal verse={verse} onClose={cerrarVersiculo} />
      <ToastContainer toasts={toasts}/>
    </div>
  )
}
