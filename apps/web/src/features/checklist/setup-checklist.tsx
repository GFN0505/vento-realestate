import { type QueryClient, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ChecklistItem } from '@vento/shared'
import { CheckIcon, EllipsisIcon, PlusIcon, UserPlusIcon } from 'lucide-react'
import type { ComponentType } from 'react'
import { toast } from 'sonner'
import { LazyMenu, type LazyMenuProps } from '@/components/ui/lazy-menu'
import { openAddCompany } from '@/features/companies/open-add-company'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { preloadCompanySheet, preloadInvite, shellUi } from '@/features/shell/shell-ui'
import { toastApiError } from '@/lib/api-errors'
import { client } from '@/lib/orpc'
import { cn } from '@/lib/utils'
import { ALL_DONE_LINE, CHECKLIST_COPY } from './checklist-copy'
import { checklistQuery } from './checklist-queries'

export const checklistMenuTrigger =
  'inline-flex size-8 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted max-md:size-11'

const rowAction =
  'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border bg-muted px-3 font-semibold text-xs outline-hidden transition-colors hover:bg-border/60 focus-visible:outline-2 focus-visible:outline-ring max-md:h-11'

const loadMenu = () =>
  import('./checklist-menu-panel').then((m): ComponentType<LazyMenuProps> => m.ChecklistMenuPanel)

/**
 * Finish setting up (boards Onboarding checklist, DSAdditions ChecklistRow), on Home for people
 * who can invite (owners and admins). Every tick comes from data; only steps someone can act on
 * are listed. Organization-wide, so it ignores the chosen company.
 */
export function SetupChecklist() {
  const checklist = useQuery(checklistQuery())
  const queryClient = useQueryClient()
  const data = checklist.data
  if (!data?.shown || data.items.length === 0) return null
  const done = data.items.filter((item) => item.done).length
  const total = data.items.length

  return (
    <section
      aria-labelledby="setup-title"
      className="flex flex-col gap-3 rounded-[12px] border bg-card px-4 pt-4 pb-2 shadow-lift sm:px-5 motion-safe:animate-in motion-safe:fade-in-0"
    >
      <div className="flex items-center gap-3">
        <h2 id="setup-title" className="font-heading font-semibold text-base tracking-[-0.01em]">
          Finish setting up
        </h2>
        <span className="font-semibold text-muted-foreground text-xs tabular-nums">
          {done} of {total} done
        </span>
        <span className="ml-auto">
          <LazyMenu load={loadMenu} className={checklistMenuTrigger} label="Checklist options">
            <EllipsisIcon aria-hidden className="size-4" />
          </LazyMenu>
        </span>
      </div>
      <div
        role="progressbar"
        aria-label="Setup progress"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        className="h-1.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 ease-out motion-reduce:transition-none"
          style={{ width: `${Math.round((done / total) * 100)}%` }}
        />
      </div>
      {data.allDone ? (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t py-3 text-[13px] text-muted-foreground">
          <p>{ALL_DONE_LINE}</p>
          <button
            type="button"
            onClick={() =>
              void import('./checklist-visibility').then((m) => m.hideChecklist(queryClient))
            }
            className="rounded-md px-2 py-1 font-semibold text-foreground outline-hidden hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
          >
            Hide checklist
          </button>
        </div>
      ) : (
        // Done steps fold into one line; the open ones get the room.
        <ul className="grid grid-cols-1 sm:grid-cols-2 sm:gap-x-8">
          {done > 0 && <DoneSummary items={data.items.filter((item) => item.done)} />}
          {data.items
            .filter((item) => !item.done)
            .map((item) => (
              <ChecklistRow key={item.key} item={item} />
            ))}
        </ul>
      )}
    </section>
  )
}

/** "3 steps done", naming them underneath. */
function DoneSummary({ items }: { items: readonly ChecklistItem[] }) {
  const names = items.map((item) => CHECKLIST_COPY[item.key].short).join(', ')
  return (
    <li className="flex min-h-[60px] items-center gap-3 border-t py-2.5">
      <Tick done />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="font-medium text-muted-foreground text-sm">
          {items.length === 1 ? '1 step done' : `${items.length} steps done`}
        </span>
        <span className="truncate text-muted-foreground text-xs" title={names}>
          {names}
        </span>
      </div>
    </li>
  )
}

function Tick({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-5 shrink-0 items-center justify-center rounded-full border-[1.5px]',
        done
          ? 'border-status-emerald bg-status-emerald text-primary-foreground'
          : 'border-border bg-card',
      )}
    >
      {done && <CheckIcon className="size-3" strokeWidth={3} />}
    </span>
  )
}

/** ChecklistRow: a tick, the step and its detail, and the one action while it's open. */
function ChecklistRow({ item }: { item: ChecklistItem }) {
  const copy = CHECKLIST_COPY[item.key]
  const detail = copy.open
  return (
    <li
      className={cn(
        'flex min-h-[60px] flex-wrap items-center gap-x-3 gap-y-2 border-t py-2.5',
        // Two actions need the card's full width beside the words.
        item.key === 'other_companies' && 'sm:col-span-2',
      )}
    >
      <Tick done={false} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium text-sm">
          {copy.label}
          <span className="sr-only">, to do</span>
        </span>
        {detail && <span className="truncate text-muted-foreground text-xs">{detail}</span>}
      </div>
      {!item.done && item.key === 'other_companies' && <OtherCompaniesActions />}
      {!item.done && item.key === 'invite_team' && (
        <button
          type="button"
          onPointerEnter={preloadInvite}
          onFocus={preloadInvite}
          onClick={() => shellUi.openInvite()}
          className={rowAction}
        >
          <UserPlusIcon aria-hidden className="size-3.5" />
          Invite people
        </button>
      )}
    </li>
  )
}

/**
 * "Add your other companies (SPVs)": Add company (the sheet, or the plan message at the limit),
 * and a quiet "We only have one company", recorded on the organization with Undo (spec).
 */
function OtherCompaniesActions() {
  const me = useMe()
  const access = useEffectiveAccess()
  const queryClient = useQueryClient()
  return (
    <span className="flex shrink-0 items-center gap-1 max-sm:w-full max-sm:pl-8">
      <button
        type="button"
        onClick={() => void answerSingleCompany(queryClient, true)}
        className="inline-flex h-8 items-center rounded-md px-2.5 font-medium text-muted-foreground text-xs outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:h-11"
      >
        We only have one company
      </button>
      <button
        type="button"
        onPointerEnter={preloadCompanySheet}
        onFocus={preloadCompanySheet}
        onClick={() => openAddCompany(access.showUpgradeHints ? me.plan : null)}
        className={rowAction}
      >
        <PlusIcon aria-hidden className="size-3.5" />
        Add company
      </button>
    </span>
  )
}

async function answerSingleCompany(queryClient: QueryClient, singleCompany: boolean) {
  try {
    await client.checklist.answerSingleCompany({ singleCompany })
    await queryClient.invalidateQueries({ queryKey: checklistQuery().queryKey })
    if (singleCompany) {
      toast.success('Noted: you have one company', {
        duration: 8000,
        action: { label: 'Undo', onClick: () => void answerSingleCompany(queryClient, false) },
      })
    }
  } catch (error) {
    toastApiError(error)
  }
}
