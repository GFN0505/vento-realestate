import { Link, type LinkProps } from '@tanstack/react-router'
import { ArrowLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/** "← Organizations" above a detail page's title (board AdminOrgDetail). */
export function BackLink({ to, children }: { to: LinkProps['to']; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="-ml-1 inline-flex min-h-8 items-center gap-1 rounded-sm px-1 font-semibold text-link text-xs outline-hidden hover:text-link-hover focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
    >
      <ArrowLeftIcon aria-hidden className="size-3.5" />
      {children}
    </Link>
  )
}

/** The table head and cell classes every console table shares (Team's pattern). */
export const th =
  'h-10 px-3 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] first:pl-5 last:pr-5'
export const td = 'h-[60px] px-3 align-middle first:pl-5 last:pr-5'
export const nameLink =
  'truncate rounded-sm text-left font-semibold outline-hidden hover:underline hover:underline-offset-4 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring'
export const cardRow =
  'flex min-h-[64px] w-full flex-col gap-1.5 rounded-[14px] border bg-card px-3.5 py-3 text-left outline-hidden transition-colors active:bg-muted focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring'
