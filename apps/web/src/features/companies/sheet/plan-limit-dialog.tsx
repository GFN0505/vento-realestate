import { Link } from '@tanstack/react-router'
import { CircleFadingArrowUpIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { talkToVentoHref } from '@/features/plan/talk-to-vento'
import { useMe } from '@/features/preview/use-effective-permissions'
import { shellUi, useOverlay } from '@/features/shell/shell-ui'

/**
 * Owners at the company limit: Add company opens this instead of a form that can't save (spec
 * question 11). Only owners reach it (`me.plan` is theirs), so the plan's name can be said.
 */
export function PlanLimitDialog() {
  const open = useOverlay('companyPlan')
  const me = useMe()
  const plan = me.plan
  const limit = plan?.limits.find((l) => l.key === 'entities')
  const included = limit?.included ?? 0
  const places = `${included} active ${included === 1 ? 'company' : 'companies'}`
  const close = () => shellUi.close('companyPlan')
  const href =
    plan && me.organization
      ? talkToVentoHref({
          contact: plan.contact,
          organizationName: me.organization.name,
          planName: plan.name,
          about: 'more companies',
        })
      : null

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="max-w-[440px]">
        <DialogHeader className="border-b-0 pb-0">
          <span
            aria-hidden
            className="mb-2 flex size-11 items-center justify-center rounded-xl bg-status-blue-bg text-status-blue-fg"
          >
            <CircleFadingArrowUpIcon className="size-5" strokeWidth={1.8} />
          </span>
          <DialogTitle>All your plan's companies are in use</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <DialogDescription className="text-[13.5px] leading-relaxed">
            {plan?.name ? `Your ${plan.name} plan` : 'Your plan'} includes {places}. Archive one, or
            talk to Vento about a bigger plan.
          </DialogDescription>
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={close} className="max-sm:h-11 sm:mr-auto">
            Close
          </Button>
          <Button asChild variant="outline" className="max-sm:h-11">
            <Link to="/settings/companies" search={{ show: 'archived' }} onClick={close}>
              See archived companies
            </Link>
          </Button>
          {href && (
            <Button asChild className="max-sm:h-11">
              <a
                href={href}
                onClick={close}
                {...(href.startsWith('mailto:')
                  ? {}
                  : { target: '_blank', rel: 'noopener noreferrer' })}
              >
                Talk to Vento
              </a>
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
