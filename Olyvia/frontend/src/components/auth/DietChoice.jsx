import { useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { updateProfile } from '../../services/api'
import '../onboarding/Onboarding.css'

const STATS_NUTRIENTS = [
  { value: 'energy_kcal', label: 'Calories' },
  { value: 'proteins', label: 'Protein' },
  { value: 'sugars', label: 'Sugar' },
  { value: 'sodium', label: 'Sodium' },
  { value: 'fat', label: 'Fat' },
  { value: 'saturated_fat', label: 'Saturated fat' },
  { value: 'carbs', label: 'Carbs' },
  { value: 'fiber', label: 'Fiber' },
]

const HEALTH_OPTIONS = [
  { value: 'hypertension', label: 'High blood pressure' },
  { value: 'diabetes', label: 'Diabetes / prediabetes' },
  { value: 'high_cholesterol', label: 'High cholesterol' },
  { value: 'kidney', label: 'Kidney issues' },
  { value: 'heart', label: 'Heart condition' },
  { value: 'digestive', label: 'Digestive issues (IBS)' },
  { value: 'food_allergies', label: 'Food allergies' },
  { value: 'none', label: 'None' },
]

const DIET_OPTIONS = [
  { value: 'vegetarian', label: 'Vegetarian' },
  { value: 'vegan', label: 'Vegan' },
  { value: 'keto', label: 'Keto' },
  { value: 'low_carb', label: 'Low carb' },
  { value: 'high_protein', label: 'High protein' },
  { value: 'gluten_free', label: 'Gluten-free' },
  { value: 'none', label: 'None' },
]

const DEFAULT_NUTRIENTS = ['energy_kcal', 'proteins', 'sugars', 'sodium', 'fat']

function buildConditionRules(healthConditions) {
  const rules = []
  for (const condition of healthConditions.filter((item) => item && item !== 'none')) {
    if (condition === 'hypertension' || condition === 'kidney') {
      rules.push({ condition, sodium_strictness: 'moderate' })
    } else if (condition === 'diabetes') {
      rules.push({ condition, sugar_strictness: 'moderate' })
    } else if (condition === 'high_cholesterol') {
      rules.push({ condition, saturated_fat_strictness: 'moderate' })
    } else if (condition === 'heart') {
      rules.push({ condition, sodium_strictness: 'moderate', saturated_fat_strictness: 'moderate' })
    } else if (condition === 'digestive') {
      rules.push({ condition, ultra_processed_strictness: 'moderate' })
    }
  }
  return rules
}

function toggleMany(current, value) {
  if (current.includes(value)) return current.filter((item) => item !== value)
  return [...current, value]
}

function toggleExclusive(current, value) {
  if (current.includes(value)) return current.filter((item) => item !== value)
  if (value === 'none') return ['none']
  return [...current.filter((item) => item !== 'none'), value]
}

export function DietChoice({ onDone }) {
  const { profile, refreshProfile } = useAuth()
  const [nutrients, setNutrients] = useState(
    profile?.stats_tracked_nutrients?.length ? profile.stats_tracked_nutrients : DEFAULT_NUTRIENTS,
  )
  const [conditions, setConditions] = useState(
    profile?.health_conditions?.length ? profile.health_conditions : [],
  )
  const [diets, setDiets] = useState(profile?.diet_preferences || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const save = async () => {
    if (nutrients.length === 0 || conditions.length === 0 || diets.length === 0) {
      setError('Choose at least one nutrient, one health condition, and one diet. Use None where it is listed.')
      return
    }
    setSaving(true)
    setError('')
    try {
      await updateProfile({
        stats_tracked_nutrients: nutrients,
        health_conditions: conditions,
        condition_rules: buildConditionRules(conditions),
        diet_preferences: diets,
      })
      await refreshProfile()
      onDone()
    } catch (err) {
      setError(err.message || 'Could not save these choices.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="onboarding-page">
      <div className="onboarding-box onboarding-box-scroll">
        <h2 className="onboarding-heading">Set up this demo</h2>
        <p className="onboarding-text">These choices personalize the stats and the food verdicts.</p>

        <h3 className="onboarding-heading">Stats nutrients</h3>
        <p className="onboarding-subtitle">Nutrients shown in Today snapshot</p>
        <div className="onboarding-options onboarding-options-multi">
          {STATS_NUTRIENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`onboarding-option ${nutrients.includes(option.value) ? 'selected' : ''}`}
              onClick={() => setNutrients((current) => toggleMany(current, option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>

        <h3 className="onboarding-heading">Health conditions</h3>
        <p className="onboarding-subtitle">Used to personalize food verdicts</p>
        <div className="onboarding-options onboarding-options-multi">
          {HEALTH_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`onboarding-option ${conditions.includes(option.value) ? 'selected' : ''}`}
              onClick={() => setConditions((current) => toggleExclusive(current, option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>

        <h3 className="onboarding-heading">Diet preferences</h3>
        <div className="onboarding-options onboarding-options-multi">
          {DIET_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={`onboarding-option ${diets.includes(option.value) ? 'selected' : ''}`}
              onClick={() => setDiets((current) => toggleExclusive(current, option.value))}
            >
              {option.label}
            </button>
          ))}
        </div>

        {error && <p className="onboarding-error">{error}</p>}
        <button type="button" className="onboarding-btn" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
