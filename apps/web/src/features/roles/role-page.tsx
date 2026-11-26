import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { PERMISSION_MODULES, type Role, roleName } from '@vento/shared'
import { CloudOffIcon, SearchXIcon } from 'lucide-react'
import { type RefObject, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UnsavedChangesDialog } from '@/components/unsaved-changes-dialog'
import { useMe } from '@/features/preview/use-effective-permissions'
import { ReadOnlyNote } from '@/features/settings/read-only-note'
import { roleQuery } from '@/features/settings/role-queries'
import { usePageTitle } from '@/features/shell/use-page-title'
import { errorReason, isNotFound } from '@/lib/error-data'
import { reloadPage } from '@/lib/reload'
import { PHONE_QUERY, useMediaQuery } from '@/lib/use-media-query'
import { useSaveShortcut, useUnsavedGuard } from '@/lib/use-unsaved-guard'
import { DeleteRoleConfirm } from './delete-role-confirm'
import { NewRoleDialog } from './new-role-dialog'
import { PermissionsGrid } from './permissions-grid'
import { PermissionsMobileList } from './permissions-mobile-list'
import { RolePageMenu } from './role-actions'
import { RoleHeader } from './role-header'
import { RoleSaveBar } from './role-save-bar'
import { TwoStepField } from './two-step-field'
import { useRoleRights } from './use-role-actions'
import { updateFrom, useRoleDraft } from './use-role-draft'
import { useRoleUndo, useSaveRole } from './use-save-role'

const route = getRouteApi('/_app/_shell/settings/roles/$roleId')

/** A role's page (boards SetPermissions, PermissionsMobile): what it can do, and who has it. */
export function RolePage() {
  const { roleId } = route.useParams()
  const search = route.useSearch()
  const navigate = route.useNavigate()
  const query = useQuery(roleQuery(roleId))
  const role = query.data
  const rights = useRoleRights()
  // Undo outlives the editor (keyed by version); it asks first if there are unsaved ticks.
  const dirtyRef = useRef(false)
  const undo = useRoleUndo(dirtyRef)
  usePageTitle(role?.name ?? 'Role', { module: 'settings', recent: role !== undefined })

  return (
    <TooltipProvider>
      {role ? (
        // A save, an Undo or a Reload brings a new version: the editor starts again from it.
        <RoleEditor
          key={`${role.id}:${role.version}`}
          role={role}
          undo={undo}
          dirtyRef={dirtyRef}
        />
      ) : query.isError && isNotFound(query.error) ? (
        <EmptyState
          icon={SearchXIcon}
          action={
            <Button asChild variant="outline" className="max-md:h-11">
              <Link to="/settings/roles">See all roles</Link>
            </Button>
          }
        >
          <h1 tabIndex={-1} className="font-heading font-semibold text-[15px] text-foreground">
            That role no longer exists.
          </h1>
        </EmptyState>
      ) : query.isError ? (
        <EmptyState
          icon={CloudOffIcon}
          action={
            <Button
              variant="outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="max-md:h-11"
            >
              Try again
            </Button>
          }
        >
          <span role="alert">This role couldn't load. Check your connection and try again.</span>
        </EmptyState>
      ) : (
        <RoleSkeleton />
      )}
      <NewRoleDialog
        open={search.new === true && rights.create}
        from={search.from ?? roleId}
        onClose={() => void navigate({ search: {}, replace: true })}
      />
      <ConfirmDialog
        open={undo.asking !== null}
        onOpenChange={(open) => !open && undo.cancel()}
        title={`Undo the save to ${undo.asking?.saved.name ?? 'this role'}?`}
        confirmLabel="Undo save"
        cancelLabel="Keep editing"
        onConfirm={undo.confirm}
      >
        Your unsaved changes on this page will be lost.
      </ConfirmDialog>
    </TooltipProvider>
  )
}

type EditorProps = {
  role: Role
  undo: ReturnType<typeof useRoleUndo>
  dirtyRef: RefObject<boolean>
}

