const API_BASE = import.meta.env.VITE_API_URL || ''
/** True when the UI talks to a deployed API (e.g. Render), not the Vite dev proxy. */
export const isRemoteApi = Boolean(API_BASE)
const FETCH_TIMEOUT_MS = 45000
/** Render free tier cold starts often exceed 15s; allow time for wake + login. */
const AUTH_TIMEOUT_MS = 90000
const COLD_START_RETRIES = 2

let authErrorHandler = null
export function setAuthErrorHandler(fn) {
  authErrorHandler = fn
}

function isRetryableNetworkError(err) {
  if (!err) return false
  if (err.name === 'AbortError') return true
  const msg = String(err.message || '').toLowerCase()
  if (msg.includes('abort')) return true
  if (err.name === 'TypeError' && msg.includes('fetch')) return true
  return false
}

function toFetchError(err) {
  if (err?.name === 'AbortError' || String(err?.message || '').toLowerCase().includes('abort')) {
    return new Error(
      'The server took too long to respond. On Render it may be waking up — wait a moment and try again.',
    )
  }
  if (err?.name === 'TypeError' && String(err?.message || '').includes('fetch')) {
    return new Error('Could not reach the server. It may still be starting — try again in a few seconds.')
  }
  return err
}

async function fetchWithTimeout(url, options, timeout = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController()
  const id = setTimeout(() => ctrl.abort(), timeout)
  try {
    const res = await fetch(url, { ...options, signal: ctrl.signal })
    return res
  } catch (err) {
    throw toFetchError(err)
  } finally {
    clearTimeout(id)
  }
}

async function fetchWithColdStartRetry(url, options, timeout = AUTH_TIMEOUT_MS) {
  let lastErr
  for (let attempt = 0; attempt <= COLD_START_RETRIES; attempt++) {
    try {
      return await fetchWithTimeout(url, options, timeout)
    } catch (err) {
      lastErr = err
      if (attempt < COLD_START_RETRIES && isRetryableNetworkError(err)) {
        await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        continue
      }
      throw err
    }
  }
  throw lastErr
}

/** Ping backend (e.g. before login) so Render can spin up while the user waits. */
export async function ensureBackendReady() {
  if (!API_BASE) return
  await fetchWithColdStartRetry(`${API_BASE}/api/health/`, { method: 'GET' }, AUTH_TIMEOUT_MS)
}

