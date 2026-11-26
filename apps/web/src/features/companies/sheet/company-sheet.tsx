import type { Entity } from '@vento/shared'
import { ArchiveIcon, ArchiveRestoreIcon, Building2Icon, LoaderCircleIcon } from 'lucide-react'
import { type ReactNode, type RefObject, useRef, useState } from 'react'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { ArchiveCompanyConfirm } from '@/features/companies/archive-company-confirm'
import {
  type CompanyRights,
  companyRights,
  companyTypeLabel,
} from '@/features/companies/company-rights'
import { useArchiveCompany } from '@/features/companies/use-archive-company'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { OrgWideReadOnlyNote } from '@/features/settings/read-only-note'
import { type CompanyTarget, shellUi, useOverlay } from '@/features/shell/shell-ui'
import { SheetFrame } from '@/features/team/sheet-frame'
import { hasFinePointer } from '@/lib/pointer'
import { useVisualViewportHeight } from '@/lib/use-visual-viewport'
import { CompanyFacts } from './company-facts'
import { COMPANY_FORM_ID, CompanyForm, CompanySaveError, useCompanyForm } from './company-form'
import { useSaveCompany } from './use-save-company'

type Guard = RefObject<(() => boolean) | null>

/**
 * The Company sheet (pattern: side-sheet form; full screen on phones), mounted once in the shell
 * and opened from Companies, the switcher, Home's checklist and ⌘K. Add, edit, or read-only.
 */
export function CompanySheet() {
  const open = useOverlay('company')
  const me = useMe()
  const { permissions } = useEffectiveAccess()
  const rights = companyRights(me, permissions)
  const height = useVisualViewportHeight(open)
  const guard: Guard = useRef(null)
  // A fresh form for every opening; the last target stays on screen while the sheet slides out.
  const [opening, setOpening] = useState({ open: false, count: 0, target: shellUi.companyTarget() })
  if (open !== opening.open) {
    setOpening({ open, count: opening.count + (open ? 1 : 0), target: shellUi.companyTarget() })
  }
  const target = opening.target
  const close = () => shellUi.close('company')

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        if (next) return
        if (guard.current && !guard.current()) return
        close()
      }}
    >
      <SheetFrame
        height={height}
        lead={<CompanyTile />}
        title={target.mode === 'add' ? 'Add company' : target.company.name}
        description={
          target.mode === 'add'
            ? 'A separate registered company, like an SPV for one estate. To add another estate, create a project instead.'
            : companyTypeLabel(target.company.type)
        }
        onCloseAutoFocus={(event) => {
          if (target.mode !== 'edit') return
          const row = document.querySelector<HTMLElement>(
            `[data-company-row="${target.company.id}"]`,
          )
          if (!row) return
          event.preventDefault()
          row.focus()
        }}
      >
        <Body key={opening.count} target={target} rights={rights} guard={guard} onClose={close} />
      </SheetFrame>
    </Sheet>
  )
}

function CompanyTile() {
  return (
    <span
      aria-hidden
      className="tile-gradient mb-2 flex size-11 items-center justify-center rounded-xl text-tile-icon"
    >
      <Building2Icon className="size-5" strokeWidth={1.8} />
    </span>
  )
}

type BodyProps = { target: CompanyTarget; rights: CompanyRights; guard: Guard; onClose: () => void }

function Body({ target, rights, guard, onClose }: BodyProps) {
  const company = target.mode === 'edit' ? target.company : null
  if (company && (company.status === 'archived' || !rights.edit)) {
    return <ReadOnlyCompany company={company} rights={rights} onClose={onClose} />
  }
  return <EditableCompany company={company} rights={rights} guard={guard} onClose={onClose} />
}

function EditableCompany({
  company,
  rights,
  guard,
  onClose,
}: Omit<BodyProps, 'target'> & { company: Entity | null }) {
  const form = useCompanyForm(company)
  const save = useSaveCompany(form)
  const archive = useArchiveCompany()
  const [discarding, setDiscarding] = useState(false)
  const dirty = form.formState.isDirty
  guard.current = dirty
    ? () => {
        setDiscarding(true)
        return false
      }
    : null

  return (
    <>
      <CompanyForm
        form={form}
        save={save}
        canRestore={rights.archive}
        autoFocusName={company === null && hasFinePointer()}
        onSubmit={(values) => void (company ? save.save(company, values) : save.add(values))}
      />
      <SheetFooter>
        <CompanySaveError error={save.error} />
        <div className="flex items-center gap-2">
          {company && rights.archive && (
            <Button
              type="button"
              variant="ghost"
              disabled={archive.pendingId !== null}
              onClick={() => void archive.archive(company).then((done) => done && onClose())}
              className="-ml-2.5 text-muted-foreground max-md:h-11"
            >
              <ArchiveIcon aria-hidden />
              Archive
            </Button>
          )}
          <span className="flex-1" />
          <Button
            variant="ghost"
            onClick={() => (dirty ? setDiscarding(true) : onClose())}
            className="max-md:h-11"
          >
            Cancel
          </Button>
          <Button
            type="submit"
            form={COMPANY_FORM_ID}
            disabled={save.pending || (company !== null && !dirty)}
            aria-busy={save.pending || undefined}
            className="max-md:h-11 max-md:flex-1"
          >
            {save.pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            {company ? 'Save changes' : 'Add company'}
          </Button>
        </div>
      </SheetFooter>
      <ArchiveCompanyConfirm actions={archive} onArchived={onClose} />
      <ConfirmDialog
        open={discarding}
        onOpenChange={setDiscarding}
        title="Discard your changes?"
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => {
          setDiscarding(false)
          guard.current = null
          onClose()
        }}
      >
        {company
          ? `Your changes to ${company.name} aren't saved yet.`
          : "This company isn't added yet."}
      </ConfirmDialog>
    </>
  )
}

function ReadOnlyCompany({
  company,
  rights,
  onClose,
}: Omit<BodyProps, 'target' | 'guard'> & { company: Entity }) {
  const archive = useArchiveCompany()
  const archived = company.status === 'archived'
  return (
    <>
      {!archived && <OrgWideReadOnlyNote refusal="permission" />}
      <CompanyFacts company={company} />
      {archived && rights.archive && (
        <SheetFooter>
          <div className="flex justify-end">
            <Button
              disabled={archive.pendingId !== null}
              aria-busy={archive.pendingId !== null || undefined}
              onClick={() => void archive.restore(company).then((done) => done && onClose())}
              className="max-md:h-11 max-md:flex-1"
            >
              {archive.pendingId ? (
                <LoaderCircleIcon aria-hidden className="animate-spin" />
              ) : (
                <ArchiveRestoreIcon aria-hidden />
              )}
              Restore
            </Button>
          </div>
        </SheetFooter>
      )}
    </>
  )
}

/** Sticks to the foot of the sheet's scrolling body, so the main button stays above a keyboard. */
function SheetFooter({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-0 -mx-5 -mb-5 mt-auto flex flex-col gap-3 border-t bg-card px-5 pt-3.5 pb-[max(0.875rem,env(safe-area-inset-bottom))] sm:-mx-6 sm:px-6">
      {children}
    </div>
  )
}
