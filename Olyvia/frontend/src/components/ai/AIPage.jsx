import { useEffect, useRef, useState } from 'react'
import { MessageCircle, Send } from 'lucide-react'
import { sendCoachMessage } from '../../services/api'
import { GeminiSparkIcon } from './GeminiSparkIcon'
import './AIPage.css'

const STARTERS = [
  'How is my sugar today?',
  'What should I watch next?',
  'Explain my biggest risk',
]

export function AIPage() {
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const threadRef = useRef(null)

  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  const send = async (text) => {
    const content = text.trim()
    if (!content || sending) return
    const next = [...messages, { role: 'user', content }]
    setMessages(next)
    setDraft('')
    setError('')
    setSending(true)
    try {
      const data = await sendCoachMessage(next)
      setMessages([...next, { role: 'assistant', content: data.reply }])
    } catch (err) {
      setError(err.message || 'Could not get a reply.')
    } finally {
      setSending(false)
    }
  }

  const showEmpty = messages.length === 0 && !sending

  return (
    <div className="ai-page">
      <div className="ai-page-bg" aria-hidden>
        <span className="ai-page-blob ai-page-blob-a" />
        <span className="ai-page-blob ai-page-blob-b" />
      </div>

      <div className="ai-hero-wrap">
        <div className="ai-hero-card">
          <div className="ai-hero-surface">
            <div className="ai-hero-brand">
              <div className="ai-hero-icon">
                <GeminiSparkIcon className="ai-hero-star" />
              </div>
              <div>
                <p className="ai-hero-eyebrow">Powered by Gemini</p>
                <h1 className="ai-hero-title">AI coach</h1>
              </div>
            </div>
            <p className="ai-hero-desc">
              Ask about today&apos;s intake, your goals, and health rules. Answers use your profile and logged meals.
            </p>
          </div>
        </div>
      </div>

      <div className="ai-thread" ref={threadRef}>
        {showEmpty && (
          <div className="ai-welcome">
            <p className="ai-welcome-label">Try asking</p>
            <ul className="ai-starter-list">
              {STARTERS.map((prompt) => (
                <li key={prompt}>
                  <button type="button" className="ai-starter-card" onClick={() => send(prompt)}>
                    <MessageCircle size={18} strokeWidth={2} className="ai-starter-icon" aria-hidden />
                    <span>{prompt}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {messages.map((message, index) => (
          <div
            key={`${message.role}-${index}`}
            className={`ai-message ai-message-${message.role}`}
          >
            {message.role === 'assistant' && (
              <div className="ai-message-gemini-badge" aria-hidden>
                <GeminiSparkIcon className="ai-message-star" />
              </div>
            )}
            <div className={`ai-bubble ai-bubble-${message.role}`}>
              {message.content}
            </div>
          </div>
        ))}

        {sending && (
          <div className="ai-message ai-message-assistant">
            <div className="ai-message-gemini-badge" aria-hidden>
              <GeminiSparkIcon className="ai-message-star" />
            </div>
            <div className="ai-bubble ai-bubble-assistant ai-bubble-thinking">
              <span className="ai-thinking-bar" />
              <span className="ai-thinking-bar ai-thinking-bar-mid" />
              <span className="ai-thinking-label">Gemini is thinking…</span>
            </div>
          </div>
        )}
      </div>

      {error && <p className="ai-error">{error}</p>}

      <form
        className="ai-composer-wrap"
        onSubmit={(e) => {
          e.preventDefault()
          send(draft)
        }}
      >
        <div className="ai-composer">
          <input
            className="ai-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask about your meals…"
            disabled={sending}
            aria-label="Message"
          />
          <button className="ai-send" type="submit" disabled={sending || !draft.trim()} aria-label="Send">
            <Send size={18} strokeWidth={2} />
          </button>
        </div>
      </form>
    </div>
  )
}
