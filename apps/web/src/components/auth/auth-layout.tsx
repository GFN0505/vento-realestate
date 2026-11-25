import { ArrowLeftIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { VentoMark } from '@/components/vento-mark'

/** The privacy notice and terms pages are published outside the app (not built yet). */
export const LEGAL_LINKS = { privacy: '/privacy', terms: '/terms' } as const

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
      <main className="flex min-h-dvh flex-col gap-5 px-6 pt-4 pb-8 lg:items-center lg:justify-start lg:p-12 lg:pt-[14vh]">
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
          className={
            wide
              ? 'flex w-full flex-col gap-[18px] lg:max-w-[560px]'
              : 'flex w-full flex-col gap-[18px] lg:w-[400px]'
          }
        >
          {children}
        </div>
      </main>
    </div>
  )
}

function BrandPanel() {
  return (
    <aside className="relative isolate hidden overflow-hidden bg-auth-panel text-sidebar-foreground lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16">
      <PanelBackdrop />
      <VentoMark tone="navy" />
      <div className="motion-safe:animate-auth-rise">
        <p className="max-w-[560px] text-balance font-heading font-semibold text-[40px] leading-[1.1] tracking-[-0.03em] xl:text-[48px]">
          Command every development, from title to handover.
        </p>
        <p className="mt-5 max-w-[460px] text-pretty text-base text-sidebar-muted-foreground leading-relaxed xl:text-lg">
          Everything your development business runs on, in one calm, secure place.
        </p>
      </div>
      <AuthFooter />
    </aside>
  )
}

/** Decoration only: the logo-colour glow, a hairline grid and an oversized faint chevron. */
function PanelBackdrop() {
  return (
    <div aria-hidden="true" className="-z-10 pointer-events-none absolute inset-0">
      <div className="absolute inset-0 auth-glow" />
      <div className="absolute inset-0 auth-grid" />
      <svg
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden="true"
        className="-right-32 -bottom-40 absolute size-[600px] opacity-[0.07]"
      >
        <path
          d="M5 7 L16 27 L27 7"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-logo-stroke"
        />
      </svg>
    </div>
  )
}

function AuthFooter() {
  return (
    <div className="flex flex-wrap gap-4 text-sidebar-faint-foreground text-xs">
      <span>© 2026 Vento Real Estate</span>
      <a href={LEGAL_LINKS.privacy} className="text-sidebar-muted-foreground hover:underline">
        Privacy
      </a>
      <a href={LEGAL_LINKS.terms} className="text-sidebar-muted-foreground hover:underline">
        Terms
      </a>
    </div>
  )
}

/** Title and one-line explanation at the top of every auth screen. */
export function AuthHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div>
      <h1 className="mb-1.5 font-heading font-semibold text-2xl">{title}</h1>
      {children && (
        <p className="text-base text-muted-foreground leading-normal lg:text-sm">{children}</p>
      )}
    </div>
  )
}

/** Small print under the main button: links to the neighbouring screens. */
export function AuthFootnote({ children }: { children: ReactNode }) {
  return (
    <p className="text-muted-foreground text-xs leading-normal [&_a]:text-link [&_a:hover]:text-link-hover [&_a]:underline-offset-4 [&_a:hover]:underline [&_button]:text-link [&_button:hover]:underline max-lg:[&_a]:inline-flex max-lg:[&_a]:min-h-11 max-lg:[&_a]:items-center max-lg:[&_button]:inline-flex max-lg:[&_button]:min-h-11 max-lg:[&_button]:items-center">
      {children}
    </p>
  )
}
