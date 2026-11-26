import {
  defaultPermissions,
  defaultRole,
  type Me,
  type MePlan,
  type SystemRoleKey,
} from '@vento/shared'

/** The owner's plan block: Starter, with a Commissions hint and an email contact. */
export function testPlan(overrides: Partial<MePlan> = {}): MePlan {
  return {
    name: 'Starter',
    limits: [{ key: 'entities', included: 2, used: 2 }],
    aiBudget: null,
    trial: null,
    upgradeHints: [{ key: 'sales.commissions', label: 'Commissions', availableOn: 'Growth' }],
    contact: { email: 'hello@vento.ng', whatsapp: null },
    ...overrides,
  }
}

/**
 * A signed-in member of Lekki Partners Ltd with the role's default permissions. Owners get a
 * plan block (as the server sends it), everyone else `plan: null`.
 */
export function testMe(roleKey: SystemRoleKey, overrides: Partial<Me> = {}): Me {
  const role = defaultRole(roleKey)
  return {
    user: {
      id: 'u',
      name: 'Bisi Lawal',
      email: 'bisi@lekkipartners.ng',
      twoFactorEnabled: true,
      companyName: null,
    },
    organization: { id: 'org-a', name: 'Lekki Partners Ltd', internal: false },
    features: [],
    plan: roleKey === 'owner' ? testPlan() : null,
    organizations: [{ id: 'org-a', name: 'Lekki Partners Ltd', roleName: role.name }],
    member: {
      id: 'm',
      role: { id: `role-${roleKey}`, key: roleKey, name: role.name },
      entityIds: null,
      permissions: defaultPermissions(role),
    },
    nextStep: 'ready',
    twoStepRequired: false,
    ...overrides,
  }
}
