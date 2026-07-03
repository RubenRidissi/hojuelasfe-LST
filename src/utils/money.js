const OCULTO = '•••'

export function fmtMonto(valor, puedeVer, opts = { maximumFractionDigits: 0 }) {
  if (!puedeVer) return OCULTO
  return '$' + parseFloat(valor || 0).toLocaleString('es-AR', opts)
}

export function fmtNumero(valor, puedeVer, opts = {}) {
  if (!puedeVer) return OCULTO
  return parseFloat(valor || 0).toLocaleString('es-AR', opts)
}
