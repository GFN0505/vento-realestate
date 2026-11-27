import { useQuery } from '@tanstack/react-query'
import { getRouteApi, Link } from '@tanstack/react-router'
import { type RoleDetail, roleName } from '@vento/shared'
import { CloudOffIcon, SearchXIcon } from 'lucide-react'
import { type RefObject, useRef, useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { EmptyState } from '@/components/empty-state'
import { Button } from '@/components/ui/button'
import { TooltipProvider } from '@/components/ui/tooltip'
import { UnsavedChangesDialog } from '@/components/unsaved-changes-dialog'
import { SendForApprovalSheet } from '@/features/approvals/send/send-for-approval-sheet'
import { WaitingForApproval } from '@/features/approvals/send/waiting-for-approval'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { ReadOnlyNote } from '@/features/settings/read-only-note'
import { roleQuery } from '@/features/settings/role-queries'
import { canSeeAuditLog } from '@/features/settings/sections'
import { usePageTitle } from '@/features/shell/use-page-title'
import { errorReason, isNotFound } from '@/lib/error-data'
import { reloadPage } from '@/lib/reload'
import { useMediaQuery } from '@/lib/use-media-query'
import { useSaveShortcut, useUnsavedGuard } from '@/lib/use-unsaved-guard'
import { DeleteRoleConfirm } from './delete-role-confirm'
import { NewRoleDialog } from './new-role-dialog'
import { PermissionsGrid } from './permissions-grid'
import { PermissionsMobileList } from './permissions-mobile-list'
import { RolePageMenu } from './role-actions'
import { RoleApprovesLine, RoleChangeSummary, useRoleApproval } from './role-approval'
import { RoleHeader } from './role-header'
import { RoleSaveBar } from './role-save-bar'
import { RoleSkeleton } from './role-skeleton'
import { TwoStepField } from './two-step-field'
import { useRoleRights } from './use-role-actions'
import { updateFrom, useRoleDraft } from './use-role-draft'
import { UNDO_MS, useRoleUndo, useSaveRole } from './use-save-role'

const GRID_QUERY = '(max-width: 1279px)'

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
  role: RoleDetail
  undo: ReturnType<typeof useRoleUndo>
  dirtyRef: RefObject<boolean>
}

function RoleEditor({ role, undo, dirtyRef }: EditorProps) {
  const me = useMe()
  const access = useEffectiveAccess()
  const rights = useRoleRights()
  // Below xl the content column is too narrow for six columns: the list and its sheet instead.
  const compact = useMediaQuery(GRID_QUERY)
  const navigate = route.useNavigate()
  const pending = role.pendingApproval ?? null
  // While a request waits, the grid is read-only until it's decided (spec).
  const editable = rights.canEdit(role) && pending === null
  const approval = useRoleApproval(role.id, editable)
  const draft = useRoleDraft(role)
  const [sending, setSending] = useState(false)
  const save = useSaveRole(undo.offer, {
    onRequested: (outcome) => {
      // Nothing changed yet: the edits now live in the request, and the page shows it waiting.
      setSending(false)
      draft.discard()
      toast.success(outcome.notice)
      approval.refresh()
    },
    onReasonRequired: () => {
      approval.refresh()
      setSending(true)
    },
  })
  // The rule guards permissions and two-step, never a rename (plan 6.3).
  const guarded = draft.changes.length > 0 || draft.requiresTwoStep !== role.requiresTwoStep
  const needsApproval = approval.needed && guarded
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
    if (needsApproval) {
      save.clearError()
      setSending(true)
      return
    }
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
        menu={
          <RolePageMenu
            role={role}
            disabled={dirty}
            history={canSeeAuditLog(access)}
            onDelete={() => setDeleting(true)}
          />
        }
      />
      {role.readOnly && <ReadOnlyNote>{role.readOnly.message}</ReadOnlyNote>}
      {pending && <WaitingForApproval pending={pending} />}
      {compact ? <PermissionsMobileList {...grid} /> : <PermissionsGrid {...grid} />}
      <RoleApprovesLine roleId={role.id} />
      <TwoStepField
        checked={editable ? draft.requiresTwoStep : role.requiresTwoStep}
        locked={draft.twoStepLocked}
        onChange={editable ? draft.setTwoStep : null}
        requiredForEveryone={role.requiredForEveryone ? (me.organization?.name ?? '') : null}
      />
      {(dirty || save.error !== null) && !sending && (
        <RoleSaveBar
          sendForApproval={needsApproval}
          count={draft.count}
          people={role.memberCount}
          empty={draft.empty}
          pending={save.pending}
          // A name clash is said under the name, not twice.
          error={errorReason(save.error) === 'role_name_taken' ? null : save.error}
          stale={save.stale}
          onDiscard={() => {
            const previous = draft.draft
            draft.discard()
            save.clearError()
            toast('Changes discarded', {
              duration: UNDO_MS,
              action: { label: 'Undo', onClick: () => draft.restore(previous) },
            })
          }}
          onSave={submit}
          onReload={() => (save.accessChanged ? reloadPage() : void save.reload(role.id))}
        />
      )}
      <SendForApprovalSheet
        open={sending}
        onOpenChange={setSending}
        summary={
          <RoleChangeSummary
            roleName={role.name}
            changes={draft.changes}
            twoStep={draft.requiresTwoStep !== role.requiresTwoStep ? draft.requiresTwoStep : null}
          />
        }
        chain={approval.chain}
        blocked={approval.blocked}
        pending={save.pending}
        error={save.error}
        onSend={(reason) => void save.save(role, { ...updateFrom(role, draft.draft), reason })}
      />
      <UnsavedChangesDialog guard={guard} title={`Discard changes to ${role.name}?`} />
      <DeleteRoleConfirm role={deleting ? role : null} onOpenChange={setDeleting} />
    </div>
  )
}
