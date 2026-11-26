import { MIN_PASSWORD_LENGTH } from '@vento/shared'
import { useId, useState } from 'react'
import type { UseFormReturn } from 'react-hook-form'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { PasswordInput } from './password-input'
import { meetsLocalRules, PasswordRules, type ServerPasswordIssues } from './password-rules'

type PasswordValues = { password: string; confirm: string }

type Props<T extends PasswordValues> = {
  form: UseFormReturn<T>
  label: string
  /** Reset adds "Different from your last 5 passwords". */
  showReuseRule?: boolean
  serverIssues?: ServerPasswordIssues
  /** Typing a new password clears a server refusal of the old one. */
  onPasswordChange?: () => void
  /** Lets password managers save the new password against this account. */
  username?: string
  /**
   * Show the rules from the start, unticked (a dialog: nothing jumps when typing begins), at the
   * roomier 13px size.
   */
  alwaysShowRules?: boolean
}

export const PASSWORDS_DONT_MATCH = "Passwords don't match"

/** Safari and iCloud Keychain read this to generate a password that meets our rules. */
const PASSWORD_MANAGER_RULES = `minlength: ${MIN_PASSWORD_LENGTH}; required: upper; required: lower; required: digit; required: special;`

/**
 * New password with its live rule checklist, then "Confirm password". The confirmation is
 * checked in the browser only (on submit, and on blur once typed in) and never sent.
 */
export function NewPasswordFields<T extends PasswordValues>({
  form: anyForm,
  label,
  showReuseRule = false,
  serverIssues,
  onPasswordChange,
  username,
  alwaysShowRules = false,
}: Props<T>) {
  // React Hook Form can't resolve field paths on a generic form; T always has both fields.
  const form = anyForm as unknown as UseFormReturn<PasswordValues>
  const ids = { password: useId(), confirm: useId() }
  const { errors } = form.formState
  const serverRefused = !!(serverIssues?.reused || serverIssues?.rule)
  // The checklist appears once they start typing (or submit empty) and then stays, so
  // clearing the field doesn't make the form jump.
  const [typed, setTyped] = useState(false)
  // One toggle shows or hides both fields, so they can compare what they typed.
  const [visible, setVisible] = useState(false)
  const toggle = { visible, onVisibleChange: setVisible, toggleNoun: 'passwords' as const }
  const showRules = alwaysShowRules || typed || !!errors.password || serverRefused
  const rulesId = `${ids.password}-rules`
  const recheckConfirm = () => {
    if (form.getFieldState('confirm').error) void form.trigger('confirm')
  }

  return (
    <>
      <Field data-invalid={!!errors.password || serverRefused}>
        <FieldLabel htmlFor={ids.password}>{label}</FieldLabel>
        <PasswordInput
          id={ids.password}
          autoComplete="new-password"
          passwordrules={PASSWORD_MANAGER_RULES}
          {...toggle}
          aria-invalid={!!errors.password || serverRefused}
          aria-describedby={showRules ? rulesId : undefined}
          {...form.register('password', {
            onChange: (event: { target: { value: string } }) => {
              if (event.target.value) setTyped(true)
              onPasswordChange?.()
              recheckConfirm()
            },
            validate: (v) => meetsLocalRules(v) || 'Meet every password rule',
          })}
        />
        {username && (
          <input type="email" autoComplete="username" value={username} readOnly hidden />
        )}
        {showRules && (
          // Grows downwards from zero height, so nothing above it moves.
          <div className={alwaysShowRules ? 'grid' : 'grid motion-safe:animate-reveal-down'}>
            <div className="min-h-0 overflow-hidden">
              <PasswordRules
                id={rulesId}
                password={form.watch('password')}
                serverIssues={serverIssues}
                showReuseRule={showReuseRule}
                showUnmetAsFailed={!!errors.password}
                size={alwaysShowRules ? 'roomy' : 'default'}
              />
            </div>
          </div>
        )}
      </Field>
      <Field data-invalid={!!errors.confirm}>
        <FieldLabel htmlFor={ids.confirm}>Confirm password</FieldLabel>
        <PasswordInput
          id={ids.confirm}
          autoComplete="new-password"
          {...toggle}
          aria-invalid={!!errors.confirm}
          aria-describedby={errors.confirm ? `${ids.confirm}-error` : undefined}
          {...form.register('confirm', {
            onBlur: () => {
              if (form.getValues('confirm')) void form.trigger('confirm')
            },
            validate: (v, values) => v === values.password || PASSWORDS_DONT_MATCH,
          })}
        />
        {/*
         * The line is reserved: this error can appear on blur, and if it pushed the form down
         * the click that caused the blur (e.g. on the terms box) would land on the wrong thing.
         */}
        <div className="min-h-[18px]">
          <FieldError id={`${ids.confirm}-error`}>{errors.confirm?.message}</FieldError>
        </div>
      </Field>
    </>
  )
}
