import { LoaderCircleIcon } from 'lucide-react'
import { AlertDialog as Primitive } from 'radix-ui'
import type { ReactNode, RefObject } from 'react'
import { Button } from '@/components/ui/button'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** Asks the question: "Remove Grace Umeh?" */
  title: string
  /** The consequence, in one or two sentences. */
  children: ReactNode
  /** Repeats the action exactly: "Remove Grace Umeh". */
  confirmLabel: string
  cancelLabel?: string
  destructive?: boolean
  pending?: boolean
  /** A field the confirm needs, under the explanation (e.g. a reason). */
  extra?: ReactNode
  /** Where focus starts instead of Cancel, e.g. the reason field in `extra`. */
  initialFocus?: RefObject<HTMLElement | null>
  onConfirm: () => void
}

/**
 * Confirm only for permanent or sensitive actions (design-system: undo over confirm). The title
 * asks, the body explains, the button repeats the action. Focus starts on Cancel so Enter never
 * removes someone by accident; Esc cancels. Closing is blocked while the action runs.
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel = 'Cancel',
  destructive = false,
  pending = false,
  extra,
  initialFocus,
  onConfirm,
}: Props) {
  return (
    <Primitive.Root open={open} onOpenChange={(next) => !pending && onOpenChange(next)}>
      <Primitive.Portal>
        <Primitive.Overlay className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none" />
        <Primitive.Content
          onOpenAutoFocus={
            initialFocus
              ? (event) => {
                  event.preventDefault()
                  initialFocus.current?.focus()
                }
              : undefined
          }
          className="data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 fixed top-1/2 left-1/2 z-50 flex w-[calc(100%-2rem)] max-w-[440px] -translate-x-1/2 -translate-y-1/2 flex-col gap-3 rounded-xl bg-card p-5 text-card-foreground shadow-2xl outline-none duration-200 data-[state=closed]:animate-out data-[state=open]:animate-in motion-reduce:animate-none sm:p-6"
        >
          <Primitive.Title className="font-heading font-semibold text-[17px] leading-snug">
            {title}
          </Primitive.Title>
          <Primitive.Description className="text-[13.5px] text-muted-foreground leading-relaxed">
            {children}
          </Primitive.Description>
          {extra}
          <div className="mt-2 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Primitive.Cancel asChild>
              <Button variant="ghost" disabled={pending} className="max-sm:h-11">
                {cancelLabel}
              </Button>
            </Primitive.Cancel>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              disabled={pending}
              aria-busy={pending || undefined}
              onClick={onConfirm}
              className="max-sm:h-11"
            >
              {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
              {confirmLabel}
            </Button>
          </div>
        </Primitive.Content>
      </Primitive.Portal>
    </Primitive.Root>
  )
}
