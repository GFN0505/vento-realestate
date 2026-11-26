import type { CDPSession, Page } from '@playwright/test'

export type VirtualAuthenticator = {
  cdp: CDPSession
  id: string
  credentials: () => Promise<{ credentialId: string; userHandle?: string }[]>
  /** Face ID / fingerprint succeeds (true) or the person fails the check (false). */
  setUserVerified: (verified: boolean) => Promise<void>
  removeAll: () => Promise<void>
}

/**
 * A platform authenticator inside Chromium (CDP), like Face ID on a phone: resident keys, user
 * verification that passes, and presence simulated so no prompt waits for a tap. It belongs to
 * this page's tab; add it before the first navigation so the page sees it from the start.
 */
export async function addVirtualAuthenticator(
  page: Page,
  options: {
    userVerified?: boolean
    hasUserVerification?: boolean
    hasResidentKey?: boolean
    /**
     * Headless Chromium answers the email field's suggestions at once, so a stored passkey would
     * sign in the moment Sign in opens, racing the test. Off unless a test is about suggestions.
     */
    suggestions?: boolean
  } = {},
): Promise<VirtualAuthenticator> {
  if (!options.suggestions) {
    await page.addInitScript(() => {
      window.PublicKeyCredential.isConditionalMediationAvailable = async () => false
    })
  }
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable')
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: options.hasResidentKey ?? true,
      hasUserVerification: options.hasUserVerification ?? true,
      isUserVerified: options.userVerified ?? true,
      automaticPresenceSimulation: true,
    },
  })
  return {
    cdp,
    id: authenticatorId,
    credentials: async () =>
      (await cdp.send('WebAuthn.getCredentials', { authenticatorId })).credentials,
    setUserVerified: async (isUserVerified) => {
      await cdp.send('WebAuthn.setUserVerified', { authenticatorId, isUserVerified })
    },
    removeAll: async () => {
      await cdp.send('WebAuthn.clearCredentials', { authenticatorId })
    },
  }
}
