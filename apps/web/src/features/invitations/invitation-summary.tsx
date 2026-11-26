import type { InvitationPreview } from '@vento/shared'
import { AuthHeader } from '@/components/auth/auth-layout'
import { formatDate, initials } from '@/lib/format'

/** Board AcceptInvite, top half: who invited you, to what, and what the role can do. */
export function InvitationSummary({ preview }: { preview: InvitationPreview }) {
  const access =
    preview.entities === 'all' ? 'All companies' : preview.entities.join(', ') || 'No companies yet'
  const rows = [
    ['Access', access],
    ['Can approve', preview.canApprove.length ? preview.canApprove.join(', ') : 'Nothing'],
    ['Two-step sign-in', preview.twoStepRequired ? 'Required for this role' : 'Optional'],
  ] as const
  return (
    <>
      <div className="flex items-center gap-3.5 rounded-xl border bg-muted p-3.5">
        <span
          aria-hidden
          className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-sidebar font-bold text-sidebar-foreground"
        >
          {initials(preview.organizationName)}
        </span>
        <div className="min-w-0 [overflow-wrap:anywhere]">
          <div className="font-semibold text-[15px]">{preview.organizationName}</div>
          <div className="text-muted-foreground text-xs">
            {preview.inviterName} invited you · expires {formatDate(preview.expiresOn)}
          </div>
        </div>
      </div>
      <AuthHeader title={`Join as ${preview.roleName}`} />
      <dl className="text-[13px] tabular-nums">
        {rows.map(([label, value], index) => (
          <div
            key={label}
            className={`flex justify-between gap-4 py-2 ${index > 0 ? 'border-t' : ''}`}
          >
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="min-w-0 text-right font-semibold [overflow-wrap:anywhere]">{value}</dd>
          </div>
        ))}
      </dl>
    </>
  )
}
