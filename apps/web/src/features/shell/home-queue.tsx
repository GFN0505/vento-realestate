import { CircleCheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { StatusBadge } from '@/components/status-badge'
import { buttonVariants } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export type QueueTone = 'rose' | 'amber' | 'slate'

/** One thing a person should do, in words: what, on what, and when. */
export type HomeQueueItem = {
  key: string
  /** "Answer the registry's query" */
  title: string
  /** "Governor's consent, Plot 22" */
  meta: string
  /** "Queried 3 Nov", in the tone of how urgent it is. */
  due: { text: string; tone: QueueTone; badge: string }
  /** The button's verb: "Update stage". */
  action: string
}

export type QueueLinkProps = { className: string; 'aria-label': string; children: ReactNode }

type Props<T extends HomeQueueItem> = {
  items: readonly T[]
  /** The item's one action, as the module's own typed link: `<Link to=… {...props} />`. */
  renderLink: (item: T, props: QueueLinkProps) => ReactNode
  empty?: string
}

const DUE_TEXT = {
  rose: 'text-status-rose-fg',
  amber: 'text-status-amber-fg',
  slate: 'text-muted-foreground',
} as const
/** A small filled dot: how urgent, beside the due text (never colour alone). */
const DOT = {
  rose: 'bg-status-rose',
  amber: 'bg-status-amber',
  slate: 'bg-status-slate',
} as const

// Desktop: an outline button at the row's end. Phones (board HomeLandMobile): the whole card is
// the link; the button's words stay its accessible name and its focus ring outlines the card.
const linkClass = cn(
  buttonVariants({ variant: 'outline', size: 'sm' }),
  'shrink-0 max-md:absolute max-md:inset-0 max-md:z-10 max-md:h-auto max-md:rounded-[14px] max-md:border-0 max-md:bg-transparent max-md:text-transparent max-md:shadow-none max-md:hover:bg-transparent',
)

/**
 * A role home's queue (board HomeLand "Your queue"): sorted by due date, then impact, by the
 * module. Items aren't ticked off; they leave when the record they're about changes.
 */
export function HomeQueue<T extends HomeQueueItem>({
  items,
  renderLink,
  empty = "You're clear for today.",
}: Props<T>) {
  return (
    <QueueFrame>
      {items.length === 0 ? (
        <p className="flex items-center gap-3 rounded-[14px] border bg-card px-4 py-6 text-[13px] text-muted-foreground md:justify-center md:rounded-none md:border-0 md:py-9">
          <CircleCheckIcon aria-hidden className="size-4 shrink-0 text-status-emerald" />
          {empty}
        </p>
      ) : (
        <ul aria-label="Your queue" className="flex flex-col gap-2 md:gap-0">
          {items.map((item) => (
            <li
              key={item.key}
              className="relative flex min-h-[56px] items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 md:rounded-none md:border-0 md:border-b md:px-5 md:last:border-b-0"
            >
              <span
                aria-hidden
                className={cn('size-2 shrink-0 rounded-full max-md:hidden', DOT[item.due.tone])}
              />
              <div className="flex min-w-0 flex-1 flex-col gap-1 md:gap-0.5">
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0 font-semibold text-[14px] leading-snug md:text-[13px]">
                    {item.title}
                  </span>
                  <DueText item={item} className="md:hidden" />
                </span>
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[12px] text-muted-foreground tabular-nums">
                    {item.meta}
                  </span>
                  <StatusBadge tone={item.due.tone} className="md:hidden">
                    {item.due.badge}
                  </StatusBadge>
                </span>
              </div>
              <DueText item={item} className="max-md:hidden" />
              {renderLink(item, {
                className: linkClass,
                // Starts with the visible words; says everything the row shows, urgency included.
                'aria-label': `${item.action}: ${item.title}, ${item.meta}, ${item.due.text}, ${item.due.badge}`,
                children: item.action,
              })}
            </li>
          ))}
        </ul>
      )}
    </QueueFrame>
  )
}

function DueText({ item, className }: { item: HomeQueueItem; className?: string }) {
  return (
    <span
      className={cn(
        'shrink-0 whitespace-nowrap font-semibold text-[13px] tabular-nums md:text-[12px]',
        DUE_TEXT[item.due.tone],
        className,
      )}
    >
      {item.due.text}
    </span>
  )
}

/** A card with a header on desktop; on phones a heading over separate cards (HomeLandMobile). */
function QueueFrame({ children }: { children: ReactNode }) {
  return (
    <section
      aria-labelledby="home-queue-title"
      className="flex min-w-0 flex-col gap-2 md:gap-0 md:overflow-hidden md:rounded-xl md:border md:bg-card"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 md:min-h-[52px] md:items-center md:border-b md:px-5 md:py-3">
        <h2 id="home-queue-title" className="font-heading font-semibold text-[15px]">
          Your queue
        </h2>
        <span className="text-muted-foreground text-xs max-md:hidden">
          Sorted by due date, then impact
        </span>
      </div>
      {children}
    </section>
  )
}

/** Loading, in the queue's final shape. */
export function HomeQueueSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <QueueFrame>
      <div aria-hidden className="flex flex-col gap-2 md:gap-0">
        {Array.from({ length: rows }, (_, i) => (
          <div
            // biome-ignore lint/suspicious/noArrayIndexKey: placeholders have no identity.
            key={i}
            className="flex min-h-[56px] items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 md:rounded-none md:border-0 md:border-b md:px-5 md:last:border-b-0"
          >
            <Skeleton className="size-2 shrink-0 rounded-full max-md:hidden" />
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-52 max-w-full" />
              <Skeleton className="h-3 w-32" />
            </div>
            <Skeleton className="h-3 w-14 max-md:hidden" />
            <Skeleton className="h-8 w-28 max-md:hidden" />
          </div>
        ))}
      </div>
    </QueueFrame>
  )
}
