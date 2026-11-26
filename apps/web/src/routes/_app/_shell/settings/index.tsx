import { createFileRoute, notFound, redirect } from '@tanstack/react-router'
import {
  effectiveAccessFrom,
  useEffectiveAccess,
} from '@/features/preview/use-effective-permissions'
import { settingsLanding, visibleSections } from '@/features/settings/sections'
import { SettingsMobileList } from '@/features/settings/settings-mobile-list'

const PHONE = '(max-width: 767px)'

export const Route = createFileRoute('/_app/_shell/settings/')({
  // `/settings` opens the first section; phones get the section list once there are two or more.
  beforeLoad: ({ context }) => {
    const access = effectiveAccessFrom(context.queryClient)
    const sections = access ? visibleSections(access) : []
    const landing = settingsLanding(sections, window.matchMedia(PHONE).matches)
    if (landing === null) throw notFound()
    if (landing !== 'list') throw redirect({ to: landing, replace: true })
  },
  component: SettingsIndex,
})

function SettingsIndex() {
  const access = useEffectiveAccess()
  return <SettingsMobileList sections={visibleSections(access)} />
}
