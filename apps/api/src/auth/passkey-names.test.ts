import { describe, expect, it } from 'vitest'
import { defaultPasskeyName } from './passkey-names'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Safari/604.1'
const ANDROID = 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0 Safari/537.36'
const LINUX = 'Mozilla/5.0 (X11; Linux x86_64) Firefox/133.0'
const ZEROS = '00000000-0000-0000-0000-000000000000'

describe('default passkey names', () => {
  it('names the password manager and the device', () => {
    expect(defaultPasskeyName('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', ANDROID)).toBe(
      'Google Password Manager · Android phone',
    )
    expect(defaultPasskeyName('08987058-cadc-4b81-b6e1-30de50dcbe96', WINDOWS)).toBe(
      'Windows Hello · Windows PC',
    )
  })

  it('calls Apple devices iCloud Keychain when the authenticator sends zeros', () => {
    expect(defaultPasskeyName(ZEROS, IPHONE)).toBe('iCloud Keychain · iPhone')
  })

  it('falls back to the browser and device for an unknown authenticator', () => {
    expect(defaultPasskeyName(ZEROS, LINUX)).toBe('Passkey · Firefox on Linux PC')
    expect(defaultPasskeyName(null, null)).toBe('Passkey')
  })

  it('never goes over 40 characters', () => {
    const name = defaultPasskeyName('ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4', 'Android tablet')
    expect(name.length).toBeLessThanOrEqual(40)
  })
})
