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
  const nuevoEstado = totalPagado >= totalVenta - 0.01 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente'

  const { error: updError } = await supabase
    .from('ventas')
    .update({ monto_pagado: totalPagado, estado_pago: nuevoEstado })
    .eq('id', ventaId)

  if (updError) throw updError

  return { totalPagado, nuevoEstado }
}
