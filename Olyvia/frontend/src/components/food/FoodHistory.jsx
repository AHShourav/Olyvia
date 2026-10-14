import { useState, useEffect, useCallback } from 'react'
import { Trash2, UtensilsCrossed } from 'lucide-react'
import { clearFoodLogs, fetchFoodLog } from '../../services/api'
import { CalendarSection, formatDateLabel } from './CalendarSection'
import './FoodHistory.css'

function FoodImage({ imageUrl }) {
  const [failed, setFailed] = useState(false)
  const showPlaceholder = !imageUrl || failed

  if (showPlaceholder) {
    return (
      <div className="food-history-placeholder">
        <UtensilsCrossed size={24} strokeWidth={1.5} />
      </div>
    )
  }
  return (
    <img
      src={imageUrl}
      alt=""
      className="food-history-img"
      onError={() => setFailed(true)}
    />
  )
}

function formatNutrients(nutrients) {
  if (!nutrients) return ''
  const parts = []
  const kcal = nutrients.energy_kcal
  if (kcal != null) parts.push(`${Math.round(kcal)} kcal`)
  const p = nutrients.proteins
  if (p != null) parts.push(`${Math.round(p)}g protein`)
  const s = nutrients.sugars
  if (s != null) parts.push(`${Math.round(s)}g sugar`)
  const na = nutrients.sodium_mg
  if (na != null) parts.push(`${Math.round(na)}mg sodium`)
  const f = nutrients.fat
  if (f != null) parts.push(`${Math.round(f)}g fat`)
  return parts.slice(0, 4).join(' · ')
}

function formatTime(iso) {
  try {
    const d = new Date(iso)
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  } catch {
    return ''
  }
}

function groupByDate(items) {
  const groups = {}
  for (const item of items) {
    const d = item.logged_at?.slice(0, 10) || ''
    if (!groups[d]) groups[d] = []
    groups[d].push(item)
  }
  return Object.entries(groups).sort((a, b) => b[0].localeCompare(a[0]))
}

export function FoodHistory({ isAuthenticated, refreshTrigger, selectedDate, onDateChange, onItemClick, onLogCleared }) {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [clearing, setClearing] = useState(false)
  const [clearError, setClearError] = useState('')

  const load = useCallback(async () => {
    if (!isAuthenticated) return
    try {
      const { items: data } = await fetchFoodLog(100, selectedDate)
      setItems(data || [])
    } catch {
      setItems([])
    } finally {
      setLoading(false)
    }
  }, [isAuthenticated, refreshTrigger, selectedDate])

  useEffect(() => {
    setLoading(true)
    load()
  }, [load])

  const handleClearConfirm = async () => {
    if (clearing) return
    setClearing(true)
    setClearError('')
    try {
      await clearFoodLogs(selectedDate)
      setItems([])
      setShowClearConfirm(false)
      onLogCleared?.()
    } catch (err) {
      setClearError(err.message || 'Could not clear food log')
    } finally {
      setClearing(false)
    }
  }

  if (!isAuthenticated) return null

  const groups = groupByDate(items)
  const dateLabel = formatDateLabel(selectedDate)

  return (
    <section className="food-history">
      <CalendarSection selectedDate={selectedDate} onDateChange={onDateChange} />

      <div className="food-history-toolbar">
        <div className="food-history-toolbar-text">
          <h2 className="food-history-heading">Logged food</h2>
          {!loading && items.length > 0 && (
            <p className="food-history-count">
              {items.length} item{items.length !== 1 ? 's' : ''} · {dateLabel}
            </p>
          )}
        </div>
        {!loading && items.length > 0 && (
          <button
            type="button"
            className="food-history-clear"
            onClick={() => {
              setClearError('')
              setShowClearConfirm(true)
            }}
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden />
            Clear list
          </button>
        )}
      </div>

      {loading ? (
        <p className="food-history-loading">Loading…</p>
      ) : items.length === 0 ? (
        <p className="food-history-empty">No logged food for this date.</p>
      ) : (
        groups.map(([date, dateItems]) => (
          <div key={date} className="food-history-group">
            <h3 className="food-history-date-label">{formatDateLabel(date)}</h3>
            <ul className="food-history-list">
              {dateItems.map((item) => (
                <li
                  key={item.id}
                  className="food-history-card"
                  onClick={() => onItemClick?.(item)}
                  role={onItemClick ? 'button' : undefined}
                  tabIndex={onItemClick ? 0 : undefined}
                  onKeyDown={(e) => onItemClick && (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onItemClick(item))}
                >
                  <div className="food-history-img-wrap">
                    <FoodImage imageUrl={item.image_url} />
                  </div>
                  <div className="food-history-body">
                    <span className="food-history-name">{item.food_name}</span>
                    <span className="food-history-nutrients">{formatNutrients(item.nutrients)}</span>
                    <span className="food-history-time">{formatTime(item.logged_at)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}

      {showClearConfirm && (
        <div className="food-history-clear-overlay" onClick={() => !clearing && setShowClearConfirm(false)}>
          <div className="food-history-clear-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="clear-food-title">
            <h3 id="clear-food-title" className="food-history-clear-title">Clear logged food?</h3>
            <p className="food-history-clear-desc">
              Remove all {items.length} item{items.length !== 1 ? 's' : ''} for <strong>{dateLabel}</strong>.
              This cannot be undone.
            </p>
            {clearError && <p className="food-history-clear-error">{clearError}</p>}
            <div className="food-history-clear-actions">
              <button
                type="button"
                className="food-history-clear-cancel"
                onClick={() => setShowClearConfirm(false)}
                disabled={clearing}
              >
                Cancel
              </button>
              <button
                type="button"
                className="food-history-clear-confirm"
                onClick={handleClearConfirm}
                disabled={clearing}
              >
                {clearing ? 'Clearing…' : 'Clear list'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
