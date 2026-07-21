import { supabase } from './supabase'

export async function registrarComision({ fecha, vendedorId, monto, medio, notas }) {
  const { error } = await supabase.from('comisiones').insert({
    fecha, vendedor_id: vendedorId, monto: parseFloat(monto), medio, notas: notas || null
  })
  if (error) throw error
}

export async function anularComision(id) {
  const { error } = await supabase.from('comisiones').delete().eq('id', id)
  if (error) throw error
}
