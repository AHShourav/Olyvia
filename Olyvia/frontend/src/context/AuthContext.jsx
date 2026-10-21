import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import { register as apiRegister, login as apiLogin, loginDemo as apiLoginDemo, logout as apiLogout, fetchMe, storeTokens, setAuthErrorHandler, fetchProfileAvatarUrl, ensureBackendReady } from '../services/api'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [avatarUrl, setAvatarUrl] = useState(null)
  const [loading, setLoading] = useState(true)
  const [pendingDietChoice, setPendingDietChoice] = useState(false)
  const avatarUrlRef = useRef(null)

  const clearSession = useCallback(() => {
    if (avatarUrlRef.current) {
      URL.revokeObjectURL(avatarUrlRef.current)
      avatarUrlRef.current = null
    }
    setAvatarUrl(null)
    setUser(null)
    setProfile(null)
  }, [])

  useEffect(() => {
    setAuthErrorHandler(clearSession)
    return () => setAuthErrorHandler(null)
  }, [clearSession])

  const loadAvatar = useCallback(async (hasAvatar) => {
    if (!hasAvatar) {
      if (avatarUrlRef.current) {
        URL.revokeObjectURL(avatarUrlRef.current)
        avatarUrlRef.current = null
      }
      setAvatarUrl(null)
      return
    }
    try {
      const url = await fetchProfileAvatarUrl()
      if (avatarUrlRef.current) URL.revokeObjectURL(avatarUrlRef.current)
      avatarUrlRef.current = url
      setAvatarUrl(url)
    } catch {
      setAvatarUrl(null)
    }
  }, [])

  const loadSession = useCallback(async () => {
    const token = localStorage.getItem('olyvia_access')
    if (!token) {
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      if (import.meta.env.VITE_API_URL) {
        await ensureBackendReady().catch(() => {})
      }
      const { user: u, profile: p } = await fetchMe()
      setUser(u)
      setProfile(p)
      loadAvatar(p?.profile_has_avatar)
    } catch {
      localStorage.removeItem('olyvia_access')
      localStorage.removeItem('olyvia_refresh')
    } finally {
      setLoading(false)
    }
  }, [loadAvatar])

  useEffect(() => {
    loadSession()
  }, [loadSession])

  const register = useCallback(async (data) => {
    const res = await apiRegister(data)
    storeTokens(res.tokens)
    setUser(res.user)
    setProfile(res.profile ?? null)
    return res
  }, [])

  const applySession = useCallback((res) => {
    storeTokens(res.tokens)
    setUser(res.user)
    setProfile(res.profile ?? null)
    loadAvatar(res.profile?.profile_has_avatar)
    return res
  }, [loadAvatar])

  const login = useCallback(async (data) => {
    return applySession(await apiLogin(data))
  }, [applySession])

  const loginDemo = useCallback(async () => {
    const res = await applySession(await apiLoginDemo())
    setPendingDietChoice(true)
    return res
  }, [applySession])

  const finishDietChoice = useCallback(() => {
    setPendingDietChoice(false)
  }, [])

  const logout = useCallback(async () => {
    await apiLogout()
    if (avatarUrlRef.current) {
      URL.revokeObjectURL(avatarUrlRef.current)
      avatarUrlRef.current = null
    }
    setAvatarUrl(null)
    setUser(null)
    setProfile(null)
    setPendingDietChoice(false)
  }, [])

  const refreshProfile = useCallback(async () => {
    const token = localStorage.getItem('olyvia_access')
    if (!token) return
    const { user: u, profile: p } = await fetchMe()
    setUser(u)
    setProfile(p)
    loadAvatar(p?.profile_has_avatar)
  }, [loadAvatar])

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        avatarUrl,
        loading,
        isAuthenticated: !!user,
        register,
        login,
        loginDemo,
        pendingDietChoice,
        finishDietChoice,
        logout,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
