import { useState } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'

const TABLAS_EXPORT = [
  { nombre: 'Clientes',         tabla: 'clientes',          select: undefined, order: 'nombre' },
  { nombre: 'Productos',        tabla: 'productos',         select: undefined, order: 'codigo' },
  { nombre: 'Pedidos',          tabla: 'pedidos',           select: 'id,numero,fecha,fecha_entrega,estado,total,notas,clientes(nombre,nombre_fantasia)', order: 'numero' },
  { nombre: 'Pedido Items',     tabla: 'pedido_items',      select: 'pedido_id,cantidad,bonificado,precio_unitario,productos(nombre,codigo)', order: undefined },
  { nombre: 'Ventas',           tabla: 'ventas',            select: 'id,numero,fecha,total,estado_pago,monto_pagado,notas,clientes(nombre,nombre_fantasia)', order: 'numero' },
  { nombre: 'Venta Items',      tabla: 'venta_items',       select: 'venta_id,cantidad,bonificado,precio_unitario,productos(nombre,codigo)', order: undefined },
  { nombre: 'Remitos',          tabla: 'remitos',           select: 'id,numero,fecha_generado,fecha_entrega_real,total,origen_tipo,clientes(nombre,nombre_fantasia)', order: 'numero' },
  { nombre: 'Pagos',            tabla: 'pagos',             select: 'id,numero,fecha,monto,medio,centro_costo,notas,clientes(nombre,nombre_fantasia)', order: 'numero' },
  { nombre: 'Recepciones',      tabla: 'recepciones',       select: 'id,numero,fecha_recepcion_real,total,estado,estado_pago_prov,monto_pagado_prov', order: 'numero' },
  { nombre: 'Stock Movimientos',tabla: 'stock_movimientos', select: 'fecha,tipo,origen,cantidad,notas,productos(nombre,codigo),clientes(nombre)', order: undefined },
  { nombre: 'Ajustes Clientes', tabla: 'ajustes_cliente',  select: 'fecha,tipo,monto,concepto,clientes(nombre)', order: undefined },
  { nombre: 'Objetivos Ventas', tabla: 'objetivos_ventas', select: undefined, order: 'anio,mes' },
]

export default function ConfigPage() {
  const { isAdmin } = useAuth()
  const { toasts, toast } = useToast()

  const [exportando, setExportando] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [backupStatus, setBackupStatus] = useState('')

  async function exportarTodoExcel() {
    setExportando(true)
    setExportStatus('Cargando librería Excel...')
    try {
      // Cargar SheetJS dinámicamente
      if (!window.XLSX) {
        await new Promise((res, rej) => {
          const s = document.createElement('script')
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'
          s.onload = res; s.onerror = rej
          document.head.appendChild(s)
        })
      }
      const XLSX = window.XLSX
      const wb = XLSX.utils.book_new()
      let exportadas = 0

      for (const t of TABLAS_EXPORT) {
        setExportStatus(`Exportando ${t.nombre}...`)
        try {
          let q = supabase.from(t.tabla).select(t.select || '*')
          if (t.order) q = q.order(t.order)
          const { data } = await q
          if (!data?.length) continue

          const aplanados = data.map(row => {
            const flat = {}
            Object.entries(row).forEach(([k, v]) => {
              if (v && typeof v === 'object' && !Array.isArray(v)) {
                Object.entries(v).forEach(([k2, v2]) => { flat[`${k}_${k2}`] = v2 })
              } else if (!Array.isArray(v)) { flat[k] = v ?? '' }
            })
            return flat
          })

          const ws = XLSX.utils.json_to_sheet(aplanados)
          XLSX.utils.book_append_sheet(wb, ws, t.nombre)
          exportadas++
        } catch (e) { console.warn('Error exportando', t.nombre, e) }
      }

      const fecha = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }).replace(/\//g, '-')
      XLSX.writeFile(wb, `HojuelasSFE_Backup_${fecha}.xlsx`)
      setExportStatus(`✓ ${exportadas} tablas exportadas correctamente`)
    } catch (e) {
      setExportStatus('Error: ' + e.message)
    } finally {
      setExportando(false)
    }
  }

  async function exportBackupJSON() {
    setBackupStatus('Exportando...')
    try {
      const [{ data: clientes }, { data: productos }, { data: pedidos }, { data: ventas }, { data: pagos }] = await Promise.all([
        supabase.from('clientes').select('*'),
        supabase.from('productos').select('*'),
        supabase.from('pedidos').select('*'),
        supabase.from('ventas').select('*'),
        supabase.from('pagos').select('*')
      ])
      const backup = { fecha: new Date().toISOString(), clientes, productos, pedidos, ventas, pagos }
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
      const a = document.createElement('a')
      a.href = URL.createObjectURL(blob)
      a.download = `hojuelas-backup-${new Date().toISOString().split('T')[0]}.json`
      a.click()
      setBackupStatus('✓ Backup descargado')
      toast('Backup descargado')
    } catch (e) {
      setBackupStatus('Error: ' + e.message)
      toast('Error al exportar', 'error')
    }
  }

  if (!isAdmin) return (
    <div className="card" style={{ padding: 32, textAlign: 'center' }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🔒</div>
      <p style={{ color: 'var(--muted)' }}>Solo el administrador puede acceder a esta sección.</p>
    </div>
  )

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configuración</h1>
      </div>

      {/* Exportar Excel */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>📊 Exportar todo a Excel</div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Exporta todas las tablas del sistema (clientes, productos, pedidos, ventas, pagos, etc.) en un archivo Excel con una hoja por tabla.
        </p>
        <button className="btn btn-primary" onClick={exportarTodoExcel} disabled={exportando}>
          {exportando ? '⏳ Exportando...' : '📊 Exportar todo a Excel'}
        </button>
        {exportStatus && (
          <div style={{ marginTop: 10, fontSize: 13, color: exportStatus.startsWith('✓') ? 'var(--success)' : exportStatus.startsWith('Error') ? 'var(--danger)' : 'var(--muted)' }}>
            {exportStatus}
          </div>
        )}
      </div>

      {/* Backup JSON */}
      <div className="card" style={{ padding: 20, marginBottom: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>💾 Backup JSON</div>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 16 }}>
          Descarga un backup en formato JSON con las tablas principales (clientes, productos, pedidos, ventas, pagos).
        </p>
        <button className="btn btn-secondary" onClick={exportBackupJSON}>
          💾 Descargar backup JSON
        </button>
        {backupStatus && (
          <div style={{ marginTop: 10, fontSize: 13, color: backupStatus.startsWith('✓') ? 'var(--success)' : 'var(--danger)' }}>
            {backupStatus}
          </div>
        )}
      </div>

      {/* Info sistema */}
      <div className="card" style={{ padding: 20 }}>
        <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12 }}>ℹ Sistema</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div>Sistema: <strong style={{ color: 'var(--text)' }}>Hojuelas SFE ERP</strong></div>
          <div>Stack: <strong style={{ color: 'var(--text)' }}>React + Vite → GitHub → Vercel + Supabase</strong></div>
          <div>Base de datos: <strong style={{ color: 'var(--text)' }}>PostgreSQL (Supabase)</strong></div>
        </div>
      </div>

      <ToastContainer toasts={toasts} />
    </div>
  )
}
