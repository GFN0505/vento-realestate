import { useSyncExternalStore } from 'react'

/*
 * Whether the app can reach Vento. The browser's online/offline events catch a dropped
 * connection at once; a failed request while the browser still says "online" (weak signal,
 * captive Wi-Fi) starts a health probe every few seconds, which catches the rest.
 */

const PROBE_URL = '/health'
const PROBE_EVERY_MS = 3000
const PROBE_TIMEOUT_MS = 5000

let online = typeof navigator === 'undefined' ? true : navigator.onLine
let probeTimer: ReturnType<typeof setTimeout> | null = null
let probing = false
const listeners = new Set<() => void>()
const reconnectListeners = new Set<() => void>()

function set(next: boolean) {
  if (next === online) return
  online = next
  for (const listener of listeners) listener()
  if (next) for (const listener of reconnectListeners) listener()
}

function stopProbing() {
  if (probeTimer) clearTimeout(probeTimer)
  probeTimer = null
}

/** One health check. Resolves true when the API answered at all. */
export async function probe(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  if (probing) return online
  probing = true
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS)
  try {
    await fetchImpl(PROBE_URL, { cache: 'no-store', signal: controller.signal })
    set(true)
    stopProbing()
    return true
  } catch {
    set(false)
    stopProbing()
    probeTimer = setTimeout(() => void probe(fetchImpl), PROBE_EVERY_MS)
    return false
  } finally {
    clearTimeout(timeout)
    probing = false
  }
}

export const connection = {
  isOnline: () => online,
  /** A request failed at the network level: check whether we're really cut off. */
  reportNetworkFailure() {
    if (!probeTimer) void probe()
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
  /** Runs when the connection comes back, e.g. to reload what failed. */
  onReconnect(listener: () => void) {
    reconnectListeners.add(listener)
    return () => {
      reconnectListeners.delete(listener)
    }
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => set(false))
  window.addEventListener('online', () => {
    set(true)
    stopProbing()
  })
}

export function useOnline(): boolean {
  return useSyncExternalStore(connection.subscribe, connection.isOnline, () => true)
}

/** Test helper: put the store back to a known state. */
export function resetConnectionForTests(value = true) {
  stopProbing()
  probing = false
  online = value
}
