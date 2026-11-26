import { Button } from '@/components/ui/button'
import { useMe } from '@/features/preview/use-effective-permissions'
import { talkToVentoHref } from './talk-to-vento'

/**
 * **Talk to Vento**, for owners only (the server sends `plan` to owners alone): a real link, so
 * it works with a long-press or a middle-click too. Nothing renders for anyone else.
 */
export function TalkToVentoButton({ about, className }: { about: string; className?: string }) {
  const me = useMe()
  if (!me.plan || !me.organization) return null
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
        Talk to Vento
      </a>
    </Button>
  )
}
