import { CompanySheet } from './company-sheet'
import { PlanLimitDialog } from './plan-limit-dialog'

/** One lazy chunk for the Company sheet and the plan message, mounted once in the shell. */
export function CompanyOverlays() {
  return (
    <>
      <CompanySheet />
      <PlanLimitDialog />
    </>
  )
}
