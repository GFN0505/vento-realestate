import { lazy, Suspense, useId, useState } from 'react'
import { CodeInput } from '@/components/auth/code-input'
import { PasswordInput } from '@/components/auth/password-input'
import { Button } from '@/components/ui/button'
import { FieldError, FieldLabel } from '@/components/ui/field'
import { PendingLabel } from '@/components/ui/pending-label'
import { hasFinePointer } from '@/lib/pointer'
import { SetupStep, SetupSteps } from './setup-steps'
import { formatTotpSecret, type useTwoStepSetup } from './use-two-step-setup'

// The QR encoder only loads once there's a code to draw.
const TotpQr = lazy(() => import('@/components/auth/totp-qr').then((m) => ({ default: m.TotpQr })))

type Setup = ReturnType<typeof useTwoStepSetup>

/** Confirm password → scan → enter a code. Backup codes follow on the page. */
export function TwoStepSetupSteps({ setup }: { setup: Setup }) {
  const { stage } = setup
  const scanning = stage.name === 'scan'
  return (
    <SetupSteps>
      <SetupStep n={1} state={scanning ? 'done' : 'current'} title="Confirm your password">
        <PasswordStep setup={setup} />
      </SetupStep>
      <SetupStep
        n={2}
        state={scanning ? 'current' : 'next'}
        title="Scan with Google Authenticator or Microsoft Authenticator"
      >
        {scanning && <ScanStep uri={stage.totpURI} />}
      </SetupStep>
      <SetupStep n={3} state={scanning ? 'current' : 'next'} title="Enter the 6-digit code">
        {scanning && <VerifyStep setup={setup} />}
      </SetupStep>
    </SetupSteps>
  )
}

function PasswordStep({ setup }: { setup: Setup }) {
  const id = useId()
  const [password, setPassword] = useState('')
  return (
    <form
      noValidate
      className="flex flex-col gap-2"
      onSubmit={(event) => {
        event.preventDefault()
        if (!password) return setup.setError('Enter your password.')
        void setup.confirmPassword(password)
      }}
    >
      <FieldLabel htmlFor={id} className="sr-only">
        Password
      </FieldLabel>
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="flex-1">
          <PasswordInput
            id={id}
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            aria-invalid={!!setup.error}
            aria-describedby={setup.error ? `${id}-error` : undefined}
            autoFocus={hasFinePointer()}
          />
        </div>
        <Button
          type="submit"
          disabled={setup.pending}
          aria-busy={setup.pending || undefined}
          className="relative h-12 md:h-10"
        >
          <PendingLabel pending={setup.pending}>Continue</PendingLabel>
        </Button>
      </div>
      <FieldError id={`${id}-error`} role="alert">
        {setup.error}
      </FieldError>
    </form>
  )
}

function ScanStep({ uri }: { uri: string }) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Suspense fallback={<div className="size-[132px] rounded-md bg-muted" />}>
        <TotpQr uri={uri} />
      </Suspense>
      <div className="max-w-[260px] leading-[1.55]">
        <span className="text-muted-foreground">Can't scan? Enter this key:</span>
        <br />
        <span className="select-all font-semibold tabular-nums tracking-[0.08em]">
          {formatTotpSecret(uri)}
        </span>
      </div>
    </div>
  )
}

function VerifyStep({ setup }: { setup: Setup }) {
  const errorId = useId()
  const [code, setCode] = useState('')
  return (
    <form
      noValidate
      className="flex flex-col gap-3"
      onSubmit={(event) => {
        event.preventDefault()
        void setup.verify(code)
      }}
    >
      <CodeInput
        size="compact"
        value={code}
        onChange={(value) => {
          setCode(value)
          if (setup.error && !setup.locked) setup.setError(null)
        }}
        onComplete={(value) => void setup.verify(value)}
        invalid={!!setup.error}
        disabled={setup.locked}
        aria-describedby={setup.error ? errorId : undefined}
      />
      <FieldError id={errorId} role="alert">
        {setup.error}
      </FieldError>
      <Button
        type="submit"
        size="lg"
        disabled={setup.pending || setup.locked}
        aria-busy={setup.pending || undefined}
        className="relative sm:self-start"
      >
        <PendingLabel pending={setup.pending}>Verify and turn on</PendingLabel>
      </Button>
    </form>
  )
}
