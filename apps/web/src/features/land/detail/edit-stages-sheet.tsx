import { useQueryClient } from '@tanstack/react-query'
import { type ParcelDetail, TITLE_STAGE_TYPES, type TitleStageType } from '@vento/shared'
import { ListChecksIcon, LoaderCircleIcon, LockIcon } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Sheet } from '@/components/ui/sheet'
import { SheetFrame } from '@/features/team/sheet-frame'
import { errorReason, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection, useOnline } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { cn } from '@/lib/utils'
import { LAND_COPY, stageLabel, stageStatusText } from '../land-words'
import { SheetFooter } from '../parcel-sheet/sheet-parts'
import { parcelQuery, refreshParcel } from '../parcels-queries'
import { DETAIL_COPY } from './detail-words'

type Props = { open: boolean; parcel: ParcelDetail; onClose: () => void }

/**
 * Edit stages (`pattern`: checklist sheet). Every catalog stage in catalog order; a stage that
 * has started, or holds a document, stays (spec). At least one stage stays.
 */
export function EditStagesSheet({ open, parcel, onClose }: Props) {
  const [opening, setOpening] = useState({ open: false, count: 0 })
  if (open !== opening.open) setOpening({ open, count: opening.count + (open ? 1 : 0) })
  return (
    <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
      <SheetFrame
        lead={
          <span
            aria-hidden
            className="tile-gradient mb-2 flex size-11 items-center justify-center rounded-xl text-tile-icon"
          >
            <ListChecksIcon className="size-5" strokeWidth={1.8} />
          </span>
        }
        title={DETAIL_COPY.editStages}
        description={`${parcel.name} · the stages this land goes through, in order`}
      >
        <StagesChecklist key={opening.count} parcel={parcel} onClose={onClose} />
      </SheetFrame>
    </Sheet>
  )
}

/** Why a stage can't come off, or null. */
function lockReason(parcel: ParcelDetail, type: TitleStageType): string | null {
  const stage = parcel.stages.find((s) => s.type === type)
  if (!stage) return null
  if (stage.status !== 'not_started') return 'This stage has started, so it stays.'
  const documented = parcel.documents.some((d) => d.stageType === type && d.latest)
  return documented ? 'This stage has a document, so it stays.' : null
}

function StagesChecklist({ parcel, onClose }: { parcel: ParcelDetail; onClose: () => void }) {
  const queryClient = useQueryClient()
  const online = useOnline()
  const [picked, setPicked] = useState<ReadonlySet<TitleStageType>>(
    () => new Set(parcel.stages.map((s) => s.type)),
  )
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<unknown>(null)
  // The parcel as it was when the sheet opened: a change by someone else meanwhile is refused
  // (stale) rather than silently overwritten; after that, the next Save checks against theirs.
  const [expectedVersion, setExpectedVersion] = useState(parcel.version)
  const types = TITLE_STAGE_TYPES.filter((t) => picked.has(t))
  const changed =
    types.length !== parcel.stages.length || parcel.stages.some((s) => !picked.has(s.type))

  function toggle(type: TitleStageType, on: boolean) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (on) next.add(type)
      else next.delete(type)
      return next
    })
  }

  async function save() {
    setError(null)
    if (!connection.isOnline()) return setError(new Error(OFFLINE_SAVE_ERROR))
    setPending(true)
    try {
      const saved = await client.land.stages.set({
        parcelId: parcel.id,
        expectedVersion,
        types,
      })
      refreshParcel(queryClient, saved)
      toast.success(DETAIL_COPY.stagesSaved)
      onClose()
    } catch (caught) {
      setError(caught)
      // Someone changed the parcel meanwhile: the list shows theirs; the ticks stay.
      if (errorReason(caught) === 'stale') {
        const latest = await queryClient
          .fetchQuery({ ...parcelQuery(parcel.id), staleTime: 0 })
          .catch(() => null)
        if (latest) {
          refreshParcel(queryClient, latest)
          setExpectedVersion(latest.version)
        }
      }
    } finally {
      setPending(false)
    }
  }

  const anyLocked = TITLE_STAGE_TYPES.some((type) => lockReason(parcel, type) !== null)

  return (
    <>
      {anyLocked && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Stages that have started, or hold a document, stay.
        </p>
      )}
      <fieldset aria-label="Title stages" className="flex flex-col rounded-[10px] border">
        {TITLE_STAGE_TYPES.map((type) => {
          const locked = lockReason(parcel, type)
          const stage = parcel.stages.find((s) => s.type === type)
          const lastOne = picked.has(type) && picked.size === 1
          const id = `edit-stage-${type}`
          return (
            <label
              key={type}
              htmlFor={id}
              className={cn(
                'flex min-h-12 items-center gap-3 border-b px-3.5 py-2 text-sm last:border-b-0',
                locked || lastOne ? 'cursor-not-allowed' : 'cursor-pointer hover:bg-muted/50',
              )}
            >
              <Checkbox
                id={id}
                checked={picked.has(type)}
                disabled={locked !== null || lastOne}
                aria-describedby={locked || lastOne ? `${id}-why` : undefined}
                onCheckedChange={(on) => toggle(type, on === true)}
              />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="font-medium">{stageLabel(type)}</span>
                {locked ? (
                  // The note above says it once; the row keeps the reason for screen readers.
                  <span id={`${id}-why`} className="sr-only">
                    {locked}
                  </span>
                ) : (
                  lastOne && (
                    <span id={`${id}-why`} className="text-muted-foreground text-xs">
                      Keep at least one title stage.
                    </span>
                  )
                )}
              </span>
              {stage && stage.status !== 'not_started' && (
                <span className="shrink-0 text-muted-foreground text-xs tabular-nums">
                  {stageStatusText(stage.status, stage.statusOn)}
                </span>
              )}
              {locked && (
                <LockIcon aria-hidden className="size-3.5 shrink-0 text-muted-foreground" />
              )}
            </label>
          )
        })}
      </fieldset>
      <p className="text-muted-foreground text-xs leading-relaxed">
        Land bought with a C of O usually adds a deed of assignment and governor's consent.
      </p>
      <SheetFooter>
        <SaveErrorAlert error={error} />
        {!online && (
          <p role="status" className="text-[13px] text-status-amber-fg">
            {LAND_COPY.offline}
          </p>
        )}
        <div className="flex items-center gap-2">
          <span className="flex-1" />
          <Button variant="ghost" onClick={onClose} className="max-md:h-11">
            Cancel
          </Button>
          <Button
            onClick={() => void save()}
            disabled={!changed || pending || !online}
            aria-busy={pending || undefined}
            className="max-md:h-11 max-md:flex-1"
          >
            {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
            Save stages
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}
