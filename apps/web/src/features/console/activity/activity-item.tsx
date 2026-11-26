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

/**
 * Break-glass entries are rose "Command line" (spec). A command row with no person is Vento's own
 * setup (bootstrap, seed), not break-glass, so it reads slate "Setup"; console changes are slate.
 */
export function ChannelTag({ row }: { row: Pick<ActivityRow, 'channel' | 'actorUserId'> }) {
  if (row.channel === 'command' && row.actorUserId === null) {
    return <StatusBadge tone="slate">Setup</StatusBadge>
  }
  if (row.channel === 'command') return <StatusBadge tone="rose">Command line</StatusBadge>
  if (row.channel === 'scheduled') return <StatusBadge tone="slate">Scheduled</StatusBadge>
  return <StatusBadge tone="slate">Console</StatusBadge>
}

const WORDS: Record<string, string> = {
  none: 'Not set',
  null: 'Not set',
  on: 'On',
  off: 'Off',
  internal: 'Internal',
  pilot: 'Pilot',
  standard: 'Standard',
  unlimited: 'Unlimited',
}

/**
 * "internal → pilot" → "Internal → Pilot"; "none → on" → "Not set → On". Nothing when the two
 * sides read the same (no change worth showing). Other values (plan names, amounts) stay as sent.
 */
export function changeWords(change: string | null): string | null {
  if (!change) return null
  const sides = change.split(' → ')
  if (sides.length !== 2) return change
  const [before = '', after = ''] = sides.map((side) => WORDS[side.trim()] ?? side.trim())
  return before === after ? null : `${before} → ${after}`
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
        <ChannelTag row={row} />
      </div>
      {changeWords(row.change) && (
        <p className="text-[13px] tabular-nums">{changeWords(row.change)}</p>
      )}
      <p className="text-[13px] text-muted-foreground leading-relaxed">“{row.reason}”</p>
      <p className="text-muted-foreground text-xs tabular-nums">
        {row.actorName} · <time dateTime={row.at}>{formatWhen(row.at)}</time>
        {row.operator && <span className="max-sm:hidden"> · {row.operator}</span>}
      </p>
    </li>
  )
}
