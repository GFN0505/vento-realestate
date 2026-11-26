import { createFileRoute } from '@tanstack/react-router'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { RolePage } from '@/features/roles/role-page'
import { roleQuery, validateNewRoleSearch } from '@/features/roles/role-queries'

export const Route = createFileRoute('/_app/_shell/settings/roles/$roleId')({
  validateSearch: validateNewRoleSearch,
  loader: ({ context: { queryClient }, params }) => {
    // The list feeds Start from in New role; not awaited.
    void queryClient.prefetchQuery(rolesQuery())
    // A missing role shows "That role no longer exists." on the page, with a way back.
    return queryClient.prefetchQuery(roleQuery(params.roleId))
  },
  component: RolePage,
})
