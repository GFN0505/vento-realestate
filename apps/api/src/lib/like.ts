/** `%` and `_` typed in a search box are literal characters, not wildcards. */
export function likePattern(q: string): string {
  return `%${q.replace(/[\\%_]/g, '\\$&')}%`
}
