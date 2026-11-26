import { FingerprintIcon, LoaderCircleIcon } from 'lucide-react'
import { type FormEvent, useId, useState } from 'react'
import { CodeInput } from '@/components/auth/code-input'
import { FormAlert } from '@/components/auth/form-alert'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { browserSupportsPasskeys } from '@/lib/passkey-support'
import { hasFinePointer } from '@/lib/pointer'
import { useConsoleProof } from './use-console-proof'

type Props = { passkey: boolean }

const linkButton =
  'rounded-sm text-link text-xs outline-hidden hover:text-link-hover hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:inline-flex max-md:min-h-11 max-md:items-center'

/**
 * "Confirm it's you" (spec): a passkey, or a code from the authenticator app, or a backup code.
 * Never the password. Six digits submit by themselves; Enter submits a backup code.
 */
export function ConfirmItsYouForm({ passkey }: Props) {
  const ids = { code: useId(), status: useId() }
  const offerPasskey = passkey && browserSupportsPasskeys()
  const [mode, setMode] = useState<'passkey' | 'code' | 'backup'>(offerPasskey ? 'passkey' : 'code')
  const [code, setCode] = useState('')
  const [missing, setMissing] = useState<string | null>(null)
  const proof = useConsoleProof()
  const busy = proof.pending !== null
  const fieldError = missing ?? (proof.failure?.onField ? proof.failure.message : null)
  const formError = proof.failure && !proof.failure.onField ? proof.failure.message : null

  async function send(value: string) {
    if (busy) return
    const typed = mode === 'backup' ? value.trim() : value
    if (mode === 'backup' ? !typed : typed.length < 6) {
      return setMissing(mode === 'backup' ? 'Enter a backup code' : 'Enter all 6 digits.')
    }
    setMissing(null)
    const failure = await proof.confirm(
      mode === 'backup' ? { method: 'backup_code', code: typed } : { method: 'code', code: typed },
    )
    if (failure?.onField) setCode('')
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void send(code)
  }

  function switchTo(next: typeof mode) {
    setMode(next)
    setCode('')
    setMissing(null)
    proof.clearFailure()
  }

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <p id={ids.status} aria-live="polite" className="sr-only">
        {busy ? 'Checking…' : ''}
      </p>
      {formError && <FormAlert variant="error">{formError}</FormAlert>}
      {mode === 'passkey' ? (
        <>
          <Button
            type="button"
            size="lg"
            disabled={busy}
            aria-busy={busy || undefined}
            onClick={() => void proof.provePasskey()}
            autoFocus={hasFinePointer()}
          >
            {busy ? (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            ) : (
              <FingerprintIcon aria-hidden />
            )}
            Use passkey
          </Button>
          <button
            type="button"
            onClick={() => switchTo('code')}
            className={`${linkButton} self-center`}
          >
            Use a code instead
          </button>
        </>
      ) : (
        <>
          {/* The switch sits beside the label from sm, and under the code boxes on phones. */}
          <Field
            data-invalid={!!fieldError}
            className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 gap-y-1.5"
          >
            <FieldLabel htmlFor={ids.code} className="col-start-1 row-start-1">
              {mode === 'backup' ? 'Backup code' : 'Code from your authenticator app'}
            </FieldLabel>
            <div className="col-span-2 row-start-2">
              {mode === 'backup' ? (
                <Input
                  id={ids.code}
                  name="backup-code"
                  value={code}
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  autoFocus={hasFinePointer()}
                  className="tabular-nums tracking-wider"
                  onChange={(event) => setCode(event.target.value)}
                  aria-invalid={!!fieldError}
                  aria-describedby={fieldError ? `${ids.code}-error` : undefined}
                />
              ) : (
                <CodeInput
                  id={ids.code}
                  size="compact"
                  value={code}
                  autoFocus={hasFinePointer()}
                  disabled={busy}
                  onChange={(value) => {
                    setCode(value)
                    if (missing) setMissing(null)
                  }}
                  onComplete={(value) => void send(value)}
                  invalid={!!fieldError}
                  aria-describedby={fieldError ? `${ids.code}-error` : undefined}
                />
              )}
            </div>
            <div className="col-span-2 row-start-3">
              <FieldError id={`${ids.code}-error`} role="alert">
                {fieldError}
              </FieldError>
            </div>
            <button
              type="button"
              onClick={() => switchTo(mode === 'backup' ? 'code' : 'backup')}
              className={`${linkButton} max-sm:col-span-2 max-sm:row-start-4 max-sm:justify-self-start sm:col-start-2 sm:row-start-1 sm:justify-self-end`}
            >
              {mode === 'backup' ? 'Use your authenticator app' : 'Use a backup code'}
            </button>
          </Field>
          <Button type="submit" size="lg" disabled={busy} aria-busy={busy || undefined}>
            {busy && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            Confirm
          </Button>
          {offerPasskey && (
            <button
              type="button"
              onClick={() => switchTo('passkey')}
              className={`${linkButton} self-center`}
            >
              Use passkey instead
            </button>
          )}
        </>
      )}
    </form>
  )
}
