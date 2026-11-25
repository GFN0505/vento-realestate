import { type RenderedEmail, renderEmail } from './layout'

export function verifyEmail(p: { name: string; url: string; code: string }): RenderedEmail {
  return renderEmail('Verify your email for Vento', `Welcome to Vento, ${p.name}`, [
    { kind: 'p', text: 'Confirm this is your email to finish creating your account.' },
    { kind: 'button', label: 'Verify email', url: p.url },
    { kind: 'p', text: 'Or enter this code on the Verify email screen:' },
    { kind: 'code', code: p.code },
    { kind: 'small', text: 'The link and code expire in 30 minutes.' },
    { kind: 'small', text: "If you didn't create a Vento account, you can ignore this email." },
  ])
}

/** Sent instead of a second account when someone signs up with an email that already has one. */
export function existingAccountSignUp(p: {
  name: string
  signInUrl: string
  resetUrl: string
}): RenderedEmail {
  return renderEmail('Someone tried to create a Vento account with your email', `Hello ${p.name}`, [
    {
      kind: 'p',
      text: 'Someone tried to create a Vento account with your email. Sign in or reset your password.',
    },
    { kind: 'button', label: 'Sign in', url: p.signInUrl },
    { kind: 'p', text: `Forgot your password? Reset it here: ${p.resetUrl}` },
    {
      kind: 'small',
      text: "If this wasn't you, you don't need to do anything. Your account is unchanged.",
    },
  ])
}
