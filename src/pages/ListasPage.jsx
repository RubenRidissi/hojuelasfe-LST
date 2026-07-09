import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { nombreCliente } from '../utils/helpers'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const EMPRESA = {
  razon: 'Hojuelas con Miel',
  lema: 'Descubrí el sabor del maná',
  web: 'https://hojuelassrl.com/',
  logoUrl: '/branding/logo-principal.png',
  logoEmblemaUrl: '/branding/logo-espigas.png',
  representante: 'LST Distribuidora',
  responsable: 'Esteban Gaitán',
  telefono: '342 630-0603'
}
const COMP_CSS = `body{font-family:Arial,sans-serif;color:#1C1917;margin:0;padding:0}.comp-wrap{padding:20px}.comp-table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}.comp-table th{background:#D4860A;color:white;padding:7px 8px;text-align:left;font-size:12px}.comp-table td{padding:7px 8px;border-bottom:1px solid #E8E2D8}.comp-table tbody tr:nth-child(even){background:#FFFDF8}@media print{*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}}`

export default function ListasPage() {
  const { isAdmin, puedeVerMontos } = useAuth()
  const { toasts, toast } = useToast()

  const [productos, setProductos] = useState([])
  const [clientes, setClientes] = useState([])
  const [listas, setListas] = useState([])
  const [loadingListas, setLoadingListas] = useState(true)

  // Config lista
  const [tipo, setTipo] = useState('Distribuidor')
  const [clienteId, setClienteId] = useState('')
  const [familiasSel, setFamiliasSel] = useState([])
  const [ivaOpcion, setIvaOpcion] = useState('siniva')
  const [mostrarPromo, setMostrarPromo] = useState(true)
  const [mostrarCodigo, setMostrarCodigo] = useState(true)
  const [soloConStock, setSoloConStock] = useState(false)
  const [vigencia, setVigencia] = useState(new Date().toLocaleDateString('es-AR'))
  const [nombreLista, setNombreLista] = useState('')
  const [tituloEditable, setTituloEditable] = useState('')

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
    try {
      const { data, error } = await supabase
        .from('listas_precios_repo')
        .select('id,nombre,tipo,html,created_at')
        .order('created_at', { ascending: false })

      if (error) throw error

      setListas(data || [])
    } catch (e) {
      console.error('Error cargando listas:', e)
      toast('Error al cargar listas: ' + e.message, 'error')
    } finally {
      setLoadingListas(false)
    }
  }

  const familias = useMemo(() => [...new Set(productos.map(p => p.familia).filter(Boolean))].sort(), [productos])
  const clienteSeleccionado = useMemo(() => clientes.find(c => c.id === clienteId), [clientes, clienteId])
  const subtituloSugerido = useMemo(() => {
    if (tipo === 'cliente') return clienteSeleccionado?.tipo || 'Cliente específico'
    return tipo
  }, [tipo, clienteSeleccionado])

  function normalizarTipoLista(valor) {
    const limpio = String(valor || '').trim()
    const map = {
      Representante: 'representante',
      Distribuidor: 'distribuidor',
      Mayorista: 'mayorista',
      Supermercado: 'supermercado',
      'Almacén': 'almacen',
      Almacen: 'almacen',
      Minorista: 'almacen',
      cliente: 'cliente',
      Cliente: 'cliente',
    }

    return map[limpio] || limpio
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
  }

  async function generarLista() {
    if (tipo === 'cliente' && !clienteId) { toast('Seleccioná un cliente', 'error'); return }
    setGenerando(true)
    try {
      let prods = productos.filter(p => p.activo !== false)
      if (familiasSel.length) prods = prods.filter(p => familiasSel.includes(p.familia))

      if (soloConStock) {
        const { data: stockData } = await supabase.from('stock_actual').select('id,stock')
        const stockMap = {}
        ;(stockData || []).forEach(s => { stockMap[s.id] = parseFloat(s.stock || 0) })
        prods = prods.filter(p => (stockMap[p.id] || 0) > 0)
      }

      const PRECIO_POR_TIPO = {
        'Representante': 'precio_representante',
        'Distribuidor':  'precio_distribuidor',
        'Mayorista':     'precio_mayorista',
        'Supermercado':  'precio_supermercado',
        'Minorista':     'precio_almacen',
      }
      const tipoEfectivo = tipo === 'cliente' ? (clienteSeleccionado?.tipo || 'Distribuidor') : tipo
      const colPrecio = PRECIO_POR_TIPO[tipoEfectivo] || 'precio_distribuidor'

      const descPct = tipo === 'cliente'
        ? parseFloat(clienteSeleccionado?.descuento_pct || 0)
        : 0

      // Distribuidor/Mayorista compran por bandeja cerrada: no aplica la promo de volumen (10+1),
      // en su lugar se informa el descuento por bandeja de los productos que lo tengan configurado.
      const esListaBandeja = tipoEfectivo === 'Distribuidor' || tipoEfectivo === 'Mayorista'
      let huboBandeja = false

      const grupos = {}
      prods.forEach(p => {
        const fam = p.familia || 'Otros'
        if (!grupos[fam]) grupos[fam] = []
        grupos[fam].push(p)
      })

      const colSpan = mostrarCodigo ? 4 : 3
      let tablaRows = ''
      const preciosSnapshot = {}
      Object.entries(grupos).forEach(([fam, ps]) => {
        tablaRows += `<tr><td colspan="${colSpan}" style="background:#FEF3DC;font-weight:700;font-size:13px;color:#9A5F00;padding:8px 10px">${fam}</td></tr>`
        ps.forEach(p => {
          const precioBase = parseFloat(p[colPrecio] || 0)
          preciosSnapshot[p.id] = precioBase
          const precioFinal = descPct > 0 ? precioBase * (1 - descPct / 100) : precioBase
          const precioIVA = precioFinal * 1.21
          const promoStr = p.promo && mostrarPromo && !esListaBandeja ? `<span style="background:#DCFCE7;color:#15803D;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:6px">${p.promo}</span>` : ''

          const tienePqxbj = esListaBandeja && parseInt(p.pqxbj || 0) > 0
          const descBandejaPct = tienePqxbj ? parseFloat(p.descuento_bandeja || 0) : 0
          const tieneBandeja = tienePqxbj && descBandejaPct > 0
          if (tieneBandeja) huboBandeja = true

          const pqxbjStr = tienePqxbj ? `<span style="color:#78716C;font-size:11px;margin-left:6px">(${p.pqxbj} u./bandeja)</span>` : ''
          const bandejaStr = tieneBandeja ? `<span style="background:#DBEAFE;color:#1D4ED8;font-size:10px;padding:2px 6px;border-radius:10px;margin-left:6px">Bandeja -${p.descuento_bandeja}%</span>` : ''

          const precioFinalMostrar = tieneBandeja ? precioFinal * (1 - descBandejaPct / 100) : precioFinal
          const precioIVAMostrar = precioFinalMostrar * 1.21
          const hayTachado = descPct > 0 || tieneBandeja

          tablaRows += `<tr>
            ${mostrarCodigo ? `<td style="color:#78716C;font-size:11px;font-family:monospace;text-align:center">${p.codigo || '—'}</td>` : ''}
            <td style="font-weight:600;color:#292524">${p.nombre}${promoStr}${pqxbjStr}${bandejaStr}</td>
            <td style="text-align:center;color:#78716C;font-size:12px">${p.unidad || ''}</td>
            <td style="text-align:right;font-weight:700;color:#9A5F00">
              ${hayTachado ? `<span style="text-decoration:line-through;color:#A8A29E;font-size:11px;font-weight:400">$${(ivaOpcion === 'coniva' ? precioBase * 1.21 : precioBase).toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span><br>` : ''}
              ${ivaOpcion === 'ambos'
                ? `$${precioFinalMostrar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span style="color:#1D4ED8;font-size:11px">($${precioIVAMostrar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span>`
                : ivaOpcion === 'coniva'
                  ? `$${precioIVAMostrar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `$${precioFinalMostrar.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              }
            </td>
          </tr>`
        })
      })

      const tituloLista = tipo === 'cliente'
        ? `Lista de Precios — ${clienteSeleccionado?.nombre_fantasia || clienteSeleccionado?.nombre || ''}`
        : `Lista de Precios ${tipo}`

      const subtitulo = ''

      const ivaLabel = ivaOpcion === 'siniva' ? 'Precios sin IVA'
        : ivaOpcion === 'coniva' ? 'Precios con IVA 21%'
        : 'Precios sin IVA y con IVA 21%'

      const promocionTexto = mostrarPromo && !esListaBandeja
        ? 'Los productos identificados con etiqueta verde corresponden a promociones de volumen. Aplican al período de lanzamiento en Zona Santa Fe y están sujetas a modificación.'
        : ''

      const bandejaTexto = esListaBandeja && huboBandeja
        ? 'Los productos identificados con etiqueta azul tienen un descuento adicional al comprar por bandeja cerrada.'
        : ''

      const precioLabelCondiciones = ivaOpcion === 'siniva'
        ? 'Los valores se encuentran expresados en pesos argentinos, sin IVA incluido.'
        : ivaOpcion === 'coniva'
          ? 'Los valores se encuentran expresados en pesos argentinos, con IVA 21% incluido.'
          : 'Los valores se encuentran expresados en pesos argentinos, con referencia sin IVA y con IVA 21%.'

      const subtituloLista = (tituloEditable || '').trim() || subtituloSugerido

      const clienteLinea = tipo === 'cliente' && clienteSeleccionado
        ? `<p style="font-size:13px;color:#57534E;margin:6px 0 0"><strong>Cliente:</strong> ${nombreCliente(clienteSeleccionado)}</p>`
        : ''

      const html = `<div class="comp-wrap">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:24px;padding:4px 6px 12px;border-bottom:3px solid #DC2626">
          <div style="display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-start">
            <img src="${EMPRESA.logoUrl}" style="height:104px;object-fit:contain;display:block" alt="Hojuelas con Miel" onerror="this.style.display='none'">
            <div style="font-size:13px;color:#57534E;line-height:1.1;margin-top:-5px;padding-left:0">
              ${EMPRESA.lema}
            </div>
          </div>

          <div style="display:flex;flex-direction:column;align-items:flex-end;justify-content:flex-start;padding-top:8px">
            <img src="${EMPRESA.logoEmblemaUrl}" style="height:62px;object-fit:contain;display:block;margin-bottom:4px" alt="Hojuelas" onerror="this.style.display='none'">
            <div style="font-size:12px;color:#57534E;line-height:1.1">
              ${EMPRESA.web}
            </div>
          </div>
        </div>

        <div style="text-align:center;margin:18px 0 16px">
          <h3 style="font-size:20px;font-weight:800;margin:0;color:#1C1917;text-transform:uppercase">LISTA DE PRECIOS</h3>
          <p style="font-size:16px;color:#57534E;margin:4px 0 0;font-weight:600">${subtituloLista}</p>
          <p style="font-size:13px;color:#57534E;margin:8px 0 0"><strong>Vigencia:</strong> ${vigencia}</p>
          ${clienteLinea}
        </div>

        <table class="comp-table">
          <thead><tr>
            ${mostrarCodigo ? '<th style="text-align:center">Cód.</th>' : ''}
            <th>Producto</th><th style="text-align:center">Unidad</th><th style="text-align:right">Precio</th>
          </tr></thead>
          <tbody>${tablaRows}</tbody>
        </table>

        ${promocionTexto ? `
          <div style="margin-top:14px;background:#FEF3C7;color:#92400E;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.45;border-left:4px solid #D4860A">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-weight:700">PROMOCIONES VIGENTES</span>
              <span style="background:#DCFCE7;color:#15803D;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:700">10+1</span>
            </div>
            <div>${promocionTexto}</div>
          </div>
        ` : ''}

        ${bandejaTexto ? `
          <div style="margin-top:14px;background:#EFF6FF;color:#1D4ED8;border-radius:8px;padding:10px 12px;font-size:12px;line-height:1.45;border-left:4px solid #1D4ED8">
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
              <span style="font-weight:700">DESCUENTO POR BANDEJA</span>
              <span style="background:#DBEAFE;color:#1D4ED8;font-size:10px;padding:2px 7px;border-radius:10px;font-weight:700">Bandeja cerrada</span>
            </div>
            <div>${bandejaTexto}</div>
          </div>
        ` : ''}

        <div style="margin-top:18px;border-top:1px solid #E8E2D8;padding-top:14px">
          <h4 style="font-size:14px;margin:0 0 10px;color:#1C1917;letter-spacing:.04em">CONDICIONES COMERCIALES</h4>

          <div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px 18px;font-size:12px;color:#44403C;line-height:1.45">
            <div>
              <div style="font-weight:700;color:#1C1917;margin-bottom:2px">Precios</div>
              <div>${precioLabelCondiciones}</div>
            </div>

            <div>
              <div style="font-weight:700;color:#1C1917;margin-bottom:2px">Forma de pago</div>
              <div>Efectivo.</div>
            </div>

            <div>
              <div style="font-weight:700;color:#1C1917;margin-bottom:2px">Plazo de pago</div>
              <div>Contado.</div>
            </div>

            <div>
              <div style="font-weight:700;color:#1C1917;margin-bottom:2px">Entrega</div>
              <div>Consultar alcance y cronograma de reparto para su zona.</div>
            </div>
          </div>
        </div>

        <div style="margin-top:16px;border-top:1px solid #E8E2D8;padding-top:14px">
          <h4 style="font-size:14px;margin:0 0 8px;color:#1C1917;letter-spacing:.04em">REPRESENTANTE COMERCIAL ZONA SANTA FE</h4>
          <div style="font-size:12px;color:#44403C;line-height:1.5">
            <div style="font-weight:700;color:#1C1917">${EMPRESA.representante}</div>
            <div>${EMPRESA.responsable} — Responsable Comercial</div>
            <div>Cel.: ${EMPRESA.telefono}</div>
          </div>
        </div>

        <div style="margin-top:16px;border-top:1px solid #E8E2D8;padding-top:10px;font-size:11px;color:#78716C;display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <span>${EMPRESA.web}</span>
          <span>Generado el ${new Date().toLocaleDateString('es-AR')} · ${EMPRESA.representante}</span>
        </div>
      </div>`

      setPreview({ html, titulo: `Lista de Precios ${subtituloLista}`, tipo, prods: prods.length, precios: preciosSnapshot })
      setNombreLista(`Lista de Precios ${subtituloLista} — ${vigencia}`)
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
      const tipoRepo = normalizarTipoLista(preview.tipo)
      console.log('TIPO ORIGINAL:', preview.tipo)
      console.log('TIPO NORMALIZADO:', tipoRepo)

      const { data, error } = await supabase
        .from('listas_precios_repo')
        .insert({
          nombre: nombreLista.trim(),
          tipo: tipoRepo,
          html: preview.html,
          precios: preview.precios || {}
        })
        .select('id,nombre,tipo,html,created_at')

      if (error) throw error

      if (!data?.length) {
        throw new Error('Supabase no devolvió la lista guardada.')
      }

      toast('Lista guardada en el repositorio ✓')
      await loadListas()
    } catch (e) {
      console.error('Error guardando lista:', e)
      toast('Error al guardar lista: ' + e.message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  async function deleteListaRepo(id) {
    if (!confirm('¿Eliminar esta lista del repositorio?')) return
    try {
      await supabase.from('listas_precios_repo').delete().eq('id', id)
      toast('Lista eliminada')
      loadListas()
    } catch (e) { toast('Error al eliminar', 'error') }
  }

  const tipoBadge = { representante: 'badge-gray', distribuidor: 'badge-yellow', mayorista: 'badge-blue', supermercado: 'badge-green', almacen: 'badge-blue', cliente: 'badge-green' }
  const tipoLabel = { representante: 'Representante', distribuidor: 'Distribuidor', mayorista: 'Mayorista', supermercado: 'Supermercado', almacen: 'Minorista', cliente: 'Cliente específico' }
  const baseUrl = typeof window !== 'undefined' ? window.location.origin + '/lista.html' : ''

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Listas de Precios Vigentes</h1>
      </div>
      {isAdmin && <>


      {/* Config */}
      <div className="card" style={{ padding: 16, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12 }}>Generar nueva lista</div>
        <div className="form-row">
          <div className="form-group">
            <label>Tipo de lista</label>
            <select value={tipo} onChange={e => { setTipo(e.target.value); setTituloEditable('') }}>
              <option value="Representante">Representante</option>
              <option value="Distribuidor">Distribuidor</option>
              <option value="Mayorista">Mayorista</option>
              <option value="Supermercado">Supermercado</option>
              <option value="Minorista">Minorista</option>
              <option value="cliente">Cliente específico</option>
            </select>
          </div>
          {tipo === 'cliente' && (
            <div className="form-group">
              <label>Cliente *</label>
              <select value={clienteId} onChange={e => { setClienteId(e.target.value); setTituloEditable('') }}>
                <option value="">Seleccioná un cliente</option>
                {clientes.map(c => <option key={c.id} value={c.id}>{nombreCliente(c)}</option>)}
              </select>
            </div>
          )}
          <div className="form-group">
            <label>Familia</label>
            <select
              multiple
              size={Math.min(Math.max(familias.length, 1), 5)}
              value={familiasSel}
              onChange={e => setFamiliasSel(Array.from(e.target.selectedOptions, o => o.value))}
              style={{ width: '100%' }}
            >
              {familias.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
            <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--muted)' }}>
              {familiasSel.length === 0 ? 'Sin selección: todas las familias. Ctrl/Cmd + click para elegir una o varias.' : `${familiasSel.length} familia(s) seleccionada(s).`}
            </p>
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
                <div className="form-group" style={{ flex: 2 }}>
                  <label>Texto debajo de LISTA DE PRECIOS</label>
                  <input value={tituloEditable} onChange={e => setTituloEditable(e.target.value)} placeholder={`Ej: ${subtituloSugerido}`} />
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
        {isAdmin && <button className="btn btn-primary" onClick={generarLista} disabled={generando}>{generando ? 'Generando...' : '👁 Generar vista previa'}</button>}
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

      </>}

      {!isAdmin && (
        <div className="card" style={{ padding: 14, marginBottom: 16, fontSize: 13, color: 'var(--muted)' }}>
          {puedeVerMontos ? 'Solo podés consultar listas generadas por administración.' : 'Tu perfil no tiene acceso a las listas de precios.'}
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
                const tipoListaRepo = normalizarTipoLista(l.tipo)
                const url = `${baseUrl}?id=${l.id}`
                const waMsg = encodeURIComponent(`Lista de Precios Hojuelas — ${l.nombre}\n${url}`)
                return (
                  <div key={l.id} style={{ padding: 12, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
                    <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{l.nombre}</div>
                    <div style={{ fontSize: 12, color: 'var(--muted)', marginBottom: 10 }}>
                      <span className={`badge ${tipoBadge[tipoListaRepo] || 'badge-gray'}`}>{tipoLabel[tipoListaRepo] || l.tipo}</span>
                      {' · '}Guardada el {fecha}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {puedeVerMontos && <a href={url} target="_blank" rel="noreferrer" className="btn btn-sm btn-secondary" style={{ flex: 1, textAlign: 'center', textDecoration: 'none' }}>👁 Ver</a>}
                      {puedeVerMontos && <a href={`https://wa.me/?text=${waMsg}`} target="_blank" rel="noreferrer" className="btn btn-sm" style={{ flex: 1, textAlign: 'center', background: '#25D366', color: '#fff', textDecoration: 'none' }}>💬 WhatsApp</a>}
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
