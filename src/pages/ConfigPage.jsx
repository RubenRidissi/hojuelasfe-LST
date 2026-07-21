import { useState } from 'react'
import { supabase } from '../services/supabase'
import { useAuth } from '../context/AuthContext'
import { useToast } from '../hooks/useToast'
import { ToastContainer } from '../components/Toast'
import { loadXLSX } from '../utils/xlsxLoader'
import { resultadoVisitaInfo } from '../utils/helpers'

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
  { nombre: 'Gastos',           tabla: 'gastos',            select: 'fecha,categoria,monto,medio,notas,recepciones(numero,remito_proveedor)', order: 'fecha' },
  { nombre: 'Comisiones',       tabla: 'comisiones',        select: 'fecha,monto,medio,notas', order: 'fecha' },
  { nombre: 'Stock Movimientos',tabla: 'stock_movimientos', select: 'fecha,tipo,origen,cantidad,notas,productos(nombre,codigo),clientes(nombre)', order: undefined },
  { nombre: 'Ajustes Clientes', tabla: 'ajustes_cliente',  select: 'fecha,tipo,monto,concepto,clientes(nombre)', order: undefined },
  { nombre: 'Objetivos Ventas', tabla: 'objetivos_ventas', select: undefined, order: 'anio,mes' },
  { nombre: 'Visitas',          tabla: 'visitas',          select: 'id,fecha,resultado,notas,vendedor_id,clientes(nombre,nombre_fantasia)', order: 'fecha' },
]

// Aplicar tamaño de fuente guardado al body
export function initFontSize() {
  const saved = localStorage.getItem('app_font_size') || 'normal'
  document.body.classList.remove('font-small','font-normal','font-large')
  document.body.classList.add('font-' + saved)
}

export function setFontSize(size) {
  document.body.classList.remove('font-small','font-normal','font-large')
  document.body.classList.add('font-' + size)
  localStorage.setItem('app_font_size', size)
}

