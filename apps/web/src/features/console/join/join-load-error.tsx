import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'

/** The link couldn't be checked (no connection, or the server failed): say so and offer a retry. */
export function JoinLoadError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <AuthLayout>
      <AuthHeader title="Couldn't open this invitation">
        Couldn't reach Vento Real Estate. Check your connection and try again.
      </AuthHeader>
      <Button
        size="lg"
        variant="outline"
        className="w-full"
        onClick={() => {
          reset()
          void router.invalidate()
        }}
      >
        Try again
      </Button>
    </AuthLayout>
  )
}
