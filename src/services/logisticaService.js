import { supabase } from './supabase'

/**
 * ==========================================================
 * Servicio Logístico
 * Centraliza la lógica de remitos, entregas y stock.
 * RC 1.4.06 - Iteración 1
 * ==========================================================
 */

/**
 * Busca un remito existente para un Pedido o una Venta.
 *
 * Contempla también:
 * - Pedido convertido en venta.
 * - Venta originada desde un pedido.
 */
export async function buscarRemitoExistente(origenTipo, origenId) {
  if (!origenTipo || !origenId) return null

  const origenes = [
    {
      tipo: origenTipo,
      id: origenId
    }
  ]

  // Pedido -> Venta
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

  // Venta -> Pedido
  if (origenTipo === 'venta') {
    const { data: pedidos, error } = await supabase
      .from('pedidos')
      .select('id')
      .eq('convertido_venta_id', origenId)

    if (error) throw error

    pedidos?.forEach((p) => {
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
 * Estado logístico simple.
 */
export function obtenerEstadoLogistico(remito) {
  if (!remito) return 'sin_remito'

  if (remito.fecha_entrega_real) {
    return 'entregado'
  }

  return 'remito_emitido'
}

/**
 * Indica si todavía puede emitirse un remito.
 */
export async function puedeEmitirRemito(origenTipo, origenId) {
  const remito = await buscarRemitoExistente(origenTipo, origenId)

  return {
    puede: !remito,
    remito,
    motivo: remito
      ? 'Ya existe un remito para este documento.'
      : null
  }
}