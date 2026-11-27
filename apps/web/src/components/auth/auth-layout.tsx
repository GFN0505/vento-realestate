import { ArrowLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { VentoMark } from '@/components/vento-mark'
import { cn } from '@/lib/utils'
import { BrandPanel } from './brand-panel'

export { LEGAL_LINKS } from './brand-panel'

type Props = {
  children: ReactNode
  /** Where the phone header's back arrow goes, e.g. from the two-step check back to sign-in. */
  back?: { label: string; onClick: () => void } | undefined
  /** Wider form column, for onboarding and two-step setup. */
  wide?: boolean
}

/**
 * Sign-in, sign-up and the other "front door" screens: a navy brand panel beside a form on
 * desktop (boards SignIn, SignUp, …), and the form alone under a small header on phones.
 */
export function AuthLayout({ children, back, wide = false }: Props) {
  return (
    <div className="min-h-dvh bg-card lg:grid lg:grid-cols-2">
      <BrandPanel />
      {/*
       * Desktop: a fixed top offset that sits a sign-in-sized form a little above the middle.
       * Not flex-centred, so an error alert appearing grows the form downwards and nothing
       * above it moves (no layout shift).
       */}
      <main className="flex min-h-dvh flex-col gap-5 px-6 pt-4 pb-8 lg:items-center lg:justify-start lg:p-12 lg:pt-[max(3rem,calc(50dvh-14rem))]">
        <div className="flex min-h-10 items-center gap-2.5 lg:hidden">
          {back && (
            <button
              type="button"
              onClick={back.onClick}
              aria-label={back.label}
              className="-ml-2.5 inline-flex size-11 items-center justify-center rounded-lg text-foreground hover:bg-muted"
            >
              <ArrowLeftIcon className="size-5" />
            </button>
          )}
          <VentoMark size={26} />
        </div>
        <div
          className={cn(
            'flex w-full flex-col gap-[18px]',
            // Front-door fields are 48px tall at every width (the app's forms are 40px from md).
            'md:[&_[data-slot=input]]:h-12 md:[&_[data-slot=input]]:text-[15px] md:[&_[data-slot=select-trigger]]:h-12',
            wide ? 'lg:max-w-[560px]' : 'lg:w-[432px]',
          )}
        >
          {children}
        </div>
      </main>
    </div>
  )
}

/** Title and one-line explanation at the top of every auth screen. */
export function AuthHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="mb-2 font-heading font-semibold text-[26px] leading-[1.2] tracking-[-0.02em] lg:text-[32px]">
        {title}
      </h1>
      {children && (
        <p className="text-base text-muted-foreground leading-normal lg:text-sm">{children}</p>
      )}
    </div>
  )
}

/** Small print under the main button: links to the neighbouring screens. */
export function AuthFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs leading-normal [&_a]:text-link [&_a:hover]:text-link-hover [&_a]:underline [&_a]:underline-offset-4 [&_button]:text-link [&_button]:underline [&_button]:underline-offset-4 max-lg:[&_a]:inline-flex max-lg:[&_a]:min-h-11 max-lg:[&_a]:items-center max-lg:[&_button]:inline-flex max-lg:[&_button]:min-h-11 max-lg:[&_button]:items-center">
      {children}
    </p>
  )
}
