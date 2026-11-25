import { CheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/** Numbered steps from the SecuritySettings two-step panel: done (emerald), current, next. */
export function SetupSteps({ children }: { children: ReactNode }) {
  return <ol className="flex flex-col gap-4">{children}</ol>
}

export function SetupStep({
  n,
  state,
  title,
  children,
}: {
  n: number
  state: 'done' | 'current' | 'next'
  title: string
  children?: ReactNode
}) {
  return (
    <li className="flex gap-3" aria-current={state === 'current' ? 'step' : undefined}>
      <span
        className={cn(
          'flex size-6 shrink-0 items-center justify-center rounded-full border-[1.5px] font-bold text-[11px]',
          state === 'done' && 'border-status-emerald bg-status-emerald text-primary-foreground',
          state === 'current' && 'border-primary bg-primary text-primary-foreground',
          state === 'next' && 'bg-card text-muted-foreground',
        )}
      >
        {state === 'done' ? <CheckIcon className="size-3" strokeWidth={3} aria-label="Done" /> : n}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-2 text-[13px]">
        <b className={cn('font-semibold', state === 'next' && 'text-muted-foreground')}>{title}</b>
        {state === 'current' && children}
      </div>
    </li>
  )
}
