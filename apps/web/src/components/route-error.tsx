import { type ErrorComponentProps, useRouter } from '@tanstack/react-router'
import { AuthHeader, AuthLayout } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'

/** Shown when a page can't load its data, usually a dropped connection. */
export function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter()
  return (
    <AuthLayout>
      <AuthHeader title="Couldn't reach Vento">
        Check your connection and try again. Nothing you saved has been lost.
      </AuthHeader>
      <Button
        size="lg"
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

export function NotFound() {
  return (
    <AuthLayout>
      <AuthHeader title="Page not found">
        The link may be old or mistyped. Check it, or go back to the start.
      </AuthHeader>
      <Button size="lg" className="w-full" asChild>
        <a href="/">Go to Vento</a>
      </Button>
    </AuthLayout>
  )
}
