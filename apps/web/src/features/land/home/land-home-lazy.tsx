import { type ComponentType, lazy, type ReactNode, Suspense, useState } from 'react'
import { StatCard } from '@/components/stat-card'
import { Skeleton } from '@/components/ui/skeleton'

/*
 * Home's door to Land & title. This file is in Home's first load, so it holds only the lazy
 * imports and their placeholders; the tile, queue, pipeline and upload come in one chunk that
 * Home's loader starts with the page.
 */

type LandHomeModule = typeof import('./land-home')
let modulePromise: Promise<LandHomeModule> | null = null

/** A failed download (offline) is forgotten, so the next visit tries again. */
export function loadLandHome(): Promise<LandHomeModule> {
  modulePromise ??= import('./land-home').catch((error: unknown) => {
    modulePromise = null
    throw error
  })
  return modulePromise
}

type TileProps = { label: string; icon: ReactNode }

/** Couldn't download: the tile stays as it was before Land & title shipped. */
function PlainTile(props: TileProps) {
  return <StatCard {...props} />
}

function Nothing() {
  return null
}

/**
 * A lazy part that falls back when the chunk can't download. React keeps a lazy component's
 * first answer for good, so after a fallback the next mount (the next visit to Home) starts a
 * fresh one and downloads again.
 */
function retryingLazy<P extends object>(
  pick: (m: LandHomeModule) => ComponentType<P>,
  fallback: ComponentType<P>,
) {
  let failed = false
  const make = () =>
    lazy<ComponentType<P>>(() =>
      loadLandHome().then(
        (m) => ({ default: pick(m) }),
        () => {
          failed = true
          return { default: fallback }
        },
      ),
    )
  let current = make()
  /** The lazy component for a new mount: a fresh one after a fallback. */
  return () => {
    if (failed) {
      failed = false
      current = make()
    }
    return current
  }
}

/** Picks the part once per mount, so a re-render never swaps it. */
function usePart<P>(next: () => ComponentType<P>): ComponentType<P> {
  return useState(next)[0]
}

const nextTile = retryingLazy<TileProps>((m) => m.TitlesInProgressTile, PlainTile)
const nextSection = retryingLazy<Record<string, never>>((m) => m.LandHomeSection, Nothing)

export function LazyTitlesTile(props: TileProps) {
  const Tile = usePart(nextTile)
  return (
    <Suspense
      fallback={
        <StatCard
          {...props}
          value={<Skeleton className="inline-block h-[0.8em] w-10" />}
          detail={<Skeleton className="h-3 w-32" />}
        />
      }
    >
      <Tile {...props} />
    </Suspense>
  )
}

/** The queue and pipeline's space is held while the chunk arrives, so nothing jumps. */
export function LazyLandHomeSection() {
  const Section = usePart(nextSection)
  return (
    <Suspense
      fallback={
        <div aria-hidden className="grid items-start gap-5 lg:grid-cols-[1.4fr_1fr]">
          <div className="h-[244px] rounded-xl border bg-card" />
          <div className="h-[212px] rounded-xl border bg-card max-lg:hidden" />
        </div>
      }
    >
      <Section />
    </Suspense>
  )
}
