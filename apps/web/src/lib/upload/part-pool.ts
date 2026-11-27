/**
 * Runs `send` over the part numbers in `queue`, `width` at a time. Once `narrow()` turns true, only
 * the last worker still sending takes the next part, so a weak link gets one part at a time. The
 * first part to fail for good stops the others, so the caller settles once and can be retried.
 */
export async function sendAll(
  queue: number[],
  width: number,
  narrow: () => boolean,
  send: (n: number, signal: AbortSignal) => Promise<void>,
  runSignal: AbortSignal,
): Promise<void> {
  const stop = new AbortController()
  const signal = stop.signal
  const forward = () => stop.abort(runSignal.reason)
  runSignal.addEventListener('abort', forward, { once: true })
  let failure: unknown = null
  let active = 0
  const worker = async () => {
    for (;;) {
      if (narrow() && active > 0) return
      const n = queue.shift()
      if (n === undefined) return
      active++
      try {
        await send(n, signal)
      } catch (error) {
        if (!signal.aborted) failure = error
        queue.length = 0
        stop.abort()
      } finally {
        active--
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(width, queue.length) }, worker))
  runSignal.removeEventListener('abort', forward)
  runSignal.throwIfAborted()
  if (failure) throw failure
}
