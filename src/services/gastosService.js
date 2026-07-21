import { supabase } from './supabase'

export async function registrarGasto({ fecha, categoria, monto, medio, notas, recepcionId }) {
  const { error } = await supabase.from('gastos').insert({
    fecha, categoria, monto: parseFloat(monto), medio,
    notas: notas || null, recepcion_id: recepcionId || null
  })
  if (error) throw error
}

export async function anularGasto(id) {
  const { error } = await supabase.from('gastos').delete().eq('id', id)
  if (error) throw error
}
