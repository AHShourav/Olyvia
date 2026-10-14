export function GeminiSparkIcon({ className = 'gemini-spark-icon' }) {
  return (
    <svg className={className} viewBox="0 0 28 28" aria-hidden>
      <defs>
        <linearGradient id="olyviaGeminiGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#4285F4" />
          <stop offset="32%" stopColor="#9B72CB" />
          <stop offset="58%" stopColor="#D96570" />
          <stop offset="100%" stopColor="#F4B400" />
        </linearGradient>
      </defs>
      <path
        fill="url(#olyviaGeminiGrad)"
        d="M14 2.5l2.2 6.8h7.1l-5.75 4.2 2.2 6.8L14 16.1l-5.75 4.2 2.2-6.8-5.75-4.2h7.1L14 2.5z"
      />
    </svg>
  )
}
