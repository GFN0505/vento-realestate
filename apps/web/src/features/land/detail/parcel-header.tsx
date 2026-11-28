import type { ParcelDetail } from '@vento/shared'
import { ArchiveRestoreIcon, EllipsisIcon, LoaderCircleIcon } from 'lucide-react'
import { type ComponentType, useCallback, useRef } from 'react'
import { StatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { LazyMenu, type LazyMenuProps } from '@/components/ui/lazy-menu'
import { formatDate } from '@/lib/format'
import { formatNaira } from '@/lib/format-more'
import { hectaresText, lgaLine, parcelBadge } from '../land-words'
import { updateStageLabel } from './detail-words'
import { menuTrigger } from './menu-trigger'
import type { ParcelAbilities } from './parcel-abilities'
import type { ParcelMenuActions } from './parcel-menu'

type Props = {
  parcel: ParcelDetail
  abilities: ParcelAbilities
  onUpdateStage: () => void
  onRestore: () => void
  restoring: boolean
  menu: ParcelMenuActions
  /** Hover or focus on an action that opens a sheet: start downloading the sheets. */
  onIntent: () => void
}

/**
 * The parcel's header (board ParcelDetail): name and status first, then where, how big and
 * whose; then the one primary action, **Update {current stage}** (spec departure: works for
 * every stage), and ⋯ (Upload document, Edit, Archive). The Documents card keeps its own
 * Upload document. Phones keep only the ⋯ menu here; their actions sit in the sticky bar.
 */
export function ParcelHeader({
  parcel,
  abilities,
  onUpdateStage,
  onRestore,
  restoring,
  menu,
  onIntent,
}: Props) {
  const badge = parcelBadge(parcel)
  const current = parcel.currentStage
  const latestMenu = useRef(menu)
  latestMenu.current = menu
  // The menu's Radix code loads on intent; its actions are read when it renders.
  const loadMenu = useCallback(
    () =>
      import('./parcel-menu').then(
        (m): ComponentType<LazyMenuProps> =>
          (props) => <m.ParcelMenu {...props} actions={latestMenu.current} />,
      ),
    [],
  )

  return (
    <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1
            tabIndex={-1}
            className="font-heading font-semibold text-[22px] leading-tight tracking-[-0.02em] outline-hidden sm:text-2xl"
          >
            {parcel.name}
          </h1>
          <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
        </div>
        <Facts parcel={parcel} />
        {parcel.notes && (
          <p className="line-clamp-2 max-w-prose text-pretty text-[13px] text-muted-foreground">
            {parcel.notes}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {abilities.restore && (
          <Button
            variant="outline"
            onClick={onRestore}
            disabled={restoring}
            className="max-md:h-11"
          >
            {restoring ? (
              <LoaderCircleIcon aria-hidden className="animate-spin" />
            ) : (
              <ArchiveRestoreIcon aria-hidden />
            )}
            Restore parcel
          </Button>
        )}
        {abilities.updateStage && current && (
          <Button
            onClick={onUpdateStage}
            onPointerEnter={onIntent}
            onFocus={onIntent}
            className="max-md:hidden"
          >
            {updateStageLabel(current)}
          </Button>
        )}
        {abilities.menu && (
          <LazyMenu load={loadMenu} className={menuTrigger} label="More actions">
            <EllipsisIcon aria-hidden className="size-4" />
          </LazyMenu>
        )}
      </div>
    </header>
  )
}

/**
 * "P-0012 · Ibeju-Lekki LGA, Lagos · 4.20 ha · Lekki Pearl Estates Ltd", then the money on a
 * line of its own: "Acquired 3 Mar 2025 for ₦840,000,000.00 · Bought from Adeyemi family".
 */
function Facts({ parcel }: { parcel: ParcelDetail }) {
  const bought = parcel.acquisition
  const date = bought?.on ? formatDate(bought.on) : null
  const cost = bought?.cost ? formatNaira(bought.cost) : null
  const acquired =
    date && cost
      ? `Acquired ${date} for ${cost}`
      : date
        ? `Acquired ${date}`
        : cost
          ? `Bought for ${cost}`
          : null
  const where = present([
    parcel.reference,
    parcel.area && parcel.area !== parcel.lga ? parcel.area : null,
    lgaLine(parcel),
    hectaresText(parcel.sizeSqm),
    parcel.entity.name,
  ])
  const money = present([acquired, parcel.seller ? `Bought from ${parcel.seller}` : null])
  return (
    <div className="flex flex-col gap-0.5 text-[13px] text-muted-foreground">
      <p className="text-pretty">{where.join(' · ')}</p>
      {money.length > 0 && <p className="text-pretty tabular-nums">{money.join(' · ')}</p>}
    </div>
  )
}

const present = (facts: readonly (string | null | undefined)[]) =>
  facts.filter((fact): fact is string => Boolean(fact))
