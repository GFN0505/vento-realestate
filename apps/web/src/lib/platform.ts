/** Mac, iPhone and iPad show ⌘; everything else shows Ctrl. */
export function isApplePlatform(): boolean {
  if (typeof navigator === 'undefined') return false
  const data = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData
  const platform = data?.platform ?? navigator.platform ?? ''
  return /mac|iphone|ipad|ipod/i.test(platform)
}

/** "⌘K" or "Ctrl K". */
export function modKeyLabel(key: string): string {
  return isApplePlatform() ? `⌘${key}` : `Ctrl ${key}`
}
