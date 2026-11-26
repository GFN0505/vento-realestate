import { useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { probe, useOnline } from '@/lib/connection'

/** Board OfflineBanner, without the saved-receipts line until the offline queue exists. */
export function OfflineBanner() {
  const online = useOnline()
  const queryClient = useQueryClient()
  const [checking, setChecking] = useState(false)
  if (online) return null

  async function retry() {
    setChecking(true)
    const back = await probe()
    setChecking(false)
    if (back) void queryClient.refetchQueries({ type: 'active' })
  }

  return (
    <div
      role="alert"
      className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-status-amber-border bg-status-amber-bg px-4 py-3 text-[13px] leading-normal"
    >
      <p>
        <b className="text-status-amber-fg">You're offline.</b> You can keep reading; saving resumes
        when you reconnect.
      </p>
      <Button size="sm" variant="outline" disabled={checking} onClick={() => void retry()}>
        {checking ? 'Checking…' : 'Retry now'}
      </Button>
    </div>
  )
}
