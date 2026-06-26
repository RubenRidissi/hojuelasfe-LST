import { useState } from 'react'
import { useAuth } from '../context/AuthContext'

const LOGO_URL = 'https://raw.githubusercontent.com/RubenRidissi/hojuelasfe/main/Distrilst/icon-192.png'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [pass, setPass] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleLogin(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await login(email, pass)
    } catch (err) {
      setError('Email o contraseña incorrectos')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
      padding: '16px'
    }}>
      <div style={{
        background: 'white',
        borderRadius: 'var(--radius)',
        padding: '40px 32px',
        width: '100%',
        maxWidth: '380px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.10)',
        textAlign: 'center'
      }}>
        <img src={LOGO_URL} alt="Hojuelas" style={{ height: 72, marginBottom: 16 }}
          onError={e => e.target.style.display = 'none'} />
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Hojuelas SFE</h1>
        <p style={{ color: 'var(--muted)', fontSize: 13, marginBottom: 28 }}>Panel de gestión</p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={pass}
            onChange={e => setPass(e.target.value)}
            required
            autoComplete="current-password"
          />
          {error && (
            <div style={{ color: 'var(--danger)', fontSize: 13, textAlign: 'center' }}>
              {error}
            </div>
          )}
          <button type="submit" className="btn btn-primary" disabled={loading}
            style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
