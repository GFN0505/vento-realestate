import { hostname, userInfo } from 'node:os'
import { maskIp } from '@/lib/client-ip'

/**
 * Who is at the keyboard, for the platform audit trail. Attribution, not authentication: anyone
 * with a shell and DATABASE_URL on the API host has super-admin power until the R2 console.
 * Prefers what devops sets per person (VENTO_OPERATOR), then the person behind sudo, then the
 * SSH client's masked address, then the OS account.
 */
export function operatorIdentity(
  env: NodeJS.ProcessEnv = process.env,
  os: { user: string; host: string } = { user: safeUser(), host: hostname() },
): string {
  const base = `${os.user}@${os.host}`
  const named = env.VENTO_OPERATOR?.trim()
  if (named) return `${named} (${base})`
  const sudo = env.SUDO_USER?.trim()
  if (sudo) return `${sudo} via sudo (${base})`
  const ssh = env.SSH_CONNECTION?.trim().split(/\s+/)[0]
  // Masked like every address Vento keeps ("102.89.34.x"); the full one is never stored (L5).
  if (ssh) return `${base} from ${maskIp(ssh) ?? 'a private network'}`
  return base
}

function safeUser(): string {
  try {
    return userInfo().username
  } catch {
    return 'unknown'
  }
}
