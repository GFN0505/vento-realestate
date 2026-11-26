import { TWO_STEP_GRACE_MS } from '@/auth/policy'

/** Everything the gate needs about one person in one organization, for one session. */
export type TwoStepGateInput = {
  /** The authenticator app is set up ("two-step on"). A passkey sign-in never sets this. */
  twoFactorEnabled: boolean
  /** An owner or admin reset it: required everywhere until set up again. */
  twoStepSetupRequired: boolean
  /** The member's role requires it. */
  roleRequiresTwoStep: boolean
  /** The organization's "Require two-step for everyone", and when it was last changed. */
  organization: { required: boolean; since: Date | null }
  /**
   * When this session entered the organization (sign-in, switch, invitation). null when there's
   * no session yet (accepting an invitation before signing in), which counts as entering now.
   */
  enteredAt: Date | null
}

/**
 * `ok`: go ahead. `required`: set up two-step before anything else. `grace`: the organization
 * turned the setting on while this session was already in it; work goes on until `deadline`
 * (the banner), unless the person signs in or switches in again first.
 */
export type TwoStepGate = { kind: 'ok' } | { kind: 'required' } | { kind: 'grace'; deadline: Date }

export function twoStepGate(input: TwoStepGateInput, now: Date): TwoStepGate {
  if (input.twoFactorEnabled) return { kind: 'ok' }
  if (input.twoStepSetupRequired || input.roleRequiresTwoStep) return { kind: 'required' }
  const { required, since } = input.organization
  if (!required) return { kind: 'ok' }
  // The database guarantees `since` whenever the setting is on; without it, be strict.
  if (!since || !input.enteredAt || input.enteredAt >= since) return { kind: 'required' }
  const deadline = new Date(since.getTime() + TWO_STEP_GRACE_MS)
  return now >= deadline ? { kind: 'required' } : { kind: 'grace', deadline }
}

/**
 * When the session entered the membership's organization: now, when this request is moving it
 * there (the session pointed elsewhere or nowhere), else what the session recorded.
 */
export function enteredAtFor(
  session: { activeOrganizationId: string | null; organizationEnteredAt: Date },
  organizationId: string,
  now: Date,
): Date {
  return session.activeOrganizationId === organizationId ? session.organizationEnteredAt : now
}

/** The gate for a signed-in person and their membership (the middleware, `me`, switching). */
export function memberTwoStepGate(
  user: { twoFactorEnabled: boolean; twoStepSetupRequired: boolean },
  member: {
    requiresTwoStep: boolean
    organizationTwoStep: { required: boolean; since: Date | null }
  },
  enteredAt: Date | null,
  now: Date,
): TwoStepGate {
  return twoStepGate(
    {
      twoFactorEnabled: user.twoFactorEnabled,
      twoStepSetupRequired: user.twoStepSetupRequired,
      roleRequiresTwoStep: member.requiresTwoStep,
      organization: member.organizationTwoStep,
      enteredAt,
    },
    now,
  )
}
