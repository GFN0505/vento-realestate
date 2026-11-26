/*
 * Browser storage that never throws: private mode, a full quota or a blocked storage just means
 * the preference isn't remembered, never a broken page.
 */

type Area = 'local' | 'session'

function area(which: Area): Storage | null {
  try {
    return which === 'local' ? window.localStorage : window.sessionStorage
  } catch {
    return null
  }
}

export function readItem(key: string, which: Area = 'local'): string | null {
  try {
    return area(which)?.getItem(key) ?? null
  } catch {
    return null
  }
}

export function writeItem(key: string, value: string | null, which: Area = 'local'): void {
  try {
    const store = area(which)
    if (value === null) store?.removeItem(key)
    else store?.setItem(key, value)
  } catch {
    // Remembering is a nicety; failing to is fine.
  }
}

export function readJson<T>(key: string, guard: (value: unknown) => value is T, which?: Area) {
  const raw = readItem(key, which)
  if (raw === null) return null
  try {
    const value: unknown = JSON.parse(raw)
    return guard(value) ? value : null
  } catch {
    return null
  }
}

export function writeJson(key: string, value: unknown, which?: Area): void {
  writeItem(key, value === null ? null : JSON.stringify(value), which)
}

/** Removes every key that starts with `prefix` (e.g. all recent pages for one person). */
export function removeByPrefix(prefix: string, which: Area = 'local'): void {
  const store = area(which)
  if (!store) return
  try {
    const keys: string[] = []
    for (let i = 0; i < store.length; i++) {
      const key = store.key(i)
      if (key?.startsWith(prefix)) keys.push(key)
    }
    for (const key of keys) store.removeItem(key)
  } catch {
    // See writeItem.
  }
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
