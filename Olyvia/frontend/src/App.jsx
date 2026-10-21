import { useState } from 'react'
import { AuthProvider, useAuth } from './context/AuthContext'
import { Login } from './components/auth/Login'
import { Signup } from './components/auth/Signup'
import { BackendRestartingNotice } from './components/auth/BackendRestartingNotice'
import { Onboarding } from './components/onboarding/Onboarding'
import { DietChoice } from './components/auth/DietChoice'
import { isRemoteApi } from './services/api'
import MainApp from './MainApp'

function AppContent() {
  const { user, profile, loading, pendingDietChoice, finishDietChoice } = useAuth()
  const [authScreen, setAuthScreen] = useState('login')

  if (loading) {
    return (
      <div className="auth-page">
        <div className="auth-box">
          {isRemoteApi ? (
            <BackendRestartingNotice />
          ) : (
            <p className="auth-subtitle">Loading…</p>
          )}
        </div>
      </div>
    )
  }

  if (!user) {
    if (authScreen === 'signup') {
      return (
        <Signup
          onSignupSuccess={() => {}}
          onSwitchToLogin={() => setAuthScreen('login')}
        />
      )
    }
    return (
      <Login
        onLoginSuccess={() => {}}
        onSwitchToSignup={() => setAuthScreen('signup')}
      />
    )
  }

  const onboardingComplete = profile?.onboarding_completed === true
  if (!onboardingComplete) {
    return <Onboarding onComplete={() => {}} />
  }

  if (pendingDietChoice) {
    return <DietChoice onDone={finishDietChoice} />
  }

  return <MainApp />
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}
