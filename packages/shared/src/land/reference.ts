// Parcel references: P-0001 upwards per organization, never reused (record_counters).

/** 12 → "P-0012"; past 9999 it simply grows ("P-12345"). */
export function parcelReference(n: number): string {
  return `P-${String(n).padStart(4, '0')}`
}

const REFERENCE = /^\s*p?\s*-?\s*0*(\d{1,9})\s*$/i

/** "P-0012", "p-12", "P12" and "12" → 12; anything else → null (it's a name search). */
export function parseParcelReference(q: string): number | null {
  const m = REFERENCE.exec(q)
  if (!m?.[1]) return null
  const n = Number(m[1])
  return Number.isSafeInteger(n) && n > 0 ? n : null
}
