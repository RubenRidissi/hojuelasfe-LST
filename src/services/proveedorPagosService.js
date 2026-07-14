import { supabase } from './supabase'

async function recalcularEstadoPagoRecepcion(recepcionId) {
  const { data: pagos, error: pagosError } = await supabase.from('pagos_proveedor').select('monto').eq('recepcion_id', recepcionId)
  if (pagosError) throw pagosError
  const totalPagado = (pagos || []).reduce((s, p) => s + parseFloat(p.monto || 0), 0)
  const { data: r, error: recepError } = await supabase.from('recepciones').select('total').eq('id', recepcionId).single()
  if (recepError) throw recepError
  const totalRecep = parseFloat(r?.total || 0)
  const nuevoEstado = totalPagado >= totalRecep - 0.01 ? 'pagado' : totalPagado > 0 ? 'parcial' : 'pendiente'
  const { error: updError } = await supabase.from('recepciones').update({ monto_pagado_prov: totalPagado, estado_pago_prov: nuevoEstado }).eq('id', recepcionId)
  if (updError) throw updError
  return { totalPagado, nuevoEstado }
}

export async function registrarPagoProveedor({ recepcionId, fecha, monto, medio, notas }) {
  const { error: insertError } = await supabase.from('pagos_proveedor').insert({
    recepcion_id: recepcionId, fecha, monto: parseFloat(monto), medio, notas: notas || null
  })
  if (insertError) throw insertError

  try {
    return await recalcularEstadoPagoRecepcion(recepcionId)
  } catch (e) {
    // El pago ya quedó guardado; lo que falló es solo el recálculo del estado/saldo de la
    // recepción, que puede quedar desactualizado hasta el próximo pago o una recarga manual.
    throw new Error(`El pago se registró, pero no se pudo actualizar el saldo de la recepción (${e.message}). Revisá el estado de pago de esta recepción.`)
  }
}

export async function anularPagoProveedor(pagoId, recepcionId) {
  const { error: deleteError } = await supabase.from('pagos_proveedor').delete().eq('id', pagoId)
  if (deleteError) throw deleteError
  return recalcularEstadoPagoRecepcion(recepcionId)
}
