import { ORPCError } from '@orpc/client'
import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { type ConflictData, type Entity, updateEntityInput } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { companiesKey } from '@/features/companies/companies-queries'
import { useCurrentEntity } from '@/features/entity/use-current-entity'
import { shellUi } from '@/features/shell/shell-ui'
import { errorReason, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client, orpc } from '@/lib/orpc'
import type { CompanyForm, CompanyValues } from './company-fields'

/** The company already using the RC number, when it's archived: offer to restore it instead. */
export type ArchivedClash = { id: string; name: string }

function archivedClash(error: unknown): ArchivedClash | null {
  if (!(error instanceof ORPCError) || error.code !== 'CONFLICT') return null
  const entity = (error.data as ConflictData | undefined)?.entity
  return entity?.archived ? { id: entity.id, name: entity.name } : null
}

/**
 * Add or save a company. What was typed stays on any refusal: an RC clash goes on its field,
 * a plan limit shows above the buttons, anything else in a line there too.
 */
export function useSaveCompany(form: CompanyForm) {
  const queryClient = useQueryClient()
  const current = useCurrentEntity()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [clash, setClash] = useState<ArchivedClash | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: companiesKey() })
    void queryClient.invalidateQueries({ queryKey: orpc.account.me.key() })
    void queryClient.invalidateQueries({ queryKey: orpc.checklist.get.key() })
  }

  async function run(call: () => Promise<Entity>, done: (saved: Entity) => void) {
    setError(null)
    setClash(null)
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return
    }
    setPending(true)
    try {
      const saved = await call()
      refresh()
      shellUi.close('company')
      done(saved)
    } catch (caught) {
      if (errorReason(caught) === 'rc_number_taken' && caught instanceof Error) {
        form.setError('rcNumber', { message: caught.message }, { shouldFocus: true })
        setClash(archivedClash(caught))
      } else {
        setError(caught)
      }
    } finally {
      setPending(false)
    }
  }

  const add = (values: CompanyValues) =>
    run(
      () => client.entities.create(values),
      (saved) =>
        toast.success(`${saved.name} added`, {
          action: { label: 'Switch to it', onClick: () => current.select(saved.id) },
        }),
    )

  /** Only the fields that changed, so two people fixing different fields both win. */
  const save = (company: Entity, values: CompanyValues) => {
    const dirty = form.formState.dirtyFields
    const patch = updateEntityInput.parse({
      id: company.id,
      ...(dirty.name ? { name: values.name } : {}),
      ...(dirty.type ? { type: values.type } : {}),
      ...(dirty.rcNumber ? { rcNumber: values.rcNumber } : {}),
      ...(dirty.tin ? { tin: values.tin } : {}),
      ...(dirty.vatRegistered ? { vatRegistered: values.vatRegistered } : {}),
    })
    return run(
      () => client.entities.update(patch),
      (saved) => toast.success(`${saved.name} updated`),
    )
  }

  async function restoreInstead(target: ArchivedClash) {
    setError(null)
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return
    }
    setPending(true)
    try {
      const restored = await client.entities.restore({ id: target.id })
      refresh()
      shellUi.close('company')
      // The restored company is the one they meant: show it in the active list, one tap to edit.
      void navigate({ to: '/settings/companies', search: {} })
      toast.success(`${restored.name} restored`, {
        action: {
          label: 'Edit',
          onClick: () => shellUi.openCompany({ mode: 'edit', company: restored }),
        },
      })
    } catch (caught) {
      setError(caught)
    } finally {
      setPending(false)
    }
  }

  return { add, save, restoreInstead, pending, error, clash }
}
