import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { OrganizationSecurity } from '@vento/shared'
import { ShieldCheckIcon } from 'lucide-react'
import { useId, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { rolesQuery, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { ReadOnlyNote } from '@/features/settings/read-only-note'
import { teamListKey } from '@/features/team/team-queries'
import { OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { orpc } from '@/lib/orpc'
import { organizationSecurityQuery } from './organization-queries'
import { peopleWithoutTwoStep } from './security-words'

/**
 * Settings → Organization, Security card (spec J-ONB-10): "Require two-step sign-in for
 * everyone". Owners change it; everyone else who can open the page sees it read-only.
 */
export function SecurityCard() {
  const query = useQuery(organizationSecurityQuery())
  if (query.data) return <LoadedSecurityCard security={query.data} />
  return (
    <section aria-label="Security" className="rounded-[12px] border bg-card">
      <header className="border-b px-5 py-4 sm:px-6">
        <h2 className="font-heading font-semibold text-[15px] tracking-[-0.01em]">Security</h2>
      </header>
      {query.isError ? (
        <div className="flex flex-wrap items-center gap-3 px-5 py-5 sm:px-6">
          <p role="alert" className="min-w-0 flex-1 text-[13px] text-muted-foreground">
            Couldn't load the security setting. Check your connection and try again.
          </p>
          <Button
            variant="outline"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
            className="max-md:h-11"
          >
            Try again
          </Button>
        </div>
      ) : (
        <div aria-hidden className="flex items-start gap-4 px-5 py-5 sm:px-6">
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-4 w-64 max-w-full" />
            <Skeleton className="h-3 w-full max-w-md" />
            <Skeleton className="mt-2 h-1.5 w-48" />
          </div>
          <Skeleton className="h-6 w-10 rounded-full" />
        </div>
      )}
    </section>
  )
}

function LoadedSecurityCard({ security }: { security: OrganizationSecurity }) {
  const ids = { label: useId(), hint: useId() }
  const me = useMe()
  const access = useEffectiveAccess()
  const queryClient = useQueryClient()
  const [asking, setAsking] = useState<boolean | null>(null)
  const organization = me.organization?.name ?? 'your organization'
  // Owners only; an owner previewing another role sees what that role would (read-only).
  const canChange = security.canChange && access.roleKey === 'owner'
  const share = security.people > 0 ? security.withTwoStep / security.people : 0

  const save = useMutation(
    orpc.organization.setTwoStepRequired.mutationOptions({
      onSuccess: (result) => {
        const { notice, changedByOther, ...next } = result
        queryClient.setQueryData(organizationSecurityQuery().queryKey, next)
        if (changedByOther) toast(changedByOther)
        else toast.success(notice)
        setAsking(null)
        // Roles read "Required", Team shows who must set it up, and the banner may change.
        void queryClient.invalidateQueries({ queryKey: rolesQuery().queryKey })
        void queryClient.invalidateQueries({ queryKey: teamListKey() })
        void queryClient.invalidateQueries({ queryKey: orpc.account.me.key() })
      },
      onError: (error) => {
        toastApiError(error)
        setAsking(null)
        void queryClient.invalidateQueries({ queryKey: organizationSecurityQuery().queryKey })
      },
    }),
  )

  return (
    <section aria-labelledby={ids.label} className="rounded-[12px] border bg-card">
      <header className="border-b px-5 py-4 sm:px-6">
        <h2 className="font-heading font-semibold text-[15px] tracking-[-0.01em]">Security</h2>
      </header>
      <div className="flex flex-col gap-4 px-5 py-5 sm:px-6">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-selected text-selected-foreground max-sm:hidden"
          >
            <ShieldCheckIcon className="size-[18px]" strokeWidth={1.8} />
          </span>
          <div className="min-w-0 flex-1">
            {/* The label toggles the switch too: a large touch area on phones. */}
            <label
              id={ids.label}
              htmlFor={`${ids.label}-switch`}
              className="cursor-pointer font-semibold text-sm max-md:block max-md:py-1"
            >
              Require two-step sign-in for everyone
            </label>
            <p id={ids.hint} className="mt-1 text-[13px] text-muted-foreground leading-relaxed">
              Everyone in {organization} signs in with a code from an authenticator app or a
              passkey. Owners, admins, finance and HR already need it.
            </p>
          </div>
          <Switch
            id={`${ids.label}-switch`}
            checked={security.required}
            disabled={!canChange || save.isPending}
            aria-labelledby={ids.label}
            aria-describedby={ids.hint}
            onCheckedChange={(next) => {
              if (!connection.isOnline()) return void toast.error(OFFLINE_SAVE_ERROR)
              setAsking(next)
            }}
            className="mt-0.5"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:pl-[3.25rem]">
          <p className="text-[13px] tabular-nums">
            <span className="font-semibold">{security.withTwoStep}</span> of{' '}
            <span className="font-semibold">{security.people}</span>{' '}
            {security.people === 1 ? 'person has' : 'people have'} two-step on
          </p>
          <div aria-hidden className="h-1.5 w-full max-w-60 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-status-emerald transition-[width] duration-300 motion-reduce:transition-none"
              style={{ width: `${Math.round(share * 100)}%` }}
            />
          </div>
        </div>
        {!canChange && <ReadOnlyNote>Only owners can change this.</ReadOnlyNote>}
      </div>

      <ConfirmDialog
        open={asking === true}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Require two-step for everyone?"
        confirmLabel="Require two-step"
        pending={save.isPending}
        onConfirm={() => save.mutate({ required: true, seenChangedAt: security.changedAt })}
      >
        {peopleWithoutTwoStep(security.withoutTwoStep)}
      </ConfirmDialog>
      <ConfirmDialog
        open={asking === false}
        onOpenChange={(open) => !open && setAsking(null)}
        title="Stop requiring two-step for everyone?"
        confirmLabel="Stop requiring"
        destructive
        pending={save.isPending}
        onConfirm={() => save.mutate({ required: false, seenChangedAt: security.changedAt })}
      >
        Owners, admins, finance and HR still need it. Others can choose. Every owner gets an email
        about this change.
      </ConfirmDialog>
    </section>
  )
}
