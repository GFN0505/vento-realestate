import type { ReactNode } from 'react'

type Props = {
  greeting: string
  date: string
  /** "Vento Homes Ltd · All entities" (desktop; phones show it in the header). */
  context: ReactNode
}

/**
 * Home's hero: the greeting on the sign-in panel's navy, with the same quiet light (logo-violet
 * and cyan aurora, a hairline grid) and the V drawing itself once. Motion is entrance-only (a
 * working page shouldn't keep moving) and behind `motion-safe:`. Decoration is aria-hidden.
 */
export function HomeHero({ greeting, date, context }: Props) {
  return (
    <section
      aria-labelledby="home-title"
      className="relative isolate overflow-hidden rounded-2xl bg-auth-panel px-5 py-7 text-sidebar-foreground sm:px-8 sm:py-10 lg:px-10 lg:py-12 dark:border dark:border-sidebar-edge"
    >
      <HeroBackdrop />
      <p className="font-medium text-[13px] text-auth-panel-muted tabular-nums motion-safe:animate-auth-word">
        {date}
      </p>
      <h1
        id="home-title"
        tabIndex={-1}
        className="mt-2 font-heading font-semibold text-[28px] leading-[1.1] tracking-[-0.03em] motion-safe:animate-auth-word motion-safe:[animation-delay:60ms] sm:text-[36px] lg:text-[40px]"
      >
        {greeting}
      </h1>
      <p className="mt-3 text-[14px] text-auth-panel-muted motion-safe:animate-auth-word motion-safe:[animation-delay:120ms] max-sm:hidden">
        {context}
      </p>
    </section>
  )
}

function HeroBackdrop() {
  return (
    <div aria-hidden="true" className="-z-10 pointer-events-none absolute inset-0">
      <div className="-left-[10%] -top-[120%] absolute aspect-square w-[70%] auth-blob-violet" />
      <div className="-right-[15%] -bottom-[140%] absolute aspect-square w-[65%] auth-blob-cyan" />
      <div className="absolute inset-0 auth-grid" />
      <svg
        aria-hidden="true"
        viewBox="0 0 32 32"
        fill="none"
        className="-right-6 -bottom-24 sm:-bottom-28 absolute size-[260px] opacity-[0.12] sm:right-6 sm:size-[340px]"
      >
        <path
          d="M5 7 L16 27 L27 7"
          strokeWidth={1.1}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="stroke-logo-stroke [stroke-dasharray:46] motion-safe:animate-auth-draw motion-safe:[animation-delay:150ms] motion-safe:[animation-duration:1.6s]"
        />
        <circle cx="16" cy="10" r="1.4" className="fill-logo-dot motion-safe:animate-auth-dot" />
      </svg>
    </div>
  )
}
