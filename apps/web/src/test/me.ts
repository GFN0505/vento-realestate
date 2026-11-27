import {
  DEFAULT_ROLES,
  defaultPermissions,
  defaultRole,
  type Me,
  type MePlan,
  type Role,
  type SystemRoleKey,
  toggleCell,
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
    twoStepRequiredBy: null,
    twoStepSetupBy: null,
    // As the server computes it: settings create and all-companies access.
    canAddCompany: roleKey === 'owner' || roleKey === 'admin',
    console: null,
    approvalsWaiting: 0,
    // As the server computes it: the role can approve in some module.
    canSeeApprovals: Object.values(defaultPermissions(role)).some((a) => a.includes('approve')),
    ...overrides,
  }
}

const BUILT_IN_READ_ONLY = {
  reason: 'built_in',
  message: "Built-in roles can't be changed. Duplicate this role to make your own version.",
} as const

/**
 * The built-in roles as `roles.list` returns them to an owner; Finance can approve finance.
 * Nobody holds them unless a test says so.
 */
export function testRoles(): Role[] {
  return DEFAULT_ROLES.map((r) => ({
    id: `role-${r.key}`,
    key: r.key,
    name: r.name,
    pluralName: r.pluralName,
    description: r.description,
    isSystem: true,
    requiresTwoStep: r.requiresTwoStep,
    permissions: defaultPermissions(r),
    canApprove: r.key === 'finance' ? ['finance'] : [],
    version: 1,
    memberCount: 0,
    invitedCount: 0,
    can: { assign: true, edit: false, delete: false, duplicate: true },
    readOnly: BUILT_IN_READ_ONLY,
  }))
}

/** A custom role an owner can edit and delete ("Site engineer", from Project manager). */
export function testCustomRole(overrides: Partial<Role> = {}): Role {
  const base = defaultRole('project_manager')
  return {
    id: 'role-site-engineer',
    key: null,
    name: 'Site engineer',
    pluralName: 'people with the Site engineer role',
    description: 'Based on Project manager',
    isSystem: false,
    requiresTwoStep: false,
    // Without Projects: Approve: any Approve locks two-step on (decision 0024), and this role
    // stands for one that doesn't need it.
    permissions: toggleCell(defaultPermissions(base), 'projects', 'approve', false),
    canApprove: [],
    version: 1,
    memberCount: 0,
    invitedCount: 0,
    can: { assign: true, edit: true, delete: true, duplicate: true },
    readOnly: null,
    ...overrides,
  }
}
