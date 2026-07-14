// Carga SheetJS (XLSX) dinámicamente desde CDN, una sola vez.
let xlsxPromise = null

export function loadXLSX() {
  if (window.XLSX) return Promise.resolve(window.XLSX)
  if (!xlsxPromise) {
    xlsxPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script')
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
      s.onload = () => resolve(window.XLSX)
      s.onerror = reject
      document.head.appendChild(s)
    })
  }
  return xlsxPromise
}
