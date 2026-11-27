import { useQuery } from '@tanstack/react-query'
import { type RoleRef, type TeamMemberRow, updateMemberAccessInput } from '@vento/shared'
import { CircleAlertIcon } from 'lucide-react'
import { useRef } from 'react'
import { Controller, type Resolver, type UseFormReturn, useForm } from 'react-hook-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { entitiesQuery } from '@/features/entity/use-current-entity'
import { rolesQuery, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { EntityAccessField, type EntityAccessValue, entityIdsOf } from './entity-access-field'
import { RoleField } from './invite/role-for-everyone'
import { grantableRoles } from './role-notes'
import { currentEntityIds } from './use-change-role'
import type { useSaveAccess } from './use-save-access'

export type AccessValues = { roleId: string; access: EntityAccessValue }

export const MEMBER_FORM_ID = 'member-access-form'

/** Validates through the shared schema, then maps its issues back onto the two fields. */
function resolverFor(memberId: string): Resolver<AccessValues> {
  return async (values) => {
    const parsed = updateMemberAccessInput.safeParse({
      memberId,
      roleId: values.roleId,
      entityIds: entityIdsOf(values.access),
    })
    if (parsed.success) return { values, errors: {} }
    const errors: Record<string, { type: string; message: string }> = {}
    for (const issue of parsed.error.issues) {
      const field = issue.path[0] === 'entityIds' ? 'access' : 'roleId'
      errors[field] ??= { type: 'validate', message: issue.message }
    }
    return { values: {}, errors }
  }
}

/** The sheet owns the form, so its footer knows when something differs. */
export function useMemberAccessForm(row: TeamMemberRow) {
  const ids = currentEntityIds(row)
  return useForm<AccessValues>({
    resolver: resolverFor(row.id),
    defaultValues: { roleId: row.role.id, access: { mode: ids ? 'some' : 'all', ids: ids ?? [] } },
  })
}

type Props = {
  row: TeamMemberRow
  form: UseFormReturn<AccessValues>
  save: ReturnType<typeof useSaveAccess>
  /**
   * Owner asks first (spec); the confirm then runs this save, or sends the same role and
   * companies for approval when a rule applies (brick 4).
   */
  confirmOwner: (save: () => void, role: RoleRef, entityIds: string[] | null) => void
}

/** Role and entity access in the member sheet. */
export function MemberAccessForm({ row, form, save, confirmOwner }: Props) {
  const me = useMe()
  const access = useEffectiveAccess()
  const roles = useQuery(rolesQuery())
  const entities = useQuery(entitiesQuery())
  const roleRef = useRef<HTMLButtonElement>(null)
  const grantable = roles.data
    ? grantableRoles(roles.data.items, access.roleKey === 'owner')
    : undefined

  const submit = form.handleSubmit(
    (values) => {
      const role = grantable?.find((r) => r.id === values.roleId)
      if (!role) return
      const ref = { id: role.id, key: role.key, name: role.name }
      const entityIds = entityIdsOf(values.access)
      const run = () => save.mutate({ row, role: ref, entityIds })
      if (role.key === 'owner' && row.role.key !== 'owner') confirmOwner(run, ref, entityIds)
      else run()
    },
    (errors) => {
      if (errors.roleId) roleRef.current?.focus()
      else document.querySelector<HTMLElement>('#member-entities-some')?.focus()
    },
  )

  return (
    <form id={MEMBER_FORM_ID} noValidate onSubmit={submit} className="flex flex-col gap-5">
      <Controller
        control={form.control}
        name="roleId"
        render={({ field, fieldState }) => (
          <RoleField
            roles={grantable}
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message ?? null}
            triggerRef={roleRef}
            joining={false}
          />
        )}
      />
      <Controller
        control={form.control}
        name="access"
        render={({ field, fieldState }) => (
          <EntityAccessField
            name="member-entities"
            value={field.value}
            onChange={field.onChange}
            entities={entities.data?.items}
            limits={me.member?.entityIds ?? null}
            error={fieldState.error?.message ?? null}
          />
        )}
      />
      {save.errorText && (
        <Alert variant="destructive" aria-live="polite">
          <CircleAlertIcon aria-hidden />
          <AlertDescription>{save.errorText}</AlertDescription>
        </Alert>
      )}
    </form>
  )
}
