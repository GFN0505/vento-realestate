import { useNavigate, useSearch } from '@tanstack/react-router'
import { useMe } from '@/features/preview/use-effective-permissions'
import { rememberTeamFilters, type TeamSearch } from './team-search'

const FILTERS = ['q', 'role', 'show'] as const

/**
 * The Team page's state lives in the address. Changing a filter goes back to page 1; the role
 * and chip are remembered on this device. Typing a search replaces the history entry.
 */
export function useTeamSearch() {
  const search = useSearch({ from: '/_app/_shell/settings/team' })
  const navigate = useNavigate()
  const me = useMe()

  function update(patch: Partial<TeamSearch>, options: { replace?: boolean } = {}) {
    const filtering = FILTERS.some((key) => key in patch)
    const next: TeamSearch = { ...search, ...patch, ...(filtering ? { page: undefined } : {}) }
    if (me.organization && ('role' in patch || 'show' in patch)) {
      rememberTeamFilters(me.organization.id, next)
    }
    void navigate({ to: '/settings/team', search: next, replace: options.replace })
  }

  return { search, update }
}
