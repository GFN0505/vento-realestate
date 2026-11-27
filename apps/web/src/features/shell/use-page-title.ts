import { useLocation } from '@tanstack/react-router'
import type { PermissionModule } from '@vento/shared'
import { useEffect } from 'react'
import { useMe } from '@/features/preview/use-effective-permissions'
import { recordRecentPage } from './recent-pages'

type Options = {
  /** The module the page belongs to, so a recent entry hides if access is lost. */
  module?: PermissionModule | null
  /** Error pages set a title but aren't "recently opened". */
  recent?: boolean
  /** Instead of the organization's name, e.g. "Vento console" (a place with no organization). */
  suffix?: string
}

/**
 * Sets the browser tab title to "{Page} · {Organization}" (so screen readers announce where you
 * are) and records the page in this device's recently opened list.
 */
export function usePageTitle(
  title: string,
  { module = null, recent = true, suffix }: Options = {},
) {
  const me = useMe()
  const href = useLocation({ select: (l) => l.href })
  const organization = me.organization

  useEffect(() => {
    const place = suffix ?? organization?.name
    document.title = place ? `${title} · ${place}` : title
  }, [title, organization, suffix])

  // Recorded per path; the latest search (e.g. the entity) rides along.
  useEffect(() => {
    if (!recent || !organization) return
    recordRecentPage(me.user.id, organization.id, { title, href, module })
  }, [recent, organization, me.user.id, title, href, module])
}
