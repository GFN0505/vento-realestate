import { PageHeader } from '@/components/page-header'
import { SecurityCards } from '@/features/security/security-cards'
import { useConsoleTitle } from '../shell/use-console-title'

/**
 * My account (spec 1b; pattern from SecuritySettings): the staff person's own name, password,
 * two-step ("Required for Vento Real Estate staff", no Turn off), backup codes, passkeys and
 * devices, with My security's cards and rules.
 */
export function MyAccountPage() {
  useConsoleTitle('My account')
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-6">
      <PageHeader
        title="My account"
        description="How you sign in to the Vento Real Estate console and where you're signed in."
      />
      <SecurityCards accountLine="Your Vento Real Estate staff account." />
    </div>
  )
}
