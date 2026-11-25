import { createFileRoute } from '@tanstack/react-router'
import { AuthLayout } from '@/components/auth/auth-layout'
import { SignUpForm } from '@/features/auth/sign-up-form'

export const Route = createFileRoute('/_auth/sign-up')({
  component: () => (
    <AuthLayout>
      <SignUpForm />
    </AuthLayout>
  ),
})
