import { readItem, writeItem } from '@/lib/storage'

/*
 * A page's code chunk can fail to download: offline (weak signal, a building site) or after a
 * deploy replaced the file names. TanStack Router's lazy route components react to both with a
 * full browser reload, which offline shows the browser's own "no internet" page. We take that
 * decision over: offline, the shell shows our Offline page and retries on reconnect; online, one
 * full reload fetches the new version, guarded so it can never loop.
 */

/** The sessionStorage prefix TanStack uses to remember "already reloaded for this chunk". */
const TANSTACK_RELOAD_PREFIX = 'tanstack_router_reload:'
const RELOAD_KEY = 'vento-chunk-reload'
/** One reload per minute at most, however many chunks fail. */
const RELOAD_GUARD_MS = 60_000

/**
 * Makes TanStack believe it has already reloaded for every chunk, so its lazy component throws
 * the error to our route boundary instead of reloading. Only its own keys are affected.
 */
export function takeOverChunkReloads(storage: Storage = window.sessionStorage): void {
  const proto = Object.getPrototypeOf(storage) as Storage
  const original = proto.getItem
  if ((original as { ventoPatched?: boolean }).ventoPatched) return
  const patched = function (this: Storage, key: string): string | null {
    if (this === storage && key.startsWith(TANSTACK_RELOAD_PREFIX)) return '1'
    return original.call(this, key)
  }
  Object.assign(patched, { ventoPatched: true })
  proto.getItem = patched
}

export type ChunkFailureAction = 'offline' | 'reload' | 'give_up'

/** What to do when a page's chunk failed. Pure, so the guard is tested. */
export function chunkFailureAction({
  online,
  lastReloadAt,
  now,
}: {
  online: boolean
  lastReloadAt: number | null
  now: number
}): ChunkFailureAction {
  if (!online) return 'offline'
  if (lastReloadAt !== null && now - lastReloadAt < RELOAD_GUARD_MS) return 'give_up'
  return 'reload'
}

export function lastChunkReloadAt(): number | null {
  const value = Number(readItem(RELOAD_KEY, 'session'))
  return Number.isFinite(value) && value > 0 ? value : null
}

/** One full reload to pick up a new deploy; remembered so it can't loop. */
export function reloadForNewVersion(now = Date.now()): void {
  writeItem(RELOAD_KEY, String(now), 'session')
  window.location.reload()
}
