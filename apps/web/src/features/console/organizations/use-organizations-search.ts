import { useNavigate, useSearch } from '@tanstack/react-router'
import type { OrganizationsSearch } from '@/routes/console/-search'

/** The list's chip, search and page live in the address; a new filter goes back to page 1. */
export function useOrganizationsSearch() {
  const search = useSearch({ from: '/console/' })
  const navigate = useNavigate()

  function update(patch: Partial<OrganizationsSearch>, options: { replace?: boolean } = {}) {
    const filtering = 'filter' in patch || 'q' in patch
    const next = { ...search, ...patch, ...(filtering ? { page: undefined } : {}) }
    void navigate({ to: '/console', search: next, replace: options.replace })
  }

  return { search, update }
}
