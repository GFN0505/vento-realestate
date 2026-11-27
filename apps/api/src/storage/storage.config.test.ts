import { afterEach, describe, expect, it, vi } from 'vitest'
import { createStorage, LOCAL_S3, s3ConfigFrom } from './index'

const base = {
  NODE_ENV: 'test',
  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: undefined,
  S3_REGION: undefined,
  S3_BUCKET: undefined,
  S3_ACCESS_KEY_ID: undefined,
  S3_SECRET_ACCESS_KEY: undefined,
  S3_FORCE_PATH_STYLE: undefined,
} as const

describe('storage configuration', () => {
  it('uses the local container for anything unset outside production', () => {
    expect(s3ConfigFrom(base)).toEqual(LOCAL_S3)
  })

  it('never defaults a bucket, keys or endpoint in production', () => {
    expect(s3ConfigFrom({ ...base, NODE_ENV: 'production' })).toMatchObject({
      endpoint: undefined,
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
    })
  })

  it('reads the path-style switch from the environment', () => {
    expect(s3ConfigFrom({ ...base, S3_FORCE_PATH_STYLE: 'false' }).forcePathStyle).toBe(false)
    expect(s3ConfigFrom({ ...base, S3_FORCE_PATH_STYLE: 'true' }).forcePathStyle).toBe(true)
  })

  it('refuses the memory driver in production and allows it in tests', () => {
    expect(() =>
      createStorage({ ...base, NODE_ENV: 'production', STORAGE_DRIVER: 'memory' }),
    ).toThrow(/memory/)
    expect(createStorage({ ...base, STORAGE_DRIVER: 'memory' }).driver).toBe('memory')
    expect(createStorage(base).driver).toBe('s3')
  })

  it('refuses the local container’s placeholder keys in production', () => {
    const real = { S3_BUCKET: 'vento-prod', S3_REGION: 'auto' }
    for (const keys of [
      { S3_ACCESS_KEY_ID: LOCAL_S3.accessKeyId, S3_SECRET_ACCESS_KEY: 'real-secret' },
      { S3_ACCESS_KEY_ID: 'real-key', S3_SECRET_ACCESS_KEY: LOCAL_S3.secretAccessKey },
    ]) {
      expect(() => createStorage({ ...base, ...real, ...keys, NODE_ENV: 'production' })).toThrow(
        /local placeholders/,
      )
    }
  })
})

describe('production environment for storage', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
    vi.resetModules()
  })

  const production = {
    NODE_ENV: 'production',
    WEB_ORIGIN: 'https://app.example.com',
    BETTER_AUTH_SECRET: 'x'.repeat(40),
    SUPPORT_EMAIL: 'help@example.com',
    STORAGE_DRIVER: 's3',
    S3_REGION: 'auto',
    S3_BUCKET: 'vento-prod',
    S3_ACCESS_KEY_ID: 'key',
    S3_SECRET_ACCESS_KEY: 'secret',
    S3_ENDPOINT: 'https://acct.r2.cloudflarestorage.com',
  }

  async function load(overrides: Record<string, string>) {
    vi.resetModules()
    for (const key of Object.keys(production)) vi.stubEnv(key, '')
    for (const [k, v] of Object.entries({ ...production, ...overrides })) vi.stubEnv(k, v)
    const errors: string[] = []
    vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(String(m)))
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => {
      throw new Error('exit')
    }) as never)
    const outcome = await import('@/env').then(
      () => 'started',
      () => 'exited',
    )
    return { outcome, errors: errors.join('\n'), exited: exit.mock.calls.length > 0 }
  }

  it('starts with a complete https bucket configuration', async () => {
    expect((await load({})).outcome).toBe('started')
  })

  it('refuses the memory driver', async () => {
    const result = await load({ STORAGE_DRIVER: 'memory' })
    expect(result.outcome).toBe('exited')
    expect(result.errors).toContain('STORAGE_DRIVER')
  })

  it('refuses a plain http endpoint', async () => {
    const result = await load({ S3_ENDPOINT: 'http://storage.example.com' })
    expect(result.outcome).toBe('exited')
    expect(result.errors).toContain('S3_ENDPOINT: Use https://')
  })

  it.each(['S3_REGION', 'S3_BUCKET', 'S3_ACCESS_KEY_ID', 'S3_SECRET_ACCESS_KEY'])(
    'refuses a missing %s',
    async (name) => {
      const result = await load({ [name]: '' })
      expect(result.outcome).toBe('exited')
      expect(result.errors).toContain(`${name}: Required`)
    },
  )

  it.each([
    ['S3_ACCESS_KEY_ID', 'vento'],
    ['S3_SECRET_ACCESS_KEY', 'vento-local-secret'],
  ])('refuses the local placeholder as %s', async (name, value) => {
    const result = await load({ [name]: value })
    expect(result.outcome).toBe('exited')
    expect(result.errors).toContain(`${name}: Use the bucket’s own`)
  })

  it('accepts an empty endpoint, meaning the provider’s own', async () => {
    expect((await load({ S3_ENDPOINT: '' })).outcome).toBe('started')
  })
})
