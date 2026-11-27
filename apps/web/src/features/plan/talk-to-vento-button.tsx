import { Button } from '@/components/ui/button'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { talkToVentoHref } from './talk-to-vento'

/**
 * **Talk to Vento**, for owners only: a real link, so it works with a long-press or a
 * middle-click too. Follows the effective role, so an owner previewing another role sees none.
 */
export function TalkToVentoButton({ about, className }: { about: string; className?: string }) {
  const me = useMe()
  const { showUpgradeHints } = useEffectiveAccess()
  if (!showUpgradeHints || !me.plan || !me.organization) return null
  const href = talkToVentoHref({
    contact: me.plan.contact,
    organizationName: me.organization.name,
    planName: me.plan.name,
    about,
  })
  const external = !href.startsWith('mailto:')
  return (
    <Button asChild variant="outline" size="sm" className={className}>
      <a href={href} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        Talk to Vento Real Estate
      </a>
    </Button>
  )
}
