import type { SecurityOverview, SessionItem } from '@vento/shared'
import { lazy, Suspense, useState } from 'react'
import { ConfirmPasswordDialog } from './dialogs/confirm-password-dialog'
import { RemovePasskeyDialog } from './dialogs/remove-passkey-dialog'
import { SignOutOthersDialog } from './dialogs/sign-out-others-dialog'
import { type SecurityDialog, securityUi, useSecurityUi } from './security-dialogs'

// The password and two-step dialogs bring Better Auth's client: loaded on first open.
const ChangePasswordDialog = lazy(() =>
  import('./dialogs/change-password-dialog').then((m) => ({ default: m.ChangePasswordDialog })),
)
const TurnOnSheet = lazy(() =>
  import('./dialogs/turn-on-sheet').then((m) => ({ default: m.TurnOnSheet })),
)
const TurnOffDialog = lazy(() =>
  import('./dialogs/turn-off-dialog').then((m) => ({ default: m.TurnOffDialog })),
)
const NewCodesDialog = lazy(() =>
  import('./dialogs/new-codes-dialog').then((m) => ({ default: m.NewCodesDialog })),
)

type Lazy = 'change-password' | 'turn-on' | 'turn-off' | 'new-codes'

type Props = { data: SecurityOverview | undefined; sessions: readonly SessionItem[] | undefined }

/** Every My security dialog. Each lazy one stays mounted after its first open, to animate out. */
export function SecurityDialogs({ data, sessions }: Props) {
  const dialog = useSecurityUi((s) => s.dialog)
  const [used, setUsed] = useState<ReadonlySet<Lazy>>(new Set())
  const name = dialog?.name
  if (name && isLazy(name) && !used.has(name)) setUsed(new Set(used).add(name))
  const is = (n: SecurityDialog['name']) => name === n
  const others = sessions?.filter((s) => !s.isCurrent).length ?? 0

  return (
    <>
      <ConfirmPasswordDialog />
      <RemovePasskeyDialog dialog={dialog?.name === 'remove-passkey' ? dialog : null} />
      <SignOutOthersDialog dialog={dialog?.name === 'sign-out-others' ? dialog : null} />
      <Suspense fallback={null}>
        {used.has('change-password') && (
          <ChangePasswordDialog
            open={is('change-password')}
            onClose={securityUi.close}
            otherDevices={others}
          />
        )}
        {used.has('turn-on') && <TurnOnSheet open={is('turn-on')} onClose={securityUi.close} />}
        {used.has('turn-off') && <TurnOffDialog open={is('turn-off')} onClose={securityUi.close} />}
        {used.has('new-codes') && (
          <NewCodesDialog open={is('new-codes')} onClose={securityUi.close} email={data?.email} />
        )}
      </Suspense>
    </>
  )
}

function isLazy(name: SecurityDialog['name']): name is Lazy {
  return (
    name === 'change-password' || name === 'turn-on' || name === 'turn-off' || name === 'new-codes'
  )
}
