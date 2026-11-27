import { Link } from '@tanstack/react-router'
import type { AttentionItem, Dashboard } from '@vento/shared/console'
import { CircleCheckIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { DetailCard } from '../ui/detail-card'
import { count } from '../words'
import { attentionWords } from './dashboard-words'

const DOT = { rose: 'bg-status-rose', amber: 'bg-status-amber', slate: 'bg-status-slate' } as const
const LABEL = { rose: 'Urgent', amber: 'Soon', slate: 'Quiet' } as const

function ItemAction({ item, choosePlan }: { item: AttentionItem; choosePlan: boolean }) {
  const className = 'shrink-0 max-md:h-11'
  if (item.kind === 'command_line') {
    return (
      <Button size="sm" variant="outline" asChild className={className}>
        <Link to="/console/activity">Review</Link>
      </Button>
    )
  }
  return (
    <Button size="sm" variant={choosePlan ? 'default' : 'outline'} asChild className={className}>
      <Link
        to="/console/organizations/$organizationId"
        params={{ organizationId: item.organization.id }}
        search={choosePlan ? { change: 'plan' } : {}}
      >
        {choosePlan ? 'Choose a plan' : 'Review'}
      </Link>
    </Button>
  )
}

/**
 * Needs attention (spec §2): command-line changes, trials ending, limits, no plan and quiet
 * organizations, in that order; each row carries the one action that resolves it.
 */
export function AttentionQueue({ attention }: { attention: Dashboard['attention'] }) {
  return (
    <DetailCard title="Needs attention" flush>
      {attention.items.length === 0 ? (
        <p className="flex items-start gap-3 px-4 py-4 text-[13px] text-muted-foreground sm:px-[18px]">
          <CircleCheckIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-status-emerald" />
          Nothing needs attention. Command-line changes, trials ending, limits and quiet
          organizations appear here.
        </p>
      ) : (
        <ul aria-label="Needs attention">
          {attention.items.map((item) => {
            const words = attentionWords(item)
            const key =
              item.kind === 'command_line' ? item.eventId : `${item.kind}:${item.organization.id}`
            return (
              <li
                key={key}
                data-testid="attention-row"
                className="flex items-center gap-3 border-t px-4 py-2.5 first:border-t-0 sm:px-[18px]"
              >
                <span aria-hidden className={cn('size-2 shrink-0 rounded-full', DOT[words.tone])} />
                <span className="sr-only">{LABEL[words.tone]}: </span>
                <span className="min-w-0 flex-1 text-[13px] leading-snug">{words.text}</span>
                <ItemAction item={item} choosePlan={words.action === 'choose_plan'} />
              </li>
            )
          })}
        </ul>
      )}
      {attention.more > 0 && (
        <p className="border-t px-4 py-2.5 text-[13px] sm:px-[18px]">
          <Link
            to="/console/organizations"
            className="rounded-sm font-semibold text-link outline-hidden hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring"
          >
            and {count(attention.more)} more
          </Link>
        </p>
      )}
    </DetailCard>
  )
}
