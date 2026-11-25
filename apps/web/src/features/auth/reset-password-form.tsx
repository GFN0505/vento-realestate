import { useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { toast } from 'sonner'
import { FormAlert } from '@/components/auth/form-alert'
import { NewPasswordFields } from '@/components/auth/new-password-fields'
import { Button } from '@/components/ui/button'
import { authClient } from '@/lib/auth-client'
import { type AuthClientError, authErrorMessage, passwordIssues } from '@/lib/auth-errors'

type Values = { password: string; confirm: string }

/** Board ResetPassword, without the "sign out other devices" tickbox: they always end. */
export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const navigate = useNavigate()
  const [serverError, setServerError] = useState<AuthClientError | null>(null)
  const form = useForm<Values>({ defaultValues: { password: '', confirm: '' } })
  const { isSubmitting } = form.formState
  const issues = passwordIssues(serverError)
  const ruleFailed = !!(issues.reused || issues.rule)

  const submit = form.handleSubmit(async ({ password }) => {
    setServerError(null)
    const { error } = await authClient.resetPassword({ newPassword: password, token })
    if (error) {
      setServerError(error)
      form.setFocus('password')
      return
    }
    toast.success('Password changed. Sign in with your new password.')
    void navigate({ to: '/sign-in', search: { email }, replace: true })
  })

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-[18px]">
      {serverError && !ruleFailed && (
        <FormAlert variant="error">{authErrorMessage(serverError)}</FormAlert>
      )}
      <NewPasswordFields
        form={form}
        label="New password"
        showReuseRule
        serverIssues={issues}
        onPasswordChange={() => ruleFailed && setServerError(null)}
        username={email}
      />
      <p className="text-muted-foreground text-xs">
        You'll be signed out on all other devices, and asked for two-step at your next sign-in.
      </p>
      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save and sign in'}
      </Button>
    </form>
  )
}
