import { createFileRoute } from '@tanstack/react-router'
import { AuditPage } from '@/features/audit-log/audit-page'
import { auditListQuery } from '@/features/audit-log/audit-queries'
import { auditGuard } from '@/features/audit-log/audit-route'
import { validateAuditSearch } from '@/features/audit-log/audit-search'

export const Route = createFileRoute('/_app/_shell/settings/audit-log')({
  // Organization-wide: the company switcher hides here (decision 0014).
  staticData: { module: 'settings', orgWide: true },
  // The loader (the range and request) travels with the page's chunk, preloaded on hover.
  codeSplitGroupings: [['loader', 'component']],
  beforeLoad: auditGuard,
  validateSearch: validateAuditSearch,
  // The open entry and its name aren't part of the list, so opening one never refetches it.
  loaderDeps: ({ search: { open, about, ...deps } }) => deps,
  // prefetchQuery never throws: a failure shows "couldn't load" with Try again.
  loader: ({ context: { queryClient }, deps }) => queryClient.prefetchQuery(auditListQuery(deps)),
  component: AuditPage,
})
