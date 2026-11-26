import { daysAgoInLagos, formatDate } from '@/lib/format'

/** Spec: "Today", "Yesterday", "3 days ago", then "12 Nov 2026" (Lagos days). */
export function lastActiveLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return 'Not yet'
  const days = daysAgoInLagos(iso, now)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days < 7) return `${days} days ago`
  return formatDate(iso)
}
