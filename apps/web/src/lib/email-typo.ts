/** Providers people mistype most. A typo of one of these gets a one-click fix. */
const PROVIDERS = [
  'gmail.com',
  'yahoo.com',
  'outlook.com',
  'hotmail.com',
  'icloud.com',
  'ymail.com',
  'live.com',
]

/** Real domains that sit one or two letters from a provider; never "correct" these. */
const ALSO_REAL = new Set([
  'mail.com',
  'email.com',
  'aol.com',
  'yahoo.co.uk',
  'live.co.uk',
  'me.com',
])

/** Typos too far from the provider for edit distance alone. */
const TYPO_MAP: Record<string, string> = {
  gmial: 'gmail.com',
  gmai: 'gmail.com',
  gamil: 'gmail.com',
  gnail: 'gmail.com',
  yaho: 'yahoo.com',
  yahooo: 'yahoo.com',
  outlok: 'outlook.com',
  outllok: 'outlook.com',
  hotmial: 'hotmail.com',
  hotmal: 'hotmail.com',
  iclod: 'icloud.com',
}

/** Levenshtein distance, stopping early once it passes `max` (domains are short). */
export function editDistance(a: string, b: string, max = 2): number {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index)
  for (let i = 1; i <= a.length; i++) {
    const current = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      const value = Math.min(
        (previous[j] ?? 0) + 1,
        (current[j - 1] ?? 0) + 1,
        (previous[j - 1] ?? 0) + cost,
      )
      current.push(value)
      rowMin = Math.min(rowMin, value)
    }
    if (rowMin > max) return max + 1
    previous = current
  }
  return previous[b.length] ?? max + 1
}

function correctDomain(domain: string): string | null {
  if (PROVIDERS.includes(domain) || ALSO_REAL.has(domain)) return null
  const name = domain.split('.')[0] ?? ''
  const mapped = TYPO_MAP[name]
  if (mapped) return mapped
  let best: { provider: string; distance: number } | null = null
  for (const provider of PROVIDERS) {
    const distance = editDistance(domain, provider)
    if (distance <= 2 && (!best || distance < best.distance)) best = { provider, distance }
  }
  return best?.provider ?? null
}

/**
 * "ada@gmial.com" → "ada@gmail.com". Null when the email looks fine, isn't an email yet, or
 * uses a domain we don't know (work domains like ventohomes.ng are left alone).
 */
export function suggestEmail(email: string): string | null {
  const trimmed = email.trim()
  const at = trimmed.lastIndexOf('@')
  if (at < 1 || at === trimmed.length - 1) return null
  const domain = trimmed.slice(at + 1).toLowerCase()
  const fixed = correctDomain(domain)
  return fixed ? `${trimmed.slice(0, at)}@${fixed}` : null
}
