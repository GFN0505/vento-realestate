import { hostname, userInfo } from 'node:os'

/**
 * Who is at the keyboard, for the platform audit trail. Attribution, not authentication: anyone
 * with a shell and DATABASE_URL on the API host has super-admin power until the R2 console.
 * Prefers what devops sets per person (VENTO_OPERATOR), then the person behind sudo, then the
 * SSH client address, then the OS account.
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
  if (ssh) return `${base} from ${ssh}`
  return base
}

function safeUser(): string {
  try {
    return userInfo().username
  } catch {
    return 'unknown'
  }
}
