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

export function formatMoney(val) {
  return '$' + parseFloat(val || 0).toLocaleString('es-AR', { maximumFractionDigits: 2 })
}

export function formatDate(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  })
}

export function formatDateShort(dateStr) {
  if (!dateStr) return '—'
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit'
  })
}

export const ESTADO_COLORS = {
  pendiente:  { bg: '#FEF9C3', color: '#92400E' },
  confirmado: { bg: '#DBEAFE', color: '#1D4ED8' },
  entregado:  { bg: '#DCFCE7', color: '#15803D' },
  cancelado:  { bg: '#FEE2E2', color: '#991B1B' },
  pagado:     { bg: '#DCFCE7', color: '#15803D' },
}

export function badgeEstado(estado) {
  const s = ESTADO_COLORS[estado] || { bg: '#F3F4F6', color: '#374151' }
  return { backgroundColor: s.bg, color: s.color }
}

export const TIPO_CLIENTE_COLORS = {
  Minorista:     '#6B7280',
  Distribuidor:  '#1D4ED8',
  Mayorista:     '#92400E',
  Institucional: '#15803D',
}
