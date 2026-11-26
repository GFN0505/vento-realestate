import { describe, expect, it } from 'vitest'
import { whoSignedIn } from './who-signed-in'

const me = (id: string) => async () => ({ user: { id } })

describe('who signed in after Session expired', () => {
  it('carries on for the same person', async () => {
    await expect(whoSignedIn('a', me('a'))).resolves.toBe('same')
  })

  it('treats a different person as someone else', async () => {
    await expect(whoSignedIn('a', me('b'))).resolves.toBe('other')
  })

  it('never guesses when the check fails', async () => {
    const failing = async () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(whoSignedIn('a', failing)).resolves.toBe('unknown')
  })
})
