import type { ComponentProps, ReactNode } from 'react'
import { SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

type Props = Omit<ComponentProps<typeof SheetContent>, 'title'> & {
  title: ReactNode
  description?: ReactNode
  /** Above the title: an avatar or icon. */
  lead?: ReactNode
  footer?: ReactNode
  /** Phones: the visible height while the keyboard is open (sticky footer stays above it). */
  height?: number | null
}

/**
 * The side-sheet archetype for Team (invite, member, invitation): header, a body that scrolls,
 * and a footer that stays put. 480px on larger screens; full screen on phones.
 */
export function SheetFrame({
  title,
  description,
  lead,
  footer,
  height,
  children,
  className,
  style,
  ...props
}: Props) {
  return (
    <SheetContent
      side="right"
      className={cn(
        'w-full gap-0 sm:w-[min(100vw,480px)] max-sm:border-l-0 max-sm:shadow-none',
        className,
      )}
      style={height ? { ...style, height } : style}
      {...props}
    >
      <header className="flex flex-col gap-1 border-b px-5 pt-5 pb-4 pr-16 sm:px-6">
        {lead}
        <SheetTitle className="text-lg leading-snug tracking-[-0.01em]">{title}</SheetTitle>
        {description ? (
          <SheetDescription className="text-pretty text-[13px] leading-relaxed">
            {description}
          </SheetDescription>
        ) : (
          <SheetDescription className="sr-only">{title}</SheetDescription>
        )}
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-5 py-5 sm:px-6">
        {children}
      </div>
      {footer && (
        <footer className="flex flex-col gap-3 border-t bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:px-6">
          {footer}
        </footer>
      )}
    </SheetContent>
  )
}
