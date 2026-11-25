import { Link } from '@tanstack/react-router'
import type { InvitationPreview } from '@vento/shared'
import { AuthFootnote, AuthHeader } from '@/components/auth/auth-layout'
import { Button } from '@/components/ui/button'
import { formatDate } from '@/lib/format'

/** An invitation that can't be accepted any more, or a link that never worked. */
export function InvitationClosed({ preview }: { preview: InvitationPreview | null }) {
  const { title, body } = closedCopy(preview)
  return (
    <>
      <AuthHeader title={title}>{body}</AuthHeader>
      <Button size="lg" variant="outline" className="w-full" asChild>
        <Link to="/sign-in">Go to sign in</Link>
      </Button>
      <AuthFootnote>
        New to Vento? <Link to="/sign-up">Create a company account</Link>.
      </AuthFootnote>
    </>
  )
}

function closedCopy(preview: InvitationPreview | null): { title: string; body: string } {
  switch (preview?.status) {
    case 'expired':
      return {
        title: 'This invitation has expired',
        body: `This invitation expired on ${formatDate(preview.expiresOn)}. Ask ${preview.inviterName} to send a new one.`,
      }
    case 'withdrawn':
      return {
        title: 'This invitation was withdrawn',
        body: `Ask ${preview.inviterName} if you still need access to ${preview.organizationName}.`,
      }
    case 'accepted':
      return {
        title: 'Invitation already accepted',
        body: `You're a member of ${preview.organizationName}. Sign in to continue.`,
      }
    case 'declined':
      return {
        title: 'Invitation declined',
        body: `Ask ${preview.inviterName} to send a new one if you change your mind.`,
      }
    default:
      return {
        title: "This invitation link doesn't work",
        body: 'It may be incomplete or replaced by a newer one. Open the latest email, or ask for a new invitation.',
      }
  }
}
