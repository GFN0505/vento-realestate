import { Link } from '@tanstack/react-router'
import type { StaffJoinPreview } from '@vento/shared/console'
import { AuthHeader } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { closedWords } from './join-words'

/** A staff invitation that can't be used: expired (or unknown), withdrawn, used, customer email. */
export function JoinClosed({ preview }: { preview: StaffJoinPreview }) {
  const words = closedWords(preview)
  return (
    <>
      <AuthHeader title={words.title}>{words.body}</AuthHeader>
      {words.signIn && (
        <Button size="lg" className="w-full" asChild>
          <Link to="/sign-in" search={preview.email ? { email: preview.email } : {}}>
            Sign in
          </Link>
        </Button>
      )}
    </>
  )
}
