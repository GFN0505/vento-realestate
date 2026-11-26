const replacements: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** Every value interpolated into email HTML goes through this: names and org names are user input. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => replacements[c] ?? c)
}

/** Safe inside a quoted display name: no quotes, backslashes, line breaks or control characters. */
export function displayName(value: string): string {
  const safe = [...value.replace(/\s+/g, ' ')]
    .filter((c) => c !== '"' && c !== '\\' && c.charCodeAt(0) > 0x1f && c.charCodeAt(0) !== 0x7f)
    .join('')
  return safe.trim().slice(0, 60)
}
