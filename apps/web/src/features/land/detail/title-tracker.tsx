import type { ParcelDetail, TitleStage, TitleStageType } from '@vento/shared'
import { CheckIcon, ChevronRightIcon, FileTextIcon, XIcon } from 'lucide-react'
import type { StatusTone } from '@/components/status-badge'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { STAGE_STATUS_TONE, stageCountText, stageLabel, stageStatusText } from '../land-words'
import { DETAIL_COPY, versionLine } from './detail-words'

type Props = {
  parcel: ParcelDetail
  /** null: read-only; the stages are plain text. */
  onStage: ((type: TitleStageType) => void) | null
  onEditStages: (() => void) | null
  onIntent: () => void
}

const MARK: Readonly<Record<StatusTone, string>> = {
  emerald: 'border-status-emerald bg-status-emerald-bg text-status-emerald-fg',
  amber: 'border-status-amber bg-status-amber-bg text-status-amber-fg',
  blue: 'border-status-blue bg-status-blue-bg text-status-blue-fg',
  rose: 'border-status-rose bg-status-rose-bg text-status-rose-fg',
  slate: 'border-border bg-card text-muted-foreground',
}

const STATE_TEXT: Readonly<Record<StatusTone, string>> = {
  emerald: 'text-status-emerald-fg',
  amber: 'text-status-amber-fg',
  blue: 'text-status-blue-fg',
  rose: 'text-status-rose-fg',
  slate: 'text-muted-foreground',
}

/**
 * The title stage tracker (board ParcelDetail; design-system *Title stage tracker*): every stage
 * in catalog order with its status, date, reference and documents. Registries don't move in
 * order, so any stage can be clicked to update it. Across on wider screens, down on phones.
 */
export function TitleTracker({ parcel, onStage, onEditStages, onIntent }: Props) {
  const stages = parcel.stages
  const current = parcel.currentStage?.type ?? null
  const summary =
    stages.length === 0
      ? null
      : current
        ? stageCountText(parcel)
        : `All ${stages.length} stages granted`

  return (
    <section
      aria-labelledby="title-stage-heading"
      className="flex flex-col gap-4 rounded-[10px] border bg-card p-4 sm:px-6 sm:py-5"
    >
      <div className="flex items-center gap-3">
        <h2 id="title-stage-heading" className="font-heading font-semibold text-[15px]">
          {DETAIL_COPY.titleStage}
        </h2>
        {summary && <span className="text-muted-foreground text-xs tabular-nums">{summary}</span>}
        {onEditStages && (
          <button
            type="button"
            onClick={onEditStages}
            onPointerEnter={onIntent}
            onFocus={onIntent}
            className="ml-auto inline-flex items-center rounded-sm font-semibold text-[13px] text-link outline-hidden hover:text-link-hover focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11 max-md:px-1"
          >
            {DETAIL_COPY.editStages}
          </button>
        )}
      </div>
      {stages.length === 0 ? (
        <p className="text-muted-foreground text-sm">{DETAIL_COPY.noStages}</p>
      ) : (
        <ol className="flex flex-col md:flex-row">
          {stages.map((stage, i) => (
            <Step
              key={stage.id}
              stage={stage}
              n={i + 1}
              last={i === stages.length - 1}
              current={stage.type === current}
              docs={docsLine(parcel, stage.type)}
              onClick={onStage ? () => onStage(stage.type) : null}
              onIntent={onIntent}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

/** "C of O · v2", "2 documents", or null when the stage has none. */
function docsLine(parcel: ParcelDetail, type: TitleStageType): string | null {
  const docs = parcel.documents.filter((d) => d.stageType === type && d.latest)
  const [only] = docs
  if (!only) return null
  if (docs.length > 1) return `${docs.length} documents`
  return versionLine(only)
}

type StepProps = {
  stage: TitleStage
  n: number
  last: boolean
  current: boolean
  docs: string | null
  onClick: (() => void) | null
  onIntent: () => void
}

function Step({ stage, n, last, current, docs, onClick, onIntent }: StepProps) {
  const tone = STAGE_STATUS_TONE[stage.status]
  const granted = stage.status === 'granted'
  const detail = [
    stage.reference,
    stage.followUpOn ? `Follow up by ${formatDate(stage.followUpOn)}` : null,
  ]
    .filter(Boolean)
    .join(' · ')
  const why = stage.status === 'queried' || stage.status === 'rejected' ? stage.note : null

  const body = (
    <>
      <span className="flex items-center self-stretch max-md:flex-col">
        <span
          aria-hidden
          className={cn(
            'flex size-[30px] shrink-0 items-center justify-center rounded-full border-2 font-bold text-xs tabular-nums',
            MARK[tone],
            current && !granted && 'ring-4 ring-ring/15',
          )}
        >
          {granted ? (
            <CheckIcon className="size-3.5" strokeWidth={3} />
          ) : stage.status === 'rejected' ? (
            <XIcon className="size-3.5" strokeWidth={3} />
          ) : (
            n
          )}
        </span>
        {!last && (
          <span
            aria-hidden
            className={cn(
              'max-md:my-1 max-md:w-0.5 max-md:flex-1 md:mx-2 md:h-0.5 md:flex-1',
              granted ? 'bg-status-emerald' : 'bg-border',
            )}
          />
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-left max-md:pb-4 md:pr-3">
        <span className="font-semibold text-[13px] underline-offset-2 group-hover:underline">
          {stageLabel(stage.type)}
          {current && <span className="sr-only"> (current stage)</span>}
        </span>
        <span className={cn('font-semibold text-xs tabular-nums', STATE_TEXT[tone])}>
          {stageStatusText(stage.status, stage.statusOn)}
        </span>
        {detail && (
          <span className="truncate text-muted-foreground text-xs tabular-nums">{detail}</span>
        )}
        {why && (
          <span title={why} className="line-clamp-2 text-muted-foreground text-xs">
            {why}
          </span>
        )}
        {docs && (
          <span className="flex items-center gap-1 text-muted-foreground text-xs tabular-nums">
            <FileTextIcon aria-hidden className="size-3" />
            {docs}
          </span>
        )}
      </span>
    </>
  )

  return (
    <li aria-current={current ? 'step' : undefined} className="flex min-w-0 md:flex-1 md:flex-col">
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          onPointerEnter={onIntent}
          onFocus={onIntent}
          className="group flex min-w-0 flex-1 gap-3 rounded-md text-left outline-hidden transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring max-md:min-h-11 md:flex-col md:gap-2.5"
        >
          {body}
          <ChevronRightIcon
            aria-hidden
            className="mt-1.5 size-4 shrink-0 text-muted-foreground md:hidden"
          />
          <span className="sr-only">. Update</span>
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 gap-3 md:flex-col md:gap-2.5">{body}</div>
      )}
    </li>
  )
}
