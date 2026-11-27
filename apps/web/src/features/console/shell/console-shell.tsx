import type { ReactNode } from 'react'
import { InShellContext } from '@/components/errors/error-state'
import { OfflineBanner } from '@/components/shell/offline-banner'
import { useRouteFocus } from '@/features/shell/use-route-focus'
import { ConsoleMobileTabs } from './console-mobile-tabs'
import { ConsoleSidebar } from './console-sidebar'
import { ConsoleTopBar } from './console-top-bar'

/**
 * The console's frame: skip link, navy sidebar on lg+, a top bar with the staff label below it,
 * the page, and bottom tabs on phones and tablets. Landmarks: nav "Console", main#main, nav "Tabs".
 */
export function ConsoleShell({ children }: { children: ReactNode }) {
  useRouteFocus()
  return (
    <InShellContext.Provider value>
      <a
        href="#main"
        className="skip-link rounded-lg bg-primary px-4 py-2.5 font-semibold text-primary-foreground text-sm shadow-lg"
      >
        Skip to content
      </a>
      <ConsoleSidebar />
      <div className="flex min-h-dvh flex-col lg:pl-60">
        <ConsoleTopBar />
        <main
          id="main"
          tabIndex={-1}
          className="flex-1 px-4 pt-5 pb-28 outline-none sm:px-6 lg:px-8 lg:pt-7 lg:pb-14"
        >
          <OfflineBanner />
          {children}
        </main>
      </div>
      <ConsoleMobileTabs />
    </InShellContext.Provider>
  )
}
