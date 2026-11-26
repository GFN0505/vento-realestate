/*
 * ⌘K matching: case and word order don't matter ("sales go" finds "Go to Sales"), and every typed
 * word must start a word of the label or its keywords. Earlier, label-first matches score higher,
 * so cmdk highlights the likeliest result and Enter runs it.
 */

function words(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9₦]+/i)
    .filter(Boolean)
}

/** 0 = no match; otherwise higher is better (cmdk sorts by it). */
export function commandScore(
  label: string,
  search: string,
  keywords: readonly string[] = [],
): number {
  const tokens = words(search)
  if (tokens.length === 0) return 1
  // What was typed is how the label starts ("rol" → "Roles & permissions"): that ranks first.
  const typed = search.trim().toLowerCase()
  const plain = label.toLowerCase().replace(/^(go to|switch to) /, '')
  if (plain.startsWith(typed) || label.toLowerCase().startsWith(typed)) return 1
  const labelWords = words(label)
  const keywordWords = keywords.flatMap(words)
  let score = 1
  for (const token of tokens) {
    const inLabel = labelWords.findIndex((w) => w.startsWith(token))
    if (inLabel >= 0) {
      score += 1 / (inLabel + 1) + (labelWords[inLabel] === token ? 0.5 : 0)
      continue
    }
    if (!keywordWords.some((w) => w.startsWith(token))) return 0
    score += 0.1
  }
  // Normalised to 0..1 for cmdk; the ordering is all that matters.
  return Math.min(1, score / (1 + tokens.length * 1.5))
}
