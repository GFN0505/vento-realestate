import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { VentoMark } from '@/components/vento-mark'
import { cn } from '@/lib/utils'

const STEPS = [
  { label: 'Organization', hint: 'Name, state, financial year' },
  { label: 'First entity', hint: 'Type, RC number, TIN' },
] as const

/** "Step 1 of 2 · about 2 min left" */
function progressText(step: number) {
  return `Step ${step} of ${STEPS.length} · about ${STEPS.length + 1 - step} min left`
}

/**
 * Boards Onboarding (desktop: navy step list beside the form) and OnboardingMobile (header,
 * progress bar, sticky action). Step 3, first project and units, comes with Projects and Sales.
 */
export function OnboardingLayout({ step, children }: { step: 1 | 2; children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-background lg:flex">
      <aside className="hidden w-[340px] shrink-0 flex-col gap-8 bg-auth-panel px-9 py-10 text-sidebar-foreground lg:flex">
        <VentoMark />
        <div className="flex flex-col gap-1.5">
          <span className="font-heading font-semibold text-[22px] leading-[1.3]">
            Set up in about two minutes
          </span>
          <span className="text-[13px] text-sidebar-muted-foreground leading-normal">
            Two steps get you to a working organization. Everything else can wait.
          </span>
        </div>
        <ol className="flex flex-col gap-1">
          {STEPS.map((s, index) => {
            const n = index + 1
            const state = n < step ? 'done' : n === step ? 'current' : 'next'
            return (
              <li
                key={s.label}
                className="flex gap-3.5 py-2.5"
                aria-current={state === 'current' ? 'step' : undefined}
              >
                <span
                  className={cn(
                    'flex size-7 shrink-0 items-center justify-center rounded-full border-[1.5px] font-bold text-xs',
                    state === 'done' && 'border-status-emerald bg-status-emerald',
                    state === 'current' && 'border-primary bg-primary',
                    state === 'next' && 'border-sidebar-border',
                  )}
                >
                  {state === 'done' ? <CheckIcon className="size-3.5" strokeWidth={3} /> : n}
                  <span className="sr-only">{state === 'done' ? ' (done)' : ''}</span>
                </span>
                <div>
                  <div
                    className={cn(
                      'font-semibold text-sm',
                      state === 'next' && 'text-sidebar-faint-foreground',
                    )}
                  >
                    {s.label}
                  </div>
                  <div className="text-sidebar-faint-foreground text-xs">{s.hint}</div>
                </div>
              </li>
            )
          })}
        </ol>
        <div className="mt-auto text-sidebar-faint-foreground text-xs tabular-nums">
          {progressText(step)}
        </div>
      </aside>
      <header className="border-b bg-card px-[18px] py-3 lg:hidden">
        <div className="flex min-h-10 items-center">
          <span className="font-heading font-semibold text-[17px]">Set up Vento</span>
        </div>
      </header>
      <main className="flex flex-1 justify-center px-[18px] pt-3.5 pb-28 lg:px-10 lg:py-14">
        <div className="flex w-full max-w-[560px] flex-col gap-4 lg:gap-[22px]">
          <div className="flex flex-col gap-4 lg:hidden">
            <div className="flex gap-1" aria-hidden>
              {STEPS.map((s, index) => (
                <span
                  key={s.label}
                  className={cn('h-1 flex-1 rounded-sm', index < step ? 'bg-primary' : 'bg-border')}
                />
              ))}
            </div>
            <span className="font-semibold text-muted-foreground text-xs">
              {progressText(step)}
            </span>
          </div>
          {children}
        </div>
      </main>
    </div>
  )
}

/** The step's action: inline on desktop, a sticky bar above the keyboard area on phones. */
export function OnboardingActions({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-10 flex gap-2 border-t bg-background px-[18px] pt-2.5 pb-[max(10px,env(safe-area-inset-bottom))] lg:static lg:justify-end lg:border-0 lg:bg-transparent lg:p-0 lg:pt-2 [&>button]:h-[50px] [&>button]:flex-1 [&>button]:rounded-xl lg:[&>button]:h-10 lg:[&>button]:flex-none lg:[&>button]:rounded-md">
      {children}
    </div>
  )
}

export function StepHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h1 className="mb-1 font-heading font-semibold text-xl lg:mb-1.5 lg:text-2xl">{title}</h1>
      <p className="text-muted-foreground text-sm">{children}</p>
    </div>
  )
}
