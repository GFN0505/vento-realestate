import { CONSOLE_IDLE_MS, CONSOLE_MAX_MS, CONSOLE_PROOF_FRESH_MS } from '@/auth/policy'

// The Vento console window on one session (admin-console plan §2). Pure: decided at read time
// from the session row Better Auth already loaded, so closing it needs no write.

export type ConsoleSessionFields = {
  secondFactorAt: Date | null
  consoleOpenedAt: Date | null
  consoleActiveAt: Date | null
}

export type ConsoleWindow = { open: false } | { open: true; closesAt: Date }

export function consoleWindow(s: ConsoleSessionFields, now: Date): ConsoleWindow {
  if (!s.consoleOpenedAt) return { open: false }
  const opened = s.consoleOpenedAt.getTime()
  const active = (s.consoleActiveAt ?? s.consoleOpenedAt).getTime()
  const t = now.getTime()
  if (t - opened >= CONSOLE_MAX_MS || t - active >= CONSOLE_IDLE_MS) return { open: false }
  return {
    open: true,
    closesAt: new Date(Math.min(opened + CONSOLE_MAX_MS, active + CONSOLE_IDLE_MS)),
  }
}

/** A passkey, code or backup code proven in the last 5 minutes: the console opens without asking. */
export function proofIsFresh(s: Pick<ConsoleSessionFields, 'secondFactorAt'>, now: Date): boolean {
  return (
    s.secondFactorAt !== null &&
    now.getTime() - s.secondFactorAt.getTime() <= CONSOLE_PROOF_FRESH_MS
  )
}
