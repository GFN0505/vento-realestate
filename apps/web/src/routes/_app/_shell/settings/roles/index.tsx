import { createFileRoute } from '@tanstack/react-router'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { validateNewRoleSearch } from '@/features/roles/role-queries'
import { RolesPage } from '@/features/roles/roles-page'

export const Route = createFileRoute('/_app/_shell/settings/roles/')({
  validateSearch: validateNewRoleSearch,
  // prefetchQuery never throws: a failure shows "Roles couldn't load" with Try again.
  loader: ({ context: { queryClient } }) => queryClient.prefetchQuery(rolesQuery()),
  component: RolesPage,
})
