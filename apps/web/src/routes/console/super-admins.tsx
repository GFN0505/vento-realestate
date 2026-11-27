import { createFileRoute } from '@tanstack/react-router'
import { loadConsoleData } from '@/features/console/load'
import { ConsolePageError } from '@/features/console/shell/console-route-error'
import { invitationsQuery, superAdminsQuery } from '@/features/console/super-admins/queries'
import { SuperAdminsPage } from '@/features/console/super-admins/super-admins-page'
import { validateSuperAdminsSearch } from './-search'

export const Route = createFileRoute('/console/super-admins')({
  codeSplitGroupings: [['loader', 'component', 'errorComponent']],
  validateSearch: validateSuperAdminsSearch,
  loader: ({ context: { queryClient } }) =>
    loadConsoleData(queryClient, [superAdminsQuery(), invitationsQuery()]),
  component: SuperAdminsPage,
  errorComponent: ConsolePageError,
})
