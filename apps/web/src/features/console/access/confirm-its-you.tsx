import { ShieldCheckIcon } from 'lucide-react'
import { DialogBody } from '@/components/ui/dialog'
import { DialogFrame, dialogBodyClass } from '@/features/security/dialogs/dialog-frame'
import { consoleGate } from '../gate/console-gate'
import { useConsoleTitle } from '../shell/use-console-title'
import { ConfirmItsYouForm } from './confirm-its-you-form'

export const ENTRY_LINE =
  'Use your passkey or a code from your authenticator app to open the Vento console.'
export const EXPIRED_LINE =
  "Your console session timed out. Confirm it's you to carry on. Your change is still here."

/** On arrival: a page-level card in the console's frame (pattern: My security dialogs). */
export function ConfirmItsYouCard({ passkey }: { passkey: boolean }) {
  useConsoleTitle("Confirm it's you")
  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-5 rounded-xl border bg-card p-5 sm:mt-10 sm:p-7">
      <div className="flex flex-col gap-3">
        <span className="flex size-11 items-center justify-center rounded-xl tile-gradient text-tile-icon">
          <ShieldCheckIcon aria-hidden className="size-5" strokeWidth={1.8} />
        </span>
        <h1 tabIndex={-1} className="font-heading font-semibold text-[22px] tracking-[-0.02em]">
          Confirm it's you
        </h1>
        <p className="text-[13.5px] text-muted-foreground leading-relaxed">{ENTRY_LINE}</p>
      </div>
      <ConfirmItsYouForm passkey={passkey} />
    </div>
  )
}

/**
 * Mid-task: over the page and any open sheet, which keeps its fields and reason (spec). Closing
 * it lets the waiting request fail with its own error; nothing is lost.
 */
export function ConfirmItsYouDialog({ open, passkey }: { open: boolean; passkey: boolean }) {
  return (
    <DialogFrame
      open={open}
      onClose={() => consoleGate.dismissed()}
      title="Confirm it's you"
      description={EXPIRED_LINE}
      className="z-[60]"
    >
      <DialogBody className={`${dialogBodyClass} pb-5`}>
        <ConfirmItsYouForm passkey={passkey} />
      </DialogBody>
    </DialogFrame>
  )
}
