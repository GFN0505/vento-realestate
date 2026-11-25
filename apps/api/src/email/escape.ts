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
