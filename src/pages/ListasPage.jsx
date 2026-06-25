import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const EMPRESA = { razon: 'Hojuelas con Miel', logoUrl: 'https://hojuelassrl.com/wp-content/uploads/2024/09/Logo-Hojuelas-A.webp' }
const COMP_CSS = `body{font-family:Arial,sans-serif;color:#1C1917;margin:0;padding:0}.comp-wrap{padding:20px}.comp-table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}.comp-table th{background:#D4860A;color:white;padding:7px 8px;text-align:left}.comp-table td{padding:7px 8px;border-bottom:1px solid #E8E2D8}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}`

export default function ListasPage() {
  const { isAdmin } = useAuth()
  const { toasts, toast } = useToast()

  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [listas, setListas] = useState([])
  const [loadingListas, setLoadingListas] = useState(true)

  // Config lista
  const [tipo, setTipo] = useState('distribuidor')
  const [clienteId, setClienteId] = useState('')
  const [familia, setFamilia] = useState('')
  const [ivaOpcion, setIvaOpcion] = useState('siniva')
  const [mostrarPromo, setMostrarPromo] = useState(true)
  const [mostrarCodigo, setMostrarCodigo] = useState(true)
  const [soloConStock, setSoloConStock] = useState(false)
  const [vigencia, setVigencia] = useState(new Date().toLocaleDateString('es-AR'))
  const [nombreLista, setNombreLista] = useState('')

  // Vista previa
  const [preview, setPreview] = useState(null)
  const [generando, setGenerando] = useState(false)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('productos').select('*').eq('activo', true).order('familia').order('nombre'),
      supabase.from('clientes').select('id,nombre,nombre_fantasia,tipo,descuento_pct,modalidad_factura').order('nombre'),
    ]).then(([{ data: p }, { data: c }]) => {
      setProductos(p || [])
      setClientes(c || [])
    })
    loadListas()
  }, [])

  async function loadListas() {
    setLoadingListas(true)
    const { data } = await supabase.from('listas_precios_repo').select('id,nombre,tipo,created_at').order('created_at', { ascending: false })
    setListas(data || [])
    setLoadingListas(false)
  }

  const familias = useMemo(() => [...new Set(productos.map(p => p.familia).filter(Boolean))].sort(), [productos])
  const clienteSeleccionado = useMemo(() => clientes.find(c => c.id === clienteId), [clientes, clienteId])

  async function generarLista() {
    if (tipo === 'cliente' && !clienteId) { toast('Seleccioná un cliente', 'error'); return }
    setGenerando(true)
    try {
      let prods = productos.filter(p => p.activo !== false)
      if (familia) prods = prods.filter(p => p.familia === familia)

      if (soloConStock) {
        const { data: stockData } = await supabase.from('stock_actual').select('id,stock')
        const stockMap = {}
        ;(stockData || []).forEach(s => { stockMap[s.id] = parseFloat(s.stock || 0) })
        prods = prods.filter(p => (stockMap[p.id] || 0) > 0)
      }

      const descPct = tipo === 'cliente' ? parseFloat(clienteSeleccionado?.descuento_pct || 0) : 0
      const grupos = {}
      prods.forEach(p => {
        const fam = p.familia || 'Otros'
        if (!grupos[fam]) grupos[fam] = []
        grupos[fam].push(p)
      })

      const colSpan = mostrarCodigo ? 4 : 3
      let tablaRows = ''
      Object.entries(grupos).forEach(([fam, ps]) => {
        tablaRows += `<tr><td colspan="${colSpan}" style="background:#FEF3DC;font-weight:700;font-size:13px;color:#9A5F00;padding:8px 10px">${fam}</td></tr>`
        ps.forEach(p => {
          const precioBase = tipo === 'mayorista' ? parseFloat(p.precio_mayorista || p.precio || 0) : parseFloat(p.precio || 0)
          const precioFinal = descPct > 0 ? precioBase * (1 - descPct / 100) : precioBase
          const precioIVA = precioFinal * 1.21
          const promoStr = p.promo && mostrarPromo ? `<span style="background:#DCFCE7;color:#15803D;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:6px">${p.promo}</span>` : ''
          tablaRows += `<tr>
            ${mostrarCodigo ? `<td style="color:#78716C;font-size:11px;font-family:monospace">${p.codigo || '—'}</td>` : ''}
            <td>${p.nombre}${promoStr}</td>
            <td style="text-align:center;color:#78716C;font-size:12px">${p.unidad || ''}</td>
            <td style="text-align:right;font-weight:600">
              ${descPct > 0 ? `<span style="text-decoration:line-through;color:#A8A29E;font-size:11px;font-weight:400">$${(ivaOpcion === 'coniva' ? precioBase * 1.21 : precioBase).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</span><br>` : ''}
              ${ivaOpcion === 'ambos'
                ? `$${precioFinal.toLocaleString('es-AR', { maximumFractionDigits: 2 })} <span style="color:#1D4ED8;font-size:11px">($${precioIVA.toLocaleString('es-AR', { maximumFractionDigits: 2 })})</span>`
                : ivaOpcion === 'coniva'
                  ? `$${precioIVA.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
                  : `$${precioFinal.toLocaleString('es-AR', { maximumFractionDigits: 2 })}`
              }
            </td>
          </tr>`
        })
      })

      const tituloLista = tipo === 'distribuidor' ? 'Lista de Precios Distribuidor'
        : tipo === 'mayorista' ? 'Lista de Precios Mayorista'
        : `Lista de Precios — ${clienteSeleccionado?.nombre_fantasia || clienteSeleccionado?.nombre || ''}`

      const subtitulo = tipo === 'cliente' && descPct > 0
        ? `<p style="color:#15803D;font-size:13px;font-weight:600;margin:4px 0 0">Descuento aplicado: ${descPct}% sobre precio de lista</p>` : ''

      const ivaLabel = ivaOpcion === 'siniva' ? 'Precios sin IVA'
        : ivaOpcion === 'coniva' ? 'Precios con IVA 21%'
        : 'Precios sin IVA y con IVA 21%'

      const html = `<div class="comp-wrap">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:8px">
          <div>
            <h2 style="font-size:28px;font-weight:700;color:#1C1917;margin:0 0 4px">${EMPRESA.razon}</h2>
            <p style="font-size:13px;color:#78716C;margin:0">Descubrí el sabor del maná</p>
          </div>
          <img src="${EMPRESA.logoUrl}" style="height:64px;object-fit:contain" alt="Hojuelas" onerror="this.style.display='none'">
        </div>
        <div style="border-top:3px solid #DC2626;margin-bottom:16px"></div>
        <div style="text-align:center;margin:16px 0">
          <h3 style="font-size:18px;font-weight:700;margin:0">${tituloLista}</h3>
          <p style="font-size:13px;color:#78716C;margin:4px 0 0">Vigencia: ${vigencia}</p>
          <p style="font-size:12px;color:#78716C;margin:2px 0 0">${ivaLabel}</p>
          ${subtitulo}
          ${tipo === 'cliente' && clienteSeleccionado ? `<p style="font-size:12px;color:#78716C;margin-top:4px">Tipo: ${clienteSeleccionado.tipo || 'Minorista'}</p>` : ''}
        </div>
        <table class="comp-table">
          <thead><tr>
            ${mostrarCodigo ? '<th>Cód.</th>' : ''}
            <th>Producto</th><th style="text-align:center">Unidad</th><th style="text-align:right">Precio</th>
          </tr></thead>
          <tbody>${tablaRows}</tbody>
        </table>
        <div style="margin-top:16px;font-size:11px;color:#78716C;text-align:center">
          ${EMPRESA.razon} · Lista generada el ${new Date().toLocaleDateString('es-AR')}
        </div>
      </div>`

      setPreview({ html, titulo: tituloLista, tipo, prods: prods.length })
      setNombreLista(tituloLista + ' — ' + vigencia)
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setGenerando(false) }
  }

  function imprimirLista() {
    if (!preview) return
    const isMobile = window.innerWidth < 768
    if (isMobile) {
      const css = document.createElement('style'); css.id = 'printOverlayCss'
      css.textContent = `@media print{#printOverlayBar{display:none!important;} #printOverlay{position:static!important;} body>*:not(#printOverlay){display:none!important;} *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}}`
      document.head.appendChild(css)
      const overlay = document.createElement('div'); overlay.id = 'printOverlay'
      overlay.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;overflow-y:auto;'
      overlay.innerHTML = `<div id="printOverlayBar" style="display:flex;gap:12px;padding:12px 16px;background:#f8f7f4;border-bottom:2px solid #D4860A;position:sticky;top:0">
        <button onclick="window.print()" style="background:#D4860A;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600;flex:1">🖨 Imprimir / Guardar PDF</button>
        <button onclick="document.getElementById('printOverlay').remove();document.getElementById('printOverlayCss').remove();" style="background:#78716C;color:white;border:none;padding:10px 16px;border-radius:8px;font-size:15px;cursor:pointer">✕</button>
      </div><style>${COMP_CSS}</style>${preview.html}`
      document.body.appendChild(overlay)
    } else {
      const win = window.open('', '_blank')
      if (!win) { toast('Permitir ventanas emergentes', 'error'); return }
      win.document.write(`<!DOCTYPE html><html><head><title>${preview.titulo}</title><style>${COMP_CSS}</style></head><body>${preview.html}</body></html>`)
      win.document.close(); win.focus()
      setTimeout(() => { win.print(); win.close() }, 500)
    }
  }

  function compartirWhatsApp() {
    if (!preview) return
    toast('Para compartir por WhatsApp primero guardá la lista en el repositorio', 'info')
  }

  async function guardarEnRepo() {
    if (!preview) return
    if (!nombreLista.trim()) { toast('Ingresá un nombre para la lista', 'error'); return }
    setGuardando(true)
    try {
      await supabase.from('listas_precios_repo').insert({
        nombre: nombreLista.trim(),
        tipo: preview.tipo,
        html: preview.html
      })
      toast('Lista guardada en el repositorio ✓')
      loadListas()
    } catch (e) { toast('Error: ' + e.message, 'error') } finally { setGuardando(false) }
  }

  async function deleteListaRepo(id) {
    if (!confirm('¿Eliminar esta lista del repositorio?')) return
    try {
      await supabase.from('listas_precios_repo').delete().eq('id', id)
      toast('Lista eliminada')
      loadListas()
    } catch (e) { toast('Error al eliminar', 'error') }
  }

  const tipoBadge = { distribuidor: 'badge-yellow', mayorista: 'badge-blue', cliente: 'badge-green' }
  const tipoLabel = { distribuidor: 'Distribuidor', mayorista: 'Mayorista', cliente: 'Cliente' }
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/lista.html' : ''

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Listas de Precios Vigentes</h1>
      </div>

      {/* Config */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Generar nueva lista</div>
        <div className="form-row">
          <div className="form-group">
            <label>Tipo de lista</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)}>
              <option value="distribuidor">Distribuidor</option>
              <option value="mayorista">Mayorista</option>
              <option value="cliente">Cliente específico</option>
            </select>
          </div>
          {tipo === 'cliente' && (
            <div className="form-group">
              <label>Cliente *</label>
              <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
                <option value="">Seleccioná un cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Familia</label>
            <select value={familia} onChange={e => setFamilia(e.target.value)}>
              <option value="">Todas las familias</option>
              {familias.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div className="form-group">
            <label>IVA</label>
            <select value={ivaOpcion} onChange={e => setIvaOpcion(e.target.value)}>
              <option value="siniva">Sin IVA</option>
              <option value="coniva">Con IVA 21%</option>
              <option value="ambos">Ambos</option>
            </select>
          </div>
        </div>
        <div className="form-row">
          <div className="form-group">
            <label>Vigencia</label>
            <input value={vigencia} onChange={e => setVigencia(e.target.value)} placeholder="Ej: Junio 2026" />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 16, marginBottom: 12, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
            <input type="checkbox" checked={mostrarPromo} onChange={e => setMostrarPromo(e.target.checked)} />Mostrar promos
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
            <input type="checkbox" checked={mostrarCodigo} onChange={e => setMostrarCodigo(e.target.checked)} />Mostrar código
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 'normal' }}>
            <input type="checkbox" checked={soloConStock} onChange={e => setSoloConStock(e.target.checked)} />Solo con stock
          </label>
        </div>
        <button className="btn btn-primary" onClick={generarLista} disabled={generando}>{generando ? 'Generando...' : '👁 Generar vista previa'}</button>
      </div>

      {/* Vista previa */}
      {preview && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
            <div>
              <strong>{preview.titulo}</strong>
              <span style={{ fontSize: 12, color: 'var(--muted)', marginLeft: 8 }}>{preview.prods} productos</span>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn btn-primary btn-sm" onClick={imprimirLista}>🖨 Imprimir</button>
              {isAdmin && <button className="btn btn-secondary btn-sm" onClick={compartirWhatsApp}>💬 WhatsApp</button>}
            </div>
          </div>
          {isAdmin && (
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8, alignItems: 'center' }}>
              <input value={nombreLista} onChange={e => setNombreLista(e.target.value)} placeholder="Nombre para guardar..." style={{ flex: 1 }} />
              <button className="btn btn-secondary btn-sm" onClick={guardarEnRepo} disabled={guardando}>{guardando ? 'Guardando...' : '💾 Guardar en repositorio'}</button>
            </div>
          )}
          <div style={{ padding: 0, overflow: 'auto', maxHeight: 500 }}>
            <style>{COMP_CSS}</style>
            <div dangerouslySetInnerHTML={{ __html: preview.html }} />
          </div>
        </div>
      )}

      {/* Repositorio */}
      <div className="card">
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13 }}>Listas de Precios Vigentes</div>
        <div style={{ padding: 16 }}>
          {loadingListas ? (
            <div style={{ color: 'var(--muted)', fontSize: 13 }}>Cargando...</div>
          ) : listas.length === 0 ? (
            <p style={{ color: 'var(--muted)', fontSize: 13 }}>No hay listas guardadas todavía. Generá una y guardala en el repositorio.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {listas.map(l => {
                const fecha = new Date(l.created_at).toLocaleDateString('es-AR')
                const url = `${baseUrl}?id=${l.id}`
                const waMsg = encodeURIComponent(`Lista de Precios Hojuelas — ${l.nombre}\n${url}`)
                return (
                  <div key={l.id} style={{ padding: 12, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{l.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                      <span className={`badge ${tipoBadge[l.tipo] || 'badge-gray'}`}>{tipoLabel[l.tipo] || l.tipo}</span>
                      {' · '}Guardada el {fecha}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>👁 Ver</a>
                      <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ flex: 1, textAlign: 'center', background: '#25D366', color: '#fff', textDecoration: 'none' }}>💬 WhatsApp</a>
                      {isAdmin && <button className="btn btn-sm btn-danger" style={{ flex: 1 }} onClick={() => deleteListaRepo(l.id)}>🗑 Borrar</button>}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  )
}
