import type { LucideIcon } from 'lucide-react'
import { createContext, type ReactNode, useContext } from 'react'
import { VentoMark } from '@/components/vento-mark'
import { cn } from '@/lib/utils'

/** True inside the app shell; error pages outside it bring their own frame. */
export const InShellContext = createContext(false)
export const useInShell = () => useContext(InShellContext)

const tones = {
  amber: 'bg-status-amber-bg text-status-amber-fg',
  blue: 'bg-status-blue-bg text-status-blue-fg',
  rose: 'bg-status-rose-bg text-status-rose-fg',
  slate: 'bg-status-slate-bg text-status-slate-fg',
} as const

type Props = {
  icon: LucideIcon
  tone: keyof typeof tones
  title: string
  children?: ReactNode
  actions: ReactNode
}

/**
 * The 403, 404, 500 and offline archetype (boards Error403/404/500, OfflinePage): a tinted icon
 * tile, a title, one or two lines and the next step, centred. Outside the shell it sits on the
 * page background under the Vento mark.
 */
export function ErrorState({ icon: Icon, tone, title, children, actions }: Props) {
  const inShell = useInShell()
  const body = (
    <div className="mx-auto flex max-w-[480px] flex-col items-center gap-3.5 py-10 text-center md:py-20">
      <span className={cn('flex size-14 items-center justify-center rounded-[14px]', tones[tone])}>
        <Icon aria-hidden className="size-7" strokeWidth={1.7} />
      </span>
      <h1
        tabIndex={-1}
        className="font-heading font-semibold text-xl tracking-[-0.01em] md:text-[22px]"
      >
        {title}
      </h1>
      {children}
      <div className="mt-1 flex w-full flex-col justify-center gap-2 sm:w-auto sm:flex-row sm:flex-wrap max-sm:[&>*]:h-11">
        {actions}
      </div>
    </div>
  )
  if (inShell) return body
  return (
    <div className="min-h-dvh bg-background px-5 py-5 md:px-8">
      <VentoMark size={26} />
      <main id="main">{body}</main>
    </div>
  )
}

/** The explanation line under an error title. */
export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-muted-foreground leading-[1.55]">{children}</p>
}
