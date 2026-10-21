import { useEffect, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { ensureBackendReady, isRemoteApi } from '../../services/api'
import { BackendRestartingNotice } from './BackendRestartingNotice'
import './Auth.css'

export function Signup({ onSignupSuccess, onSwitchToLogin }) {
  const { register } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [wakingServer, setWakingServer] = useState(false)
  const [error, setError] = useState('')

  const connecting = loading || wakingServer

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email || !password || !confirmPassword) {
      setError('All fields are required.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setLoading(true)
    try {
      if (isRemoteApi) {
        setWakingServer(true)
        await ensureBackendReady()
      }
      await register({ email, password, password_confirm: confirmPassword })
      onSignupSuccess?.()
    } catch (err) {
      setError(err.message || 'Sign up failed.')
    } finally {
      setWakingServer(false)
      setLoading(false)
    }
  }

  return (
    <div className="auth-page">
      <div className="auth-box">
        <h1 className="auth-title">Olyvia</h1>
        <p className="auth-subtitle">Create an account</p>

        {isRemoteApi && connecting && <BackendRestartingNotice compact />}

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
            autoComplete="new-password"
            disabled={connecting}
          />
          <p className="auth-hint">At least 8 characters. Not a common password, and not only numbers.</p>
          <input
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className="auth-input"
            autoComplete="new-password"
            disabled={connecting}
          />

          {error && <p className="auth-error">{error}</p>}

          <button type="submit" className="auth-btn" disabled={connecting}>
            {connecting && isRemoteApi ? 'Connecting to server…' : connecting ? 'Creating…' : 'Create account'}
          </button>
        </form>

        <p className="auth-switch">
          Already have an account?{' '}
          <button type="button" className="auth-link" onClick={onSwitchToLogin} disabled={connecting}>
            Log in
          </button>
        </p>
      </div>
    </div>
  )
}
