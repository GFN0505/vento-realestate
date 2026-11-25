import { useRef } from 'react'
import { VentoMark } from '@/components/vento-mark'
import { usePanelMotion } from './use-panel-motion'

/** The privacy notice and terms pages are published outside the app (not built yet). */
export const LEGAL_LINKS = { privacy: '/privacy', terms: '/terms' } as const

const HEADLINE = 'Command every development, from title to handover.'

/**
 * The navy panel beside every auth form on desktop. It moves, calmly: a drifting aurora, the V
 * drawing itself, a pointer spotlight and a one-off headline entrance. All of it is behind
 * `motion-safe:` (reduced motion gets the finished, still panel) and pauses in hidden tabs.
 */
export function BrandPanel() {
  const ref = useRef<HTMLElement>(null)
  usePanelMotion(ref)

  return (
    <aside
      ref={ref}
      className="group/panel relative isolate hidden overflow-hidden bg-auth-panel text-sidebar-foreground data-paused:**:[animation-play-state:paused] lg:flex lg:flex-col lg:justify-between lg:p-12 xl:p-16"
    >
      <PanelBackdrop />
      <VentoMark tone="navy" animated />
      <div>
        <p className="max-w-[560px] text-balance font-heading font-semibold text-[40px] leading-[1.1] tracking-[-0.03em] xl:text-[48px]">
          {/* Screen readers get the sentence whole, not word by word. */}
          <span className="sr-only">{HEADLINE}</span>
          {HEADLINE.split(' ').map((word, index) => (
            <span key={word} aria-hidden="true">
              <span
                className="inline-block motion-safe:animate-auth-word"
                style={{ animationDelay: `${120 + index * 40}ms` }}
              >
                {word}
              </span>{' '}
            </span>
          ))}
        </p>
        <p className="mt-5 max-w-[460px] text-pretty text-auth-panel-muted text-base leading-relaxed motion-safe:animate-auth-word motion-safe:[animation-delay:420ms] xl:text-lg">
          Everything your development business runs on, in one calm, secure place.
        </p>
      </div>
      <AuthFooter />
    </aside>
  )
}

/**
 * Decoration only. Layers, back to front: aurora blobs, the hairline grid, the spotlight and the
 * grid it lights, the occasional sweep, and the oversized V. The brightest blob (violet) drifts
 * around the top-left and the cyan one around the bottom-right, away from the headline.
 */
function PanelBackdrop() {
  return (
    <div aria-hidden="true" className="-z-10 pointer-events-none absolute inset-0">
      <div className="-left-[25%] -top-[30%] absolute aspect-square w-[95%] auth-blob-violet will-change-transform motion-safe:animate-auth-drift-a" />
      <div className="-right-[30%] -bottom-[30%] absolute aspect-square w-[85%] auth-blob-cyan will-change-transform motion-safe:animate-auth-drift-b" />
      <div className="-bottom-[20%] -left-[20%] absolute aspect-square w-[60%] auth-blob-violet opacity-50 will-change-transform motion-safe:animate-auth-drift-c" />
      <div className="absolute inset-0 auth-grid" />
      <div className="absolute inset-0 auth-spotlight opacity-0 transition-opacity duration-500 group-data-[spotlight=on]/panel:opacity-100" />
      <div className="absolute inset-0 auth-grid-lit opacity-0 transition-opacity duration-500 group-data-[spotlight=on]/panel:opacity-100" />
      <div className="absolute inset-0 hidden auth-sweep motion-safe:block motion-safe:animate-auth-sweep" />
      <div className="-right-32 -bottom-40 absolute size-[640px] opacity-[0.08]">
        <svg
          viewBox="0 0 32 32"
          fill="none"
          aria-hidden="true"
          className="size-full motion-safe:animate-auth-breathe"
        >
          <path
            d="M5 7 L16 27 L27 7"
            strokeWidth={1.2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="stroke-logo-stroke [stroke-dasharray:46] motion-safe:animate-auth-draw motion-safe:[animation-delay:200ms] motion-safe:[animation-duration:1.6s]"
          />
        </svg>
      </div>
    </div>
  )
}

function AuthFooter() {
  return (
    <div className="flex flex-wrap gap-4 text-auth-panel-muted text-xs">
      <span>© 2026 Vento Real Estate</span>
      <a href={LEGAL_LINKS.privacy} className="hover:text-sidebar-foreground hover:underline">
        Privacy
      </a>
      <a href={LEGAL_LINKS.terms} className="hover:text-sidebar-foreground hover:underline">
        Terms
      </a>
    </div>
  )
}
