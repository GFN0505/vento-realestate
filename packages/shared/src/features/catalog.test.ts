import { describe, expect, it } from 'vitest'
import { PERMISSION_MODULES } from '../access/permissions'
import {
  ADD_ONS,
  addOnOf,
  FEATURE_KEYS,
  FEATURES,
  type FeatureKey,
  featuresOfAddOn,
  isCoreFeature,
  isFeatureKey,
  isPlanFeature,
  LIMIT_KEYS,
  prerequisitesOf,
} from './catalog'

describe('feature catalog', () => {
  it('uses keys shaped like module or module.feature', () => {
    for (const key of FEATURE_KEYS) expect(key).toMatch(/^[a-z_]+(\.[a-z_]+)?$/)
  })

  it('names only known features as prerequisites', () => {
    for (const key of FEATURE_KEYS) {
      for (const p of FEATURES[key].requires) expect(isFeatureKey(p), `${key} → ${p}`).toBe(true)
    }
  })

  it('has no prerequisite cycles', () => {
    const state = new Map<FeatureKey, 'visiting' | 'done'>()
    const visit = (key: FeatureKey, path: FeatureKey[]) => {
      if (state.get(key) === 'done') return
      if (state.get(key) === 'visiting') throw new Error(`Cycle: ${[...path, key].join(' → ')}`)
      state.set(key, 'visiting')
      for (const p of prerequisitesOf(key)) visit(p, [...path, key])
      state.set(key, 'done')
    }
    for (const key of FEATURE_KEYS) expect(() => visit(key, [])).not.toThrow()
  })

  it('makes every sub-feature of a module require that module (or a feature of it)', () => {
    for (const key of FEATURE_KEYS) {
      const [prefix, rest] = key.split('.')
      if (!rest || prefix === 'platform' || prefix === 'ai') continue
      const requires = prerequisitesOf(key)
      expect(
        requires.some((p) => p === prefix || p.startsWith(`${prefix}.`)),
        key,
      ).toBe(true)
    }
  })

  it('links every add-on feature to a defined add-on, and only ai.* features', () => {
    for (const key of FEATURE_KEYS) {
      const addOn = addOnOf(key)
      if (key.startsWith('ai.')) expect(addOn).toBe('ai')
      else expect(addOn).toBeUndefined()
      if (addOn) expect(Object.keys(ADD_ONS)).toContain(addOn)
    }
    expect(featuresOfAddOn('ai')).toContain('ai.payment_matching')
  })

  it('never sells a core feature as an add-on', () => {
    for (const key of FEATURE_KEYS) {
      if (isCoreFeature(key)) expect(addOnOf(key), key).toBeUndefined()
    }
  })

  it('keeps security and compliance core', () => {
    for (const key of [
      'compliance',
      'compliance.permits',
      'compliance.ubo_scuml',
      'platform.passkeys',
    ] as const) {
      expect(isCoreFeature(key), key).toBe(true)
      expect(isPlanFeature(key), key).toBe(false)
    }
  })

  it('has unique labels', () => {
    const labels = FEATURE_KEYS.map((k) => FEATURES[k].label)
    expect(new Set(labels).size).toBe(labels.length)
  })

  it('has a module flag for every permission module except settings', () => {
    for (const m of PERMISSION_MODULES) {
      if (m === 'settings') continue
      expect(isFeatureKey(m), m).toBe(true)
      expect(FEATURES[m as FeatureKey].kind).toBe('module')
    }
  })

  it('points each add-on at a known limit', () => {
    for (const addOn of Object.values(ADD_ONS)) expect(LIMIT_KEYS).toContain(addOn.limit)
  })
})
