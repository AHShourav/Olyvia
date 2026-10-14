import { useState, useEffect, useCallback, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { Activity, HeartPulse, Lightbulb, Plus, TrendingUp } from 'lucide-react'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Filler,
} from 'chart.js'
import { useAuth } from '../../context/AuthContext'
import { fetchStatsDashboard, updateProfile } from '../../services/api'
import './StatsPage.css'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Filler)

const DEFAULT_TRACKED = ['energy_kcal', 'proteins', 'sugars', 'sodium', 'fat']

const ALL_NUTRIENTS = [
  { key: 'energy_kcal', label: 'Calories', unit: 'kcal', targetKey: 'energy_kcal' },
  { key: 'proteins', label: 'Protein', unit: 'g', targetKey: 'proteins' },
  { key: 'sugars', label: 'Sugar', unit: 'g', targetKey: 'sugars' },
  { key: 'sodium', label: 'Sodium', unit: 'mg', targetKey: 'sodium' },
  { key: 'fat', label: 'Fat', unit: 'g', targetKey: 'fat' },
  { key: 'saturated_fat', label: 'Saturated fat', unit: 'g', targetKey: 'saturated_fat' },
  { key: 'carbs', label: 'Carbs', unit: 'g', targetKey: 'carbs' },
  { key: 'fiber', label: 'Fiber', unit: 'g', targetKey: 'fiber' },
]

const CONDITION_LABELS = {
  hypertension: 'blood pressure',
  diabetes: 'diabetes',
  high_cholesterol: 'cholesterol',
  kidney: 'kidney health',
  heart: 'heart health',
  digestive: 'digestive health',
  food_allergies: 'food allergies',
}

const TARGETS = {
  energy_kcal: 2000,
  proteins: 50,
  sugars: 50,
  sodium: 2300,
  fat: 65,
  saturated_fat: 20,
  carbs: 260,
  fiber: 25,
}

function getValue(summary, key) {
  if (key === 'sodium') return summary?.sodium ?? summary?.sodium_mg ?? 0
  return summary?.[key] ?? 0
}

function formatAmount(n) {
  const rounded = Math.round(n)
  return rounded.toLocaleString('en-US')
}

function getNutrientStatus(ratio) {
  if (ratio <= 0.85) return { key: 'good', label: 'On track' }
  if (ratio <= 1) return { key: 'ok', label: 'Almost there' }
  return { key: 'over', label: 'Over goal' }
}

function sortTrackedByConcern(trackedItems, summary, targets) {
  return [...trackedItems].sort((a, b) => {
    const va = getValue(summary, a.key)
    const vb = getValue(summary, b.key)
    const ta = targets[a.targetKey] || TARGETS[a.targetKey] || 100
    const tb = targets[b.targetKey] || TARGETS[b.targetKey] || 100
    const ra = ta > 0 ? va / ta : 0
    const rb = tb > 0 ? vb / tb : 0
    return rb - ra
  })
}

function buildDayNutrientSummary(trackedItems, summary, targets) {
  let over = 0
  let almost = 0
  let onTrack = 0
  for (const item of trackedItems) {
    const v = getValue(summary, item.key)
    const t = targets[item.targetKey] || TARGETS[item.targetKey] || 100
    const ratio = t > 0 ? v / t : 0
    if (ratio > 1) over += 1
    else if (ratio > 0.85) almost += 1
    else onTrack += 1
  }
  if (over === 0 && almost === 0) {
    return 'Everything tracked is within your daily goals.'
  }
  if (over > 0 && almost === 0 && onTrack === 0) {
    return `All ${over} tracked nutrients are above your daily goals.`
  }
  const parts = []
  if (over > 0) parts.push(`${over} above goal`)
  if (almost > 0) parts.push(`${almost} almost at limit`)
  if (onTrack > 0) parts.push(`${onTrack} on track`)
  return parts.join(' · ')
}

