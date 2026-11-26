import { useQuery, useQueryClient } from '@tanstack/react-query'
import type { ListTeamOutput } from '@vento/shared'
import { useEffect, useRef, useState } from 'react'
import { Sheet } from '@/components/ui/sheet'
import { entitiesQuery, useCurrentEntity } from '@/features/entity/use-current-entity'
import { rolesQuery, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { shellUi, useOverlay } from '@/features/shell/shell-ui'
import { hasFinePointer } from '@/lib/pointer'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import { grantableRoles } from '../role-notes'
import { SheetFrame } from '../sheet-frame'
import { teamListKey } from '../team-queries'
import { AccessLine } from './access-line'
import { defaultInviteRole } from './default-role'
import { EmailBox } from './email-box'
import { InviteFooter } from './invite-footer'
import { planInvite } from './invite-plan'
import { InviteRows } from './invite-rows'
import { peopleLimit, planPlacesMessage } from './plan-places'
import { RoleField } from './role-for-everyone'
import { inviteDraft, useInviteDraft } from './use-invite-draft'
import { useResendInstead } from './use-resend-instead'
import { NO_ERRORS, useSendInvitations, validateDraft } from './use-send-invitations'

/**
 * Invite people (pattern: side-sheet form). One sheet for Team, Home's checklist and ⌘K, mounted
 * once in the shell. Paste emails, check the role (preselected), Send.
 */
export function InviteSheet() {
  const open = useOverlay('invite')
  const me = useMe()
  const access = useEffectiveAccess()
  const queryClient = useQueryClient()
  const draft = useInviteDraft()
  const roles = useQuery(rolesQuery())
  const entities = useQuery(entitiesQuery())
  const picked = useCurrentEntity()
  const limits = me.member?.entityIds ?? null
  const grantable = roles.data
    ? grantableRoles(roles.data.items, access.roleKey === 'owner')
    : undefined
  const [tried, setTried] = useState(false)
  const emailRef = useRef<HTMLTextAreaElement>(null)
  const roleRef = useRef<HTMLButtonElement>(null)
  const height = useVisualViewportHeight(open)
  const close = () => shellUi.close('invite')
  const send = useSendInvitations((sent) => {
    inviteDraft.removeMany(sent)
    // Marked rows that were skipped stay, to fix or remove; otherwise the sheet is done.
    if (inviteDraft.get().rows.length > 0) return
    inviteDraft.reset(limits)
    setTried(false)
    close()
  })
  const resend = useResendInstead()
  // Owners on a limited plan see the limit before sending; everyone else hears it from the server.
  const limit = access.showUpgradeHints ? peopleLimit(me.plan) : null
  const plan = planInvite(draft.rows, me.user.email, limit)
  const placesMessage = planPlacesMessage(limit, plan.sendable.length)
  const errors = tried ? validateDraft(draft, plan.sendable) : NO_ERRORS

  // Opening: "Invite again" fills its row; otherwise a sheet with nothing typed starts fresh.
  // Runs once per opening (a ref, so React's dev double-run can't wipe a prefill it just took).
  const opened = useRef(false)
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs once per opening
  useEffect(() => {
    if (!open) {
      opened.current = false
      return
    }
    if (opened.current) return
    opened.current = true
    const fill = shellUi.takeInvitePrefill()
    const current = inviteDraft.get()
    const fresh = fill !== null || (current.rows.length === 0 && current.text === '')
    if (fresh) inviteDraft.reset(limits)
    if (fill) {
      // A prefill (email and last role) wins over every default below.
      inviteDraft.add(fill.emails.join('\n'))
      if (fill.roleId) inviteDraft.setRole(fill.roleId)
    } else if (fresh && picked.entity && !picked.locked) {
      // With one entity picked in the top bar, new people start with access to just that entity.
      inviteDraft.setEntityMode('some')
      inviteDraft.setEntityIds([picked.entity.id])
    }
    setTried(false)
  }, [open])

  // A role is chosen from the start, so a disabled Send never waits on one.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-chooses after Cancel clears the role
  useEffect(() => {
    if (!open || !grantable || inviteDraft.get().roleId) return
    const pages = queryClient
      .getQueriesData<ListTeamOutput>({ queryKey: teamListKey() })
      .map(([, page]) => page)
    const roleId = defaultInviteRole(grantable, me.organization?.id, pages)
    if (roleId) inviteDraft.setRole(roleId)
  }, [open, grantable, draft.roleId, queryClient, me.organization?.id])

  function submit(only?: number) {
    if (draft.text.trim()) inviteDraft.add(draft.text)
    const current = inviteDraft.get()
    const next = planInvite(current.rows, me.user.email, limit)
    const found = validateDraft(current, next.sendable)
    setTried(true)
    if (found.emails) return emailRef.current?.focus()
    if (next.sendable.length === 0) {
      const row = document.querySelector<HTMLElement>('[data-problem] button[aria-label^="Remove"]')
      row?.scrollIntoView?.({ block: 'nearest' })
      return row?.focus()
    }
    if (found.role) return roleRef.current?.focus()
    if (found.entities) {
      return document.querySelector<HTMLElement>('[data-slot="checkbox"]')?.focus()
    }
    if (send.isPending) return
    const fits = next.left === null || next.sendable.length <= next.left
    if (!fits && only === undefined) return
    const rows = fits ? next.sendable : next.sendable.slice(0, only)
    send.mutate({ draft: current, rows, organizationId: me.organization?.id })
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
            count={plan.sendable.length}
            total={draft.rows.length}
            error={draft.error}
            problems={plan.problems}
            placesMessage={placesMessage}
            left={plan.left}
            pending={send.isPending}
            onSend={() => submit()}
            onSendOnly={() => submit(plan.left ?? 0)}
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
            <EmailBox inputRef={emailRef} error={errors.emails} onSubmit={() => submit()} />
            <InviteRows
              rows={draft.rows}
              roles={grantable ?? []}
              batchRoleId={draft.roleId}
              perRow={draft.perRow}
              over={plan.over}
              viewerEmail={me.user.email}
              resending={resend.variables?.email ?? null}
              onResendInstead={(row, id) => resend.mutate({ id, email: row.email })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <RoleField
              roles={grantable}
              value={draft.roleId}
              onChange={inviteDraft.setRole}
              error={errors.role}
              triggerRef={roleRef}
              label={draft.perRow ? 'Role for the rest' : 'Role'}
              joining
            />
            {draft.rows.length > 1 && (
              <button
                type="button"
                onClick={() => inviteDraft.setPerRow(!draft.perRow)}
                className="self-start rounded-sm font-semibold text-link text-xs underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring max-md:py-2"
              >
                {draft.perRow ? 'Same role for everyone' : 'Give people different roles'}
              </button>
            )}
          </div>
          <AccessLine
            value={{ mode: draft.entityMode, ids: draft.entityIds }}
            onChange={(value) => {
              inviteDraft.setEntityMode(value.mode)
              inviteDraft.setEntityIds(value.ids)
            }}
            entities={entities.data?.items}
            limits={limits}
            error={errors.entities}
          />
        </form>
      </SheetFrame>
    </Sheet>
  )
}
