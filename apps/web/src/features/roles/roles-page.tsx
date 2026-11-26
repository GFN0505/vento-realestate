import { useQuery } from '@tanstack/react-query'
import { getRouteApi } from '@tanstack/react-router'
import type { Role } from '@vento/shared'
import { CloudOffIcon, PlusIcon, SparklesIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { PAGE_SHORTCUT_EVENT } from '@/features/shell/shortcuts'
import { usePageTitle } from '@/features/shell/use-page-title'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import { DeleteRoleConfirm } from './delete-role-confirm'
import { NewRoleDialog } from './new-role-dialog'
import { RoleRowMenu } from './role-actions'
import { RolesCards, RolesTable } from './roles-table'
import { useRoleRights } from './use-role-actions'

const route = getRouteApi('/_app/_shell/settings/roles/')

/** Settings → Roles & permissions (board SetPermissions, partly): every role and who has it. */
export function RolesPage() {
  usePageTitle('Roles & permissions', { module: 'settings' })
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const roles = useQuery(rolesQuery())
  const rights = useRoleRights()
  const phone = useMediaQuery(PHONE_QUERY)
  const [deleting, setDeleting] = useState<Role | null>(null)
  const items = roles.data?.items
  const hasCustom = items?.some((r) => !r.isSystem) ?? false
  const newRole = (from?: string) => void navigate({ search: { new: true, from } })
  useNewRoleShortcut(rights.create, () => newRole())

  return (
    <div className={cn('flex flex-col gap-5', rights.create && 'pb-20 md:pb-0')}>
      <PageHeader
        title="Roles & permissions"
        description="What each role can do. Give roles to people on Team."
        actions={rights.create && <NewRoleButton onClick={() => newRole()} />}
        className="[&>div:last-child]:max-md:hidden"
      />
      {roles.isError && !items ? (
        <EmptyState
          icon={CloudOffIcon}
          action={
            <Button
              variant="outline"
              onClick={() => void roles.refetch()}
              disabled={roles.isFetching}
              className="max-md:h-11"
            >
              Try again
            </Button>
          }
        >
          <span role="alert">Roles couldn't load. Check your connection and try again.</span>
        </EmptyState>
      ) : !items ? (
        <RolesSkeleton phone={phone} />
      ) : phone ? (
        <RolesCards roles={items} />
      ) : (
        <RolesTable
          roles={items}
          menu={(role) => (
            <RoleRowMenu
              role={role}
              actions={{
                duplicate: rights.canDuplicate(role) ? () => newRole(role.id) : null,
                preview: rights.preview && (() => rights.preview?.(role)),
                delete: () => setDeleting(role),
              }}
            />
          )}
        />
      )}
      {items && !hasCustom && <NoCustomRoles canCreate={rights.create} onNew={() => newRole()} />}
      {rights.create && phone && (
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2 md:hidden">
          <NewRoleButton onClick={() => newRole()} className="h-11 w-full shadow-lg" />
        </div>
      )}
      <NewRoleDialog
        open={search.new === true && rights.create}
        from={search.from}
        onClose={() => void navigate({ search: {}, replace: true })}
      />
      <DeleteRoleConfirm role={deleting} onOpenChange={(open) => !open && setDeleting(null)} />
    </div>
  )
}

function NewRoleButton({ onClick, className }: { onClick: () => void; className?: string }) {
  return (
    <Button onClick={onClick} aria-keyshortcuts="n" className={cn('max-md:h-11', className)}>
      <PlusIcon aria-hidden />
      New role
    </Button>
  )
}

/** Under the built-ins while there's no custom role (spec). */
function NoCustomRoles({ canCreate, onNew }: { canCreate: boolean; onNew: () => void }) {
  return (
    <div className="relative flex flex-col items-start gap-3 overflow-hidden rounded-[12px] border border-dashed bg-card px-5 py-5 sm:flex-row sm:items-center sm:gap-4">
      <span
        aria-hidden
        className="tile-gradient flex size-10 shrink-0 items-center justify-center rounded-xl text-tile-icon"
      >
        <SparklesIcon className="size-5" strokeWidth={1.8} />
      </span>
      <p className="min-w-0 flex-1 text-[13.5px] text-muted-foreground leading-relaxed">
        <span className="font-semibold text-foreground">
          Need a role the built-in ones don't fit, like Site engineer?
        </span>{' '}
        Open the closest role and duplicate it.
      </p>
      {canCreate && (
        <Button variant="outline" onClick={onNew} className="max-md:h-11">
          <PlusIcon aria-hidden />
          New role
        </Button>
      )}
    </div>
  )
}

function RolesSkeleton({ phone }: { phone: boolean }) {
  const rows = Array.from({ length: 9 }, (_, i) => i)
  if (phone) {
    return (
      <div aria-hidden className="flex flex-col gap-2">
        {rows.slice(0, 6).map((i) => (
          <div
            key={i}
            className="flex h-[88px] flex-col justify-center gap-2 rounded-[14px] border bg-card px-3.5"
          >
            <Skeleton className="h-3.5 w-32" />
            <Skeleton className="h-3 w-56" />
            <Skeleton className="h-3 w-24" />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div aria-hidden className="overflow-hidden rounded-[12px] border bg-card">
      <div className="h-10 border-b bg-muted/40" />
      {rows.map((i) => (
        <div key={i} className="flex h-16 items-center gap-3 border-b px-5 last:border-b-0">
          <div className="flex w-1/2 flex-col gap-1.5">
            <Skeleton className="h-3.5 w-28" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <Skeleton className="h-3.5 w-[12%]" />
          <Skeleton className="ml-[5%] h-3.5 w-[12%]" />
        </div>
      ))}
    </div>
  )
}

/** `n` opens New role, on this page only (listed under `?`). */
function useNewRoleShortcut(enabled: boolean, open: () => void) {
  const latest = useRef(open)
  latest.current = open
  useEffect(() => {
    if (!enabled) return
    function onShortcut(event: Event) {
      if ((event as CustomEvent<string>).detail === 'roles-new') latest.current()
    }
    window.addEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
    return () => window.removeEventListener(PAGE_SHORTCUT_EVENT, onShortcut)
  }, [enabled])
}
