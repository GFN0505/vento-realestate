import { createFileRoute, redirect } from '@tanstack/react-router'
import type { Me } from '@vento/shared'
import { meQuery } from '@/features/account/api'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { TeamPage } from '@/features/team/team-page'
import { teamListKey, teamListQuery } from '@/features/team/team-queries'
import { restoreTeamFilters, validateTeamSearch } from '@/features/team/team-search'

export const Route = createFileRoute('/_app/_shell/settings/team')({
  validateSearch: validateTeamSearch,
  beforeLoad: ({ context, search }) => {
    // A bare link to Team opens with this device's last role filter and chip.
    const me = context.queryClient.getQueryData<Me>(meQuery().queryKey)
    const restored = me?.organization ? restoreTeamFilters(me.organization.id, search) : null
    if (restored) throw redirect({ to: '/settings/team', search: restored, replace: true })
  },
  // The open sheet isn't part of the list, so opening one never refetches it.
  loaderDeps: ({ search: { q, role, show, page } }) => ({ q, role, show, page }),
  loader: async ({ context: { queryClient }, deps }) => {
    // Roles feed the role filter and menus; not awaited, the list never waits for them.
    void queryClient.prefetchQuery(rolesQuery())
    const seenBefore = queryClient.getQueriesData({ queryKey: teamListKey() }).length > 0
    // prefetchQuery never throws: a failure shows "Team couldn't load" with Try again.
    const load = queryClient.prefetchQuery(teamListQuery(deps))
    // The first visit arrives with its rows. After that, searching and paging don't wait: the
    // page keeps the current rows on screen until the new ones land.
    if (!seenBefore) await load
  },
  component: TeamPage,
})
