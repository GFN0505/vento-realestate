import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { NavItem } from './nav'

/**
 * "Your workspace": the modules this member can open (decision 12: only those), each with a few
 * words on what it holds. Unbuilt ones use a quieter icon tile; one note by the heading says
 * they open as they ship, instead of a label on every card.
 */
export function WorkspaceGrid({ modules }: { modules: readonly NavItem[] }) {
  const anySoon = modules.some((m) => m.status === 'soon')
  return (
    <section aria-labelledby="workspace-title" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="workspace-title" className="font-heading font-semibold text-[15px]">
          Your workspace
        </h2>
        {anySoon && (
          <p className="text-muted-foreground text-xs">Each module opens here as it ships.</p>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {modules.map((item) => {
          const soon = item.status === 'soon'
          return (
            <li key={item.key} className="flex">
              <Link
                to={item.to}
                className="group flex w-full items-center gap-3 rounded-[10px] border bg-card px-4 py-3.5 outline-none transition-colors hover:border-input-hover focus-visible:outline-2 focus-visible:outline-ring"
              >
                <span
                  aria-hidden
                  className={cn(
                    'flex size-9 shrink-0 items-center justify-center rounded-lg',
                    soon
                      ? 'bg-muted text-muted-foreground'
                      : 'bg-selected text-selected-foreground',
                  )}
                >
                  <item.icon className="size-[18px]" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-semibold text-[13.5px]">
                    {item.label}
                    {soon && <span className="sr-only">, coming soon</span>}
                  </span>
                  <span className="truncate text-muted-foreground text-xs">{item.summary}</span>
                </span>
                <ArrowUpRightIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
