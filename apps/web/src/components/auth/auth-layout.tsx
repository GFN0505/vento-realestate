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
    <div className="min-h-dvh bg-card lg:grid lg:grid-cols-[520px_1fr]">
      <BrandPanel />
      <main className="flex min-h-dvh flex-col gap-5 px-6 pt-4 pb-8 lg:items-center lg:justify-center lg:p-12">
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
    <aside className="hidden flex-col justify-between bg-auth-panel p-12 text-sidebar-foreground lg:flex">
      <VentoMark />
      <div>
        <p className="mb-3 max-w-[380px] font-heading font-semibold text-[28px] leading-[1.3]">
          Land, projects, buyers and money in one place.
        </p>
        <p className="max-w-[380px] text-sidebar-muted-foreground text-sm leading-normal">
          Built for Nigerian developers: titles, off-plan instalments, SPVs and statutory filings.
        </p>
      </div>
      <AuthFooter />
    </aside>
  )
}

function AuthFooter() {
  return (
    <div className="flex flex-wrap gap-4 text-sidebar-faint-foreground text-xs">
      <span>© 2026 Vento</span>
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
    <p className="text-muted-foreground text-xs leading-normal [&_a]:text-link [&_a:hover]:text-link-hover [&_a]:underline-offset-4 [&_a:hover]:underline [&_button]:text-link [&_button:hover]:underline">
      {children}
    </p>
  )
}
