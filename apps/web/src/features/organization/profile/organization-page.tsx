import { useQuery } from '@tanstack/react-query'
import type { Organization } from '@vento/shared'
import { CloudOffIcon, LoaderCircleIcon } from 'lucide-react'
import { EmptyState } from '@/components/empty-state'
import { PageHeader } from '@/components/page-header'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { UnsavedChangesDialog } from '@/components/unsaved-changes-dialog'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { orgWideRefusal } from '@/features/settings/org-wide-access'
import { OrgWideReadOnlyNote } from '@/features/settings/read-only-note'
import { usePageTitle } from '@/features/shell/use-page-title'
import { useSaveShortcut, useUnsavedGuard } from '@/lib/use-unsaved-guard'
import { ORGANIZATION_FORM_ID, OrganizationForm, useOrganizationForm } from './organization-form'
import { organizationQuery } from './organization-queries'

const DESCRIPTION = 'Your developer group. Each company inside it is set up under Companies.'

/** Settings → Organization (board SetOrg, partly): the group's name, head office and year. */
export function OrganizationPage() {
  usePageTitle('Organization', { module: 'settings' })
  const query = useQuery(organizationQuery())

  if (!query.data) {
    return (
      <div className="flex flex-col gap-5">
        <PageHeader title="Organization" description={DESCRIPTION} />
        {query.isError ? (
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
            <span role="alert">
              Organization details couldn't load. Check your connection and try again.
            </span>
          </EmptyState>
        ) : (
          <OrganizationSkeleton />
        )}
      </div>
    )
  }
  return <LoadedOrganization org={query.data} />
}

function LoadedOrganization({ org }: { org: Organization }) {
  const me = useMe()
  const { permissions } = useEffectiveAccess()
  const refusal = orgWideRefusal(me, permissions, 'edit')
  const editable = refusal === null
  const state = useOrganizationForm(org)
  const dirty = editable && state.form.formState.isDirty
  const guard = useUnsavedGuard(dirty)
  useSaveShortcut(dirty && !state.save.isPending, () => void state.submit())

  const saveButton = (className?: string) => (
    <Button
      type="submit"
      form={ORGANIZATION_FORM_ID}
      disabled={!dirty || state.save.isPending}
      aria-busy={state.save.isPending || undefined}
      aria-keyshortcuts="Meta+S Control+S"
      className={className}
    >
      {state.save.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
      Save changes
    </Button>
  )

  return (
    <div className="flex flex-col gap-5 pb-20 md:pb-0">
      <PageHeader
        title="Organization"
        description={DESCRIPTION}
        actions={editable && saveButton('max-md:hidden')}
        className="[&>div:last-child]:ml-auto"
      />
      {refusal && <OrgWideReadOnlyNote refusal={refusal} />}
      <OrganizationForm org={org} editable={editable} {...state} />
      {editable && (
        // Phones: the save button sits above the tabs and the home indicator.
        <div className="fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-30 px-4 pb-2 md:hidden">
          {saveButton('h-11 w-full shadow-lg')}
        </div>
      )}
      <UnsavedChangesDialog guard={guard} title="Discard changes to Organization?" />
    </div>
  )
}

function OrganizationSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-5">
      {['organization', 'defaults'].map((card) => (
        <div key={card} className="rounded-[12px] border bg-card">
          <div className="flex flex-col gap-2 border-b px-5 py-4 sm:px-6">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-3 w-64 max-w-full" />
          </div>
          <div className="grid gap-5 px-5 py-5 sm:grid-cols-2 sm:px-6">
            {['first', 'second'].map((field) => (
              <div key={field} className="flex flex-col gap-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-12 w-full md:h-10" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