export default function ConfigPage() {
  const { user, isAdmin, nombre } = useAuth()
  const { toasts, toast } = useToast()

  const [fontActual, setFontActual] = useState(() => localStorage.getItem('app_font_size') || 'normal')
  const [exportando, setExportando] = useState(false)
  const [exportStatus, setExportStatus] = useState('')
  const [backupStatus, setBackupStatus] = useState('')
  const [pwNueva, setPwNueva] = useState('')
  const [pwConfirmar, setPwConfirmar] = useState('')
  const [pwSaving, setPwSaving] = useState(false)

  const APP_VERSION = 'RC1.4.02'
  const nombreMostrar = nombre || user?.email || 'Usuario'
  const rolMostrar = isAdmin ? 'Administrador' : 'Vendedor'

  async function cambiarPassword() {
    if (!pwNueva || pwNueva.length < 6) { toast('La contraseña debe tener al menos 6 caracteres', 'error'); return }
    if (pwNueva !== pwConfirmar) { toast('Las contraseñas no coinciden', 'error'); return }
    setPwSaving(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pwNueva })
      if (error) throw error
      toast('Contraseña actualizada')
      setPwNueva('')
      setPwConfirmar('')
    } catch (e) {
      toast('Error al actualizar la contraseña: ' + e.message, 'error')
    } finally {
      setPwSaving(false)
    }
  }

  const cambiarPasswordCard = (
    <div className="card" style={{ padding: 20, marginBottom: 16 }}>
      <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>🔑 Cambiar contraseña</div>
      <div className="form-row">
        <div className="form-group">
          <label>Nueva contraseña</label>
          <input type="password" value={pwNueva} onChange={e => setPwNueva(e.target.value)} placeholder="Mínimo 6 caracteres" />
        </div>
        <div className="form-group">
          <label>Confirmar contraseña</label>
          <input type="password" value={pwConfirmar} onChange={e => setPwConfirmar(e.target.value)} placeholder="Repetí la contraseña" />
        </div>
      </div>
      <button className="btn btn-primary" onClick={cambiarPassword} disabled={pwSaving} style={{ marginTop: 8 }}>
        {pwSaving ? 'Actualizando...' : 'Actualizar contraseña'}
      </button>
    </div>
  )

  async function exportarTodoExcel() {
    setExportando(true)
    setExportStatus('Cargando librería Excel...')
    try {
      const XLSX = await loadXLSX()
      const wb = XLSX.utils.book_new()
      let exportadas = 0

      const { data: vendedores } = await supabase.from('user_roles').select('user_id,nombre').eq('rol', 'vendedor')
      const vendedorNombre = id => vendedores?.find(v => v.user_id === id)?.nombre || id || ''

      for (const t of TABLAS_EXPORT) {
        setExportStatus(`Exportando ${t.nombre}...`)
        try {
          let q = supabase.from(t.tabla).select(t.select || '*')
          if (t.order) q = q.order(t.order)
          const { data } = await q
          if (!data?.length) continue

          const filas = t.tabla === 'visitas'
            ? data.map(v => ({ ...v, vendedor_id: vendedorNombre(v.vendedor_id), resultado: resultadoVisitaInfo(v.resultado).label }))
            : data

          const aplanados = filas.map(row => {
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
  <div>
    <div className="page-header">
      <h1 className="page-title">Mi cuenta</h1>
    </div>

    <div className="card" style={{padding:20,marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>👤 Mi cuenta</div>
      <div style={{fontSize:13,color:'var(--muted)',display:'flex',flexDirection:'column',gap:6}}>
        <div>Nombre: <strong style={{color:'var(--text)'}}>{nombreMostrar}</strong></div>
        <div>Usuario: <strong style={{color:'var(--text)'}}>{user?.email || '—'}</strong></div>
        <div>Rol: <strong style={{color:'var(--text)'}}>{rolMostrar}</strong></div>
      </div>
    </div>

    {cambiarPasswordCard}

    <div className="card" style={{padding:20,marginBottom:16}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>🔤 Tamaño de texto</div>
      <p style={{color:'var(--muted)',fontSize:13,marginBottom:16}}>Ajustá el tamaño del texto a tu preferencia. Se guarda automáticamente.</p>
      <div style={{display:'flex',gap:8}}>
        {[{key:'small',label:'A Pequeño'},{key:'normal',label:'A Normal'},{key:'large',label:'A Grande'}].map(({key,label}) => (
          <button key={key} className="btn" style={{flex:1,background:fontActual===key?'var(--primary)':'var(--bg)',color:fontActual===key?'#fff':'var(--text)',border:'1px solid var(--border)'}}
            onClick={() => { setFontSize(key); setFontActual(key) }}>{label}</button>
        ))}
      </div>
    </div>

    <div className="card" style={{padding:20}}>
      <div style={{fontWeight:700,fontSize:15,marginBottom:12}}>ℹ️ Acerca de</div>
      <div style={{fontSize:13,color:'var(--muted)',display:'flex',flexDirection:'column',gap:6}}>
        <div>Aplicación: <strong style={{color:'var(--text)'}}>Hojuelas Santa Fe</strong></div>
        <div>Versión: <strong style={{color:'var(--text)'}}>{APP_VERSION}</strong></div>
        <div>Stack: <strong style={{color:'var(--text)'}}>React + Vite + Supabase + Vercel</strong></div>
        <div>© <strong style={{color:'var(--text)'}}>Alpha y Omega</strong></div>
      </div>
    </div>

    <ToastContainer toasts={toasts} />
  </div>
)

  return (
    <div>
      <div className="page-header">
        <h1 className="page-title">Configuración</h1>
      </div>

      {cambiarPasswordCard}

      {/* Tamaño de fuente */}
      <div className="card" style={{padding:20,marginBottom:16}}>
        <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>🔤 Tamaño de texto</div>
        <p style={{color:'var(--muted)',fontSize:13,marginBottom:16}}>Ajustá el tamaño del texto a tu preferencia. Se guarda automáticamente.</p>
        <div style={{display:'flex',gap:8}}>
          {[{key:'small',label:'A Pequeño'},{key:'normal',label:'A Normal'},{key:'large',label:'A Grande'}].map(({key,label}) => (
            <button key={key} className="btn" style={{flex:1,background:fontActual===key?'var(--primary)':'var(--bg)',color:fontActual===key?'#fff':'var(--text)',border:'1px solid var(--border)'}}
              onClick={() => { setFontSize(key); setFontActual(key) }}>{label}</button>
          ))}
        </div>
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
