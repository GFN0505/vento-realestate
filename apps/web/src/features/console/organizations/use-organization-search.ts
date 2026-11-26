import { useNavigate, useParams, useSearch } from '@tanstack/react-router'
import type { OrganizationSearch } from '@/routes/console/-search'

/** The detail page's open sheet, features filter and ended list live in the address. */
export function useOrganizationSearch() {
  const search = useSearch({ from: '/console/organizations/$organizationId' })
  const { organizationId } = useParams({ from: '/console/organizations/$organizationId' })
  const navigate = useNavigate()

  function update(patch: Partial<OrganizationSearch>, options: { replace?: boolean } = {}) {
    void navigate({
      to: '/console/organizations/$organizationId',
      params: { organizationId },
      search: { ...search, ...patch },
      replace: options.replace,
      resetScroll: false,
    })
  }

  /** Opens a change sheet, with its prefill; closing clears both. */
  function openChange(
    change: OrganizationSearch['change'],
    prefill: Pick<OrganizationSearch, 'kind' | 'key'> = {},
  ) {
    update({ change, kind: prefill.kind, key: prefill.key })
  }
  const closeChange = () => update({ change: undefined, kind: undefined, key: undefined })

  return { organizationId, search, update, openChange, closeChange }
}
