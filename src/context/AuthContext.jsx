import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../services/supabase'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)       // userId de Supabase
  const [rol, setRol] = useState(null)         // 'admin' | 'vendedor'
  const [nombre, setNombre] = useState(null)   // nombre para mostrar
  const [loading, setLoading] = useState(true) // cargando sesión inicial

  useEffect(() => {
    // Verificar sesión existente al cargar
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        loadUserRole(session.user.id)
      } else {
        setLoading(false)
      }
    })

    // Escuchar cambios de auth
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
        .from('usuarios')
        .select('rol, nombre')
        .eq('user_id', userId)
        .single()

      if (error || !data) throw error || new Error('Usuario no encontrado')

      setUser(userId)
      setRol(data.rol)
      setNombre(data.nombre)
    } catch (e) {
      console.error('Error cargando rol:', e)
      await supabase.auth.signOut()
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
