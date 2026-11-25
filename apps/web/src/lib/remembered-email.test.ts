import { afterEach, describe, expect, it, vi } from 'vitest'
import { forgetRememberedEmail, readRememberedEmail, rememberEmail } from './remembered-email'

afterEach(() => {
  localStorage.clear()
  vi.restoreAllMocks()
})

describe('remembered email', () => {
  it('remembers the email when "Keep me signed in" was ticked', () => {
    rememberEmail('ada@ventohomes.ng', true)

    expect(readRememberedEmail()).toBe('ada@ventohomes.ng')
  })

  it('forgets a stored email when the box was not ticked', () => {
    rememberEmail('ada@ventohomes.ng', true)
    rememberEmail('tunde@ventohomes.ng', false)

    expect(readRememberedEmail()).toBeUndefined()
  })

  it('clears it for "Not you?"', () => {
    rememberEmail('ada@ventohomes.ng', true)
    forgetRememberedEmail()

    expect(readRememberedEmail()).toBeUndefined()
  })

  it('carries on quietly when storage is unavailable', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('denied')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('denied')
    })

    expect(() => rememberEmail('ada@ventohomes.ng', true)).not.toThrow()
    expect(readRememberedEmail()).toBeUndefined()
  })
})
