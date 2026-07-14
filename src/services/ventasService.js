import { supabase } from './supabase'

// Recalcula estado_pago/monto_pagado de una venta según sus cobros imputados y los NC/ND vigentes.
export async function recalcularEstadoVenta(ventaId) {
  const [
    { data: pagosVenta, error: pagosVentaError },
    { data: venta, error: ventaError },
    { data: ajustesVenta, error: ajustesError }
  ] = await Promise.all([
    supabase.from('pago_ventas').select('monto_aplicado').eq('venta_id', ventaId),
    supabase.from('ventas').select('total').eq('id', ventaId).single(),
    supabase.from('ajustes_cliente').select('tipo,monto').eq('venta_id', ventaId)
  ])

  if (pagosVentaError) throw pagosVentaError
  if (ventaError) throw ventaError
  if (ajustesError) throw ajustesError

  const totalPagado = (pagosVenta || []).reduce((s, p) => s + parseFloat(p.monto_aplicado || 0), 0)
  const ajusteNeto = (ajustesVenta || []).reduce((s, a) => s + (a.tipo === 'NC' ? -1 : 1) * parseFloat(a.monto || 0), 0)

  const totalVenta = parseFloat(venta?.total || 0) + ajusteNeto
  // Tolerancia de $1 para absorber centavos de redondeo en el total (no representan deuda real).
  const nuevoEstado = totalPagado >= totalVenta - 1 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente'

  const { error: updError } = await supabase
    .from('ventas')
    .update({ monto_pagado: totalPagado, estado_pago: nuevoEstado })
    .eq('id', ventaId)

  if (updError) throw updError

  return { totalPagado, nuevoEstado }
}

// Misma lógica que recalcularEstadoVenta, pero para varias ventas a la vez: 3 consultas
// batcheadas en vez de 3 por venta (una imputación que toca N ventas ya no hace ~4*N viajes).
export async function recalcularEstadoVentas(ventaIds) {
  const ids = [...new Set(ventaIds)].filter(Boolean)
  if (!ids.length) return []

  const [
    { data: pagosVenta, error: pagosVentaError },
    { data: ventas, error: ventasError },
    { data: ajustesVenta, error: ajustesError }
  ] = await Promise.all([
    supabase.from('pago_ventas').select('venta_id,monto_aplicado').in('venta_id', ids),
    supabase.from('ventas').select('id,total').in('id', ids),
    supabase.from('ajustes_cliente').select('venta_id,tipo,monto').in('venta_id', ids)
  ])

  if (pagosVentaError) throw pagosVentaError
  if (ventasError) throw ventasError
  if (ajustesError) throw ajustesError

  const pagadoPorVenta = {}
  ;(pagosVenta || []).forEach(p => { pagadoPorVenta[p.venta_id] = (pagadoPorVenta[p.venta_id] || 0) + parseFloat(p.monto_aplicado || 0) })

  const ajusteNetoPorVenta = {}
  ;(ajustesVenta || []).forEach(a => {
    ajusteNetoPorVenta[a.venta_id] = (ajusteNetoPorVenta[a.venta_id] || 0) + (a.tipo === 'NC' ? -1 : 1) * parseFloat(a.monto || 0)
  })

  return Promise.all((ventas || []).map(async venta => {
    const totalPagado = pagadoPorVenta[venta.id] || 0
    const totalVenta = parseFloat(venta.total || 0) + (ajusteNetoPorVenta[venta.id] || 0)
    const nuevoEstado = totalPagado >= totalVenta - 1 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente'

    const { error: updError } = await supabase
      .from('ventas')
      .update({ monto_pagado: totalPagado, estado_pago: nuevoEstado })
      .eq('id', venta.id)
    if (updError) throw updError

    return { ventaId: venta.id, totalPagado, nuevoEstado }
  }))
}
