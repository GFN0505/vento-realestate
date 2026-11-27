import { usePageTitle } from '@/features/shell/use-page-title'
import { CONSOLE_NAME } from './console-nav'

/** "Organizations · Vento Real Estate console"; never "recently opened" in a workspace. */
export function useConsoleTitle(title: string) {
  usePageTitle(title, { suffix: CONSOLE_NAME, recent: false })
}
