import { CopyIcon, TriangleAlertIcon } from 'lucide-react'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ErrorState, ErrorText } from './error-state'

/**
 * Board Error500, without the "saved up to 14:32" line and status page (spec departures). The
 * reference matches the server's log line for the request.
 */
export function ServerErrorPage({
  reference,
  onRetry,
}: {
  reference: string | null
  onRetry: () => void
}) {
  useEffect(() => {
    document.title = 'Something went wrong · Vento'
  }, [])

  async function copy() {
    if (!reference) return
    try {
      await navigator.clipboard.writeText(reference)
      toast.success('Reference copied')
    } catch {
      toast(`Reference ${reference}`)
    }
  }

  return (
    <ErrorState
      icon={TriangleAlertIcon}
      tone="rose"
      title="Something went wrong on our side"
      actions={<Button onClick={onRetry}>Try again</Button>}
    >
      <ErrorText>
        Anything you saved before this is safe. Try again, or quote this reference if it keeps
        happening.
      </ErrorText>
      {reference && (
        <span className="inline-flex items-center gap-1 rounded-lg border bg-card py-0.5 pr-0.5 pl-2.5 text-xs tabular-nums">
          Reference <span className="font-semibold">{reference}</span>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => void copy()}
            className="h-8 text-link max-md:h-11"
          >
            <CopyIcon aria-hidden />
            Copy
          </Button>
        </span>
      )}
    </ErrorState>
  )
}
