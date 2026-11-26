import type { QueryKey } from '@tanstack/react-query'
import type { TeamMemberRow } from '@vento/shared'
import { InfoIcon, KeyRoundIcon, LoaderCircleIcon, UserMinusIcon } from 'lucide-react'
import { type ComponentProps, type RefObject, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { lastActiveLabel } from './last-active'
import { MEMBER_FORM_ID, MemberAccessForm, useMemberAccessForm } from './member-access-form'
import { SheetFrame } from './sheet-frame'
import { AccessText, TwoStepBadge, YouTag } from './team-cells'
import { useSaveAccess } from './use-save-access'
import { useTeamActionsContext } from './use-team-actions'

type Props = Pick<ComponentProps<typeof SheetFrame>, 'onCloseAutoFocus' | 'height'> & {
  row: TeamMemberRow
  listKey: QueryKey
  onClose: () => void
  /** Run before the sheet closes; false keeps it open (unsaved changes ask first). */
  closeGuard: RefObject<(() => boolean) | null>
}

/** Member sheet (pattern: side sheet with facts and actions). */
export function MemberSheet({ row, listKey, onClose, closeGuard, ...frame }: Props) {
  const actions = useTeamActionsContext()
  const form = useMemberAccessForm(row)
  const save = useSaveAccess(listKey, actions, onClose)
  const [discarding, setDiscarding] = useState(false)
  const dirty = form.formState.isDirty
  const editable = row.can.changeAccess && !row.readOnly
  closeGuard.current = dirty
    ? () => {
        setDiscarding(true)
        return false
      }
    : null

  return (
    <SheetFrame
      {...frame}
      lead={<Avatar name={row.name} className="mb-2 size-11 text-sm" />}
      title={
        <span className="flex items-center gap-2">
          {row.name}
          {row.isYou && <YouTag />}
        </span>
      }
      description={row.email}
      footer={
        editable && (
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => (dirty ? setDiscarding(true) : onClose())}>
              Cancel
            </Button>
            <Button
              type="submit"
              form={MEMBER_FORM_ID}
              disabled={!dirty || save.isPending}
              aria-busy={save.isPending || undefined}
              className="max-md:h-11 max-md:flex-1"
            >
              {save.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
              Save changes
            </Button>
          </div>
        )
      }
    >
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-6 gap-y-2.5 text-[13px]">
        <dt className="text-muted-foreground">Joined</dt>
        <dd>{formatDate(row.joinedAt)}</dd>
        <dt className="text-muted-foreground">Last active</dt>
        <dd>{lastActiveLabel(row.lastActiveAt)}</dd>
        <dt className="text-muted-foreground">Two-step</dt>
        <dd>
          <TwoStepBadge state={row.twoStep} />
        </dd>
        {row.passkeyCount > 0 && (
          <>
            <dt className="text-muted-foreground">Passkeys</dt>
            <dd className="tabular-nums">
              {row.passkeyCount} {row.passkeyCount === 1 ? 'passkey' : 'passkeys'}
            </dd>
          </>
        )}
        {!editable && (
          <>
            <dt className="text-muted-foreground">Role</dt>
            <dd>{row.role.name}</dd>
            <dt className="text-muted-foreground">Company access</dt>
            <dd>
              <AccessText access={row.access} />
            </dd>
          </>
        )}
      </dl>

      <section aria-labelledby="member-access" className="flex flex-col gap-4 border-t pt-5">
        <h3 id="member-access" className="font-heading font-semibold text-[15px]">
          Access
        </h3>
        {row.readOnly ? (
          <p className="flex gap-2.5 rounded-lg bg-muted px-3.5 py-3 text-[13px] leading-relaxed">
            <InfoIcon aria-hidden className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
            {row.readOnly.message}
          </p>
        ) : editable ? (
          <MemberAccessForm
            row={row}
            form={form}
            save={save}
            confirmOwner={(run) =>
              actions.setConfirm({ kind: 'owner', row, role: row.role, save: run })
            }
          />
        ) : null}
      </section>

      {(row.can.resetTwoStep || row.can.remove) && (
        <section
          aria-label="Other actions"
          className="mt-auto flex flex-col items-start gap-1 border-t pt-4"
        >
          {row.can.resetTwoStep && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.setConfirm({ kind: 'reset', row })}
              className="-ml-2.5 max-md:h-11"
            >
              <KeyRoundIcon aria-hidden />
              Reset two-step
            </Button>
          )}
          {row.can.remove && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => actions.setConfirm({ kind: 'remove', row })}
              className="-ml-2.5 text-status-rose-fg hover:bg-status-rose-bg hover:text-status-rose-fg max-md:h-11"
            >
              <UserMinusIcon aria-hidden />
              Remove from team
            </Button>
          )}
        </section>
      )}

      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscarding(false)
          form.reset()
          closeGuard.current = null
          onClose()
        }}
      >
        Your changes to {row.name}'s access aren't saved yet.
      </ConfirmDialog>
    </SheetFrame>
  )
}
