import { useMatches } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useEffect, useState } from 'react'
import { InShellContext } from '@/components/errors/error-state'
import { LazyForbiddenPage } from '@/components/errors/lazy-pages'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useEntitySync } from '@/features/entity/use-current-entity'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { canView, navItemForModule } from '@/features/shell/nav'
import { loadPalette, useOverlay } from '@/features/shell/shell-ui'
import { useRouteFocus } from '@/features/shell/use-route-focus'
import { useShellSync } from '@/features/shell/use-shell-sync'
import { useShortcuts } from '@/features/shell/use-shortcuts'
import { MobileTabs } from './mobile-tabs'
import { OfflineBanner } from './offline-banner'
import { PreviewBanner } from './preview-banner'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'

const CommandPalette = lazy(() => loadPalette().then((m) => ({ default: m.CommandPalette })))
const ShortcutsDialog = lazy(() =>
  import('@/features/shell/shortcuts-dialog').then((m) => ({ default: m.ShortcutsDialog })),
)

/**
 * The signed-in workspace (boards ExecutiveHome, *Mobile): skip link, navy sidebar on lg+, top
 * bar, page, and bottom tabs on phones. Landmarks: nav "Main", header, main#main, nav "Tabs".
 */
export function AppShell({ children }: { children: ReactNode }) {
  useShortcuts()
  useRouteFocus()
  useEntitySync()
  useShellSync()

  return (
    <InShellContext.Provider value>
      <TooltipProvider>
        <a
          href="#main"
          className="skip-link rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground text-sm shadow-lg"
        >
          Skip to content
        </a>
        <Sidebar />
        <div className="flex min-h-dvh flex-col transition-[padding] duration-200 ease-out motion-reduce:transition-none lg:pl-(--sidebar-width)">
          <div className="sticky top-0 z-30">
            <PreviewBanner />
            <TopBar />
          </div>
          <main
            id="main"
            tabIndex={-1}
            className="flex-1 px-4 pt-5 pb-28 outline-none sm:px-6 md:pb-14 lg:px-8 lg:pt-7"
          >
            <OfflineBanner />
            <PermittedPage>{children}</PermittedPage>
          </main>
        </div>
        <MobileTabs />
        <ShellOverlays />
      </TooltipProvider>
    </InShellContext.Provider>
  )
}

/**
 * The route guard runs once per navigation; this re-checks live, so a role changed while the
 * page is open (or a preview started) turns it into the 403 page without a reload.
 */
function PermittedPage({ children }: { children: ReactNode }) {
  const { permissions } = useEffectiveAccess()
  const module = useMatches({ select: (m) => m.at(-1)?.staticData?.module })
  const item = module ? navItemForModule(module) : undefined
  if (module && item && !canView(permissions, item)) return <LazyForbiddenPage module={module} />
  return children
}

/** Lazy overlays: mounted on first open, kept mounted so they can animate out. */
function ShellOverlays() {
  const palette = useOverlay('palette')
  const shortcuts = useOverlay('shortcuts')
  const [used, setUsed] = useState({ palette: false, shortcuts: false })
  if ((palette && !used.palette) || (shortcuts && !used.shortcuts)) {
    setUsed({ palette: used.palette || palette, shortcuts: used.shortcuts || shortcuts })
  }

  // The palette's code arrives in the background once the page is idle, so ⌘K opens at once.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500))
    idle(() => void loadPalette())
  }, [])

  return (
    <Suspense fallback={null}>
      {used.palette && <CommandPalette />}
      {used.shortcuts && <ShortcutsDialog />}
    </Suspense>
  )
}
