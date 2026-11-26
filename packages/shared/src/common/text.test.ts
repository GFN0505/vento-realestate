import { describe, expect, it } from 'vitest'
import { personName } from '../access/schema'
import { entityName, organizationName } from '../organization/schema'
import { joinNames } from './text'

describe('joinNames', () => {
  it('returns an empty string for no names', () => {
    expect(joinNames([])).toBe('')
  })

  it('returns a single name as it is', () => {
    expect(joinNames(['owners'])).toBe('owners')
  })

  it('joins two names with "and"', () => {
    expect(joinNames(['owners', 'admins'])).toBe('owners and admins')
  })

  it('joins three or more with commas and a final "and"', () => {
    expect(joinNames(['owners', 'admins', 'HR staff', 'finance staff'])).toBe(
      'owners, admins, HR staff and finance staff',
    )
  })
})

describe('names with hidden characters', () => {
  const schemas = { organizationName, entityName, personName }
  it.each(Object.entries(schemas))(
    '%s refuses control and direction-override characters',
    (_n, schema) => {
      for (const bad of [
        'Vento\nHomes',
        'Vento\u0007 Homes',
        'Vento \u202EsemoH',
        'Vento\u0085Homes',
        'Ada\u2066 Okafor',
      ]) {
        const result = schema.safeParse(bad)
        expect(result.success, JSON.stringify(bad)).toBe(false)
        expect(result.error?.issues[0]?.message).toBe(
          'Remove hidden characters, like line breaks or tabs',
        )
      }
    },
  )

  it.each(Object.entries(schemas))(
    '%s keeps ordinary names, accents and ampersands',
    (_n, schema) => {
      expect(schema.safeParse('Adébáyọ̀ & Sons Ltd').success).toBe(true)
    },
  )
})
