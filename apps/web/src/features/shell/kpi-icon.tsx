import { type ComponentType, lazy, Suspense } from 'react'
import type { KpiGlyphName } from './kpi-glyphs'

type Props = { name: KpiGlyphName }

function NoGlyph() {
  return null
}

// Home's loader starts this download, so the icons usually arrive with the page. They're
// decoration: if they can't download, the tile stays as it is, without one.
const Glyph = lazy<ComponentType<Props & { className?: string; strokeWidth?: number }>>(() =>
  import('./kpi-glyphs').then(
    (m) => ({ default: m.KpiGlyph }),
    () => ({ default: NoGlyph }),
  ),
)

/** A Home number's icon, sized for StatCard. Its square is reserved, so nothing moves. */
export function KpiIcon({ name }: Props) {
  return (
    <Suspense fallback={null}>
      <Glyph name={name} className="size-4" strokeWidth={1.9} />
    </Suspense>
  )
}
