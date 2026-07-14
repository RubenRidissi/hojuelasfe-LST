/**
 * Utilidades comunes — equivalentes a las funciones helpers del HTML anterior
 */

const TZ_ARG = 'America/Argentina/Buenos_Aires'

// Fecha (YYYY-MM-DD) de un Date según el huso horario de Buenos Aires.
// new Date().toISOString() usa UTC: entre las 21:00 y 23:59 (ARG) ya devuelve
// el día siguiente. Esta función evita ese desfasaje.
export function fechaISOBuenosAires(date = new Date()) {
  return date.toLocaleDateString('en-CA', { timeZone: TZ_ARG })
}

export function hoyAR() {
  return fechaISOBuenosAires(new Date())
}

export function nombreCliente(c) {
  if (!c) return '—'
  if (c.nombre && c.nombre_fantasia) return `${c.nombre} (${c.nombre_fantasia})`
  return c.nombre || c.nombre_fantasia || '—'
}

export function formatMoney(val, opts = { maximumFractionDigits: 2 }) {
  return '$' + parseFloat(val || 0).toLocaleString('es-AR', opts)
}

export function getIvaFactor(modalidad) {
  return modalidad === 'con_iva' ? 1.21 : 1
}

export const RESULTADOS_VISITA = [
  { value: 'venta', label: '✅ Venta', badge: 'badge-green' },
  { value: 'sin_venta', label: '➖ Sin venta', badge: 'badge-yellow' },
  { value: 'cerrado', label: '🔒 Cerrado', badge: 'badge-gray' },
  { value: 'no_atendio', label: '🚫 No atendió', badge: 'badge-red' }
]

export function resultadoVisitaInfo(value) {
  return RESULTADOS_VISITA.find(r => r.value === value) || { label: value || '—', badge: 'badge-gray' }
}
