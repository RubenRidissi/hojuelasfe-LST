import { useState } from 'react'
import { supabase } from '../services/supabase'
import { nombreCliente } from '../utils/helpers'

const EMPRESA = {
  nombre: 'LST Distribuidora',
  razon: 'Hojuelas con Miel',
  rep: 'Esteban Gaitán',
  tel: '342 630-0603',
  web: 'hojuelassrl.com'
}

const LOGO_URL = 'https://raw.githubusercontent.com/RubenRidissi/hojuelasfe/main/Distrilst/icon-192.png'

const COMP_CSS = `
*{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;box-sizing:border-box;}
html,body{margin:0;padding:0;background:white;height:auto;}
body{font-family:Arial,sans-serif;color:#1C1917;font-size:14px;}
.comp-wrap{width:100%;padding:20px;}
.comp-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #D4860A;}
.comp-logo{height:56px;object-fit:contain;}
.comp-empresa{text-align:right;}
.comp-empresa h2{font-size:16px;font-weight:700;color:#9A5F00;margin:0 0 4px;}
.comp-empresa p{font-size:12px;color:#78716C;margin:2px 0;}
.comp-tipo{text-align:center;margin:16px 0;}
.comp-tipo h3{font-size:18px;font-weight:700;color:#1C1917;margin:0;letter-spacing:.05em;text-transform:uppercase;}
.comp-tipo .comp-num{font-size:13px;color:#78716C;margin:4px 0 0;}
.comp-datos{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:16px 0;padding:12px;background:#FAF8F4!important;border-radius:8px;font-size:12px;}
.comp-datos div span{color:#78716C;}
.comp-datos div strong{display:block;margin-top:2px;}
.comp-table{width:100%;border-collapse:collapse;margin:16px 0;font-size:12px;}
.comp-table th{background:#D4860A!important;color:white!important;padding:7px 8px;text-align:left;font-size:11px;}
.comp-table td{padding:7px 8px;border-bottom:1px solid #E8E2D8;}
.comp-table tr:last-child td{border-bottom:none;}
.comp-table tfoot td{font-weight:700;background:#FEF3DC!important;border-top:2px solid #D4860A;}
.comp-footer{margin-top:20px;padding-top:12px;border-top:1px solid #E8E2D8;display:flex;justify-content:space-between;font-size:11px;color:#78716C;}
.comp-firma{margin-top:40px;text-align:center;}
.comp-badge{display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;}
.comp-badge.remito{background:#DBEAFE;color:#1D4ED8;}
.comp-badge.venta{background:#DCFCE7;color:#15803D;}
.comp-badge.pedido{background:#FEF9C3;color:#92400E;}
@media print{.no-print{display:none!important;}}
`

// ===== BUILD HELPERS =====

