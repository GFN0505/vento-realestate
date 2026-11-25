import { type RenderedEmail, renderEmail } from './layout'

export function resetPassword(p: { name: string; url: string }): RenderedEmail {
  return renderEmail('Reset your Vento password', 'Reset your password', [
    { kind: 'p', text: `Hello ${p.name}, use the button below to choose a new password.` },
    { kind: 'button', label: 'Reset password', url: p.url },
    { kind: 'small', text: 'The link works once and expires in 30 minutes.' },
    {
      kind: 'small',
      text: "If you didn't ask for this, you can ignore this email. Your password won't change.",
    },
  ])
}
