import { useQueryClient } from '@tanstack/react-query'
import { LoaderCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BackupCodes } from '@/components/auth/backup-codes'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import { useMe } from '@/features/preview/use-effective-permissions'
import { TwoStepSetupSteps } from '@/features/two-step/two-step-setup'
import { useTwoStepSetup } from '@/features/two-step/use-two-step-setup'
import { orpc } from '@/lib/orpc'
import { securityQuery } from '../security-queries'
import { CLEARED_NOTE, useClearedOnExpiry } from '../use-cleared-on-expiry'
import { DialogFrame, dialogBodyClass, dialogFooterClass, dialogFormClass } from './dialog-frame'

type Props = { open: boolean; onClose: () => void }

/**
 * Turn on two-step (spec, 4 clicks): 2a's steps in a sheet over the page, then the backup codes.
 * Also opened by the "requires two-step" banner and when the 7 days run out mid-work, so the
 * page and whatever was typed on it stay underneath.
 */
export function TurnOnSheet({ open, onClose }: Props) {
  const me = useMe()
  const [stage, setStage] = useState<'setup' | 'codes'>('setup')
  if (!open && stage !== 'setup') setStage('setup')
  const org = me.twoStepRequiredBy?.reason === 'organization' ? me.twoStepRequiredBy : null
  return (
    <DialogFrame
      open={open}
      // The codes must be saved before it closes (spec): two-step is already on by then.
      busy={stage === 'codes'}
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
      {open && <TurnOnFlow onStage={setStage} onClose={onClose} email={me.user.email} />}
    </DialogFrame>
  )
}

function TurnOnFlow({
  onStage,
  onClose,
  email,
}: {
  onStage: (stage: 'setup' | 'codes') => void
  onClose: () => void
  email: string
}) {
  const [attempt, setAttempt] = useState(0)
  // A session that ends mid-setup starts again from the password, which is never kept.
  const cleared = useClearedOnExpiry(() => setAttempt((n) => n + 1))
  return <Flow key={attempt} cleared={cleared} onStage={onStage} onClose={onClose} email={email} />
}

function Flow({
  cleared,
  onStage,
  onClose,
  email,
}: {
  cleared: boolean
  onStage: (stage: 'setup' | 'codes') => void
  onClose: () => void
  email: string
}) {
  const queryClient = useQueryClient()
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
    </DialogBody>
  )
}
