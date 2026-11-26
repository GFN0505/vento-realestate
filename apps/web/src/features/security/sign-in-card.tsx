import { type SecurityOverview, twoStepRequiredLine } from '@vento/shared'
import { KeyRoundIcon, ListOrderedIcon, SmartphoneIcon } from 'lucide-react'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { securityUi } from './security-dialogs'
import { SecurityRow, SecuritySection } from './security-section'
import { backupCodesWords } from './security-words'

const rowButton = 'max-sm:h-11'

/** Card 2 (spec "Sign-in"): password, two-step and what requires it, backup codes left. */
export function SignInCard({ data }: { data: SecurityOverview }) {
  const { twoStep } = data
  const required = twoStep.requiredBy
  const codes = twoStep.backupCodesLeft === null ? null : backupCodesWords(twoStep.backupCodesLeft)

  return (
    <SecuritySection title="Sign-in">
      <SecurityRow
        icon={KeyRoundIcon}
        label="Password"
        action={
          <Button
            variant="outline"
            className={rowButton}
            onClick={() => securityUi.open({ name: 'change-password' })}
          >
            Change password
          </Button>
        }
      >
        {data.passwordChangedAt
          ? `Last changed ${formatDate(data.passwordChangedAt)}`
          : 'Set when you joined'}
      </SecurityRow>

      <SecurityRow
        icon={SmartphoneIcon}
        tone={twoStep.enabled ? 'emerald' : 'neutral'}
        label="Two-step sign-in"
        badge={
          twoStep.enabled ? (
            <StatusBadge tone="emerald">On</StatusBadge>
          ) : (
            <StatusBadge tone="slate">Off</StatusBadge>
          )
        }
        action={
          !twoStep.enabled ? (
            <Button className={rowButton} onClick={() => securityUi.open({ name: 'turn-on' })}>
              Turn on
            </Button>
          ) : required ? null : (
            <Button
              variant="ghost"
              className={cn(rowButton, 'text-muted-foreground hover:text-foreground')}
              onClick={() => securityUi.open({ name: 'turn-off' })}
            >
              Turn off
            </Button>
          )
        }
      >
        <p>
          {twoStep.enabled
            ? 'Authenticator app'
            : 'Add a code from an authenticator app when you sign in.'}
        </p>
        {required && <p className="text-foreground/80">{twoStepRequiredLine(required)}</p>}
      </SecurityRow>

      {codes && (
        <SecurityRow
          icon={ListOrderedIcon}
          tone={codes.low ? 'amber' : 'neutral'}
          label="Backup codes"
          action={
            <Button
              variant="outline"
              className={rowButton}
              onClick={() => securityUi.open({ name: 'new-codes' })}
            >
              Make new codes
            </Button>
          }
        >
          <span className={cn('tabular-nums', codes.low && 'font-medium text-status-amber-fg')}>
            {codes.text}
          </span>
        </SecurityRow>
      )}
    </SecuritySection>
  )
}
