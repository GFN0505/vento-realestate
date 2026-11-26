import { useQueryClient } from '@tanstack/react-query'
import type { Entity, EntityArchivePreview } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { shellUi } from '@/features/shell/shell-ui'
import { errorReason, OFFLINE_SAVE_ERROR, toastApiError } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { isPlanLimit } from '@/lib/error-data'
import { client, orpc } from '@/lib/orpc'
import { companiesKey } from './companies-queries'

/** Undo stays on screen this long (spec: 8 seconds). */
const UNDO_MS = 8000

export type ArchiveConfirm = { company: Entity; members: EntityArchivePreview['members'] }

/** Someone else got there first: say so and show the latest list. */
const STALE = new Set(['not_archivable', 'not_restorable', 'entity_archived'])

/**
 * Archive at once with Undo when nobody depends on the company alone; otherwise a confirm that
 * names them first (spec "Archiving and restoring"). Restore checks the plan's company limit on
 * the server; an owner at the limit gets the plan message.
 */
export function useArchiveCompany() {
  const queryClient = useQueryClient()
  const me = useMe()
  const { showUpgradeHints } = useEffectiveAccess()
  const [confirm, setConfirm] = useState<ArchiveConfirm | null>(null)
  const [pendingId, setPendingId] = useState<string | null>(null)

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: companiesKey() })
    // The owner's plan usage and the switcher both read `me`.
    void queryClient.invalidateQueries({ queryKey: orpc.account.me.key() })
  }

  const fail = (error: unknown) => {
    const reason = errorReason(error)
    if (reason && STALE.has(reason) && error instanceof Error) {
      toast(error.message)
      refresh()
      return
    }
    if (isPlanLimit(error)) {
      if (showUpgradeHints && me.plan) shellUi.open('companyPlan')
      else toast.error(error.message)
      return
    }
    toastApiError(error)
  }

  const online = () => {
    if (connection.isOnline()) return true
    toast.error(OFFLINE_SAVE_ERROR)
    return false
  }

  /** True once the company is active again (the sheet closes only then). */
  async function restore(company: Entity, afterUndo = false): Promise<boolean> {
    if (!online()) return false
    setPendingId(company.id)
    try {
      await client.entities.restore({ id: company.id })
      refresh()
      if (!afterUndo) toast.success(`${company.name} restored`)
      return true
    } catch (error) {
      fail(error)
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function archiveNow(company: Entity) {
    await client.entities.archive({ id: company.id })
    refresh()
    toast.success(`${company.name} archived`, {
      duration: UNDO_MS,
      action: { label: 'Undo', onClick: () => void restore(company, true) },
    })
  }

  /** Returns true once the company is archived (the sheet closes then). */
  async function archive(company: Entity): Promise<boolean> {
    if (!online()) return false
    setPendingId(company.id)
    try {
      const preview = await client.entities.archivePreview({ id: company.id })
      if (preview.isLastActive) {
        toast(`${me.organization?.name ?? 'Your organization'} needs at least one active company.`)
        return false
      }
      if (preview.members.count > 0) {
        setConfirm({ company, members: preview.members })
        return false
      }
      await archiveNow(company)
      return true
    } catch (error) {
      fail(error)
      return false
    } finally {
      setPendingId(null)
    }
  }

  async function confirmArchive(): Promise<boolean> {
    if (!confirm || !online()) return false
    setPendingId(confirm.company.id)
    try {
      await archiveNow(confirm.company)
      setConfirm(null)
      return true
    } catch (error) {
      setConfirm(null)
      fail(error)
      return false
    } finally {
      setPendingId(null)
    }
  }

  return {
    archive,
    restore: (company: Entity) => restore(company),
    confirm,
    confirmArchive,
    cancelConfirm: () => setConfirm(null),
    pendingId,
  }
}

export type ArchiveActions = ReturnType<typeof useArchiveCompany>
