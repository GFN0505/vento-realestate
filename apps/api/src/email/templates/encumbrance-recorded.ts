import { type RenderedEmail, renderEmail } from './layout'

/**
 * To the owners whose companies include the parcel's, when an encumbrance is recorded (land spec
 * question 12; owner, 28 Nov 2026: non-blocking mortgages too). It never names the claimant,
 * lawyer or notes (owner, 28 Nov 2026): "Caveat recorded on Plot 22, Folu Ayo · blocks new
 * sales", with a link to the parcel for the details.
 */
export function encumbranceRecordedEmail(p: {
  /** "Caveat", "Court order". */
  typeLabel: string
  /** "4 Nov 2026": served or lodged. */
  servedOn: string
  recorderName: string
  parcelName: string
  organizationName: string
  blocksSales: boolean
  url: string
}): RenderedEmail {
  const subject = `${p.typeLabel} recorded on ${p.parcelName}`
  const headline = p.blocksSales
    ? `${subject} · blocks new sales`
    : `${subject} · Sales aren't blocked.`
  return renderEmail(subject, subject, [
    { kind: 'p', text: headline },
    {
      kind: 'p',
      text: `${p.recorderName} recorded it. Served or lodged on ${p.servedOn}.`,
    },
    ...(p.blocksSales
      ? [
          {
            kind: 'p' as const,
            text: "New sales on this parcel's units are blocked until it's cleared and approved.",
          },
        ]
      : []),
    { kind: 'button', label: 'Open parcel', url: p.url },
    {
      kind: 'small',
      text: `You're getting this because you're an owner of ${p.organizationName}.`,
    },
  ])
}
