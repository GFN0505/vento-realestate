import { createFileRoute } from '@tanstack/react-router'
import { canSeeChecklist, checklistQuery } from '@/features/checklist/checklist-queries'
import { effectiveAccessFrom } from '@/features/preview/use-effective-permissions'
import { HomePage } from '@/features/shell/home-page'

export const Route = createFileRoute('/_app/_shell/')({
  loader: ({ context }) => {
    // Not awaited: Home never waits for the checklist; it appears as soon as it arrives.
    const access = effectiveAccessFrom(context.queryClient)
    if (access && canSeeChecklist(access)) {
      void context.queryClient.prefetchQuery(checklistQuery())
    }
  },
  component: HomePage,
})
