import { type RenderedEmail, renderEmail } from './layout'

/**
 * A service notice to owners, 7 days and 1 day before a trial ends: what ends, when, and what
 * changes. Factual, not marketing (NDPA); the contact line is there for questions only.
 */
export function trialEndingEmail(p: {
  planName: string
  /** "2 Jan 2027". */
  endsOn: string
  /** Labels of what goes, e.g. ["Board pack", "Period close"]. */
  losing: string[]
  /** mailto: or WhatsApp link with the organization filled in, for questions. */
  talkUrl: string
}): RenderedEmail {
  const subject = `Your ${p.planName} trial ends on ${p.endsOn}`
  const after =
    p.losing.length === 0
      ? ''
      : ` After that, ${listOf(p.losing)} ${p.losing.length === 1 ? 'is' : 'are'} no longer available.`
  return renderEmail(subject, subject, [
    { kind: 'p', text: `Your ${p.planName} trial ends on ${p.endsOn}.${after} Your data stays.` },
    { kind: 'small', text: `Questions about your plan? Contact Vento: ${p.talkUrl}` },
  ])
}

function listOf(items: string[]): string {
  // "Board pack" → "the board pack", but "HR & payroll" and "UBO …" keep their capitals.
  const lower = items.map((i) =>
    /^[A-Z][a-z]/.test(i) ? i.charAt(0).toLowerCase() + i.slice(1) : i,
  )
  const named = lower.map((i) => `the ${i}`)
  return named.length <= 1
    ? (named[0] ?? '')
    : `${named.slice(0, -1).join(', ')} and ${named.at(-1)}`
}