function RoleEditor({ role, undo, dirtyRef }: EditorProps) {
  const me = useMe()
  const rights = useRoleRights()
  const phone = useMediaQuery(PHONE_QUERY)
  const navigate = route.useNavigate()
  const editable = rights.canEdit(role)
  const draft = useRoleDraft(role)
  const save = useSaveRole(undo.offer)
  const [deleting, setDeleting] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const dirty = editable && draft.dirty
  dirtyRef.current = dirty
  const guard = useUnsavedGuard(dirty)
  const submit = () => {
    if (!dirty || draft.empty || save.pending) return
    const name = roleName.safeParse(draft.draft.name)
    if (!name.success) {
      setNameError(name.error.issues[0]?.message ?? 'Enter a name for the role')
      document.querySelector<HTMLInputElement>('input[name="role-name"]')?.focus()
      return
    }
    setNameError(null)
    void save.save(role, updateFrom(role, draft.draft))
  }
  // A clash with another role's name belongs on the name.
  const shownNameError =
    nameError ??
    (errorReason(save.error) === 'role_name_taken' && save.error instanceof Error
      ? save.error.message
      : null)
  useSaveShortcut(dirty, submit)

  const grid = {
    roleName: role.name,
    permissions: editable ? draft.draft.permissions : role.permissions,
    saved: role.permissions,
    onToggle: editable ? draft.toggle : null,
    // The ceiling is the person's own role, not a previewed one (the server checks the same).
    ceiling: editable ? (me.member?.permissions ?? null) : null,
  }

  return (
    <div className="flex flex-col gap-5 pb-36 md:pb-24">
      <RoleHeader
        role={role}
        draft={editable ? draft : null}
        nameError={shownNameError}
        onDuplicate={
          rights.canDuplicate(role) ? () => void navigate({ search: { new: true } }) : null
        }
        onPreview={rights.preview && (() => rights.preview?.(role))}
        menu={<RolePageMenu role={role} disabled={dirty} onDelete={() => setDeleting(true)} />}
      />
      {role.readOnly && <ReadOnlyNote>{role.readOnly.message}</ReadOnlyNote>}
      {phone ? <PermissionsMobileList {...grid} /> : <PermissionsGrid {...grid} />}
      <TwoStepField
        checked={editable ? draft.requiresTwoStep : role.requiresTwoStep}
        locked={draft.twoStepLocked}
        onChange={editable ? draft.setTwoStep : null}
      />
      {(dirty || save.error !== null) && (
        <RoleSaveBar
          count={draft.count}
          people={role.memberCount}
          empty={draft.empty}
          pending={save.pending}
          error={save.error}
          stale={save.stale}
          onDiscard={() => {
            draft.discard()
            save.clearError()
          }}
          onSave={submit}
          onReload={() => (save.accessChanged ? reloadPage() : void save.reload(role.id))}
        />
      )}
      <UnsavedChangesDialog guard={guard} title={`Discard changes to ${role.name}?`} />
      <DeleteRoleConfirm role={deleting ? role : null} onOpenChange={setDeleting} />
    </div>
  )
}

function RoleSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      <Skeleton className="h-4 w-36" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-3.5 w-72 max-w-full" />
        <Skeleton className="h-3.5 w-24" />
      </div>
      <div className="overflow-hidden rounded-[12px] border bg-card">
        <div className="h-11 border-b bg-muted/40" />
        {PERMISSION_MODULES.map((m) => (
          <div key={m} className="flex h-16 items-center gap-4 border-b px-5 last:border-b-0">
            <div className="flex flex-1 flex-col gap-1.5">
              <Skeleton className="h-3.5 w-32" />
              <Skeleton className="h-3 w-52 max-w-full" />
            </div>
            <Skeleton className="hidden h-5 w-1/2 md:block" />
          </div>
        ))}
      </div>
    </div>
  )
}
