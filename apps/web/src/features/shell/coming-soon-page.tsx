import { Link } from '@tanstack/react-router'
import { ArrowLeftIcon, CheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { MODULE_HIGHLIGHTS } from './module-highlights'
import { type NavKey, navItem } from './nav'
import { usePageTitle } from './use-page-title'

/**
 * A module that isn't built yet, at its real address so links and ⌘K keep working when it ships.
 * Centred on a faint grid and a brand glow: the module's tinted icon, its purpose, what it will
 * do in three points, and the way back. Only reached by roles that can view the module.
 */
export function ComingSoonPage({ navKey }: { navKey: NavKey }) {
  const item = navItem(navKey)
  const highlights = MODULE_HIGHLIGHTS[navKey] ?? []
  usePageTitle(item.label, { module: item.module })

  return (
    <div className="relative isolate mx-auto flex w-full max-w-2xl flex-col items-center px-2 pt-6 pb-10 text-center sm:pt-12">
      <div
        aria-hidden
        className="-z-10 pointer-events-none absolute inset-x-0 top-0 h-[520px] surface-grid"
      />
      <div
        aria-hidden
        className="-z-10 pointer-events-none absolute top-0 left-1/2 size-[min(360px,100%)] -translate-x-1/2 surface-glow"
      />

      <span
        aria-hidden
        className="flex size-[72px] items-center justify-center rounded-[20px] border border-card bg-card shadow-lift"
      >
        <span className="flex size-14 items-center justify-center rounded-2xl tile-gradient text-tile-icon">
          <item.icon className="size-7" strokeWidth={1.6} />
        </span>
      </span>

      <p className="mt-6 flex items-center gap-2 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.12em]">
        <span aria-hidden className="size-1.5 rounded-full bg-logo-dot" />
        Coming soon
      </p>
      <h1
        tabIndex={-1}
        className="mt-2 font-heading font-semibold text-[30px] leading-tight tracking-[-0.03em] sm:text-[36px]"
      >
        {item.label}
      </h1>
      <p className="mt-3 max-w-lg text-pretty text-[15px] text-muted-foreground leading-relaxed">
        {item.comingSoon}
      </p>

      {highlights.length > 0 && (
        <ul
          aria-label={`What ${item.label} will do`}
          className="mt-8 grid w-full gap-2.5 text-left sm:grid-cols-3 sm:gap-3"
        >
          {highlights.map((point) => (
            <li
              key={point}
              className="flex gap-2.5 rounded-xl border bg-card p-4 text-[13px] leading-snug"
            >
              <CheckIcon
                aria-hidden
                className="mt-px size-4 shrink-0 text-tile-icon"
                strokeWidth={2.2}
              />
              <span>{point}</span>
            </li>
          ))}
        </ul>
      )}

      <Button variant="outline" asChild className="mt-8 max-md:h-11">
        <Link to="/">
          <ArrowLeftIcon aria-hidden />
          Back to home
        </Link>
      </Button>
    </div>
  )
}
