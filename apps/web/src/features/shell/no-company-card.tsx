import { useQuery } from '@tanstack/react-query'
import { Building2Icon } from 'lucide-react'
import { useMe } from '@/features/preview/use-effective-permissions'
import { orpc } from '@/lib/orpc'

/**
 * Home, for a member whose every company was archived: a calm card saying who to ask, instead
 * of empty numbers (spec "Company switcher changes").
 */
export function NoCompanyCard() {
  const me = useMe()
  const who = useQuery(
    orpc.access.whoCanChangeAccess.queryOptions({
      input: { module: 'settings' },
      staleTime: 300_000,
    }),
  )
  const first = who.data?.contacts[0]
  const ask = first ? `${first.name} (${first.roleName.toLowerCase()})` : 'an owner'
  return (
    <section className="flex items-start gap-3.5 rounded-[12px] border bg-card px-4 py-4 sm:px-5">
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-status-amber-bg text-status-amber-fg"
      >
        <Building2Icon className="size-5" strokeWidth={1.8} />
      </span>
      <p aria-live="polite" className="text-[14px] leading-relaxed">
        You don't have access to any active company in{' '}
        {me.organization?.name ?? 'this organization'}.{' '}
        <span className="text-muted-foreground">
          {who.isPending ? '' : `Ask ${ask} to give you access.`}
        </span>
      </p>
    </section>
  )
}
