import type { ApprovalRuleRow } from '@vento/shared'
import { CircleAlertIcon, LoaderCircleIcon, Trash2Icon } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { ConfirmDialog } from '@/components/confirm-dialog'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Sheet } from '@/components/ui/sheet'
import { TooltipProvider } from '@/components/ui/tooltip'
import { SheetFrame } from '@/features/team/sheet-frame'
import { apiErrorMessage, isHandledElsewhere } from '@/lib/api-errors'
import { useOnline } from '@/lib/connection'
import { DeleteRuleConfirm } from './delete-rule-confirm'
import { RULE_FORM_ID, RuleFields } from './rule-fields'
import { newRuleValues, type RuleValues, ruleInput, ruleResolver, ruleValues } from './rule-form'
import { useSaveRule } from './use-save-rule'

type Props = {
  /** `?rule=`: 'new', an existing rule, or nothing (closed). */
  target: 'new' | ApprovalRuleRow | null
  onClose: () => void
}

/**
 * Add rule / Edit rule (board Edit rule; side-sheet archetype). Opened from the address, so Back
 * closes it. Closing with changes asks first; a refusal keeps every field.
 */
export function RuleSheet({ target, onClose }: Props) {
  // The last target keeps its content on screen while the sheet slides out.
  const last = useRef(target)
  if (target) last.current = target
  const shown = last.current
  const guard = useRef<(() => boolean) | null>(null)
  return (
    <Sheet
      open={target !== null}
      onOpenChange={(open) => {
        if (open || (guard.current && !guard.current())) return
        onClose()
      }}
    >
      {shown && (
        <RuleSheetBody
          key={shown === 'new' ? 'new' : `${shown.id}:${shown.version}`}
          row={shown === 'new' ? null : shown}
          onClose={onClose}
          guard={guard}
        />
      )}
    </Sheet>
  )
}

function RuleSheetBody({
  row,
  onClose,
  guard,
}: {
  row: ApprovalRuleRow | null
  onClose: () => void
  guard: React.RefObject<(() => boolean) | null>
}) {
  const online = useOnline()
  const form = useForm<RuleValues>({
    resolver: ruleResolver,
    defaultValues: row ? ruleValues(row) : newRuleValues(),
  })
  const save = useSaveRule(onClose)
  const [discarding, setDiscarding] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const dirty = form.formState.isDirty
  guard.current = dirty
    ? () => {
        setDiscarding(true)
        return false
      }
    : null

  const submit = form.handleSubmit(
    (values) =>
      save.mutate({
        editing: row ? { id: row.id, version: row.version } : null,
        input: ruleInput(values),
      }),
    () => {
      // The first field with a problem gets the cursor (excellence checklist).
      document.querySelector<HTMLElement>(`#${RULE_FORM_ID} [aria-invalid="true"]`)?.focus()
    },
  )
  const problem = save.error && !isHandledElsewhere(save.error) ? apiErrorMessage(save.error) : null

  return (
    <TooltipProvider>
      <SheetFrame
        title={row ? 'Edit rule' : 'Add rule'}
        description="Changes apply to new requests only. Requests already waiting keep their steps."
        footer={
          <>
            {problem && (
              <Alert variant="destructive" aria-live="polite">
                <CircleAlertIcon aria-hidden />
                <AlertDescription>{problem}</AlertDescription>
              </Alert>
            )}
            <div className="flex items-center gap-2">
              {row && (
                <Button
                  variant="ghost"
                  onClick={() => setDeleting(true)}
                  className="-ml-2.5 text-status-rose-fg hover:bg-status-rose-bg hover:text-status-rose-fg max-md:h-11"
                >
                  <Trash2Icon aria-hidden />
                  Delete rule
                </Button>
              )}
              <div className="ml-auto flex gap-2">
                <Button
                  variant="ghost"
                  onClick={() => (dirty ? setDiscarding(true) : onClose())}
                  className="max-md:h-11"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form={RULE_FORM_ID}
                  disabled={save.isPending || !online}
                  aria-busy={save.isPending || undefined}
                  title={online ? undefined : "You're offline. Save when you're back online."}
                  className="max-md:h-11"
                >
                  {save.isPending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
                  Save rule
                </Button>
              </div>
            </div>
          </>
        }
      >
        <RuleFields form={form} onSubmit={() => void submit()} />
      </SheetFrame>
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
        This rule isn't saved yet.
      </ConfirmDialog>
      <DeleteRuleConfirm
        row={deleting ? row : null}
        onOpenChange={setDeleting}
        onDeleted={() => {
          guard.current = null
          onClose()
        }}
      />
    </TooltipProvider>
  )
}
