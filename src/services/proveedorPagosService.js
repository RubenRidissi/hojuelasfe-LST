import { supabase } from './supabase'

async function recalcularEstadoPagoRecepcion(recepcionId) {
  const { data: pagos } = await supabase.from('pagos_proveedor').select('monto').eq('recepcion_id', recepcionId)
  const totalPagado = (pagos || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0)
  const { data: r } = await supabase.from('recepciones').select('total').eq('id', recepcionId).single()
  const totalRecep = parseFloat(r?.total || 0)
  const nuevoEstado = totalPagado >= totalRecep - 0.01 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente'
  await supabase.from('recepciones').update({ monto_pagado_prov: totalPagado, estado_pago_prov: nuevoEstado }).eq('id', recepcionId)
  return { totalPagado, nuevoEstado }
}

export async function registrarPagoProveedor({ recepcionId, fecha, monto, medio, notas }) {
  await supabase.from('pagos_proveedor').insert({
    recepcion_id: recepcionId, fecha, monto: parseFloat(monto), medio, notas: notas || null
  })
  return recalcularEstadoPagoRecepcion(recepcionId)
}

export async function anularPagoProveedor(pagoId, recepcionId) {
  await supabase.from('pagos_proveedor').delete().eq('id', pagoId)
  return recalcularEstadoPagoRecepcion(recepcionId)
}
