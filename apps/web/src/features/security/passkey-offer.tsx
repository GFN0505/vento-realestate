import { useQuery } from '@tanstack/react-query'
import { useLocation } from '@tanstack/react-router'
import { FingerprintIcon, LoaderCircleIcon } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DialogBody, DialogFooter } from '@/components/ui/dialog'
import { clearPasskeyOffer, offerSeenKey } from '@/features/auth/passkey-offer-flag'
import { useMe } from '@/features/preview/use-effective-permissions'
import { securityQuery } from '@/features/settings/security-queries'
import { hasPlatformAuthenticator } from '@/lib/passkey-support'
import { readItem, writeItem } from '@/lib/storage'
import { ConfirmPasswordDialog } from './dialogs/confirm-password-dialog'
import { DialogFrame, dialogFooterClass } from './dialogs/dialog-frame'
import { useAddPasskey } from './passkey-actions'
import { thisDeviceKind } from './security-words'

/**
 * "Sign in faster next time" (spec, plan question 12): once per device per person, right after
 * a password sign-in, when this device has Face ID, Touch ID, a fingerprint or Windows Hello and
 * none of the person's passkeys is named for this kind of device.
 */
export function PasskeyOffer() {
  const me = useMe()
  const onSecurityPage = useLocation({ select: (l) => l.pathname === '/settings/security' })
  const security = useQuery(securityQuery())
  const [platform, setPlatform] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const passkeys = useAddPasskey()
  const seenKey = offerSeenKey(me.user.id)

  useEffect(() => {
    void hasPlatformAuthenticator().then(setPlatform)
  }, [])

  useEffect(() => {
    const data = security.data
    if (platform === null || (!data && !security.isError)) return
    // Decided once per sign-in, whatever the answer.
    clearPasskeyOffer()
    const kind = thisDeviceKind()
    const hasOneHere = !!kind && !!data?.passkeys.items.some((p) => p.name.includes(kind))
    const offer =
      !!data?.passkeys.available &&
      platform &&
      !hasOneHere &&
      !onSecurityPage &&
      readItem(seenKey) === null
    if (offer) setOpen(true)
  }, [platform, security.data, security.isError, onSecurityPage, seenKey])

  function answer() {
    writeItem(seenKey, '1')
    setOpen(false)
  }

  return (
    <>
      <DialogFrame
        open={open}
        busy={passkeys.pending}
        onClose={answer}
        title="Sign in faster next time"
        className="md:max-w-[420px]"
      >
        <DialogBody className="items-center gap-4 py-6 text-center max-md:flex-1 max-md:justify-center">
          <span
            aria-hidden
            className="flex size-14 items-center justify-center rounded-2xl bg-selected text-selected-foreground ring-8 ring-highlight"
          >
            <FingerprintIcon className="size-7" strokeWidth={1.6} />
          </span>
          <p className="max-w-xs text-[13.5px] text-muted-foreground leading-relaxed">
            Use Face ID or your fingerprint instead of a password and code on this device.
          </p>
        </DialogBody>
        <DialogFooter className={dialogFooterClass}>
          <Button variant="ghost" disabled={passkeys.pending} onClick={answer}>
            Not now
          </Button>
          <Button
            disabled={passkeys.pending}
            aria-busy={passkeys.pending || undefined}
            onClick={async () => {
              writeItem(seenKey, '1')
              await passkeys.add()
              setOpen(false)
            }}
          >
            {passkeys.pending ? (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            ) : (
              <FingerprintIcon aria-hidden />
            )}
            Add a passkey
          </Button>
        </DialogFooter>
      </DialogFrame>
      <ConfirmPasswordDialog />
    </>
  )
}