async function tryRefreshToken() {
  const refresh = localStorage.getItem('olyvia_refresh')
  if (!refresh) return false
  try {
    const res = await fetchWithColdStartRetry(`${API_BASE}/api/auth/token/refresh/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh }),
    })
    if (!res.ok) return false
    const data = await res.json()
    if (data.access) {
      localStorage.setItem('olyvia_access', data.access)
      if (data.refresh) localStorage.setItem('olyvia_refresh', data.refresh)
      return true
    }
  } catch (_) {}
  return false
}

function clearTokens() {
  localStorage.removeItem('olyvia_access')
  localStorage.removeItem('olyvia_refresh')
}

async function fetchWithAuth(url, options, timeout) {
  const ms = timeout ?? AUTH_TIMEOUT_MS
  const headers = { ...getAuthHeaders(), ...options.headers }
  let res = await fetchWithColdStartRetry(url, { ...options, headers }, ms)
  if (res.status !== 401) return res
  const refreshed = await tryRefreshToken()
  if (!refreshed) {
    clearTokens()
    authErrorHandler?.()
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || 'Session expired. Please log in again.')
  }
  const canRetry = !options.body || typeof options.body === 'string'
  if (canRetry) {
    const retryHeaders = { ...getAuthHeaders(), ...options.headers }
    res = await fetchWithColdStartRetry(url, { ...options, headers: retryHeaders }, ms)
  } else {
    throw new Error('Session expired. Please try again.')
  }
  return res
}

/**
 * Send transcript to voice pipeline. Returns { transcript, foods, nutrition }.
 */
export async function analyzeVoiceText(text) {
  const res = await fetchWithAuth(`${API_BASE}/api/voice-analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Analyze food image. Accepts File or Blob. Returns { labels, nutrition }.
 */
export async function analyzeImage(imageFile) {
  const form = new FormData()
  form.append('image', imageFile)
  const res = await fetchWithAuth(`${API_BASE}/api/analyze-image`, {
    method: 'POST',
    headers: {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Look up product by barcode. Returns Product (fat, salt, sugars, etc.).
 */
export async function scanBarcode(barcode) {
  const res = await fetchWithAuth(`${API_BASE}/api/scan-barcode`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ barcode: String(barcode).trim() }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

function getAuthHeaders() {
  const token = localStorage.getItem('olyvia_access')
  return token ? { Authorization: `Bearer ${token}` } : {}
}

export async function register({ email, password, password_confirm, full_name = '' }) {
  const res = await fetchWithColdStartRetry(`${API_BASE}/api/auth/register/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password, password_confirm, full_name: full_name.trim() }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = err.email?.[0] || err.password?.[0] || err.password_confirm?.[0] || err.detail || res.statusText
    throw new Error(typeof msg === 'string' ? msg : JSON.stringify(msg))
  }
  return res.json()
}

export async function loginDemo() {
  const res = await fetchWithColdStartRetry(`${API_BASE}/api/auth/demo/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function login({ email, password }) {
  const res = await fetchWithColdStartRetry(`${API_BASE}/api/auth/login/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function logout() {
  const refresh = localStorage.getItem('olyvia_refresh')
  if (refresh) {
    try {
      await fetch(`${API_BASE}/api/auth/logout/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ refresh }),
      })
    } catch (_) {}
  }
  localStorage.removeItem('olyvia_access')
  localStorage.removeItem('olyvia_refresh')
}

/**
 * Fetch aggregated nutrition from FoodLog for today (or ?date=YYYY-MM-DD).
 * Returns { fats, sodium, sugars, carbs }. Requires auth.
 */
export async function fetchNutritionSummary(dateStr = null) {
  const url = dateStr
    ? `${API_BASE}/api/auth/nutrition-summary/?date=${dateStr}`
    : `${API_BASE}/api/auth/nutrition-summary/`
  const res = await fetchWithAuth(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fetch food log history. Returns { items: [{ id, food_name, source, logged_at, image_url, nutrients }] }.
 */
export async function fetchFoodLog(limit = 50, dateStr = null) {
  let url = `${API_BASE}/api/auth/food-log/?limit=${limit}`
  if (dateStr) url += `&date=${dateStr}`
  const res = await fetchWithAuth(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/** Delete food logs. Pass dateStr (YYYY-MM-DD) to clear only that day; omit to clear all. */
export async function clearFoodLogs(dateStr = null) {
  let url = `${API_BASE}/api/auth/food-log/`
  if (dateStr) url += `?date=${dateStr}`
  const res = await fetchWithAuth(url, { method: 'DELETE' }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fetch full stats dashboard: today summary, health risk, trends, insights.
 */
export async function fetchStatsDashboard(dateStr = null) {
  const url = dateStr
    ? `${API_BASE}/api/auth/stats-dashboard/?date=${dateStr}`
    : `${API_BASE}/api/auth/stats-dashboard/`
  const res = await fetchWithAuth(url, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fix food results: send title, nutrients, and user correction.
 * Optional food_log_id: when provided, backend updates the FoodLog entry.
 * Returns updated item with new title, nutrients, and verdict.
 */
export async function fixFoodResults(title, nutrients, userFix, foodLogId = null) {
  const body = { title, nutrients, user_fix: userFix }
  if (foodLogId != null) body.food_log_id = foodLogId
  const res = await fetchWithAuth(`${API_BASE}/api/auth/fix-food-results/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function sendCoachMessage(messages) {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/coach-chat/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages }),
  }, FETCH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function fetchFoodInsight(food) {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/food-insight/`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(food),
  }, FETCH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function fetchMe() {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

export async function updateProfile(data) {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }, AUTH_TIMEOUT_MS)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Upload profile picture. Accepts File (image). Returns { profile_has_avatar: true }.
 */
export async function uploadProfilePicture(file) {
  const form = new FormData()
  form.append('avatar', file)
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/avatar/upload/`, {
    method: 'POST',
    headers: {},
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || res.statusText)
  }
  return res.json()
}

/**
 * Fetch profile avatar as blob URL (for img src). Returns blob URL or null.
 */
export async function fetchProfileAvatarUrl() {
  const res = await fetchWithAuth(`${API_BASE}/api/auth/me/avatar/`, {
    method: 'GET',
    headers: {},
  })
  if (!res.ok) return null
  const blob = await res.blob()
  return URL.createObjectURL(blob)
}

export function storeTokens(tokens) {
  if (tokens?.access) localStorage.setItem('olyvia_access', tokens.access)
  if (tokens?.refresh) localStorage.setItem('olyvia_refresh', tokens.refresh)
}
