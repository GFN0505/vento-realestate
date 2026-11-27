import { useEffect, useRef, useState } from 'react'
import { AuthHeader } from '@/components/auth/auth-layout'
import { BackupCodes } from '@/components/auth/backup-codes'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { ScanStep, VerifyStep } from '@/features/two-step/two-step-setup'
import { useTwoStepSetup } from '@/features/two-step/use-two-step-setup'
import { staffCodeError } from './join-words'

type Props = { password: string; email: string; onDone: () => void }

/**
 * Steps 2 and 3 (spec §1): scan, enter a code (which makes them a super-admin and accepts the
 * invitation), then save the backup codes. Starts at the scan: the password was just typed.
 */
export function JoinTwoStep({ password, email, onDone }: Props) {
  const setup = useTwoStepSetup()
  const [saved, setSaved] = useState(false)
  const started = useRef(false)
  const { confirmPassword } = setup

  useEffect(() => {
    if (started.current) return
    started.current = true
    void confirmPassword(password)
  }, [confirmPassword, password])

  if (setup.stage.name === 'codes') {
    return (
      <>
        <AuthHeader title="Save your backup codes">
          Use one if you can't get a code from your phone. Each code works once.
        </AuthHeader>
        <BackupCodes
          codes={setup.stage.backupCodes}
          email={email}
          saved={saved}
          onSavedChange={setSaved}
        />
        <Button size="lg" className="w-full" disabled={!saved} onClick={onDone}>
          I've saved them
        </Button>
      </>
    )
  }

  return (
    <>
      <AuthHeader title="Set up two-step sign-in">
        Staff accounts need it every time you sign in.
      </AuthHeader>
      {setup.stage.name === 'scan' ? (
        <div className="flex flex-col gap-5">
          <ScanStep uri={setup.stage.totpURI} />
          <VerifyStep setup={setup} label="Verify code" errorText={staffCodeError} />
        </div>
      ) : setup.error ? (
        <>
          <FormAlert variant="error">{setup.error}</FormAlert>
          <Button size="lg" variant="outline" onClick={() => void confirmPassword(password)}>
            Try again
          </Button>
        </>
      ) : (
        <div aria-busy="true" className="flex flex-wrap gap-4">
          <span className="sr-only" role="status">
            Preparing your code
          </span>
          <Skeleton className="size-[132px] rounded-md" />
          <Skeleton className="h-16 w-[220px]" />
        </div>
      )}
    </>
  )
}
