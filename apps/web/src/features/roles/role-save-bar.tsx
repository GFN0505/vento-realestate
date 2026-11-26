import { CircleAlertIcon, LoaderCircleIcon, RotateCcwIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { apiErrorMessage, isHandledElsewhere } from '@/lib/api-errors'
import { cn } from '@/lib/utils'

/** "3 changes · applies to 4 people on their next click" (spec "Save bar"). */
export function saveBarLine(count: number, people: number): string {
  const changes = `${count} ${count === 1 ? 'change' : 'changes'}`
  if (people === 0) return `${changes} · applies to nobody yet`
  return `${changes} · applies to ${people} ${people === 1 ? 'person' : 'people'} on their next click`
}

type Props = {
  count: number
  people: number
  empty: boolean
  pending: boolean
  error: unknown
  stale: boolean
  onDiscard: () => void
  onSave: () => void
  onReload: () => void
}

/**
 * Slides up from the bottom when a role has unsaved changes; sits above the tabs on phones. A
 * Save that's always on screen invites "did it save?", so this appears only when there's
 * something to save (CHANGES.md).
 */
export function RoleSaveBar({
  count,
  people,
  empty,
  pending,
  error,
  stale,
  onDiscard,
  onSave,
  onReload,
}: Props) {
  const problem = error && !isHandledElsewhere(error) ? apiErrorMessage(error) : null
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-3 pb-2 md:bottom-6 md:px-6 lg:pl-[calc(var(--sidebar-width)+2rem)]">
      <section
        aria-label="Unsaved changes"
        className="pointer-events-auto mx-auto flex max-w-3xl flex-col gap-2.5 rounded-[14px] border border-sidebar-edge bg-sidebar px-4 py-3 text-sidebar-foreground shadow-2xl motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-4 motion-safe:duration-200 sm:flex-row sm:items-center sm:gap-4 sm:py-2.5 sm:pr-2.5 sm:pl-5"
      >
        <p aria-live="polite" className="min-w-0 flex-1 text-[13px] leading-snug">
          {problem ? (
            <span className="flex items-start gap-2">
              <CircleAlertIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-status-rose" />
              {problem}
            </span>
          ) : empty ? (
            'Give this role access to at least one area'
          ) : (
            <span className="tabular-nums">{saveBarLine(count, people)}</span>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          {stale ? (
            <Button onClick={onReload} className="h-10 flex-1 sm:flex-none">
              <RotateCcwIcon aria-hidden />
              Reload
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                onClick={onDiscard}
                disabled={pending}
                className={cn(
                  'h-10 flex-1 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-foreground sm:flex-none',
                )}
              >
                Discard
              </Button>
              <Button
                onClick={onSave}
                disabled={pending || empty}
                aria-busy={pending || undefined}
                aria-keyshortcuts="Meta+S Control+S"
                className="h-10 flex-1 sm:flex-none"
              >
                {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                Save changes
              </Button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
