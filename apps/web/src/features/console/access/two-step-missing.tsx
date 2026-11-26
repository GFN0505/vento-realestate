import { Link } from '@tanstack/react-router'
import { SmartphoneIcon } from 'lucide-react'
import { ErrorState, ErrorText } from '@/components/errors/error-state'
import { Button } from '@/components/ui/button'
import { useMe } from '@/features/preview/use-effective-permissions'
import { useConsoleTitle } from '../shell/use-console-title'

/**
 * A super-admin whose two-step was reset (spec): the console stays closed until the
 * authenticator app is set up again, in My security or (with no organization) the setup page.
 */
export function TwoStepMissing() {
  const me = useMe()
  useConsoleTitle('Set up two-step')
  return (
    <ErrorState
      icon={SmartphoneIcon}
      tone="amber"
      title="Set up two-step to use the Vento console."
      actions={
        <Button asChild>
          {me.organization ? (
            <Link to="/settings/security" search={{ do: 'turn-on' }}>
              Set up two-step
            </Link>
          ) : (
            <Link to="/two-step/setup">Set up two-step</Link>
          )}
        </Button>
      }
    >
      <ErrorText>You'll need a code from your authenticator app each time you open it.</ErrorText>
    </ErrorState>
  )
}