function NutrientRow({ item, value, target, onRemove }) {
  const v = value ?? 0
  const t = target || TARGETS[item.targetKey] || 100
  const ratio = t > 0 ? v / t : 0
  const { key: status, label: statusLabel } = getNutrientStatus(ratio)
  const barWidth = Math.min(ratio, 1) * 100
  const unit = item.unit

  let hint
  if (ratio > 1) {
    const overBy = Math.round(v - t)
    hint = `${formatAmount(overBy)} ${unit} above your ${formatAmount(t)} ${unit} goal`
  } else {
    const left = Math.max(0, Math.round(t - v))
    hint = left > 0
      ? `${formatAmount(left)} ${unit} left for today`
      : 'At your daily goal'
  }

  return (
    <div className={`stats-nutrient-row stats-nutrient-${status}`}>
      <div className="stats-nutrient-top">
        <span className="stats-nutrient-label">{item.label}</span>
        <div className="stats-nutrient-top-actions">
          <span className={`stats-nutrient-pill stats-nutrient-pill-${status}`}>{statusLabel}</span>
          {onRemove && (
            <button
              type="button"
              className="stats-nutrient-remove"
              onClick={() => onRemove(item.key)}
              aria-label={`Stop tracking ${item.label}`}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <p className="stats-nutrient-amount">
        <span className="stats-nutrient-eaten">{formatAmount(v)}</span>
        <span className="stats-nutrient-unit"> {unit}</span>
        <span className="stats-nutrient-goal-ref"> · goal {formatAmount(t)} {unit}</span>
      </p>
      <div
        className="stats-nutrient-track"
        role="progressbar"
        aria-valuenow={Math.round(v)}
        aria-valuemin={0}
        aria-valuemax={Math.round(t)}
        aria-label={`${item.label}: ${hint}`}
      >
        <div className="stats-nutrient-fill" style={{ width: `${barWidth}%` }} />
        {ratio > 1 && <div className="stats-nutrient-over-marker" aria-hidden />}
      </div>
      <p className="stats-nutrient-hint">{hint}</p>
    </div>
  )
}

export function StatsPage() {
  const { profile, refreshProfile, isAuthenticated } = useAuth()
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [showNutrientPicker, setShowNutrientPicker] = useState(false)

  const tracked = (profile?.stats_tracked_nutrients || []).length
    ? profile.stats_tracked_nutrients
    : DEFAULT_TRACKED

  const load = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const res = await fetchStatsDashboard()
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated])

  useEffect(() => {
    load()
  }, [load])

  const todayLabel = useMemo(
    () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    [],
  )

  const addNutrient = (key) => {
    if (tracked.includes(key)) return
    const next = [...tracked.filter((k) => k !== 'none'), key]
    updateProfile({ stats_tracked_nutrients: next }).then(() => refreshProfile())
    setShowNutrientPicker(false)
  }

  const removeNutrient = (key) => {
    const next = tracked.filter((k) => k !== key)
    if (next.length < 1) return
    updateProfile({ stats_tracked_nutrients: next }).then(() => refreshProfile())
  }

  const getMicroFeedback = () => {
    const s = data?.today_summary || {}
    const t = data?.targets || TARGETS
    const checks = []
    const sodium = getValue(s, 'sodium')
    const sugar = getValue(s, 'sugars')
    const sodiumTarget = t.sodium || 2300
    const sugarTarget = t.sugars || 50
    if (sodium > 0 && sodium <= sodiumTarget * 1.05) checks.push('sodium')
    if (sodium > sodiumTarget * 1.05) checks.push('sodium_high')
    if (sugar > 0 && sugar <= sugarTarget * 1.05) checks.push('sugar')
    if (sugar > sugarTarget * 1.05) checks.push('sugar_high')
    if (checks.includes('sodium_high')) return 'Sodium is approaching your limit.'
    if (checks.includes('sugar_high')) return 'Sugar is approaching your limit.'
    if (checks.includes('sodium')) return "You're within your sodium range today."
    if (checks.includes('sugar')) return "You're within your sugar range today."
    return "You're on track today."
  }

  if (loading) {
    return (
      <div className="stats-page">
        <header className="stats-header">
          <h1 className="stats-title">Stats</h1>
          <p className="stats-date">{todayLabel}</p>
        </header>
        <div className="stats-loading-wrap">
          <p className="stats-loading">Loading your dashboard…</p>
          <div className="stats-skeleton" aria-hidden>
            <div className="stats-skeleton-bar" />
            <div className="stats-skeleton-bar" />
            <div className="stats-skeleton-bar" />
          </div>
        </div>
      </div>
    )
  }

  const summary = data?.today_summary || {}
  const targets = data?.targets || TARGETS
  const healthRisk = data?.health_risk || {}
  const trend = data?.trend || { dates: [], energy_kcal: [], sugars: [], sodium: [] }
  const insights = data?.insights || []

  const trackedItems = tracked
    .filter((k) => k && k !== 'none')
    .map((k) => ALL_NUTRIENTS.find((n) => n.key === k))
    .filter(Boolean)

  const chartData = {
    labels: (trend.dates || []).map((d) => {
      const dt = new Date(d)
      return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    }),
    datasets: [
      {
        label: 'Calories (kcal)',
        data: trend.energy_kcal || [],
        borderColor: 'rgba(10, 132, 255, 0.85)',
        backgroundColor: 'rgba(10, 132, 255, 0.08)',
        fill: true,
        tension: 0.3,
      },
      {
        label: 'Sugar (g)',
        data: trend.sugars || [],
        borderColor: 'rgba(245, 158, 11, 0.8)',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        fill: true,
        tension: 0.3,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: 'top',
        align: 'start',
        labels: {
          font: { size: 12, family: '-apple-system, BlinkMacSystemFont, system-ui, sans-serif' },
          boxWidth: 10,
          boxHeight: 10,
          usePointStyle: true,
          padding: 14,
          color: '#374151',
        },
      },
      tooltip: {
        titleFont: { size: 13 },
        bodyFont: { size: 12 },
        padding: 10,
        cornerRadius: 10,
      },
    },
    scales: {
      x: {
        grid: { display: false },
        border: { display: false },
        ticks: { font: { size: 11 }, maxRotation: 0, color: '#9ca3af' },
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)' },
        border: { display: false },
        ticks: { font: { size: 11 }, color: '#9ca3af', maxTicksLimit: 5 },
      },
    },
  }

  const riskLabel =
    healthRisk.level === 'low'
      ? 'Stable'
      : healthRisk.level === 'moderate'
        ? 'Moderate impact'
        : 'Elevated impact'

  const conditionImpacts = healthRisk.condition_impacts || []
  const topContributors = healthRisk.top_contributors || []
  const nextAction = healthRisk.next_action
  const conditionsAffected = conditionImpacts.length

  const sortedTracked = sortTrackedByConcern(trackedItems, summary, targets)
  const nutrientDaySummary = buildDayNutrientSummary(trackedItems, summary, targets)

  return (
    <div className="stats-page">
      <header className="stats-header">
        <h1 className="stats-title">Stats</h1>
        <p className="stats-date">{todayLabel}</p>
      </header>

      <section className="stats-card">
        <div className="stats-card-head">
          <h2 className="stats-section-title">
            <Activity size={18} strokeWidth={2} className="stats-section-icon" aria-hidden />
            Today&apos;s intake
          </h2>
        </div>
        <p className="stats-nutrient-intro">{nutrientDaySummary}</p>
        <div className="stats-nutrient-list">
          {sortedTracked.map((item) => (
            <NutrientRow
              key={item.key}
              item={item}
              value={getValue(summary, item.key)}
              target={targets[item.targetKey]}
              onRemove={trackedItems.length > 1 ? removeNutrient : null}
            />
          ))}
        </div>
        <button type="button" className="stats-add-nutrient" onClick={() => setShowNutrientPicker(true)}>
          <Plus size={18} strokeWidth={2} aria-hidden />
          Add nutrient
        </button>
        <p className="stats-feedback">{getMicroFeedback()}</p>
      </section>

      {showNutrientPicker && (
        <div className="stats-picker-overlay" onClick={() => setShowNutrientPicker(false)}>
          <div className="stats-picker-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="stats-picker-title">Add nutrient to track</h3>
            <div className="stats-picker-options">
              {ALL_NUTRIENTS.filter((n) => !tracked.includes(n.key)).map((n) => (
                <button
                  key={n.key}
                  type="button"
                  className="stats-picker-option"
                  onClick={() => addNutrient(n.key)}
                >
                  {n.label}
                </button>
              ))}
            </div>
            <button type="button" className="stats-picker-close" onClick={() => setShowNutrientPicker(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}

      {trend.dates?.length > 0 && (
        <section className="stats-card">
          <div className="stats-card-head">
            <h2 className="stats-section-title">
              <TrendingUp size={18} strokeWidth={2} className="stats-section-icon" aria-hidden />
              Last 7 days
            </h2>
          </div>
          <div className="stats-chart-wrap">
            <Line data={chartData} options={chartOptions} />
          </div>
          {trend.sugars?.length >= 6 && (() => {
            const thisWeek = trend.sugars.slice(-3).reduce((a, b) => a + b, 0) / 3
            const lastWeek = trend.sugars.slice(0, 3).reduce((a, b) => a + b, 0) / 3
            const pct = lastWeek > 0 ? Math.round((1 - thisWeek / lastWeek) * 100) : 0
            if (Math.abs(pct) >= 5) {
              return (
                <p className="stats-trend-note">
                  Sugar intake {pct > 0 ? 'decreased' : 'increased'} {Math.abs(pct)}% compared to last week.
                </p>
              )
            }
            return null
          })()}
        </section>
      )}

      <section className="stats-card">
        <div className="stats-card-head">
          <h2 className="stats-section-title">
            <HeartPulse size={18} strokeWidth={2} className="stats-section-icon" aria-hidden />
            Health impact
          </h2>
        </div>
        {profile?.health_conditions?.filter((c) => c && c !== 'none').length > 0 && (
          <p className="stats-impact-subtitle-top">
            Based on your{' '}
            {profile.health_conditions
              .filter((c) => c && c !== 'none')
              .slice(0, 2)
              .map((c) => CONDITION_LABELS[c] || c)
              .join(' and ')}{' '}
            profile
          </p>
        )}
        <div className={`stats-impact-card stats-impact-${healthRisk.level || 'low'}`}>
          <div className="stats-impact-header">
            <span className={`stats-impact-badge stats-impact-badge-${healthRisk.level || 'low'}`}>
              {riskLabel}
            </span>
            {conditionsAffected > 0 && (
              <span className="stats-impact-subtitle">
                {conditionsAffected} condition{conditionsAffected !== 1 ? 's' : ''} affected today
              </span>
            )}
          </div>

          {healthRisk.level === 'low' ? (
            <p className="stats-impact-summary">
              {healthRisk.message || 'All logged foods fit your health rules today.'}
            </p>
          ) : (
            <>
              <p className="stats-impact-summary">
                Today&apos;s intake may increase risk for some of your tracked conditions.
              </p>

              {conditionImpacts.length > 0 && (
                <>
                  <div className="stats-impact-divider" />
                  <div className="stats-impact-conditions">
                    {conditionImpacts.map((imp, i) => (
                      <div key={i} className="stats-impact-condition-card">
                        <div className="stats-impact-condition-row">
                          <span className="stats-impact-condition">{imp.condition_label}</span>
                          <span className={`stats-impact-chip stats-impact-chip-${imp.severity}`}>
                            {imp.severity === 'high' ? 'High' : imp.severity === 'watch' ? 'Watch' : 'Moderate'}
                          </span>
                        </div>
                        <p className="stats-impact-cause">{imp.chip || imp.cause}</p>
                      </div>
                    ))}
                  </div>
                </>
              )}

              {topContributors.length > 0 && (
                <>
                  <div className="stats-impact-divider" />
                  <p className="stats-impact-block-label">Main drivers</p>
                  <p className="stats-impact-contributors-list">
                    {topContributors.slice(0, 5).join(', ')}
                  </p>
                </>
              )}

              {nextAction && (
                <>
                  <div className="stats-impact-divider" />
                  <p className="stats-impact-block-label">Next best step</p>
                  <p className="stats-impact-action-text">{nextAction}</p>
                </>
              )}
            </>
          )}
        </div>
      </section>

      {insights.length > 0 && (
        <section className="stats-card">
          <div className="stats-card-head">
            <h2 className="stats-section-title">
              <Lightbulb size={18} strokeWidth={2} className="stats-section-icon" aria-hidden />
              Insights
            </h2>
          </div>
          <div className="stats-insights">
            {insights.map((line, i) => (
              <p key={i} className="stats-insight-item">
                <span className="stats-insight-bullet" aria-hidden />
                {line}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
