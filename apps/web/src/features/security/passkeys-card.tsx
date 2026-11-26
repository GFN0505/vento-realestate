import type { SecurityOverview } from '@vento/shared'
import { FingerprintIcon, LoaderCircleIcon, PlusIcon } from 'lucide-react'
import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import { browserSupportsPasskeys } from '@/lib/passkey-support'
import { PasskeyRow } from './passkey-row'
import { SecuritySection } from './security-section'

type Props = {
  data: SecurityOverview
  adding: boolean
  onAdd: () => void
  addRef?: Ref<HTMLButtonElement>
}

const INTRO =
  'Sign in with Face ID, Touch ID, your fingerprint or Windows Hello. No password or code to type.'

/** Card 3 (spec "Passkeys"), shown only when passkeys are available here. */
export function PasskeysCard({ data, adding, onAdd, addRef }: Props) {
  const { items, limit } = data.passkeys
  const supported = browserSupportsPasskeys()
  const full = items.length >= limit
  const required = data.twoStep.requiredBy !== null

  const add = (primary: boolean) =>
    supported && !full ? (
      <Button
        ref={addRef}
        variant={primary ? 'default' : 'outline'}
        disabled={adding}
        aria-busy={adding || undefined}
        onClick={onAdd}
        className="max-sm:h-11"
      >
        {adding ? (
          <LoaderCircleIcon aria-hidden className="animate-spin" />
        ) : (
          <PlusIcon aria-hidden />
        )}
        Add a passkey
      </Button>
    ) : null

  return (
    <SecuritySection
      id="passkeys"
      title="Passkeys"
      description={INTRO}
      action={items.length > 0 && add(false)}
    >
      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 px-5 py-8 text-center max-sm:gap-4 sm:px-6">
          <span
            aria-hidden
            className="relative flex size-14 items-center justify-center rounded-2xl bg-selected text-selected-foreground ring-8 ring-highlight dark:ring-0"
          >
            <FingerprintIcon className="size-7" strokeWidth={1.6} />
          </span>
          <p className="max-w-sm text-[13px] text-muted-foreground leading-relaxed">
            No passkeys yet. Add one on the phone or laptop you use most, and sign in with your face
            or fingerprint next time.
          </p>
          {add(true)}
          <Notes supported={supported} full={false} shared={supported} />
        </div>
      ) : (
        <>
          <ul aria-label="Passkeys" className="flex flex-col divide-y">
            {items.map((passkey) => (
              <li key={passkey.id}>
                <PasskeyRow passkey={passkey} />
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-1 px-5 py-3 sm:px-6">
            <Notes supported={supported} full={full} shared={supported && !full} />
            {required && (
              <p className="text-muted-foreground text-xs leading-relaxed">
                A passkey counts as two-step when you sign in. Keep your authenticator app too, in
                case you lose this device.
              </p>
            )}
          </div>
        </>
      )}
    </SecuritySection>
  )
}

function Notes({
  supported,
  full,
  shared,
}: {
  supported: boolean
  full: boolean
  shared: boolean
}) {
  return (
    <>
      {!supported && (
        <p className="text-[13px] text-muted-foreground">
          This browser can't create passkeys. Try a recent version of Safari, Chrome or Edge.
        </p>
      )}
      {supported && full && (
        <p className="text-[13px] text-muted-foreground">
          You can have up to 10 passkeys. Remove one you no longer use.
        </p>
      )}
      {shared && (
        <p className="text-muted-foreground text-xs">
          Only add a passkey on a device that's yours.
        </p>
      )}
    </>
  )
}
