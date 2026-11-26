import { useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import type { Role } from '@vento/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { toastApiError } from '@/lib/api-errors'
import { client } from '@/lib/orpc'

type Props = {
  role: Role | null
  onOpenChange: (open: boolean) => void
}

/** "Delete Site engineer?" Offered only when nobody holds the role (spec question 9). */
export function DeleteRoleConfirm({ role, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [pending, setPending] = useState(false)
  const [shown, setShown] = useState(role)
  if (role && role !== shown) setShown(role)

  async function remove() {
    if (!shown) return
    setPending(true)
    try {
      await client.roles.delete({ id: shown.id })
      toast.success(`${shown.name} deleted`)
      onOpenChange(false)
      void queryClient.invalidateQueries({ queryKey: rolesQuery().queryKey })
      void navigate({ to: '/settings/roles' })
    } catch (error) {
      onOpenChange(false)
      toastApiError(error)
      void queryClient.invalidateQueries({ queryKey: rolesQuery().queryKey })
    } finally {
      setPending(false)
    }
  }

  return (
    <ConfirmDialog
      open={role !== null}
      onOpenChange={onOpenChange}
      title={shown ? `Delete ${shown.name}?` : ''}
      confirmLabel={shown ? `Delete ${shown.name}` : 'Delete'}
      destructive
      pending={pending}
      onConfirm={() => void remove()}
    >
      Nobody has this role. It will no longer be offered on Team. Its history stays in the audit
      trail.
    </ConfirmDialog>
  )
}
