import { useQuery } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { orpc } from '@/lib/orpc'
import { cn } from '@/lib/utils'
import { type OrgWideRefusal, orgWideRefusalText } from './org-wide-access'

/** A calm line above something the viewer can see but not change, saying who can. */
export function ReadOnlyNote({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        'flex gap-2.5 rounded-lg border bg-muted/40 px-3.5 py-3 text-[13px] leading-relaxed',
        className,
      )}
    >
      <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0">{children}</span>
    </p>
  )
}

/** "Only people with access to every company can change this. Ask Olumide Bankole (owner)." */
export function OrgWideReadOnlyNote({
  refusal,
  className,
}: {
  refusal: OrgWideRefusal
  className?: string
}) {
  // Asked only on a read-only page; the 403 page uses the same answer.
  const who = useQuery(
    orpc.access.whoCanChangeAccess.queryOptions({
      input: { module: 'settings' },
      staleTime: 5 * 60_000,
    }),
  )
  const first = who.data?.contacts[0]
  const ask = first ? `${first.name} (${first.roleName.toLowerCase()})` : null
  return (
    <ReadOnlyNote className={className}>
      {who.isPending ? (
        <Skeleton aria-hidden className="inline-block h-3.5 w-72 max-w-full align-middle" />
      ) : (
        orgWideRefusalText(refusal, ask)
      )}
    </ReadOnlyNote>
  )
}
