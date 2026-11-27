import { WifiOffIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { connection } from '@/lib/connection'
import { ErrorState, ErrorText } from './error-state'

/** Board OfflinePage: a page whose data hasn't loaded. Retries by itself on reconnect. */
export function OfflinePage({ onRetry }: { onRetry: () => void }) {
  useEffect(() => {
    document.title = "You're offline · Vento Real Estate"
    return connection.onReconnect(onRetry)
  }, [onRetry])

  return (
    <ErrorState
      icon={WifiOffIcon}
      tone="slate"
      title="You're offline"
      actions={<Button onClick={onRetry}>Try again</Button>}
    >
      <ErrorText>
        This page needs a connection to open. We'll load it as soon as you're back.
      </ErrorText>
    </ErrorState>
  )
}
