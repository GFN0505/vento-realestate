import { useQuery } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { rolesQuery, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { shellUi, useOverlay } from '@/features/shell/shell-ui'
import { hasFinePointer } from '@/lib/pointer'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import { EntityAccessField } from '../entity-access-field'
import { grantableRoles } from '../role-notes'
import { SheetFrame } from '../sheet-frame'
import { EmailBox } from './email-box'
import { InviteFooter } from './invite-footer'
import { InviteRows, rowProblem } from './invite-rows'
import { peopleLimit, planPlacesMessage } from './plan-places'
import { RoleField } from './role-for-everyone'
import { inviteDraft, useInviteDraft } from './use-invite-draft'
import { useResendInstead } from './use-resend-instead'
import { NO_ERRORS, useSendInvitations, validateDraft } from './use-send-invitations'

/**
 * Invite people (pattern: side-sheet form). One sheet for Team, Home's checklist and ⌘K, mounted
 * once in the shell. Three steps: paste emails, choose a role, Send.
 */
export function InviteSheet() {
  const open = useOverlay('invite')
  const me = useMe()
  const access = useEffectiveAccess()
  const draft = useInviteDraft()
  const roles = useQuery(rolesQuery())
  const entities = useQuery(entitiesQuery())
  const limits = me.member?.entityIds ?? null
  const grantable = roles.data
    ? grantableRoles(roles.data.items, access.roleKey === 'owner')
    : undefined
  const [tried, setTried] = useState(false)
  const emailRef = useRef<HTMLTextAreaElement>(null)
  const roleRef = useRef<HTMLButtonElement>(null)
  const height = useVisualViewportHeight(open)
  const close = () => shellUi.close('invite')
  const send = useSendInvitations(() => {
    inviteDraft.reset(limits)
    setTried(false)
    close()
  })
  const resend = useResendInstead()
  // Owners on a limited plan see the limit before sending; everyone else hears it from the server.
  const placesMessage = access.showUpgradeHints
    ? planPlacesMessage(peopleLimit(me.plan), draft.rows.length)
    : null
  const errors = tried ? validateDraft(draft) : NO_ERRORS
  const problems = draft.rows.filter((row) => rowProblem(row, me.user.email)).length

  // Opening: "Invite again" fills its row; otherwise a sheet with nothing typed starts fresh.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per opening
  useEffect(() => {
    if (!open) return
    const fill = shellUi.takeInvitePrefill()
    if (fill) {
      inviteDraft.reset(limits)
      inviteDraft.add(fill.emails.join('\n'))
      if (fill.roleId) inviteDraft.setRole(fill.roleId)
    } else if (draft.rows.length === 0 && draft.text === '') {
      inviteDraft.reset(limits)
    }
    setTried(false)
  }, [open])

  function submit() {
    if (draft.text.trim()) inviteDraft.add(draft.text)
    const current = inviteDraft.get()
    const found = validateDraft(current)
    setTried(true)
    if (found.emails) return emailRef.current?.focus()
    if (current.rows.some((row) => rowProblem(row, me.user.email))) {
      const row = document.querySelector<HTMLElement>('[data-problem] button[aria-label^="Remove"]')
      row?.scrollIntoView?.({ block: 'nearest' })
      return row?.focus()
    }
    if (found.role) return roleRef.current?.focus()
    if (found.entities) {
      return document.querySelector<HTMLElement>('[data-slot="checkbox"]')?.focus()
    }
    if (placesMessage || send.isPending) return
    send.mutate(current)
  }

  function cancel() {
    // Cancel discards on purpose; Esc and × keep what's typed for next time.
    inviteDraft.reset(limits)
    close()
  }

  return (
    <Sheet open={open} onOpenChange={(next) => !next && close()}>
      <SheetFrame
        title="Invite people"
        description={`They'll get an email to join ${me.organization?.name ?? 'your organization'}. Invitations last 7 days.`}
        height={height}
        onOpenAutoFocus={(event) => {
          // The cursor goes in the box on desktop only; phones keep the keyboard down.
          event.preventDefault()
          if (hasFinePointer()) emailRef.current?.focus()
          else (event.currentTarget as HTMLElement).focus()
        }}
        footer={
          <InviteFooter
            count={draft.rows.length}
            error={draft.error}
            problems={tried ? problems : 0}
            placesMessage={placesMessage}
            pending={send.isPending}
            onSend={submit}
            onCancel={cancel}
          />
        }
      >
        <form
          className="flex flex-col gap-5"
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="flex flex-col gap-2.5">
            <EmailBox inputRef={emailRef} error={errors.emails} onSubmit={submit} />
            <InviteRows
              rows={draft.rows}
              roles={grantable ?? []}
              batchRoleId={draft.roleId}
              viewerEmail={me.user.email}
              resending={resend.variables?.email ?? null}
              onResendInstead={(row, id) => resend.mutate({ id, email: row.email })}
            />
          </div>
          <RoleField
            roles={grantable}
            value={draft.roleId}
            onChange={inviteDraft.setRole}
            error={errors.role}
            triggerRef={roleRef}
            joining
          />
          <EntityAccessField
            name="invite-entities"
            value={{ mode: draft.entityMode, ids: draft.entityIds }}
            onChange={(value) => {
              inviteDraft.setEntityMode(value.mode)
              inviteDraft.setEntityIds(value.ids)
            }}
            entities={entities.data?.items}
            limits={limits}
            error={errors.entities}
            hint="Invite people who need different access in separate batches."
          />
        </form>
      </SheetFrame>
    </Sheet>
  )
}
