import {
  type Browser,
  type BrowserContext,
  expect,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { signInAs } from './sign-in'

type Person = { email: string; totpSecret?: string | undefined }

/**
 * A second signed-in person in their own browser context, with the project's device settings
 * (desktop or phone). Approvals always involve two people, so specs hold both at once.
 */
export async function pageFor(
  browser: Browser,
  testInfo: TestInfo,
  person: Person,
  password: string,
): Promise<{ page: Page; context: BrowserContext }> {
  const context = await browser.newContext({ ...testInfo.project.use })
  const page = await context.newPage()
  await signInAs(page, person, password)
  return { page, context }
}

/** The inbox on a tab, with its heading showing. */
export async function openInbox(page: Page, tab?: 'mine' | 'decided') {
  await page.goto(tab ? `/approvals?tab=${tab}` : '/approvals')
  await expect(page.getByRole('heading', { name: 'Approvals', level: 1 })).toBeVisible()
}

/** The open request on desktop (the pane beside the list). */
export const requestPane = (page: Page) => page.getByRole('region', { name: 'Request detail' })

export const rolePath = (role: { id: string }) => `/settings/roles/${role.id}`
