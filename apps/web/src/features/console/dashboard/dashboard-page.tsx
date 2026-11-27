import { useQuery } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { CloudOffIcon, SearchIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useConsoleTitle } from '../shell/use-console-title'
import { plural } from '../words'
import { AttentionQueue } from './attention-queue'
import { CustomerActivityPanel } from './customer-activity-panel'
import { DashboardNumbers } from './dashboard-numbers'
import { DashboardSkeleton } from './dashboard-skeleton'
import { PlansReleasesPanel } from './plans-releases-panel'
import { dashboardQuery } from './queries'

/** "Find an organization": Enter opens Organizations with that search (spec: 2 clicks to "why"). */
function FindOrganization() {
  const navigate = useNavigate()
  const [text, setText] = useState('')
  function submit(event: FormEvent) {
    event.preventDefault()
    const q = text.trim()
    void navigate({ to: '/console/organizations', search: q ? { q } : {} })
  }
  return (
    <search className="contents">
      <form onSubmit={submit} className="relative w-full md:w-72">
        <SearchIcon
          aria-hidden
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
        />
        <Input
          type="search"
          name="q"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Find an organization"
          aria-label="Find an organization"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="pl-9"
        />
      </form>
    </search>
  )
}

/**
 * The console's home (spec 1b §2; DESIGN-NOTES role-home anatomy): four numbers, a work queue,
 * two panels. Account-level facts only; internal organizations left out.
 */
export function DashboardPage() {
  useConsoleTitle('Dashboard')
  const query = useQuery(dashboardQuery())
  const data = query.data

  if (!data) {
    if (query.isError) {
      return (
        <EmptyState
          icon={CloudOffIcon}
          action={
            <Button
              variant="outline"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
              className="max-md:h-11"
            >
              Try again
            </Button>
          }
        >
          <span role="alert">Couldn't load the Dashboard.</span>
        </EmptyState>
      )
    }
    return <DashboardSkeleton />
  }

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Dashboard"
        description={`${plural(data.header.organizations, 'organization')} · ${plural(data.header.people, 'person', 'people')}`}
        actions={<FindOrganization />}
        className="[&>div:last-child]:max-md:w-full"
      />
      <DashboardNumbers numbers={data.numbers} />
      <AttentionQueue attention={data.attention} />
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CustomerActivityPanel activity={data.activity} />
        <PlansReleasesPanel plans={data.plans} />
      </div>
    </div>
  )
}
