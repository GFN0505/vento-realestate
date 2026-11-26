import type { ReactNode } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  onClose: () => void
  title: string
  description?: ReactNode
  /** While a request runs the dialog can't be closed (no half-done change). */
  busy?: boolean
  /** The dialog's form: a `DialogBody` and a `DialogFooter`. */
  children: ReactNode
  className?: string
}

/**
 * My security's dialogs (pattern: dialog). Centred on larger screens; under 768 px a full-height
 * sheet whose footer stays above the phone keyboard (spec "Phones"). Focus is trapped and
 * returns to the button that opened it (Radix).
 */
export function DialogFrame({
  open,
  onClose,
  title,
  description,
  busy,
  children,
  className,
}: Props) {
  const height = useVisualViewportHeight(open)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && !busy && onClose()}>
      <DialogContent
        showCloseButton={!busy}
        style={height ? { height } : undefined}
        onInteractOutside={(event) => busy && event.preventDefault()}
        className={cn(
          'max-md:top-0 max-md:left-0 max-md:h-dvh max-md:w-full max-md:max-w-none max-md:translate-x-0 max-md:grid-rows-[auto_minmax(0,1fr)] max-md:rounded-none',
          className,
        )}
      >
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription className="leading-relaxed">{description}</DialogDescription>
          ) : (
            <DialogDescription className="sr-only">{title}</DialogDescription>
          )}
        </DialogHeader>
        {children}
      </DialogContent>
    </Dialog>
  )
}

/** The dialog's form fills a phone screen: fields scroll, the footer stays put. */
export const dialogFormClass = 'flex min-h-0 flex-col max-md:h-full'
export const dialogBodyClass = 'max-md:flex-1 max-md:overflow-y-auto'
export const dialogFooterClass =
  'max-md:pb-[max(0.875rem,env(safe-area-inset-bottom))] max-md:[&>button]:h-11'
