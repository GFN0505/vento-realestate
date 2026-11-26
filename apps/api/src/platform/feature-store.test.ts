import type { ReleaseStage } from '@vento/shared'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DbOrTx } from '@/db/client'
import { emptySnapshot, type Snapshot } from './availability'
import { startFeatureStore } from './feature-store'

const db = {} as DbOrTx
const withStage = (stage: ReleaseStage): Snapshot => ({
  ...emptySnapshot(),
  stages: new Map([['sales', stage]]),
})
const stageIn = async (store: { get(): Snapshot | Promise<Snapshot> }) =>
  (await store.get()).stages.get('sales')

describe('feature store', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('waits for the first load before it can serve', async () => {
    const load = vi.fn(async () => withStage('pilot'))
    const store = await startFeatureStore(db, { refreshMs: 10_000, load })
    expect(load).toHaveBeenCalledTimes(1)
    expect(await stageIn(store)).toBe('pilot')
    store.stop()
  })

  it('sees a stage change after one interval and not before', async () => {
    let stage: ReleaseStage = 'pilot'
    const store = await startFeatureStore(db, {
      refreshMs: 10_000,
      load: async () => withStage(stage),
    })
    stage = 'off'
    await vi.advanceTimersByTimeAsync(9_999)
    expect(await stageIn(store)).toBe('pilot')
    await vi.advanceTimersByTimeAsync(1)
    expect(await stageIn(store)).toBe('off')
    store.stop()
  })

  it('keeps the last good snapshot when a load fails, and says so', async () => {
    let fail = false
    const logger = { warn: vi.fn(), error: vi.fn() }
    const store = await startFeatureStore(db, {
      refreshMs: 10_000,
      logger,
      load: async () => {
        if (fail) throw new Error('connection refused')
        return withStage('on')
      },
    })
    fail = true
    await vi.advanceTimersByTimeAsync(10_000)
    expect(await stageIn(store)).toBe('on')
    expect(logger.warn).toHaveBeenCalledWith(
      'Feature snapshot reload failed; keeping the last one',
      expect.objectContaining({ staleSeconds: 10 }),
    )
    store.stop()
  })

  it('logs an error once the snapshot is over a minute stale', async () => {
    let fail = false
    const logger = { warn: vi.fn(), error: vi.fn() }
    const store = await startFeatureStore(db, {
      refreshMs: 10_000,
      logger,
      load: async () => {
        if (fail) throw new Error('down')
        return withStage('on')
      },
    })
    fail = true
    await vi.advanceTimersByTimeAsync(70_000)
    expect(logger.error).toHaveBeenCalledWith('Feature snapshot is stale', expect.anything())
    store.stop()
  })

  it('never runs two loads at once', async () => {
    let running = 0
    let most = 0
    let first = true
    const store = await startFeatureStore(db, {
      refreshMs: 1_000,
      load: async () => {
        if (first) {
          first = false
          return withStage('on')
        }
        running += 1
        most = Math.max(most, running)
        await new Promise((resolve) => setTimeout(resolve, 3_500))
        running -= 1
        return withStage('on')
      },
    })
    await vi.advanceTimersByTimeAsync(10_000)
    expect(most).toBe(1)
    store.stop()
  })

  it('stops refreshing after stop()', async () => {
    const load = vi.fn(async () => withStage('on'))
    const store = await startFeatureStore(db, { refreshMs: 1_000, load })
    store.stop()
    await vi.advanceTimersByTimeAsync(5_000)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('starts with every feature off when the first load fails, then recovers', async () => {
    let fail = true
    const logger = { warn: vi.fn(), error: vi.fn() }
    const store = await startFeatureStore(db, {
      refreshMs: 1_000,
      logger,
      load: async () => {
        if (fail) throw new Error('relation "feature_releases" does not exist')
        return withStage('on')
      },
    })
    expect(await stageIn(store)).toBe('off')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('pnpm db:migrate'),
      expect.anything(),
    )
    fail = false
    await vi.advanceTimersByTimeAsync(1_000)
    expect(await stageIn(store)).toBe('on')
    store.stop()
  })

  it('fails closed (everything off) once the snapshot is over 5 minutes stale', async () => {
    let fail = false
    const logger = { warn: vi.fn(), error: vi.fn() }
    const store = await startFeatureStore(db, {
      refreshMs: 10_000,
      logger,
      load: async () => {
        if (fail) throw new Error('down')
        return withStage('on')
      },
    })
    fail = true
    await vi.advanceTimersByTimeAsync(290_000)
    expect(await stageIn(store)).toBe('on')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(await stageIn(store)).toBe('off')
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('every feature is off'),
      expect.anything(),
    )
    store.stop()
  })
})
