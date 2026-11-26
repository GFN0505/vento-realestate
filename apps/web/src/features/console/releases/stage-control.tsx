import type { ReleaseStage } from '@vento/shared'
import { PowerOffIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { STAGE_LABEL } from '../words'

const STAGES: readonly ReleaseStage[] = ['off', 'internal', 'pilot', 'on']

/**
 * Off · Internal · Pilot · On with the current one marked (spec). Buttons, not radios: picking
 * a stage opens its confirm and changes nothing until it's applied, so arrow keys mustn't.
 */
export function StageControl({
  stage,
  onMove,
}: {
  stage: ReleaseStage
  onMove: (stage: ReleaseStage) => void
}) {
  return (
    <fieldset aria-label="Stage" className="grid grid-cols-4 gap-1 rounded-[10px] bg-muted p-1">
      {STAGES.map((s) => {
        const current = s === stage
        return (
          <button
            key={s}
            type="button"
            aria-pressed={current}
            onClick={() => !current && onMove(s)}
            className={cn(
              'flex min-h-11 items-center justify-center rounded-lg px-2 font-semibold text-[13px] outline-hidden transition-colors focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring md:min-h-9',
              current
                ? 'cursor-default bg-card text-foreground shadow-sm'
                : 'text-foreground/80 hover:bg-card/60 hover:text-foreground',
            )}
          >
            {STAGE_LABEL[s]}
            {current && <span className="sr-only"> (current stage)</span>}
          </button>
        )
      })}
    </fieldset>
  )
}

/**
 * The kill switch (spec): a separate destructive button at the foot of the page, always
 * visible, never inside a menu. 4 taps from the console home on a phone.
 */
export function KillSwitch({
  label,
  off,
  onTurnOff,
}: {
  label: string
  off: boolean
  onTurnOff: () => void
}) {
  return (
    <section
      aria-label="Kill switch"
      className="flex flex-col gap-3 rounded-[10px] border border-status-rose-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:px-[18px]"
    >
      <div className="min-w-0">
        <h2 className="font-heading font-semibold text-[15px]">Turn off for everyone</h2>
        <p className="text-[13px] text-muted-foreground">
          {off
            ? `${label} is off for everyone. Pick a stage above to bring it back.`
            : `Stops ${label} for every organization, including overrides and plans. Nothing is deleted.`}
        </p>
      </div>
      <Button
        variant="destructive"
        disabled={off}
        onClick={onTurnOff}
        className="shrink-0 max-sm:h-11"
      >
        <PowerOffIcon aria-hidden />
        Turn off for everyone
      </Button>
    </section>
  )
}
