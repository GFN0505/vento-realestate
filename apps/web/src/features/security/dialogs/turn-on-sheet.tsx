import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BackupCodes } from '@/components/auth/backup-codes'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import { useMe } from '@/features/preview/use-effective-permissions'
import { securityQuery } from '@/features/settings/security-queries'
import { useShellActions } from '@/features/shell/use-shell-actions'
import { TwoStepSetupSteps } from '@/features/two-step/two-step-setup'
import { useTwoStepSetup } from '@/features/two-step/use-two-step-setup'
import { orpc } from '@/lib/orpc'
import { twoStepSetupUi } from '@/lib/two-step-setup-ui'
import { CLEARED_NOTE, useClearedOnExpiry } from '../use-cleared-on-expiry'
import { DialogFrame, dialogBodyClass, dialogFooterClass, dialogFormClass } from './dialog-frame'

type Props = {
  open: boolean
  onClose: () => void
  /** Two-step is required now (the 7 days ran out): no closing, but Sign out stays. */
  required?: boolean
  /** After the codes are saved, e.g. reload what was refused while two-step was missing. */
  onDone?: () => void
}

/**
 * Turn on two-step (spec, 4 clicks): 2a's steps in a sheet over the page, then the backup codes.
 * Also opened by the "requires two-step" banner and when the 7 days run out mid-work, so the
 * page and whatever was typed on it stay underneath.
 */
export function TurnOnSheet({ open, onClose, required = false, onDone }: Props) {
  const me = useMe()
  const [stage, setStage] = useState<'setup' | 'codes'>('setup')
  if (!open && stage !== 'setup') setStage('setup')
  const org = me.twoStepRequiredBy?.reason === 'organization' ? me.twoStepRequiredBy : null
  return (
    <DialogFrame
      open={open}
      // The codes must be saved before it closes (spec): two-step is already on by then.
      busy={required || stage === 'codes'}
      onClose={onClose}
      title={stage === 'codes' ? 'Two-step is on' : 'Set up two-step sign-in'}
      description={
        stage === 'codes'
          ? undefined
          : org
            ? `${org.organizationName} requires a code from an authenticator app when you sign in. It takes about a minute.`
            : 'Add a code from an authenticator app when you sign in. It takes about a minute.'
      }
      className="md:max-w-[560px]"
    >
      {open && (
        <TurnOnFlow
          onStage={setStage}
          onClose={() => {
            onClose()
            onDone?.()
          }}
          email={me.user.email}
          required={required}
        />
      )}
    </DialogFrame>
  )
}

type FlowProps = {
  onStage: (stage: 'setup' | 'codes') => void
  onClose: () => void
  email: string
  required: boolean
}

function TurnOnFlow(props: FlowProps) {
  const [attempt, setAttempt] = useState(0)
  // A session that ends mid-setup starts again from the password, which is never kept.
  const cleared = useClearedOnExpiry(() => setAttempt((n) => n + 1))
  return <Flow key={attempt} cleared={cleared} {...props} />
}

function Flow({ cleared, onStage, onClose, email, required }: FlowProps & { cleared: boolean }) {
  const queryClient = useQueryClient()
  const actions = useShellActions()
  const setup = useTwoStepSetup()
  const [saved, setSaved] = useState(false)
  const [finishing, setFinishing] = useState(false)
  const codes = setup.stage.name === 'codes'
  useEffect(() => onStage(codes ? 'codes' : 'setup'), [codes, onStage])

  if (setup.stage.name === 'codes') {
    return (
      <div className={dialogFormClass}>
        <DialogBody className={dialogBodyClass}>
          <BackupCodes
            codes={setup.stage.backupCodes}
            email={email}
            saved={saved}
            onSavedChange={setSaved}
          />
        </DialogBody>
        <DialogFooter className={dialogFooterClass}>
          <Button
            disabled={!saved || finishing}
            aria-busy={finishing || undefined}
            onClick={async () => {
              setFinishing(true)
              // The banner, Team and the Sign-in card all read these.
              await Promise.all([
                queryClient.invalidateQueries({ queryKey: orpc.account.me.key() }),
                queryClient.invalidateQueries({ queryKey: securityQuery().queryKey }),
              ])
              toast.success('Two-step is on')
              onClose()
            }}
          >
            {finishing && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            Done
          </Button>
        </DialogFooter>
      </div>
    )
  }

  return (
    <DialogBody className={`${dialogBodyClass} pb-5`}>
      {cleared && <FormAlert variant="info">{CLEARED_NOTE}</FormAlert>}
      <TwoStepSetupSteps setup={setup} />
      {required && (
        <p className="border-t pt-3 text-muted-foreground text-xs">
          Not now?{' '}
          <button
            type="button"
            onClick={() => {
              twoStepSetupUi.close()
              void actions.signOut()
            }}
            className="rounded-sm font-semibold text-link outline-hidden hover:underline focus-visible:outline-2 focus-visible:outline-ring max-md:inline-flex max-md:min-h-11 max-md:items-center"
          >
            Sign out
          </button>
        </p>
      )}
    </DialogBody>
  )
}
