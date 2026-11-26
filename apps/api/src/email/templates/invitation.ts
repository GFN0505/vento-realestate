import { type RenderedEmail, renderEmail } from './layout'

export function invitationEmail(p: {
  organizationName: string
  inviterName: string
  roleName: string
  /** Company (entity) names, or 'all'. */
  entities: string[] | 'all'
  canApprove: string[]
  twoStepRequired: boolean
  expiresOn: string
  url: string
}): RenderedEmail {
  const access = p.entities === 'all' ? 'All companies' : p.entities.join(', ')
  return renderEmail(
    `${p.inviterName} invited you to ${p.organizationName} on Vento`,
    `Join ${p.organizationName} on Vento`,
    [
      {
        kind: 'p',
        text: `${p.inviterName} invited you to join ${p.organizationName} as ${p.roleName}.`,
      },
      { kind: 'p', text: `Access: ${access}` },
      ...(p.canApprove.length
        ? [{ kind: 'p' as const, text: `Can approve: ${p.canApprove.join(', ')}` }]
        : []),
      ...(p.twoStepRequired
        ? [
            {
              kind: 'p' as const,
              text: 'This role requires two-step sign-in with an authenticator app.',
            },
          ]
        : []),
      { kind: 'button', label: 'Accept invitation', url: p.url },
      { kind: 'small', text: `This invitation expires on ${p.expiresOn}.` },
    ],
  )
}
