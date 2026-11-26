/*
 * My security's address: `/settings/security?do=change-password`. ⌘K opens the page with the
 * action to start; the page runs it once and clears it, so Back and Reload never repeat it.
 * Hand-written, not zod: route search validation runs in the entry bundle.
 */

export const SECURITY_INTENTS = ['change-password', 'add-passkey', 'turn-on'] as const
export type SecurityIntent = (typeof SECURITY_INTENTS)[number]

export type SecuritySearch = { do?: SecurityIntent }

export function validateSecuritySearch(search: Record<string, unknown>): SecuritySearch {
  const intent = SECURITY_INTENTS.find((value) => value === search.do)
  return intent ? { do: intent } : {}
}
