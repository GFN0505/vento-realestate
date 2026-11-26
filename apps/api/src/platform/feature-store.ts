import { FEATURE_KEYS, type FeatureKey, type ReleaseStage } from '@vento/shared'
import type { DbOrTx } from '@/db/client'
import { logger as defaultLogger } from '@/lib/logger'
import { emptySnapshot, type Snapshot } from './availability'
import { loadSnapshot } from './snapshot'

/** Where requests read availability from. */
export type FeatureStore = {
  get(): Snapshot | Promise<Snapshot>
  stop(): void
}

type Logger = Pick<typeof defaultLogger, 'warn' | 'error'>

export type RefreshingFeatureStore = FeatureStore & {
  /** Runs one load now (skipped if one is already running). Exposed for tests. */
  refresh(): Promise<void>
}

/** A stale snapshot past this is an incident: a kill switch can't propagate. */
const STALE_AFTER_MS = 60_000

/**
 * Loads the snapshot once before serving, then reloads it every `refreshMs` (decision 0016).
 * A failed load keeps the last good snapshot; ticks never overlap.
 */
export async function startFeatureStore(
  db: DbOrTx,
  options: {
    refreshMs: number
    load?: (db: DbOrTx) => Promise<Snapshot>
    logger?: Logger
    now?: () => number
  },
): Promise<RefreshingFeatureStore> {
  const load = options.load ?? ((d: DbOrTx) => loadSnapshot(d))
  const log = options.logger ?? defaultLogger
  const now = options.now ?? Date.now
  let current: Snapshot
  let lastSuccess = now()
  try {
    current = await load(db)
  } catch (error) {
    // Missing tables (migrations not applied) or no database: serve with every feature off
    // rather than crash, and keep retrying on the interval.
    current = safeSnapshot()
    log.error(
      'Feature snapshot could not load; every feature is off until it does. Run pnpm db:migrate if the tables are missing.',
      {
        error: error instanceof Error ? error.name : 'unknown',
        code:
          (error as { cause?: { code?: string }; code?: string })?.cause?.code ??
          (error as { code?: string })?.code,
      },
    )
  }
  let running: Promise<void> | null = null

  const refresh = (): Promise<void> => {
    if (running) return running
    running = (async () => {
      try {
        current = await load(db)
        lastSuccess = now()
      } catch (error) {
        const staleMs = now() - lastSuccess
        const details = {
          staleSeconds: Math.round(staleMs / 1000),
          error: error instanceof Error ? error.name : 'unknown',
        }
        if (staleMs > STALE_AFTER_MS) log.error('Feature snapshot is stale', details)
        else log.warn('Feature snapshot reload failed; keeping the last one', details)
      } finally {
        running = null
      }
    })()
    return running
  }

  const timer = setInterval(() => void refresh(), options.refreshMs)
  timer.unref()
  return {
    get: () => current,
    refresh,
    stop: () => clearInterval(timer),
  }
}

/** Every flag off: nothing optional is served until a real snapshot loads. */
export function safeSnapshot(): Snapshot {
  return {
    ...emptySnapshot(),
    stages: new Map<FeatureKey, ReleaseStage>(FEATURE_KEYS.map((k) => [k, 'off'])),
  }
}

/** Loads on every call: tests and scripts, where a change must show at once. */
export function liveFeatureStore(db: DbOrTx): FeatureStore {
  return { get: () => loadSnapshot(db), stop: () => {} }
}

/** A fixed snapshot: tests that count queries. */
export function staticFeatureStore(snapshot: Snapshot): FeatureStore {
  return { get: () => snapshot, stop: () => {} }
}