function buildHeader(tipo, num, fecha) {
  const tipoBadgeClass = tipo === 'REMITO' ? 'remito' : tipo === 'PEDIDO' ? 'pedido' : 'venta'
  const tipoLabel = {
    REMITO: 'Remito de Entrega',
    PEDIDO: 'Comprobante de Pedido',
    VENTA: 'Comprobante de Venta',
    'PEDIDO PROV.': 'Pedido a Proveedor',
    RECEPCION: 'Recepción de Mercadería'
  }[tipo] || tipo
  const fechaStr = new Date(fecha + 'T00:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return `<div class="comp-wrap">
    <div class="comp-header">
      <img src="${LOGO_URL}" class="comp-logo" alt="Hojuelas" onerror="this.style.display='none'">
      <div class="comp-empresa">
        <h2>${EMPRESA.nombre}</h2>
        <p>${EMPRESA.razon}</p>
        <p>${EMPRESA.rep} · ${EMPRESA.tel}</p>
        <p>${EMPRESA.web}</p>
      </div>
    </div>
    <div class="comp-tipo">
      <span class="comp-badge ${tipoBadgeClass}">${tipo}</span>
      <h3 style="margin-top:8px">${tipoLabel}</h3>
      <p class="comp-num">N° ${String(num).padStart(6, '0')} · Fecha: ${fechaStr}</p>
    </div>`
}

function buildDomicilioCliente(cliente) {
  const direccion = cliente?.direccion || '—'
  const localidad = cliente?.localidad || ''
  const provincia = cliente?.provincia || ''
  const zona = [localidad, provincia].filter(Boolean).join(', ')
  return zona ? `${direccion}<br><span style="font-weight:400;color:#78716C">${zona}</span>` : direccion
}

function buildClienteInfo(cliente, l1, v1, l2, v2) {
  return `<div class="comp-datos">
    <div><span>Cliente</span><strong>${cliente ? nombreCliente(cliente) : '—'}</strong></div>
    <div><span>Dirección</span><strong>${buildDomicilioCliente(cliente)}</strong></div>
    <div><span>Teléfono</span><strong>${cliente?.telefono || '—'}</strong></div>
    <div><span>${l1}</span><strong>${v1}</strong></div>
    <div><span>${l2}</span><strong>${v2}</strong></div>
  </div>`
}

function buildFooter(notas) {
  return `<div class="comp-footer">
    <div>${notas ? `<strong>Notas:</strong> ${notas}` : ''}</div>
    <div>Generado el ${new Date().toLocaleDateString('es-AR')} · ${EMPRESA.nombre}</div>
  </div>
  <div class="comp-firma"></div></div>`
}

function buildComprobantePedido(p, num) {
  const items = p.pedido_items || []
  const descMatch = (p.notas || '').match(/Descuento aplicado: ([\d.]+)/)
  const descPct = descMatch ? parseFloat(descMatch[1]) : 0
  const fechaProgramada = p.fecha_entrega ? new Date(p.fecha_entrega + 'T00:00:00').toLocaleDateString('es-AR') : 'A confirmar'

  let html = buildHeader('PEDIDO', num || 0, p.fecha || new Date().toISOString().split('T')[0])
  html += buildClienteInfo(p.clientes, 'Fecha de entrega', fechaProgramada, 'Estado', (p.estado || '').charAt(0).toUpperCase() + (p.estado || '').slice(1))
  html += `<table class="comp-table"><thead><tr><th>Código</th><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>`

  items.forEach(item => {
    const bonifTxt = item.bonificado > 0 ? ` <span style="color:#15803D;font-size:11px">+${item.bonificado} 🎁</span>` : ''
    const muestraTxt = item.precio_unitario === 0 ? ' <span style="background:#DCFCE7;color:#15803D;font-size:10px;padding:1px 5px;border-radius:8px">🎁 muestra</span>' : ''
    html += `<tr>
      <td style="color:#78716C;font-size:12px">${item.productos?.codigo || '—'}</td>
      <td>${item.productos?.nombre || '—'}</td>
      <td style="text-align:center">${item.cantidad}${bonifTxt}${muestraTxt} ${item.productos?.unidad || ''}</td>
      <td style="text-align:right">$${parseFloat(item.precio_unitario).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
      <td style="text-align:right">$${(item.cantidad * item.precio_unitario).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
    </tr>`
  })

  const hasBonif = (p.notas || '').includes('bonificadas por promo')
  const hasMuestra = (p.notas || '').includes('muestras sin cargo')
  if (hasBonif || hasMuestra) {
    const partes = [hasBonif ? 'promo de volumen' : '', hasMuestra ? 'muestras sin cargo' : ''].filter(Boolean).join(' y ')
    html += `<tr style="background:#F0FDF4"><td colspan="5" style="font-size:12px;color:#15803D;padding:6px 10px">🎁 Este pedido incluye unidades bonificadas por ${partes}.</td></tr>`
  }

  html += `</tbody><tfoot><tr><td colspan="4" style="text-align:right">TOTAL</td><td style="text-align:right">$${parseFloat(p.total).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td></tr></tfoot></table>`

  const notaLimpia = (p.notas || '').split('|').map(s => s.trim()).filter(s => s && !s.includes('Descuento aplicado') && !s.includes('bonificadas') && !s.includes('muestras')).join(' | ')
  html += buildFooter(notaLimpia)
  return html
}

function buildComprobanteVenta(v, num) {
  const items = v.venta_items || []
  const descMatch = (v.notas || '').match(/Descuento aplicado: ([\d.]+)/)
  const descPct = descMatch ? parseFloat(descMatch[1]) : 0
  const fechaFacturacion = new Date(v.fecha + 'T00:00:00').toLocaleDateString('es-AR')
  const entregaTxt = v.fecha_entrega_real
    ? `<span style="color:#15803D;font-weight:600">✓ ${new Date(v.fecha_entrega_real + 'T00:00:00').toLocaleDateString('es-AR')}</span>`
    : '<span style="color:#A8A29E">Sin entregar</span>'

  let html = buildHeader('VENTA', num || 0, v.fecha)
  html += buildClienteInfo(v.clientes, 'Fecha facturación', fechaFacturacion, 'Fecha de entrega', entregaTxt)
  html += `<div class="comp-datos" style="margin-top:-8px">
    <div><span>Estado de pago</span><strong>${v.estado_pago === 'pagado' ? '✓ Pagado' : 'Pendiente'}</strong></div>
    <div><span>Descuento</span><strong>${descPct > 0 ? descPct + '%' : '—'}</strong></div>
  </div>`
  html += `<table class="comp-table"><thead><tr><th>Código</th><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:right">P. Unit.</th><th style="text-align:right">Subtotal</th></tr></thead><tbody>`

  items.forEach(item => {
    const bonifTxt = item.bonificado > 0 ? ` <span style="color:#15803D;font-size:11px">+${item.bonificado} 🎁</span>` : ''
    const muestraTxt = item.precio_unitario === 0 ? ' <span style="background:#DCFCE7;color:#15803D;font-size:10px;padding:1px 5px;border-radius:8px">🎁 muestra</span>' : ''
    html += `<tr>
      <td style="color:#78716C;font-size:12px">${item.productos?.codigo || '—'}</td>
      <td>${item.productos?.nombre || '—'}</td>
      <td style="text-align:center">${item.cantidad}${bonifTxt}${muestraTxt} ${item.productos?.unidad || ''}</td>
      <td style="text-align:right">$${parseFloat(item.precio_unitario).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
      <td style="text-align:right">$${(item.cantidad * item.precio_unitario).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td>
    </tr>`
  })

  const hasBonif = (v.notas || '').includes('bonificadas por promo')
  const hasMuestra = (v.notas || '').includes('muestras sin cargo')
  if (hasBonif || hasMuestra) {
    const partes = [hasBonif ? 'promo de volumen' : '', hasMuestra ? 'muestras sin cargo' : ''].filter(Boolean).join(' y ')
    html += `<tr style="background:#F0FDF4"><td colspan="5" style="font-size:12px;color:#15803D;padding:6px 10px">🎁 Esta venta incluye unidades bonificadas por ${partes}.</td></tr>`
  }

  html += `</tbody><tfoot><tr><td colspan="4" style="text-align:right">TOTAL</td><td style="text-align:right">$${parseFloat(v.total).toLocaleString('es-AR', { maximumFractionDigits: 2 })}</td></tr></tfoot></table>`

  const notaLimpia = (v.notas || '').split('|').map(s => s.trim()).filter(s => s && !s.includes('Descuento aplicado') && !s.includes('bonificadas') && !s.includes('muestras')).join(' | ')
  html += buildFooter(notaLimpia)
  return html
}

function buildRemitoEntrega(datos) {
  const items = datos.items || []
  let html = buildHeader('REMITO', datos.remito_numero || 0, new Date().toISOString().split('T')[0])
  const fechaProgramada = datos.fecha_entrega ? new Date(datos.fecha_entrega + 'T00:00:00').toLocaleDateString('es-AR') : 'A confirmar'
  const fechaReal = datos.fecha_entrega_real ? new Date(datos.fecha_entrega_real + 'T00:00:00').toLocaleDateString('es-AR') : null
  const fechaEntLabel = fechaReal
    ? `${fechaProgramada} <span style="color:#15803D;font-weight:600">(✓ entregado: ${fechaReal})</span>`
    : fechaProgramada

  html += buildClienteInfo(datos.clientes, 'Fecha programada', fechaEntLabel, 'Estado', datos.estado || '—')
  html += `<table class="comp-table"><thead><tr><th>Código</th><th>Producto</th><th style="text-align:center">Cant.</th><th style="text-align:center">Unidad</th><th style="text-align:center">Recibido ✓</th></tr></thead><tbody>`

  let totalBultos = 0
  items.forEach(item => {
    const cantFisica = item.cantidad + (item.bonificado || 0)
    totalBultos += cantFisica
    const bonifTxt = item.bonificado > 0 ? ` <span style="color:#15803D;font-size:11px">(incl. ${item.bonificado} bonif.)</span>` : ''
    html += `<tr>
      <td style="color:#78716C;font-size:12px">${item.productos?.codigo || '—'}</td>
      <td>${item.productos?.nombre || '—'}</td>
      <td style="text-align:center">${cantFisica}${bonifTxt}</td>
      <td style="text-align:center">${item.productos?.unidad || '—'}</td>
      <td style="text-align:center">□</td>
    </tr>`
  })

  html += `</tbody><tfoot><tr><td colspan="4" style="text-align:right">TOTAL BULTOS</td><td style="text-align:center">${totalBultos}</td></tr></tfoot></table>`
  html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:32px;margin-top:32px;font-size:12px;color:#78716C">
    <div style="text-align:center"><div style="border-top:1px solid #1C1917;padding-top:6px;margin-top:40px">Firma receptor</div></div>
    <div style="text-align:center"><div style="border-top:1px solid #1C1917;padding-top:6px;margin-top:40px">Firma transportista</div></div>
  </div>`
  html += buildFooter(datos.notas)
  return html
}

// ===== BUSCAR REMITO EXISTENTE =====
async function buscarRemitoExistente(tipo, id) {
  let origenIds = [id]
  if (tipo === 'pedido') {
    const { data: ped } = await supabase.from('pedidos').select('convertido_venta_id').eq('id', id).single()
    if (ped?.convertido_venta_id) origenIds.push(ped.convertido_venta_id)
  } else {
    const { data: peds } = await supabase.from('pedidos').select('id').eq('convertido_venta_id', id)
    if (peds?.length) origenIds.push(peds[0].id)
  }
  for (const oid of origenIds) {
    const { data } = await supabase.from('remitos').select('*').eq('origen_id', oid).limit(1)
    if (data?.length) return data[0]
  }
  return null
}

// ===== PRINT / DOWNLOAD =====
function printComprobante(html, titulo, isMobile) {
  if (isMobile) {
    // Overlay en página
    const css = document.createElement('style')
    css.id = 'printOverlayCss'
    css.textContent = `#printOverlay .comp-wrap{width:100%;padding:16px;} @media print{#printOverlayBar{display:none!important;} #printOverlay{position:static!important;} body>*:not(#printOverlay){display:none!important;} *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important;}}`
    document.head.appendChild(css)

    const overlay = document.createElement('div')
    overlay.id = 'printOverlay'
    overlay.style.cssText = 'position:fixed;inset:0;background:white;z-index:99999;overflow-y:auto;'
    overlay.innerHTML = `<div id="printOverlayBar" style="display:flex;align-items:center;gap:12px;padding:12px 16px;background:#f8f7f4;border-bottom:2px solid #D4860A;position:sticky;top:0;z-index:1;">
      <button onclick="window.print()" style="background:#D4860A;color:white;border:none;padding:10px 24px;border-radius:8px;font-size:15px;cursor:pointer;font-weight:600;flex:1">🖨 Imprimir / Guardar PDF</button>
      <button onclick="document.getElementById('printOverlay').remove();document.getElementById('printOverlayCss').remove();" style="background:#78716C;color:white;border:none;padding:10px 16px;border-radius:8px;font-size:15px;cursor:pointer">✕ Cerrar</button>
    </div>` + `<style>${COMP_CSS}</style>` + html
    document.body.appendChild(overlay)
  } else {
    const win = window.open('', '_blank')
    if (!win) { alert('Permitir ventanas emergentes para imprimir'); return }
    win.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>${COMP_CSS}</style></head><body>${html}</body></html>`)
    win.document.close()
    win.focus()
    setTimeout(() => { win.print(); win.close() }, 500)
  }
}

function descargarComprobante(html, titulo) {
  const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-')
  const nombreArchivo = `${titulo.replace(/[^a-zA-Z0-9\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_')}_${fecha}.html`
  const fullHtml = `<!DOCTYPE html><html lang="es"><head><meta charset="UTF-8"><title>${titulo}</title><style>${COMP_CSS}</style></head><body>${html}</body></html>`
  const blob = new Blob([fullHtml], { type: 'text/html' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

// ===== HOOK PRINCIPAL =====
export function useComprobante() {
  const [comp, setComp] = useState(null) // { titulo, html, filename }

  async function verComprobanteVenta(id) {
    try {
      const { data: v } = await supabase.from('ventas')
        .select('id,numero,fecha,fecha_entrega_real,total,estado_pago,notas,clientes(nombre,nombre_fantasia,direccion,localidad,provincia,telefono,tipo),venta_items(cantidad,bonificado,precio_unitario,productos(nombre,codigo,unidad))')
        .eq('id', id).single()
      if (!v) throw new Error('No se encontró la venta')
      const num = v.numero || 1
      const nomCli = (v.clientes?.nombre_fantasia || v.clientes?.nombre || 'cliente').replace(/[^a-zA-Z0-9\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_')
      setComp({ titulo: 'Comprobante de Venta', html: buildComprobanteVenta(v, num), filename: `Venta_${String(num).padStart(4, '0')}_${nomCli}` })
    } catch (e) { throw e }
  }

  async function verComprobantePedido(id) {
    try {
      const { data: p } = await supabase.from('pedidos')
        .select('id,numero,fecha,fecha_entrega,fecha_entrega_real,estado,notas,total,clientes(nombre,nombre_fantasia,direccion,localidad,provincia,telefono,tipo),pedido_items(cantidad,bonificado,precio_unitario,productos(nombre,codigo,unidad))')
        .eq('id', id).single()
      if (!p) throw new Error('No se encontró el pedido')
      const num = p.numero || 1
      const nomCli = (p.clientes?.nombre_fantasia || p.clientes?.nombre || 'cliente').replace(/[^a-zA-Z0-9\sáéíóúÁÉÍÓÚñÑ]/g, '').trim().replace(/\s+/g, '_')
      setComp({ titulo: 'Comprobante de Pedido', html: buildComprobantePedido(p, num), filename: `Pedido_${String(num).padStart(4, '0')}_${nomCli}` })
    } catch (e) { throw e }
  }

  async function verRemitoFunc(tipo, id) {
    try {
      const remito = await buscarRemitoExistente(tipo, id)
      if (!remito) throw new Error('No se encontró el remito')
      let datos
      if (tipo === 'venta') {
        const { data: v } = await supabase.from('ventas')
          .select('id,fecha,fecha_entrega_real,estado_pago,notas,clientes(nombre,nombre_fantasia,direccion,localidad,provincia,telefono,tipo),venta_items(cantidad,bonificado,precio_unitario,productos(nombre,codigo,unidad))')
          .eq('id', id).single()
        if (!v) throw new Error('No se encontró la venta')
        datos = { fecha_entrega: v.fecha, fecha_entrega_real: v.fecha_entrega_real, estado: v.estado_pago === 'pagado' ? 'Facturada y pagada' : 'Facturada', notas: v.notas, clientes: v.clientes, items: v.venta_items, remito_numero: remito.numero }
      } else {
        const { data: p } = await supabase.from('pedidos')
          .select('id,fecha_entrega,fecha_entrega_real,estado,notas,clientes(nombre,nombre_fantasia,direccion,localidad,provincia,telefono,tipo),pedido_items(cantidad,bonificado,precio_unitario,productos(nombre,codigo,unidad))')
          .eq('id', id).single()
        if (!p) throw new Error('No se encontró el pedido')
        datos = { fecha_entrega: p.fecha_entrega, fecha_entrega_real: p.fecha_entrega_real, estado: p.estado.charAt(0).toUpperCase() + p.estado.slice(1), notas: p.notas, clientes: p.clientes, items: p.pedido_items, remito_numero: remito.numero }
      }
      setComp({ titulo: 'Remito de Entrega', html: buildRemitoEntrega(datos), filename: `Remito_${String(remito.numero).padStart(6, '0')}` })
    } catch (e) { throw e }
  }

  async function imprimirRemitoFunc(tipo, id) {
    try {
      const existente = await buscarRemitoExistente(tipo, id)
      if (existente) { await verRemitoFunc(tipo, id); return }

      let datos, clienteId, vendedorId, total
      if (tipo === 'venta') {
        const { data: v } = await supabase.from('ventas')
          .select('id,fecha,fecha_entrega_real,estado_pago,notas,cliente_id,vendedor_id,total,clientes(nombre,nombre_fantasia,direccion,localidad,provincia,telefono,tipo),venta_items(cantidad,bonificado,precio_unitario,productos(nombre,codigo,unidad))')
          .eq('id', id).single()
        if (!v) throw new Error('No se encontró la venta')
        datos = { fecha_entrega: v.fecha, fecha_entrega_real: v.fecha_entrega_real, estado: v.estado_pago === 'pagado' ? 'Facturada y pagada' : 'Facturada', notas: v.notas, clientes: v.clientes, items: v.venta_items }
        clienteId = v.cliente_id; vendedorId = v.vendedor_id; total = v.total
      } else {
        const { data: p } = await supabase.from('pedidos')
          .select('id,fecha_entrega,fecha_entrega_real,estado,notas,cliente_id,vendedor_id,total,clientes(nombre,nombre_fantasia,direccion,localidad,provincia,telefono,tipo),pedido_items(cantidad,bonificado,precio_unitario,productos(nombre,codigo,unidad))')
          .eq('id', id).single()
        if (!p) throw new Error('No se encontró el pedido')
        datos = { fecha_entrega: p.fecha_entrega, fecha_entrega_real: p.fecha_entrega_real, estado: p.estado.charAt(0).toUpperCase() + p.estado.slice(1), notas: p.notas, clientes: p.clientes, items: p.pedido_items }
        clienteId = p.cliente_id; vendedorId = p.vendedor_id; total = p.total
      }

      const { data: ultimo } = await supabase.from('remitos').select('numero').order('numero', { ascending: false }).limit(1)
      const numero = (ultimo?.[0]?.numero || 0) + 1

      await supabase.from('remitos').insert({ numero, origen_tipo: tipo, origen_id: id, cliente_id: clienteId, vendedor_id: vendedorId, fecha_entrega_real: datos.fecha_entrega_real || null, total })

      datos.remito_numero = numero
      setComp({ titulo: 'Remito de Entrega', html: buildRemitoEntrega(datos), filename: `Remito_${String(numero).padStart(6, '0')}` })
    } catch (e) { throw e }
  }

  function cerrarComp() { setComp(null) }

  function imprimir() {
    if (!comp) return
    printComprobante(comp.html, comp.titulo, window.innerWidth < 768)
  }

  function descargar() {
    if (!comp) return
    descargarComprobante(comp.html, comp.filename || comp.titulo)
  }

  return {
    comp,
    cerrarComp,
    imprimir,
    descargar,
    verComprobanteVenta,
    verComprobantePedido,
    verRemito: verRemitoFunc,
    imprimirRemito: imprimirRemitoFunc,
  }
}

// Componente modal de comprobante
export function ComprobanteModal({ comp, onClose, onPrint, onDownload }) {
  if (!comp) return null
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 1000, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div style={{ background: 'white', borderRadius: 12, width: '100%', maxWidth: 760, boxShadow: '0 20px 60px rgba(0,0,0,0.2)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 20px', borderBottom: '1px solid #E8E2D8', flexShrink: 0 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{comp.titulo}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={onPrint}>🖨 Imprimir</button>
            <button className="btn btn-secondary btn-sm" onClick={onDownload}>⬇ Descargar</button>
            <button className="btn btn-secondary btn-sm" onClick={onClose}>Cerrar</button>
          </div>
        </div>
        <div style={{ padding: 0, overflow: 'auto', WebkitOverflowScrolling: 'touch', flex: 1 }}>
          <style>{COMP_CSS}</style>
          <div dangerouslySetInnerHTML={{ __html: comp.html }} />
        </div>
      </div>
    </div>
  )
}
