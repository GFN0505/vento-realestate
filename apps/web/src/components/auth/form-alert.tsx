import { CircleAlertIcon, CircleCheckIcon, InfoIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'

type Props = {
  variant: 'error' | 'success' | 'info'
  /** Bold lead-in in the status colour, e.g. "Check your email." */
  title?: string
  children: ReactNode
  action?: ReactNode
}

const VARIANT = { error: 'destructive', success: 'success', info: 'info' } as const
const TITLE_CLASS = {
  error: 'text-status-rose-fg',
  success: 'text-status-emerald-fg',
  info: 'text-status-blue-fg',
} as const

/** A form-level message: what happened, then what to do. Errors interrupt; the rest wait. */
export function FormAlert({ variant, title, children, action }: Props) {
  const Icon =
    variant === 'error' ? CircleAlertIcon : variant === 'success' ? CircleCheckIcon : InfoIcon
  return (
    <Alert variant={VARIANT[variant]} role={variant === 'error' ? 'alert' : 'status'}>
      <Icon aria-hidden="true" />
      <AlertDescription>
        <p>
          {title && <b className={TITLE_CLASS[variant]}>{title} </b>}
          {children}
        </p>
        {action}
      </AlertDescription>
    </Alert>
  )
}
