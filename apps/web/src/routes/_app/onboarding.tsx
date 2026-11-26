import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { useState } from 'react'
import { meQuery } from '@/features/account/api'
import { EntityStep } from '@/features/onboarding/entity-step'
import { OnboardingLayout } from '@/features/onboarding/onboarding-layout'
import { OrganizationStep } from '@/features/onboarding/organization-step'
import { AccessEnded } from '@/features/organization/access-ended'
import { takeOrganizationNotice } from '@/lib/tab-organization'

export const Route = createFileRoute('/_app/onboarding')({
  component: OnboardingPage,
})

/** The server's `nextStep` picks the step, so someone who left after step 1 resumes at step 2. */
function OnboardingPage() {
  const { me: initial } = Route.useRouteContext()
  const { data: me = initial } = useQuery(meQuery())
  const step = me.nextStep === 'onboarding_entity' ? 2 : 1
  // Removed from their only organization: say so first, with Sign out (plan 6.4).
  const [ended, setEnded] = useState(() => takeOrganizationNotice())
  if (ended) return <AccessEnded message={ended} onContinue={() => setEnded(null)} />
  return (
    <OnboardingLayout step={step}>
      {step === 1 ? (
        <OrganizationStep companyName={me.user.companyName} />
      ) : (
        <EntityStep key="entity" organizationName={me.organization?.name ?? ''} />
      )}
    </OnboardingLayout>
  )
}
