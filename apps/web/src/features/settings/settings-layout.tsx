import type { ReactNode } from 'react'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { showsSettingsNav, visibleSections } from './sections'
import { SettingsNav } from './settings-nav'

/**
 * Every settings page (archetype: settings page). The left sub-navigation is drawn only once the
 * member can open two or more sections (spec: a menu of one is clutter); below lg it's replaced
 * by the phone list at `/settings`. The content column has the same max width either way.
 */
export function SettingsLayout({ children }: { children: ReactNode }) {
  const access = useEffectiveAccess()
  const sections = visibleSections(access)
  if (!showsSettingsNav(sections)) {
    return <div className="mx-auto w-full max-w-6xl">{children}</div>
  }
  return (
    <div className="mx-auto grid w-full max-w-[calc(72rem+244px)] items-start gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
      <div className="max-lg:hidden">
        <SettingsNav sections={sections} />
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
