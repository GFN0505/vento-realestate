import type { ActivityRow } from '@vento/shared/console'
import { StatusBadge } from '@/components/status-badge'
import { formatDate } from '@/lib/format'

const time = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Africa/Lagos',
})

/** "26 Nov 2026, 21:14" (Lagos). */
export function formatWhen(iso: string): string {
  return `${formatDate(iso)}, ${time.format(new Date(iso))}`
}

/** Break-glass entries are rose "Command line" (spec); console changes are slate "Console". */
export function ChannelTag({ channel }: { channel: ActivityRow['channel'] }) {
  if (channel === 'command') return <StatusBadge tone="rose">Command line</StatusBadge>
  if (channel === 'scheduled') return <StatusBadge tone="slate">Scheduled</StatusBadge>
  return <StatusBadge tone="slate">Console</StatusBadge>
}

/**
 * One platform event in words: what, before → after, the reason, then who, when and where from.
 * `showOrganization` names the organization (the Activity page; not on its own detail page).
 */
export function ActivityItem({
  row,
  showOrganization = false,
}: {
  row: ActivityRow
  showOrganization?: boolean
}) {
  return (
    <li className="flex flex-col gap-1 border-t py-3 first:border-t-0">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="min-w-0 font-semibold text-[13.5px]">
          {row.summary}
          {showOrganization && row.organization && (
            <span className="font-normal text-muted-foreground"> · {row.organization.name}</span>
          )}
        </p>
        <ChannelTag channel={row.channel} />
      </div>
      {row.change && <p className="text-[13px] tabular-nums">{row.change}</p>}
      <p className="text-[13px] text-muted-foreground leading-relaxed">“{row.reason}”</p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {row.actorName} · <time dateTime={row.at}>{formatWhen(row.at)}</time>
        {row.operator && <span className="max-sm:hidden"> · {row.operator}</span>}
      </p>
    </li>
  )
}
