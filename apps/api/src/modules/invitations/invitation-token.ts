import { createHash, randomBytes } from 'node:crypto'

/** 256 random bits, URL-safe. Only its hash is stored, so a database leak can't accept invitations. */
export function newInvitationToken(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashInvitationToken(token) }
}

export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}
