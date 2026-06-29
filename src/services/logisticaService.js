import { supabase } from './supabase'

/**
 * Servicio Logístico
 *
 * Centraliza la lógica relacionada con remitos, entregas y stock.
 * En esta primera iteración incorpora funciones de lectura y emisión
 * sin modificar todavía el movimiento de stock.
 */

/**
 * Busca un remito existente para un pedido o una venta.
 */
export async function buscarRemitoExistente(origenTipo, origenId) {
  if (!origenTipo || !origenId) return null

  const origenes = [
    { tipo: origenTipo, id: origenId }
  ]

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

    if (data?.length) {
      return data[0]
    }
  }

  return null
}

/**
 * Devuelve un estado logístico simple.
 */
export function obtenerEstadoLogistico(remito) {
  if (!remito) return 'sin_remito'
  if (remito.fecha_entrega_real) return 'entregado'
  return 'remito_emitido'
}

/**
 * Indica si puede emitirse un remito.
 */
export async function puedeEmitirRemito(origenTipo, origenId) {
  const remito = await buscarRemitoExistente(origenTipo, origenId)

  return {
    puede: !remito,
    remito,
    motivo: remito ? 'Ya existe un remito para este origen.' : null
  }
}

/**
 * Emite un remito para un pedido o una venta.
 *
 * IMPORTANTE:
 * En esta iteración solo centraliza la creación del documento remito.
 * Todavía NO descuenta stock ni registra movimientos.
 */
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