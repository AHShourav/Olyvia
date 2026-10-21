import './Auth.css'

/**
 * Shown while waiting for a sleeping Render (or similar) backend to wake up.
 */
export function BackendRestartingNotice({ compact = false }) {
  return (
    <div
      className={`backend-restart-notice${compact ? ' backend-restart-notice--compact' : ''}`}
      role="status"
      aria-live="polite"
    >
      <div className="backend-restart-spinner" aria-hidden="true" />
      <p className="backend-restart-title">Backend server is restarting</p>
      <p className="backend-restart-detail">
        The app is reconnecting after idle. This can take up to a minute — please stay on this screen.
      </p>
    </div>
  )
}
