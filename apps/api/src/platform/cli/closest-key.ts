/** Edit distance (insertions, deletions, substitutions). Keys are short, so the plain table is fine. */
export function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      current[j] = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      )
    }
    previous = current
  }
  return previous[b.length] ?? 0
}

/** The closest known key, if it's close enough to be a typo. */
export function closestKey(input: string, keys: readonly string[]): string | null {
  let best: string | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  for (const key of keys) {
    const d = editDistance(input.toLowerCase(), key)
    if (d < bestDistance) {
      best = key
      bestDistance = d
    }
  }
  return best !== null && bestDistance <= Math.max(2, Math.floor(input.length / 3)) ? best : null
}
