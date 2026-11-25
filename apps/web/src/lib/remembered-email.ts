/** The last email that signed in with "Keep me signed in" ticked, on this device only. */
const KEY = 'vento-last-email'

// Storage can throw (private mode, storage disabled, quota); remembering is only a nicety.
export function readRememberedEmail(): string | undefined {
  try {
    return localStorage.getItem(KEY) ?? undefined
  } catch {
    return undefined
  }
}

/** Remember the email only when they chose to stay signed in; otherwise forget any old one. */
export function rememberEmail(email: string, keepSignedIn: boolean): void {
  try {
    if (keepSignedIn) localStorage.setItem(KEY, email)
    else localStorage.removeItem(KEY)
  } catch {
    // Nothing to do: the next sign-in simply starts with an empty email.
  }
}

export function forgetRememberedEmail(): void {
  rememberEmail('', false)
}
