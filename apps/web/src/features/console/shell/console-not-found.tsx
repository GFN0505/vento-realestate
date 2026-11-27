import { Link } from '@tanstack/react-router'
import { CircleHelpIcon } from 'lucide-react'
import { ErrorState, ErrorText } from '@/components/errors/error-state'
import { Button } from '@/components/ui/button'
import { ConsoleShell } from './console-shell'
import { useConsoleTitle } from './use-console-title'

/** 404 inside the console: an old link, or an organization or plan that's gone. */
export function ConsoleNotFoundPage() {
  useConsoleTitle('Page not found')
  return (
    <ErrorState
      icon={CircleHelpIcon}
      tone="blue"
      title="We can't find that page"
      actions={
        <Button asChild>
          <Link to="/console/organizations">Go to Organizations</Link>
        </Button>
      }
    >
      <ErrorText>The link may be old, or what it pointed to may have been removed.</ErrorText>
    </ErrorState>
  )
}

/** A notFound thrown below the console replaces the layout, so it brings the shell with it. */
export function ConsoleNotFound() {
  return (
    <ConsoleShell>
      <ConsoleNotFoundPage />
    </ConsoleShell>
  )
}
