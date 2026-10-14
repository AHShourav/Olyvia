/**
 * Unit tests for exported helpers in api.js (no real network).
 * storeTokens — normal, empty, partial tokens; repeatability via cleared storage.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest'
import { storeTokens } from './api.js'

function mockLocalStorage() {
  const mem = Object.create(null)
  const ls = {
    getItem: (k) => (k in mem ? mem[k] : null),
    setItem: (k, v) => {
      mem[k] = String(v)
    },
    removeItem: (k) => {
      delete mem[k]
    },
    clear: () => {
      for (const k of Object.keys(mem)) delete mem[k]
    },
  }
  vi.stubGlobal('localStorage', ls)
  return mem
}

describe('storeTokens', () => {
  beforeEach(() => {
    mockLocalStorage()
  })

  it('writes access and refresh when both present', () => {
    storeTokens({ access: 'a1', refresh: 'r1' })
    expect(localStorage.getItem('olyvia_access')).toBe('a1')
    expect(localStorage.getItem('olyvia_refresh')).toBe('r1')
  })

  it('writes only access when refresh missing', () => {
    storeTokens({ access: 'a2' })
    expect(localStorage.getItem('olyvia_access')).toBe('a2')
    expect(localStorage.getItem('olyvia_refresh')).toBeNull()
  })

  it('writes only refresh when access missing', () => {
    storeTokens({ refresh: 'r2' })
    expect(localStorage.getItem('olyvia_access')).toBeNull()
    expect(localStorage.getItem('olyvia_refresh')).toBe('r2')
  })

  it('does nothing for null or empty object', () => {
    storeTokens(null)
    storeTokens(undefined)
    storeTokens({})
    expect(localStorage.getItem('olyvia_access')).toBeNull()
    expect(localStorage.getItem('olyvia_refresh')).toBeNull()
  })

  it('is repeatable: same input yields same storage state', () => {
    storeTokens({ access: 'x', refresh: 'y' })
    expect(localStorage.getItem('olyvia_access')).toBe('x')
    localStorage.removeItem('olyvia_access')
    storeTokens({ access: 'x', refresh: 'y' })
    expect(localStorage.getItem('olyvia_access')).toBe('x')
    expect(localStorage.getItem('olyvia_refresh')).toBe('y')
  })
})
