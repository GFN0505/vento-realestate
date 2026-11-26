import type { SecurityOverview, SessionItem } from '@vento/shared'

/** My security as `account.security` returns it: two-step off, nothing required, no passkeys. */
export function testSecurity(overrides: Partial<SecurityOverview> = {}): SecurityOverview {
  return {
    name: 'Grace Umeh',
    email: 'grace@ventohomes.ng',
    passwordChangedAt: null,
    twoStep: { enabled: false, requiredBy: null, backupCodesLeft: null },
    passkeys: { available: true, items: [], limit: 10 },
    reauthenticatedUntil: null,
    ...overrides,
  }
}

export function testSession(overrides: Partial<SessionItem> = {}): SessionItem {
  return {
    id: '019300aa-0000-7000-8000-000000000001',
    device: 'Mac',
    browser: 'Chrome',
    ipMasked: '102.89.34.x',
    place: 'Lekki, Lagos',
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
    persistent: false,
    isCurrent: false,
    ...overrides,
  }
}
