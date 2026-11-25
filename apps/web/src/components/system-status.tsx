import type { HealthStatus } from '@vento/shared'

type Props =
  | { state: 'loading' }
  | { state: 'unreachable' }
  | { state: 'ready'; health: HealthStatus }

/** Temporary home page for the foundation brick: proves web → API → database works. */
export function SystemStatus(props: Props) {
  const api =
    props.state === 'loading'
      ? 'Checking…'
      : props.state === 'ready'
        ? 'Connected'
        : "Can't reach the API"
  const database =
    props.state === 'ready'
      ? props.health.database === 'up'
        ? 'Connected'
        : "Can't reach the database"
      : '—'

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-semibold">Vento</h1>
        <p className="text-sm opacity-70">
          The foundation is running. Screens arrive brick by brick.
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-y-2 text-sm" aria-live="polite">
        <dt className="opacity-70">API</dt>
        <dd>{api}</dd>
        <dt className="opacity-70">Database</dt>
        <dd>{database}</dd>
      </dl>
    </main>
  )
}
