import { LEGAL_LINKS } from '@/components/auth/auth-layout'
import { Checkbox } from '@/components/ui/checkbox'
import { FieldError } from '@/components/ui/field'

type Props = {
  id: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
  error?: string | undefined
}

export function TermsCheckbox({ id, checked, onCheckedChange, error }: Props) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2.5 text-[13px]">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          className="mt-px"
        />
        <div>
          <label htmlFor={id} className="cursor-pointer">
            I agree to the{' '}
          </label>
          <a
            href={LEGAL_LINKS.terms}
            className="font-medium text-link hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Terms
          </a>{' '}
          and{' '}
          <a
            href={LEGAL_LINKS.privacy}
            className="font-medium text-link hover:underline"
            target="_blank"
            rel="noreferrer"
          >
            Privacy notice
          </a>
          <span className="mt-0.5 block text-muted-foreground text-xs">
            We process data under the Nigeria Data Protection Act 2023.
          </span>
        </div>
      </div>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  )
}
