import { MenuIcon } from 'lucide-react'
import { lazy, Suspense, useState } from 'react'

// The sheet (and Radix Dialog) load on first tap, keeping them out of the first load.
const NavSheetPanel = lazy(() =>
  import('./nav-sheet-panel').then((m) => ({ default: m.NavSheetPanel })),
)

/** Between 768 and 1024 px the sidebar opens as a sheet from a menu button (spec). */
export function NavSheet() {
  const [open, setOpen] = useState(false)
  const [used, setUsed] = useState(false)
  return (
    <>
      <button
        type="button"
        aria-label="Open navigation"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          setUsed(true)
          setOpen(true)
        }}
        className="-ml-1.5 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-foreground outline-none hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
      >
        <MenuIcon aria-hidden className="size-5" />
      </button>
      {used && (
        <Suspense fallback={null}>
          <NavSheetPanel open={open} onOpenChange={setOpen} />
        </Suspense>
      )}
    </>
  )
}
