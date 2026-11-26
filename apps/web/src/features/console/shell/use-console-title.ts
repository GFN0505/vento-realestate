import { usePageTitle } from '@/features/shell/use-page-title'

/** "Organizations · Vento console"; console pages are never "recently opened" in a workspace. */
export function useConsoleTitle(title: string) {
  usePageTitle(title, { suffix: 'Vento console', recent: false })
}
