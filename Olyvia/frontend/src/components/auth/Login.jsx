import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ensureBackendReady, isRemoteApi } from '../../services/api'
import { BackendRestartingNotice } from './BackendRestartingNotice'
import './Auth.css'

export function Login({ onLoginSuccess, onSwitchToSignup }) {
  const { login, loginDemo } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [wakingServer, setWakingServer] = useState(false)

  const connecting = loading || wakingServer
  const showRestartNotice = isRemoteApi && connecting

  useEffect(() => {
    if (!isRemoteApi) return
    let cancelled = false
    setWakingServer(true)
    ensureBackendReady()
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setWakingServer(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const handleDemo = async () => {
    setError('')
    setLoading(true)
    try {
      if (isRemoteApi) {
        setWakingServer(true)
        await ensureBackendReady()
      }
      await loginDemo()
      onLoginSuccess?.()
    } catch (err) {
      setError(err.message || 'Could not open the demo.')
    } finally {
      setWakingServer(false)
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password) {
      setError('Email and password are required.')
      return
    }

    setLoading(true)
    try {
      if (isRemoteApi) {
        setWakingServer(true)
        await ensureBackendReady()
      }
      await login({ email, password })
      onLoginSuccess?.()
    } catch (err) {
      setError(err.message || 'Log in failed.')
    } finally {
      setWakingServer(false)
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1 className="auth-title">Olyvia</h1>
        <p className="auth-subtitle">See a sample day of meals, then try voice, camera, or search.</p>

        {showRestartNotice && <BackendRestartingNotice compact />}

        <button type="button" className="auth-btn" onClick={handleDemo} disabled={connecting}>
          {connecting && isRemoteApi ? 'Connecting to server…' : connecting ? 'Opening demo…' : 'Try the demo'}
        </button>
        <p className="auth-hint">No account needed. Camera and voice stay available inside.</p>

        <p className="auth-divider">or sign in</p>

        <form className="auth-form" onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="auth-input"
            autoComplete="email"
            disabled={connecting}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="auth-input"
            autoComplete="current-password"
            disabled={connecting}
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-btn" disabled={connecting}>
            {connecting && isRemoteApi ? 'Connecting to server…' : connecting ? 'Signing in…' : 'Log in'}
          </button>
        </form>

        <p className="auth-switch">
          Don&apos;t have an account?{' '}
          <button type="button" className="auth-link" onClick={onSwitchToSignup} disabled={connecting}>
            Sign up
          </button>
        </p>
      </div>
    </div>
  )
}
