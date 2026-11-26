import { CircleFadingArrowUpIcon } from 'lucide-react'
import { CommandGroup, CommandHint, CommandItem } from '@/components/ui/command'
import { useMe } from '@/features/preview/use-effective-permissions'
import { availableOnText, openTalkToVento, talkToVentoHref } from './talk-to-vento'

/** Hints wait for a real search: owners looking for something, not browsing a price list. */
const MIN_SEARCH = 2

/**
 * ⌘K, owners only (spec decision 3): a feature released to the organization but outside its
 * plan appears as one quiet row when searched for, "Commissions · Available on Growth", and
 * Enter opens **Talk to Vento**. Never in the sidebar, tabs or Home.
 */
export function UpgradeHintRows({ search, close }: { search: string; close: () => void }) {
  const me = useMe()
  const plan = me.plan
  if (!plan || !me.organization || search.trim().length < MIN_SEARCH) return null
  if (plan.upgradeHints.length === 0) return null
  const organizationName = me.organization.name

  return (
    <CommandGroup heading="Other plans">
      {plan.upgradeHints.map((hint) => (
        <CommandItem
          key={hint.key}
          value={`upgrade:${hint.key}`}
          keywords={[hint.label, 'plan upgrade']}
          onSelect={() => {
            close()
            openTalkToVento(
              talkToVentoHref({
                contact: plan.contact,
                organizationName,
                planName: plan.name,
                about: hint.label,
              }),
            )
          }}
        >
          <CircleFadingArrowUpIcon aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col py-1.5 leading-snug">
            <span className="truncate text-muted-foreground">{hint.label}</span>
            <span className="truncate text-[11px] text-muted-foreground">
              {availableOnText(hint)}
            </span>
          </span>
          <CommandHint className="font-medium text-link">Talk to Vento</CommandHint>
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
