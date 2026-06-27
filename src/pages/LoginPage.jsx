import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const LOGO_URL = '/branding/logo-principal.png'

// RC1.1 - Bloqueo temporal de acceso por mantenimiento
// Rubén puede ingresar. Esteban y Adrián ven pantalla de mantenimiento.
const MAINTENANCE_MODE = true
const ALLOWED_EMAILS = [
  'rridissi@gmail.com',
  'vendedor.demo@hojuelas.local'
]
const BLOCKED_EMAILS = ['gaitandurol@gmail.com', 'adrianridissi@gmail.com']

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function MaintenanceView({ onBack }) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #FAF8F4 0%, #FFF7ED 100%)',
      padding: '18px'
    }}>
      <div style={{
        width: '100%',
        maxWidth: 520,
        background: 'white',
        borderRadius: 24,
        padding: '36px 28px',
        textAlign: 'center',
        border: '1px solid var(--border)',
        boxShadow: '0 18px 55px rgba(61,44,35,0.14)'
      }}>
        <img
          src={LOGO_URL}
          alt="Hojuelas"
          style={{
            height: 108,
            marginBottom: 18,
            filter: 'drop-shadow(0 8px 18px rgba(0,0,0,.14))'
          }}
          onError={e => e.target.style.display = 'none'}
        />

        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 62,
          height: 62,
          borderRadius: '50%',
          background: '#FEF3DC',
          color: '#D4860A',
          fontSize: 30,
          marginBottom: 16
        }}>
          🔒
        </div>

        <h1 style={{
          fontSize: 30,
          lineHeight: 1.15,
          fontWeight: 800,
          color: 'var(--text)',
          marginBottom: 10
        }}>
          Página en mantenimiento
        </h1>

        <p style={{
          color: 'var(--muted)',
          fontSize: 15,
          lineHeight: 1.55,
          marginBottom: 18
        }}>
          Estamos realizando mejoras para ofrecer una mejor experiencia de uso.
          El acceso se encuentra temporalmente restringido.
        </p>

        <div style={{
          background: '#FAF8F4',
          border: '1px solid var(--border)',
          borderRadius: 16,
          padding: '14px 16px',
          color: 'var(--text)',
          fontSize: 13,
          marginBottom: 20
        }}>
          <strong>Hojuelas RC1.2</strong><br />
          Muy pronto volveremos con novedades.
        </div>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={onBack}
          style={{ justifyContent: 'center', minWidth: 150 }}
        >
          Volver
        </button>
      </div>
    </div>
  )
}

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showMaintenance, setShowMaintenance] = useState(false)

  async function handleLogin(e) {
    e.preventDefault()
    setError('')

    const normalizedEmail = normalizeEmail(email)

    if (MAINTENANCE_MODE) {
      const isBlocked = BLOCKED_EMAILS.includes(normalizedEmail)
      const isAllowed = ALLOWED_EMAILS.includes(normalizedEmail)

      if (isBlocked || !isAllowed) {
        setShowMaintenance(true)
        return
      }
    }

    setLoading(true)
    try {
      await login(email, pass)
    } catch (err) {
      setError('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  if (showMaintenance) {
    return <MaintenanceView onBack={() => setShowMaintenance(false)} />
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'linear-gradient(135deg, #FAF8F4 0%, #FFF7ED 100%)',
      padding: '16px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: 24,
        padding: '42px 32px 30px',
        width: '100%',
        maxWidth: '390px',
        boxShadow: '0 18px 55px rgba(61,44,35,0.14)',
        border: '1px solid var(--border)',
        textAlign: 'center'
      }}>
        <img
          src={LOGO_URL}
          alt="Hojuelas"
          style={{
            height: 96,
            marginBottom: 20,
            filter: 'drop-shadow(0 6px 18px rgba(0,0,0,.15))'
          }}
          onError={e => e.target.style.display = 'none'}
        />

        <h1 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4, color: 'var(--text)' }}>
          ¡Buenos días!
        </h1>
        <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 28 }}>
          Bienvenido nuevamente
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
            style={{ height: 46, borderRadius: 14 }}
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={pass}
            onChange={e => setPass(e.target.value)}
            required
            autoComplete="current-password"
            style={{ height: 46, borderRadius: 14 }}
          />
          {error && (
            <div style={{
              color: 'var(--danger)',
              background: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: 12,
              padding: '10px 12px',
              fontSize: 13,
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary"
            disabled={loading}
            style={{
              width: '100%',
              height: 48,
              justifyContent: 'center',
              marginTop: 4,
              borderRadius: 14,
              fontSize: 15,
              fontWeight: 800,
              background: 'linear-gradient(135deg, #DC2626, #B91C1C)',
              boxShadow: '0 12px 28px rgba(220,38,38,0.24)'
            }}
          >
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div style={{
          marginTop: 24,
          color: 'var(--muted)',
          fontSize: 12,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6
        }}>
          <span>🔒</span>
          <span>Accedé de forma segura a tu cuenta</span>
        </div>
      </div>
    </div>
  )
}
