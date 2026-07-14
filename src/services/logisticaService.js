import { supabase } from './supabase'
import { hoyAR } from '../utils/helpers'

export const ESTADOS_LOGISTICOS = {
  SIN_REMITO: 'SIN_REMITO',
  REMITO_EMITIDO: 'REMITO_EMITIDO',
  ENTREGADO: 'ENTREGADO'
}

export const MODALIDADES_ENTREGA = {
  RETIRO_DEPOSITO: 'retiro_deposito',
  REPARTO: 'reparto'
}

function normalizarItemsStock(items = []) {
  return items
    .map(item => {
      const productoId = item.producto_id || item.productoId || item.productos?.id
      const cantidad = Number(item.cantidad || 0)
      const bonificado = Number(item.bonificado || 0)
      const cantidadFisica = cantidad + bonificado

      return {
        producto_id: productoId,
        cantidad: cantidadFisica,
        bonificado
      }
    })
    .filter(item => item.producto_id && item.cantidad > 0)
}

async function registrarMovimientosStockRemito({ remito, items = [], clienteId }) {
  const itemsStock = normalizarItemsStock(items)

  if (!itemsStock.length) return

  const fecha = hoyAR()

  const movimientos = itemsStock.map(item => ({
    producto_id: item.producto_id,
    cliente_id: clienteId || null,
    tipo: 'salida',
    origen: 'remito',
    cantidad: -item.cantidad,
    referencia_id: remito.id,
    fecha,
    notas: `Remito #${String(remito.numero || '').padStart(6, '0')}${item.bonificado ? ` (incl. ${item.bonificado} bonif.)` : ''}`
  }))

  const { error } = await supabase
    .from('stock_movimientos')
    .insert(movimientos)

  if (error) throw error
}

async function marcarOrigenEntregado(origenTipo, origenId, fechaEntregaReal) {
  if (!fechaEntregaReal) return

  if (origenTipo === 'pedido') {
    const { error } = await supabase
      .from('pedidos')
      .update({
        fecha_entrega_real: fechaEntregaReal,
        estado: 'entregado'
      })
      .eq('id', origenId)

    if (error) throw error
  }

  if (origenTipo === 'venta') {
    const { error } = await supabase
      .from('ventas')
      .update({
        fecha_entrega_real: fechaEntregaReal
      })
      .eq('id', origenId)

    if (error) throw error
  }
}

export async function buscarRemitoExistente(origenTipo, origenId) {
  if (!origenTipo || !origenId) return null

  const origenes = [{ tipo: origenTipo, id: origenId }]

  if (origenTipo === 'pedido') {
    const { data: pedido, error } = await supabase
      .from('pedidos')
      .select('convertido_venta_id')
      .eq('id', origenId)
      .maybeSingle()

    if (error) throw error

    if (pedido?.convertido_venta_id) {
      origenes.push({
        tipo: 'venta',
        id: pedido.convertido_venta_id
      })
    }
  }

  if (origenTipo === 'venta') {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('id')
      .eq('convertido_venta_id', origenId)

    if (error) throw error

    pedidos?.forEach(p => {
      origenes.push({
        tipo: 'pedido',
        id: p.id
      })
    })
  }

  for (const origen of origenes) {
    const { data, error } = await supabase
      .from('remitos')
      .select('*')
      .eq('origen_tipo', origen.tipo)
      .eq('origen_id', origen.id)
      .order('fecha_generado', { ascending: false })
      .limit(1)

    if (error) throw error
    if (data?.length) return data[0]
  }

  return null
}

export function obtenerEstadoLogistico(remito) {
  if (!remito) return 'sin_remito'
  if (remito.fecha_entrega_real) return 'entregado'
  return 'remito_emitido'
}

export async function obtenerEstadoLogisticoDocumento({ origenTipo, origenId }) {
  const remito = await buscarRemitoExistente(origenTipo, origenId)

  if (!remito) {
    return {
      estado: ESTADOS_LOGISTICOS.SIN_REMITO,
      remito: null,
      puedePrepararEntrega: true,
      puedeEmitirRemito: true,
      puedeVerRemito: false,
      puedeConfirmarEntrega: false,
      entregado: false,
      mensajes: ['El documento todavía no tiene remito emitido.']
    }
  }

  if (remito.fecha_entrega_real) {
    return {
      estado: ESTADOS_LOGISTICOS.ENTREGADO,
      remito,
      puedePrepararEntrega: false,
      puedeEmitirRemito: false,
      puedeVerRemito: true,
      puedeConfirmarEntrega: false,
      entregado: true,
      mensajes: ['La mercadería ya fue entregada al cliente.']
    }
  }

  return {
    estado: ESTADOS_LOGISTICOS.REMITO_EMITIDO,
    remito,
    puedePrepararEntrega: false,
    puedeEmitirRemito: false,
    puedeVerRemito: true,
    puedeConfirmarEntrega: true,
    entregado: false,
    mensajes: [
      'La mercadería ya salió del depósito.',
      'Falta confirmar la recepción del cliente.'
    ]
  }
}

export async function puedeEmitirRemito(origenTipo, origenId) {
  const estado = await obtenerEstadoLogisticoDocumento({ origenTipo, origenId })

  return {
    puede: estado.puedeEmitirRemito,
    remito: estado.remito,
    motivo: estado.puedeEmitirRemito ? null : 'Ya existe un remito para este origen.'
  }
}

export async function emitirRemito({
  origenTipo,
  origenId,
  clienteId,
  vendedorId,
  total,
  fechaEntregaReal = null
}) {
  if (!origenTipo || !origenId) {
    throw new Error('Faltan datos de origen para emitir el remito')
  }

  const existente = await buscarRemitoExistente(origenTipo, origenId)
  if (existente) return existente

  const { data: ultimo, error: ultimoError } = await supabase
    .from('remitos')
    .select('numero')
    .order('numero', { ascending: false })
    .limit(1)

  if (ultimoError) throw ultimoError

  const numero = (ultimo?.[0]?.numero || 0) + 1

  const { data, error } = await supabase
    .from('remitos')
    .insert({
      numero,
      origen_tipo: origenTipo,
      origen_id: origenId,
      cliente_id: clienteId,
      vendedor_id: vendedorId,
      fecha_entrega_real: fechaEntregaReal || null,
      total
    })
    .select('*')
    .single()

  if (error) throw error

  return data
}

export async function prepararEntrega({
  origenTipo,
  origenId,
  clienteId,
  vendedorId,
  total,
  items = [],
  modalidadEntrega = MODALIDADES_ENTREGA.REPARTO,
  fechaEntregaReal = null
}) {
  const estado = await obtenerEstadoLogisticoDocumento({ origenTipo, origenId })

  if (estado.remito) {
    return estado.remito
  }

  const fechaEntregaFinal =
    modalidadEntrega === MODALIDADES_ENTREGA.RETIRO_DEPOSITO
      ? hoyAR()
      : fechaEntregaReal

  const remito = await emitirRemito({
    origenTipo,
    origenId,
    clienteId,
    vendedorId,
    total,
    fechaEntregaReal: fechaEntregaFinal
  })

  await registrarMovimientosStockRemito({
    remito,
    items,
    clienteId
  })

  if (fechaEntregaFinal) {
    await marcarOrigenEntregado(origenTipo, origenId, fechaEntregaFinal)
  }

  return remito
}