import { describe, expect, it } from 'vitest'
import { NIGERIAN_STATES } from './nigeria'
import { findLga, LGA_ALIASES, LGAS_BY_STATE } from './nigeria-lgas'

// Constitution of the Federal Republic of Nigeria 1999, First Schedule: 768 LGAs (Part I) and the
// FCT's 6 area councils (Part II). Checked state by state on 28 Nov 2026.
const EXPECTED_COUNTS = {
  Abia: 17,
  Adamawa: 21,
  'Akwa Ibom': 31,
  Anambra: 21,
  Bauchi: 20,
  Bayelsa: 8,
  Benue: 23,
  Borno: 27,
  'Cross River': 18,
  Delta: 25,
  Ebonyi: 13,
  Edo: 18,
  Ekiti: 16,
  Enugu: 17,
  FCT: 6,
  Gombe: 11,
  Imo: 27,
  Jigawa: 27,
  Kaduna: 23,
  Kano: 44,
  Katsina: 34,
  Kebbi: 21,
  Kogi: 21,
  Kwara: 16,
  Lagos: 20,
  Nasarawa: 13,
  Niger: 25,
  Ogun: 20,
  Ondo: 18,
  Osun: 30,
  Oyo: 33,
  Plateau: 17,
  Rivers: 23,
  Sokoto: 23,
  Taraba: 16,
  Yobe: 17,
  Zamfara: 14,
} as const

describe('LGAS_BY_STATE', () => {
  it('covers the 36 states and the FCT', () => {
    expect(Object.keys(LGAS_BY_STATE).sort()).toEqual([...NIGERIAN_STATES].sort())
  })

  it('has 774 in all: 768 LGAs and the 6 FCT area councils', () => {
    const total = Object.values(LGAS_BY_STATE).reduce((n, list) => n + list.length, 0)
    expect(total).toBe(774)
    expect(total - LGAS_BY_STATE.FCT.length).toBe(768)
  })

  it.each(NIGERIAN_STATES.map((s) => [s]))('has the right count for %s', (state) => {
    expect(LGAS_BY_STATE[state]).toHaveLength(EXPECTED_COUNTS[state])
  })

  it('lists each LGA once within its state', () => {
    for (const state of NIGERIAN_STATES) {
      const names = LGAS_BY_STATE[state].map((n) => n.toLowerCase())
      expect(new Set(names).size, state).toBe(names.length)
    }
  })

  it('points every alias at a listed LGA of the same state', () => {
    for (const [state, aliases] of Object.entries(LGA_ALIASES)) {
      for (const target of Object.values(aliases ?? {})) {
        expect(LGAS_BY_STATE[state as keyof typeof LGAS_BY_STATE]).toContain(target)
      }
    }
  })
})

describe('findLga', () => {
  it('finds an LGA whatever the case, spaces or hyphens', () => {
    expect(findLga('Lagos', 'ibeju lekki')).toBe('Ibeju-Lekki')
    expect(findLga('Lagos', 'Eti Osa')).toBe('Eti-Osa')
    expect(findLga('Rivers', 'obio-akpor')).toBe('Obio/Akpor')
  })

  it('reads aliases: AMAC is Abuja Municipal', () => {
    expect(findLga('FCT', 'AMAC')).toBe('Abuja Municipal')
    expect(findLga('Ogun', 'Egbado North')).toBe('Yewa North')
  })

  it("doesn't find an LGA of another state", () => {
    expect(findLga('Lagos', 'Abuja Municipal')).toBeNull()
    expect(findLga('FCT', 'Ikeja')).toBeNull()
    expect(findLga('Lagos', '  ')).toBeNull()
  })
})
