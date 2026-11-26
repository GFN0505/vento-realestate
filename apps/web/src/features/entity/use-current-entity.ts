import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import type { Entity } from '@vento/shared'
import { useEffect, useRef } from 'react'
import { useMe } from '@/features/preview/use-effective-permissions'
import { notify } from '@/lib/notify'
import { orpc } from '@/lib/orpc'
import {
  ENTITY_NOT_AVAILABLE,
  type EntityView,
  rememberEntity,
  rememberedEntity,
  resolveEntity,
} from './current-entity'

/** Active entities this member can use (the server applies their limits). */
export function entitiesQuery() {
  return orpc.entities.list.queryOptions({
    input: { status: 'active', pageSize: 100 },
    staleTime: 5 * 60_000,
  })
}

export type CurrentEntity = EntityView & {
  /**
   * Limited to companies that are all archived now: nothing to show. The switcher reads
   * "No company" and Home says who to ask (spec "Company switcher changes").
   */
  noCompany: boolean
  options: readonly Entity[]
  status: 'pending' | 'error' | 'success'
  refetch: () => void
  /** null = all entities. */
  select: (entityId: string | null) => void
}

export function useCurrentEntity(): CurrentEntity {
  const me = useMe()
  const requested = useSearch({ from: '/_app/_shell', select: (s) => s.entity })
  const navigate = useNavigate()
  const query = useQuery(entitiesQuery())
  const options = query.data?.items ?? []
  const view = query.isSuccess
    ? resolveEntity(requested, options, me.member?.entityIds ?? null)
    : // Until the list arrives, the address is taken at its word (no flash of "All entities").
      { entity: null, locked: false, invalid: false }

  function select(entityId: string | null) {
    if (me.organization) rememberEntity(me.organization.id, entityId)
    void navigate({ to: '.', search: (prev) => ({ ...prev, entity: entityId ?? undefined }) })
  }

  const limits = me.member?.entityIds ?? null
  return {
    ...view,
    noCompany: query.isSuccess && limits !== null && options.length === 0,
    options,
    status: query.status,
    refetch: () => void query.refetch(),
    select,
  }
}

/**
 * Keeps the address and the device memory in step: drops an entity that isn't available (one
 * neutral toast) and restores this device's last choice when a link has none.
 */
export function useEntitySync() {
  const me = useMe()
  const organizationId = me.organization?.id
  const requested = useSearch({ from: '/_app/_shell', select: (s) => s.entity })
  const navigate = useNavigate()
  const query = useQuery(entitiesQuery())
  const restored = useRef(false)
  // One toast per unavailable id, even if the effect runs twice.
  const reported = useRef<string | null>(null)

  useEffect(() => {
    if (!query.isSuccess || !organizationId) return
    const options = query.data.items
    const limits = me.member?.entityIds ?? null
    if (limits?.length === 1) return
    if (requested) {
      if (resolveEntity(requested, options, limits).invalid) {
        if (reported.current !== requested) notify((toast) => toast(ENTITY_NOT_AVAILABLE))
        reported.current = requested
        rememberEntity(organizationId, null)
        void navigate({
          to: '.',
          search: (prev) => ({ ...prev, entity: undefined }),
          replace: true,
        })
      }
      return
    }
    if (restored.current) return
    restored.current = true
    const stored = rememberedEntity(organizationId)
    if (stored && options.some((e) => e.id === stored)) {
      void navigate({ to: '.', search: (prev) => ({ ...prev, entity: stored }), replace: true })
    } else if (stored) {
      rememberEntity(organizationId, null)
    }
  }, [query.isSuccess, query.data, organizationId, requested, me.member, navigate])
}
