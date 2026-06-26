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
    <div className="login-rc-page">
      <section className="login-rc-brand">
        <div className="login-rc-brand-inner">
          <img
            src={LOGO_URL}
            alt="Hojuelas"
            className="login-rc-brand-logo"
            onError={e => e.target.style.display = 'none'}
          />
          <h1>Descubrí el Sabor del Maná</h1>
          <p>Llevamos calidad, todos los días.</p>
          <span>Dios es Amor</span>
        </div>
      </section>

      <section className="login-rc-form-panel">
        <div className="login-rc-card">
          <img
            src={LOGO_URL}
            alt="Hojuelas"
            className="login-rc-card-logo"
            onError={e => e.target.style.display = 'none'}
          />

          <h2>Bienvenido</h2>
          <p className="login-rc-subtitle">Iniciá sesión para continuar</p>

          <form onSubmit={handleLogin} className="login-rc-form">
            <input
              type="email"
              placeholder="Usuario o email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="login-rc-input"
            />

            <input
              type="password"
              placeholder="Contraseña"
              value={pass}
              onChange={e => setPass(e.target.value)}
              required
              autoComplete="current-password"
              className="login-rc-input"
            />

            {error && <div className="login-rc-error">{error}</div>}

            <button type="submit" className="login-rc-submit" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          <div className="login-rc-secure">
            Accedé de forma segura a tu cuenta
          </div>
        </div>
      </section>
    </div>
  )
}
