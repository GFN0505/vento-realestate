import { useQuery } from '@tanstack/react-query'
import type { Role } from '@vento/shared'
import type { ReactNode } from 'react'
import { rolesQuery } from '@/features/preview/use-effective-permissions'

type Props = {
  /** Renders one role row. */
  row: (role: Role) => ReactNode
  /** Loading and error rows, in the host's own row style. */
  status: (message: string, retry?: () => void) => ReactNode
}

/**
 * The roles an owner or admin can preview (roles.list, which the server limits to them). The
 * list loads when the menu opens, never on first load.
 */
export function PreviewRoles({ row, status }: Props) {
  const roles = useQuery(rolesQuery())
  if (roles.isPending) return status('Loading roles…')
  if (roles.isError) return status("Couldn't load roles. Try again.", () => void roles.refetch())
  return <>{roles.data.items.map(row)}</>
}
