import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { joinNames, type PermissionModule, type WhoCanChangeAccess } from '@vento/shared'
import { LockIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { navItemForModule } from '@/features/shell/nav'
import { usePageTitle } from '@/features/shell/use-page-title'
import { orpc } from '@/lib/orpc'
import { ErrorState, ErrorText } from './error-state'

/** "HR & payroll is for owners, admins and HR staff. Ask Olumide Bankole (owner) to change your access." */
export function whoToAskSentence(label: string, who: WhoCanChangeAccess): string {
  const forWhom = who.roles.length > 0 ? `${label} is for ${joinNames(who.roles)}. ` : ''
  const people = who.contacts.map((c) => `${c.name} (${c.roleName.toLowerCase()})`)
  const ask =
    people.length > 0
      ? `Ask ${people.join(' or ')} to change your access.`
      : 'Ask an owner or admin to change your access.'
  return forWhom + ask
}

/**
 * Board Error403. Reached only from a typed or pasted link (decision 12): navigation never offers
 * a module the role can't view. Names who can change access; no Request access until brick 4.
 */
export function ForbiddenPage({ module }: { module?: PermissionModule | undefined }) {
  const me = useMe()
  const access = useEffectiveAccess()
  const label = (module && navItemForModule(module)?.label) ?? 'this page'
  const title = `You don't have access to ${label}`
  usePageTitle('No access', { recent: false })
  const who = useQuery({
    ...orpc.access.whoCanChangeAccess.queryOptions({ input: { module: module ?? 'settings' } }),
    enabled: module !== undefined,
  })

  return (
    <ErrorState
      icon={LockIcon}
      tone="amber"
      title={title}
      actions={
        <Button asChild>
          <Link to="/">Go to your home</Link>
        </Button>
      }
    >
      {/* Fixed height while loading, so nothing below moves when the names arrive. */}
      <div aria-live="polite" className="min-h-11 w-full">
        {who.isSuccess ? (
          <ErrorText>{whoToAskSentence(label, who.data)}</ErrorText>
        ) : who.isPending && module ? (
          <div className="flex flex-col items-center gap-2 pt-1">
            <Skeleton className="h-4 w-full max-w-[400px]" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        ) : (
          <ErrorText>
            Ask an owner or admin of {me.organization?.name ?? 'your organization'} to change your
            access.
          </ErrorText>
        )}
      </div>
      <p className="text-muted-foreground text-xs tabular-nums">
        You're signed in as {me.user.name} · {me.member?.role.name}
        {access.previewing ? ` (previewing as ${access.previewing.name})` : ''}
      </p>
    </ErrorState>
  )
}
