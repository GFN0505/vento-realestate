const BASE = 'https://vento.invalid'

/**
 * Returns `target` only when it's a path on this site, so a crafted `?redirect=` link can't
 * send someone to another domain after they sign in. Anything else gives `fallback`.
 */
export function safeRedirect(target: unknown, fallback = '/'): string {
  if (typeof target !== 'string' || target.length === 0 || target.length > 2048) return fallback
  // Only root-relative paths. "//host" and "/\host" are treated as other origins by browsers.
  if (!target.startsWith('/') || target.startsWith('//') || target.includes('\\')) return fallback
  // Control characters (tabs, newlines) are stripped by URL parsers and can hide a "//".
  if ([...target].some((char) => char.charCodeAt(0) < 0x20 || char.charCodeAt(0) === 0x7f)) {
    return fallback
  }
  try {
    const url = new URL(target, BASE)
    if (url.origin !== BASE) return fallback
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return fallback
  }
}
