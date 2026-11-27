import { PageHeader } from '@/components/page-header'
import type { SecurityIntent } from '@/features/settings/security-search'
import { usePageTitle } from '@/features/shell/use-page-title'
import { SecurityCards } from './security-cards'

type Props = {
  intent: SecurityIntent | undefined
  onIntentHandled: () => void
}

/**
 * My security (spec; boards SecuritySettings, SecurityMobile): one page of four blocks, the
 * person's own account in every organization. Needs no permission and ignores a role preview:
 * everything here is about the signed-in person.
 */
export function SecurityPage({ intent, onIntentHandled }: Props) {
  usePageTitle('My security')
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-6">
      <PageHeader
        title="My security"
        description="How you sign in to Vento and where you're signed in."
      />
      <SecurityCards
        accountLine="This is your Vento account in every organization you belong to."
        intent={intent}
        onIntentHandled={onIntentHandled}
      />
    </div>
  )
}
