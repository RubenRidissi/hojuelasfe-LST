import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const ESTADO_BADGE = { pendiente: 'badge-yellow', confirmado: 'badge-blue', entregado: 'badge-green', cancelado: 'badge-red' }
const fmt = n => '$' + parseFloat(n || 0).toLocaleString('es-AR', { maximumFractionDigits: 0 })

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

function PedidoCard({ p }) {
  const fechaCorta = p.fecha ? new Date(p.fecha+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : '—'
  const entregaCorta = p.fecha_entrega ? new Date(p.fecha_entrega+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : null
  return (
    <div className="op-card" style={{marginBottom:10}}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
        <div style={{flex:1}}>
          <div style={{fontWeight:600,fontSize:14}}>{p.clientes ? nombreCliente(p.clientes) : '—'}</div>
          <div style={{fontSize:12,color:'var(--muted)'}}>Pedido: {fechaCorta}{entregaCorta ? ` · Entrega: ${entregaCorta}` : ''}</div>
        </div>
        <div style={{textAlign:'right',flexShrink:0,marginLeft:12}}>
          <div style={{fontWeight:700,fontSize:15}}>{fmt(p.total)}</div>
          <span className={`badge ${ESTADO_BADGE[p.estado]||'badge-gray'}`} style={{marginTop:4,display:'inline-block'}}>{p.estado}</span>
        </div>
      </div>
    </div>
  )
}

export default function DashboardPage() {
  const { user, isAdmin } = useAuth()
  const { toasts } = useToast()
  const navigate = useNavigate()

  const [vendedores, setVendedores] = useState([])
  const [filtroVendedor, setFiltroVendedor] = useState('')
  const [statsAdmin, setStatsAdmin] = useState(null)
  const [pedidosAdmin, setPedidosAdmin] = useState([])
  const [statsVend, setStatsVend] = useState(null)
  const [pedidosVend, setPedidosVend] = useState([])
  const [stockBajo, setStockBajo] = useState([])
  const [loading, setLoading] = useState(true)
  const [hora, setHora] = useState(horaArgentina())

  useEffect(() => {
    const interval = setInterval(() => setHora(horaArgentina()), 60000)
    return () => clearInterval(interval)
  }, [])

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

    const [{count:cntPed},{count:cntEnt},{data:ventasPend},{count:cntCli}] = await Promise.all([
      supabase.from('pedidos').select('id',{count:'exact',head:true}).eq('vendedor_id',user).eq('estado','pendiente'),
      supabase.from('pedidos').select('id',{count:'exact',head:true}).eq('vendedor_id',user).eq('fecha_entrega',today).eq('estado','pendiente'),
      supabase.from('ventas').select('total,monto_pagado').eq('vendedor_id',user).neq('estado_pago','pagado'),
      supabase.from('clientes').select('id',{count:'exact',head:true}).eq('estado_cliente','Activo').eq('vendedor_id',user)
    ])

    const cobranzasPend = (ventasPend||[]).reduce((s,v)=>s+parseFloat(v.total||0)-parseFloat(v.monto_pagado||0),0)
    setStatsVend({ pedidosPend:cntPed||0, entregasHoy:cntEnt||0, cobranzasPend, clientesActivos:cntCli||0 })

    const {data:ultPed} = await supabase.from('pedidos').select('id,total,estado,fecha,fecha_entrega,clientes(nombre,nombre_fantasia)').eq('vendedor_id',user).gte('fecha',desde7).order('created_at',{ascending:false}).limit(20)
    setPedidosVend(ultPed||[])

    const {data:stockData} = await supabase.from('stock_actual').select('nombre,stock,stock_minimo,unidad,codigo')
    setStockBajo((stockData||[]).filter(p => parseFloat(p.stock) <= parseFloat(p.stock_minimo||0) && parseFloat(p.stock_minimo||0) > 0))
  }

  if (isAdmin) return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Dashboard</h1>
        <div style={{fontSize:12,color:'var(--muted)'}}>{hora}</div>
      </div>
      <div style={{marginBottom:16,display:'flex',gap:8,alignItems:'center'}}>
        <select value={filtroVendedor} onChange={e=>setFiltroVendedor(e.target.value)}
          style={{padding:'8px 12px',border:'1px solid var(--border)',borderRadius:'var(--radius)',fontSize:13,background:'var(--surface)'}}>
          <option value="">Todos los vendedores</option>
          {vendedores.map(v=><option key={v.user_id} value={v.user_id}>{v.nombre}</option>)}
        </select>
        {filtroVendedor && <span style={{fontSize:12,color:'var(--muted)'}}>Mostrando: {vendedores.find(v=>v.user_id===filtroVendedor)?.nombre}</span>}
      </div>
      {loading ? <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div> : statsAdmin && (<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))',gap:12,marginBottom:20}}>
          {[
            {label:'Pedidos pendientes',valor:statsAdmin.pedidosPend,color:'#D97706',icon:'📋',route:'/pedidos'},
            {label:'Cobrado hoy',valor:fmt(statsAdmin.cobradoHoy),color:'var(--success)',icon:'💰',route:'/pagos'},
            {label:'Deuda total clientes',valor:fmt(statsAdmin.deudaTotal),color:'var(--danger)',icon:'📒',route:'/ctacte'},
            {label:'Ventas hoy',valor:`${statsAdmin.cantVentasHoy} (${fmt(statsAdmin.totalVentasHoy)})`,color:'var(--primary-dark)',icon:'🧾',route:'/ventas'},
            {label:'Entregas hoy',valor:statsAdmin.entregasHoy,color:'#1D4ED8',icon:'🚚',route:'/pedidos'},
            {label:'Entregas mañana',valor:statsAdmin.entregasManana,color:'#6D28D9',icon:'📅',route:'/pedidos'},
          ].map((item,i)=>(
            <div key={i} className="card" style={{padding:16,cursor:'pointer',textAlign:'center'}} onClick={()=>navigate(item.route)}>
              <div style={{fontSize:28,marginBottom:4}}>{item.icon}</div>
              <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:4}}>{item.label}</div>
              <div style={{fontSize:18,fontWeight:700,color:item.color}}>{item.valor}</div>
            </div>
          ))}
        </div>
        <div className="card">
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13,display:'flex',justifyContent:'space-between'}}>
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
      <ToastContainer toasts={toasts}/>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Inicio</h1>
        <div style={{fontSize:12,color:'var(--muted)'}}>{hora}</div>
      </div>
      {loading ? <div className="empty"><div className="empty-icon">⏳</div><p>Cargando...</p></div> : statsVend && (<>
        <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:12,marginBottom:20}}>
          {[
            {label:'Pedidos pendientes',valor:statsVend.pedidosPend,color:'#D97706',icon:'📋',route:'/pedidos'},
            {label:'Entregas hoy',valor:statsVend.entregasHoy,color:'#1D4ED8',icon:'🚚',route:'/pedidos'},
            {label:'Cobranzas pendientes',valor:fmt(statsVend.cobranzasPend),color:'var(--danger)',icon:'💰',route:'/pagos'},
            {label:'Clientes activos',valor:statsVend.clientesActivos,color:'var(--success)',icon:'👥',route:'/clientes'},
          ].map((item,i)=>(
            <div key={i} className="card" style={{padding:16,cursor:'pointer',textAlign:'center'}} onClick={()=>navigate(item.route)}>
              <div style={{fontSize:28,marginBottom:4}}>{item.icon}</div>
              <div style={{fontSize:11,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',color:'var(--muted)',marginBottom:4}}>{item.label}</div>
              <div style={{fontSize:18,fontWeight:700,color:item.color}}>{item.valor}</div>
            </div>
          ))}
        </div>
        <div className="card" style={{marginBottom:16}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13,display:'flex',justifyContent:'space-between'}}>
            <span>Mis pedidos (últimos 7 días)</span>
            <button className="btn btn-sm btn-secondary" onClick={()=>navigate('/pedidos')}>Ver todos →</button>
          </div>
          {pedidosVend.length===0 ? <div className="empty"><p>Sin pedidos en los últimos 7 días</p></div> : (<>
            <div className="desktop-table"><div className="table-wrap"><table>
              <thead><tr><th>Cliente</th><th>Fecha</th><th>Estado</th><th>Total</th></tr></thead>
              <tbody>{pedidosVend.map(p=>{
                const fechaCorta = p.fecha ? new Date(p.fecha+'T00:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit'}) : '—'
                return <tr key={p.id}><td style={{fontSize:12}}>{p.clientes ? nombreCliente(p.clientes) : '—'}</td><td style={{fontSize:12,color:'var(--muted)'}}>{fechaCorta}</td><td><span className={`badge ${ESTADO_BADGE[p.estado]||'badge-gray'}`}>{p.estado}</span></td><td style={{fontSize:12}}>{fmt(p.total)}</td></tr>
              })}</tbody>
            </table></div></div>
            <div className="mobile-cards" style={{padding:12}}>{pedidosVend.map(p=><PedidoCard key={p.id} p={p}/>)}</div>
          </>)}
        </div>
        {stockBajo.length>0 && (
          <div className="card">
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontWeight:700,fontSize:13,color:'#D97706'}}>⚠ Productos con stock bajo</div>
            <div style={{padding:12}}>
              {stockBajo.map(p=>(
                <div key={p.nombre} style={{display:'flex',justifyContent:'space-between',padding:'6px 0',borderBottom:'1px solid var(--border)',fontSize:13}}>
                  <span>{p.nombre} {p.codigo && <code style={{fontSize:11}}>{p.codigo}</code>}</span>
                  <span style={{color:parseFloat(p.stock)<=0?'var(--danger)':'#D97706',fontWeight:600}}>{p.stock} {p.unidad||''}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </>)}
      <ToastContainer toasts={toasts}/>
    </div>
  )
}
