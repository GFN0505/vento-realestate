import { describe, expect, it } from 'vitest'
import { resetConsequences } from './team-confirms'

describe('the reset two-step confirm', () => {
  it('says the passkeys are removed too', () => {
    expect(resetConsequences(2)).toContain(
      "They'll be signed out everywhere, their 2 passkeys will be removed, and they must set a new password",
    )
  })

  it('keeps the 2a words when there are none', () => {
    expect(resetConsequences(0)).toContain(
      "They'll be signed out everywhere and must set a new password",
    )
  })
})
