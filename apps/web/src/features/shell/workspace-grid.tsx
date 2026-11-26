import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { type NavAccess, type NavItem, navTag } from './nav'

/**
 * "Your workspace": the modules this member can open (decision 12: only those) as cards, each
 * with a few words on what it holds and a link to its page. Unbuilt modules carry a small cyan
 * dot, explained once in the header, instead of a caption on every card. Early access modules
 * carry the same small tag as the sidebar.
 */
export function WorkspaceGrid({
  modules,
  access,
  className,
}: {
  modules: readonly NavItem[]
  access: NavAccess
  className?: string
}) {
  if (modules.length === 0) return null
  const anySoon = modules.some((m) => navTag(access, m) === 'soon')
  return (
    <section aria-labelledby="workspace-title" className={cn('flex flex-col gap-4', className)}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <h2 id="workspace-title" className="font-heading font-semibold text-lg tracking-[-0.01em]">
          Your workspace
        </h2>
        {anySoon && (
          <p className="flex items-center gap-2 text-muted-foreground text-xs">
            <span aria-hidden className="size-1.5 rounded-full bg-logo-dot" />
            Opening soon
          </p>
        )}
      </div>
      <ul className="grid gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-3">
        {modules.map((item) => {
          const tag = navTag(access, item)
          const soon = tag === 'soon'
          return (
            <li key={item.key} className="flex">
              <Link
                to={item.to}
                className="group relative flex w-full items-center gap-3.5 rounded-xl border bg-card p-4 outline-hidden transition-[transform,box-shadow,border-color] duration-200 ease-out hover:-translate-y-0.5 hover:border-input-hover hover:shadow-lift focus-visible:outline-2 focus-visible:outline-ring motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:p-5"
              >
                <span
                  aria-hidden
                  className="flex size-11 shrink-0 items-center justify-center rounded-xl tile-gradient text-tile-icon"
                >
                  <item.icon className="size-5" strokeWidth={1.75} />
                </span>
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="flex items-center gap-2 font-semibold text-[14px]">
                    <span className="truncate">{item.label}</span>
                    {soon && (
                      <>
                        <span aria-hidden className="size-1.5 shrink-0 rounded-full bg-logo-dot" />
                        <span className="sr-only">, opening soon</span>
                      </>
                    )}
                    {tag === 'early_access' && <Badge variant="brand">Early access</Badge>}
                  </span>
                  <span className="text-pretty text-muted-foreground text-xs leading-snug">
                    {item.summary}
                  </span>
                </span>
                <ArrowRightIcon
                  aria-hidden
                  className="size-4 shrink-0 text-muted-foreground opacity-0 transition-[opacity,transform] duration-200 group-hover:translate-x-0.5 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                />
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
