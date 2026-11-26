/*
 * "The server said NOT_FOUND." A feature switched off mid-session answers NOT_FOUND to every
 * call (spec), so the shell refetches `me` and the navigation catches up. A tiny pub/sub keeps
 * the oRPC link free of the query client. A real missing record costs one cheap `me` refetch.
 */

const listeners = new Set<() => void>()

export function notifyNotFound() {
  for (const listener of listeners) listener()
}

/** Returns the unsubscribe function, for an effect's cleanup. */
export function onNotFound(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
