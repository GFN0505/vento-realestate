import { useMatches } from '@tanstack/react-router'
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useState } from 'react'
import { InShellContext } from '@/components/errors/error-state'
import { LazyForbiddenPage } from '@/components/errors/lazy-pages'
import { passkeyOfferPending } from '@/features/auth/passkey-offer-flag'
import { useFeatureLoss, useNotFoundRefetch } from '@/features/availability/use-availability-sync'
import { useEntitySync } from '@/features/entity/use-current-entity'
import { useEffectiveAccess } from '@/features/preview/use-effective-permissions'
import { canView, isAvailable, navItemForModule } from '@/features/shell/nav'
import { routeModule } from '@/features/shell/route-module'
import {
  loadCompanySheet,
  loadInvite,
  loadPalette,
  preloadPalette,
  useOverlay,
} from '@/features/shell/shell-ui'
import { useRouteFocus } from '@/features/shell/use-route-focus'
import { useShellSync } from '@/features/shell/use-shell-sync'
import { useShortcuts } from '@/features/shell/use-shortcuts'
import { MobileTabs } from './mobile-tabs'
import { OfflineBanner } from './offline-banner'
import { PreviewBanner } from './preview-banner'
import { Sidebar } from './sidebar'
import { TopBar } from './top-bar'
import { TwoStepBanner, TwoStepSetupHost } from './two-step-banner'

const CommandPalette = lazy(() => loadPalette().then((m) => ({ default: m.CommandPalette })))
const InviteSheet = lazy(() => loadInvite().then((m) => ({ default: m.InviteSheet })))
const CompanyOverlays = lazy(() => loadCompanySheet().then((m) => ({ default: m.CompanyOverlays })))
// After a password sign-in only; its code (and the passkey library) never loads otherwise.
const PasskeyOffer = lazy(() =>
  import('@/features/security/passkey-offer').then((m) => ({ default: m.PasskeyOffer })),
)
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
  useNotFoundRefetch()

  return (
    <InShellContext.Provider value>
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
          <TwoStepBanner />
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
      <TwoStepSetupHost />
      <PasskeyOfferHost />
    </InShellContext.Provider>
  )
}

/**
 * The route guard runs once per navigation; this re-checks live. A role changed while the page
 * is open (or a preview started) turns it into the 403 page without a reload; a module the
 * organization no longer has sends the member Home with a toast.
 */
function PermittedPage({ children }: { children: ReactNode }) {
  const access = useEffectiveAccess()
  // Only pages that loaded: a guard's 404 (e.g. a typed link) keeps its own page.
  const module = useMatches({
    select: (matches) => routeModule(matches.filter((m) => m.status === 'success')),
  })
  const item = module ? navItemForModule(module) : undefined
  const lost = item && !isAvailable(access, item) ? item : null
  useFeatureLoss(lost)
  if (lost) return null
  if (module && item && !canView(access, item)) return <LazyForbiddenPage module={module} />
  return children
}

/** Lazy overlays: mounted on first open, kept mounted so they can animate out. */
function ShellOverlays() {
  const palette = useOverlay('palette')
  const shortcuts = useOverlay('shortcuts')
  const invite = useOverlay('invite')
  const companySheet = useOverlay('company')
  const companyPlan = useOverlay('companyPlan')
  const company = companySheet || companyPlan
  const [used, setUsed] = useState({
    palette: false,
    shortcuts: false,
    invite: false,
    company: false,
  })
  if (
    (palette && !used.palette) ||
    (shortcuts && !used.shortcuts) ||
    (invite && !used.invite) ||
    (company && !used.company)
  ) {
    setUsed({
      palette: used.palette || palette,
      shortcuts: used.shortcuts || shortcuts,
      invite: used.invite || invite,
      company: used.company || company,
    })
  }

  // The palette's code arrives in the background once the page is idle, so ⌘K opens at once.
  useEffect(() => {
    const idle = window.requestIdleCallback ?? ((fn: () => void) => window.setTimeout(fn, 1500))
    idle(preloadPalette)
  }, [])

  return (
    <Suspense fallback={null}>
      {used.palette && <CommandPalette />}
      {used.shortcuts && <ShortcutsDialog />}
      {used.invite && <InviteSheet />}
      {used.company && <CompanyOverlays />}
    </Suspense>
  )
}

/** "Sign in faster next time", considered once after a password sign-in (3d). */
function PasskeyOfferHost() {
  const [pending, setPending] = useState(passkeyOfferPending)
  const done = useCallback(() => setPending(false), [])
  if (!pending) return null
  return (
    <Suspense fallback={null}>
      <PasskeyOffer onDone={done} />
    </Suspense>
  )
}
