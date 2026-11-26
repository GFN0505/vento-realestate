import { useMutation, useQueryClient } from '@tanstack/react-query'
import type { SessionItem } from '@vento/shared'
import { LaptopIcon, LoaderCircleIcon, SmartphoneIcon, TabletIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { sessionsQuery } from '@/features/settings/security-queries'
import { toastApiError } from '@/lib/api-errors'
import { orpc } from '@/lib/orpc'
import { securityUi } from './security-dialogs'
import { SecurityRow, SecuritySection } from './security-section'
import {
  devicesWords,
  deviceWords,
  lastActiveWords,
  orderSessions,
  signedInWords,
  whereWords,
} from './security-words'

/** Card 4 (spec "Where you're signed in"): every device, this one first, each can be signed out. */
const VISIBLE = 5

export function SessionsCard({ sessions }: { sessions: readonly SessionItem[] }) {
  const rows = orderSessions(sessions)
  const others = rows.filter((s) => !s.isCurrent).length
  const [expanded, setExpanded] = useState(false)
  const shown = expanded ? rows : rows.slice(0, VISIBLE)
  const hidden = rows.length - shown.length
  const anyPlace = rows.some((s) => s.place)

  return (
    <SecuritySection
      id="devices"
      title="Where you're signed in"
      description={`Signed in on ${devicesWords(rows.length)}`}
      action={
        others > 0 && (
          <Button
            variant="outline"
            className="border-status-rose-border text-status-rose-fg hover:bg-status-rose-bg hover:text-status-rose-fg max-sm:h-11"
            onClick={() => securityUi.open({ name: 'sign-out-others', count: others })}
          >
            Sign out other devices
          </Button>
        )
      }
    >
      <ul aria-label="Devices" className="flex flex-col divide-y">
        {shown.map((session) => (
          <li key={session.id}>
            <SessionRow session={session} />
          </li>
        ))}
      </ul>
      {hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="flex min-h-12 w-full items-center justify-center font-semibold text-[13px] text-link outline-hidden transition-colors hover:bg-muted/60 focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
        >
          Show {hidden} more
        </button>
      )}
      {anyPlace && (
        <p className="px-5 py-1 text-muted-foreground text-xs sm:px-6 sm:py-3">
          Places are approximate.{' '}
          <a
            href="https://db-ip.com"
            target="_blank"
            rel="noreferrer"
            className="inline-flex min-h-11 items-center rounded-sm underline-offset-4 outline-hidden hover:text-foreground hover:underline focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0"
          >
            IP geolocation by DB-IP
          </a>
        </p>
      )}
    </SecuritySection>
  )
}

function deviceIcon(device: string) {
  if (/iPad|tablet/i.test(device)) return TabletIcon
  if (/iPhone|phone|Android/i.test(device)) return SmartphoneIcon
  return LaptopIcon
}

function SessionRow({ session }: { session: SessionItem }) {
  const queryClient = useQueryClient()
  const name = deviceWords(session)
  const where = whereWords(session)
  const signedIn = signedInWords(session.createdAt)
  const signOut = useMutation(
    orpc.account.sessions.revoke.mutationOptions({
      onSuccess: ({ notice }) => toast.success(notice),
      // Already ended elsewhere: the server says "…The list is up to date." and the list catches up.
      onError: toastApiError,
      onSettled: () => queryClient.invalidateQueries({ queryKey: sessionsQuery().queryKey }),
    }),
  )

  return (
    <SecurityRow
      icon={deviceIcon(session.device)}
      tone={session.isCurrent ? 'brand' : 'neutral'}
      label={name}
      inlineAction
      badge={session.isCurrent && <StatusBadge tone="emerald">This device</StatusBadge>}
      action={
        !session.isCurrent && (
          <Button
            variant="outline"
            className="max-sm:h-11"
            disabled={signOut.isPending}
            aria-busy={signOut.isPending || undefined}
            aria-label={`Sign out ${name}, ${signedIn.toLowerCase()}`}
            onClick={() => signOut.mutate({ id: session.id })}
          >
            {signOut.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            Sign out
          </Button>
        )
      }
    >
      {where && <p className="tabular-nums">{where}</p>}
      <p className="tabular-nums">
        <span className={session.isCurrent ? 'font-medium text-status-emerald-fg' : undefined}>
          {session.isCurrent ? 'Active now' : lastActiveWords(session.lastActiveAt)}
        </span>
        {signedIn && (
          <>
            <span className="max-sm:hidden"> · </span>
            <span className="max-sm:block">{signedIn}</span>
          </>
        )}
      </p>
    </SecurityRow>
  )
}
