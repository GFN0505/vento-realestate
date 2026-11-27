import { useQuery } from '@tanstack/react-query'
import type { ConsoleStatus } from '@vento/shared/console'
import { CloudOffIcon } from 'lucide-react'
import { type ReactNode, useEffect } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageSkeleton } from '@/components/shell/page-skeleton'
import { Button } from '@/components/ui/button'
import { isNotFound } from '@/lib/error-data'
import { consoleClient, consoleOrpc } from '../api'
import { consoleGate, useConsoleGate } from '../gate/console-gate'
import { ConsoleNotFoundPage } from '../shell/console-not-found'
import { ConfirmItsYouCard, ConfirmItsYouDialog } from './confirm-its-you'
import { TwoStepMissing } from './two-step-missing'

export function statusQuery() {
  return consoleOrpc.console.access.status.queryOptions({
    staleTime: 0,
    retry: false,
    refetchOnWindowFocus: false,
  })
}

/** Decide from a fresh status (plan §9.3). A proof under 5 minutes old opens it silently. */
async function follow(status: ConsoleStatus) {
  if (status.window === 'open') return consoleGate.opened()
  if (status.window === 'two_step_required') return consoleGate.twoStepMissing()
  if (status.freshProof) {
    const opened = await consoleClient.console.access.open().catch(() => null)
    if (opened?.window === 'open') return consoleGate.opened()
  }
  void consoleGate.prove()
}

/**
 * Pages render (and their data requests start) at once; requests park until the window is
 * open. On arrival a closed window shows "Confirm it's you" in place of the page; mid-task it
 * opens over the page, so an open sheet keeps what was typed.
 */
export function ConsoleAccessGate({ children }: { children: ReactNode }) {
  const gate = useConsoleGate()
  const status = useQuery(statusQuery())
  const { refetch } = status
  const passkey = status.data?.methods.passkey ?? false

  // Every answer counts, even one equal to the last (structural sharing keeps the same object).
  // biome-ignore lint/correctness/useExhaustiveDependencies: dataUpdatedAt marks a fresh answer
  useEffect(() => {
    if (status.data) void follow(status.data)
  }, [status.data, status.dataUpdatedAt])

  // A request found the window closed: check again (maybe a fresh sign-in can open it silently).
  useEffect(() => {
    if (gate.kind === 'asking') void refetch()
  }, [gate.kind, refetch])

  if (gate.kind === 'checking' && status.isError) {
    if (isNotFound(status.error)) return <ConsoleNotFoundPage />
    return (
      <EmptyState
        icon={CloudOffIcon}
        action={
          <Button variant="outline" onClick={() => void refetch()} disabled={status.isFetching}>
            Try again
          </Button>
        }
      >
        <span role="alert">The console couldn't load. Check your connection and try again.</span>
      </EmptyState>
    )
  }
  if (gate.kind === 'two_step') return <TwoStepMissing />
  if (gate.kind === 'asking' && gate.mode === 'entry') {
    return status.data ? <ConfirmItsYouCard passkey={passkey} /> : <PageSkeleton />
  }
  return (
    <>
      {children}
      <ConfirmItsYouDialog open={gate.kind === 'asking'} passkey={passkey} />
    </>
  )
}
