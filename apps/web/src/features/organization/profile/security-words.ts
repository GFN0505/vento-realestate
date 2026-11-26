import type { OrganizationSecurity } from '@vento/shared'

/**
 * The turn-on confirm (spec): "3 people haven't set it up: Grace Umeh, Kunle Ojo and 1 other.
 * They'll set it up at their next sign-in, or within 7 days." / "Everyone already has two-step on."
 */
export function peopleWithoutTwoStep({
  names,
  others,
}: OrganizationSecurity['withoutTwoStep']): string {
  const total = names.length + others
  if (total === 0) return 'Everyone already has two-step on.'
  const listed =
    others > 0
      ? `${names.join(', ')} and ${others} ${others === 1 ? 'other' : 'others'}`
      : names.length > 1
        ? `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`
        : (names[0] ?? '')
  const who = total === 1 ? "1 person hasn't" : `${total} people haven't`
  return `${who} set it up: ${listed}. They'll set it up at their next sign-in, or within 7 days.`
}
