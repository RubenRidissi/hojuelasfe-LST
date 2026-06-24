import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [rol, setRol] = useState(null)
  const [nombre, setNombre] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadUserRole(session.user.id)
      } else {
        setLoading(false)
      }
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) {
        loadUserRole(session.user.id)
      } else {
        setUser(null)
        setRol(null)
        setNombre(null)
        setLoading(false)
      }
    })

    return () => subscription.unsubscribe()
  }, [])

  async function loadUserRole(userId) {
    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('rol, nombre')
        .eq('user_id', userId)

      if (error) throw error

      if (data && data.length > 0) {
        setUser(userId)
        setRol(data[0].rol)
        setNombre(data[0].nombre)
      } else {
        // Sin registro en user_roles — rol por defecto
        setUser(userId)
        setRol('vendedor')
        setNombre('Usuario')
      }
    } catch (e) {
      console.error('Error cargando rol:', e)
      setUser(userId)
      setRol('vendedor')
      setNombre('Usuario')
    } finally {
      setLoading(false)
    }
  }

  async function login(email, password) {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
  }

  async function logout() {
    await supabase.auth.signOut()
  }

  const isAdmin = rol === 'admin'

  return (
    <AuthContext.Provider value={{ user, rol, nombre, isAdmin, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
