import { readItem, writeItem } from '@/lib/storage'

/*
 * "Sign in faster next time" (spec): set by the sign-in page after a password sign-in and
 * cleared by the offer once it has decided. Tab-scoped, so it never follows the person to
 * another tab or a later visit.
 */

const KEY = 'vento-offer-passkey'

export function offerPasskeyAfterSignIn(): void {
  writeItem(KEY, '1', 'session')
}

export function passkeyOfferPending(): boolean {
  return readItem(KEY, 'session') === '1'
}

export function clearPasskeyOffer(): void {
  writeItem(KEY, null, 'session')
}

/** Seen on this device, per person: never offered again after either answer. */
export const offerSeenKey = (userId: string) => `vento-passkey-offer-seen:${userId}`
