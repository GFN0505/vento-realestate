import type { EntityAccess, TeamInvitationRow, TwoStepState } from '@vento/shared'
import { MailIcon } from 'lucide-react'
import { Avatar } from '@/components/avatar'
import { StatusBadge } from '@/components/status-badge'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { formatDayMonth } from '@/lib/format'
import { cn } from '@/lib/utils'

/** Initials for members; a dashed mail tile for someone who hasn't joined yet. */
export function PersonAvatar({ name, invited }: { name: string; invited?: boolean }) {
  if (invited) {
    return (
      <span
        aria-hidden
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-dashed border-border bg-muted text-muted-foreground"
      >
        <MailIcon className="size-3.5" />
      </span>
    )
  }
  return <Avatar name={name} className="size-8 text-[11px]" />
}

export function YouTag() {
  return (
    // Foreground on muted: small text needs the full contrast (AA in both themes).
    <span className="rounded-full bg-muted px-1.5 py-px font-semibold text-[11px] text-foreground leading-4">
      You
    </span>
  )
}

const others = (n: number) => (n === 1 ? 'and 1 other' : `and ${n} others`)

/** Plain words for company access: "All companies", "Parkview Residences SPV Ltd", "2 companies". */
export function accessLabel(access: EntityAccess): string {
  if (access.kind === 'all') return 'All companies'
  const [only] = access.entities
  const base =
    access.entities.length === 1 && only ? only.name : `${access.entities.length} companies`
  return access.hiddenCount > 0 ? `${base} ${others(access.hiddenCount)}` : base
}

/** The label, with the names in a tooltip when there are several. */
export function AccessText({ access, className }: { access: EntityAccess; className?: string }) {
  const label = accessLabel(access)
  if (access.kind === 'all' || access.entities.length < 2) {
    // The title shows a long entity name in full where the cell truncates it.
    return (
      <span className={className} title={label}>
        {label}
      </span>
    )
  }
  const names = access.entities.map((e) => e.name).join(', ')
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* A button, so keyboard users can open the names too. */}
        <button
          type="button"
          className={cn(
            'max-w-full cursor-default rounded-sm text-left underline decoration-border decoration-dotted underline-offset-4 outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring',
            className,
          )}
        >
          {label}
          <span className="sr-only">: {names}</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{names}</TooltipContent>
    </Tooltip>
  )
}

const TWO_STEP: Record<TwoStepState, { tone: 'emerald' | 'slate' | 'amber'; label: string }> = {
  on: { tone: 'emerald', label: 'On' },
  off: { tone: 'slate', label: 'Off' },
  setup_required: { tone: 'amber', label: 'Set up at next sign-in' },
  reset_pending: { tone: 'amber', label: 'Reset, waiting for new password' },
}

export function TwoStepBadge({ state, className }: { state: TwoStepState; className?: string }) {
  const { tone, label } = TWO_STEP[state]
  return (
    <StatusBadge tone={tone} className={className}>
      {label}
    </StatusBadge>
  )
}

export function twoStepLabel(state: TwoStepState): string {
  return TWO_STEP[state].label
}

export function isUndelivered(row: Pick<TeamInvitationRow, 'delivery'>): boolean {
  return row.delivery === 'failed' || row.delivery === 'bounced' || row.delivery === 'complained'
}

/** "Invited · expires 3 Dec" · "Expired 30 Nov" · "Email not delivered". */
export function InvitationBadge({ row }: { row: TeamInvitationRow }) {
  if (isUndelivered(row)) return <StatusBadge tone="rose">Email not delivered</StatusBadge>
  if (row.status === 'expired') {
    return <StatusBadge tone="rose">Expired {formatDayMonth(row.expiresAt)}</StatusBadge>
  }
  return <StatusBadge tone="amber">Invited · expires {formatDayMonth(row.expiresAt)}</StatusBadge>
}

/**
 * Making them an owner waits for a second person (brick 4): an amber badge, not colour alone,
 * with the full words for hover and screen readers.
 */
export function OwnerPending({ row }: { row: { kind: string; pendingApproval?: unknown } }) {
  if (row.kind !== 'member' || !row.pendingApproval) return null
  return (
    <span title="Owner · waiting for approval" className="mt-1 flex">
      <StatusBadge tone="amber">
        Owner · waiting<span className="sr-only"> for approval</span>
      </StatusBadge>
    </span>
  )
}
