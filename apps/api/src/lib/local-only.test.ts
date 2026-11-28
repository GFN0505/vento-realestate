import { describe, expect, it } from 'vitest'
import { assertLocalOnly, isLocalDatabase, NOT_LOCAL_MESSAGE } from './local-only'

const LOCAL = 'postgres://vento:vento@localhost:5432/vento'

describe('assertLocalOnly', () => {
  it('lets a local database through outside production', () => {
    expect(() => assertLocalOnly({ NODE_ENV: 'development', DATABASE_URL: LOCAL })).not.toThrow()
    expect(isLocalDatabase('postgres://u:p@127.0.0.1/vento_e2e', undefined)).toBe(true)
  })

  it('refuses in production, even on a local database', () => {
    expect(() => assertLocalOnly({ NODE_ENV: 'production', DATABASE_URL: LOCAL })).toThrow(
      NOT_LOCAL_MESSAGE,
    )
  })

  it('refuses a remote database, and allows a CI service name only in CI', () => {
    const remote = 'postgres://u:p@db.eu-west.example.com:5432/vento'
    expect(() => assertLocalOnly({ NODE_ENV: 'development', DATABASE_URL: remote })).toThrow(
      NOT_LOCAL_MESSAGE,
    )
    const service = 'postgres://u:p@postgres:5432/vento_test'
    expect(isLocalDatabase(service, undefined)).toBe(false)
    expect(isLocalDatabase(service, 'true')).toBe(true)
    expect(isLocalDatabase('not a url', 'true')).toBe(false)
  })
})
