import {
  type Browser,
  type BrowserContext,
  test as base,
  type Page,
  type TestInfo,
} from '@playwright/test'
import { createTeamFixture, type TeamFixture } from './fixtures'
import { signInAs } from './sign-in'

/*
 * One team per worker process (about a few seconds to create), and one sign-in per role per
 * worker. Specs that change data (set-role, remove-member, sign out) create their own team.
 */
let team: Promise<TeamFixture> | undefined
export function sharedTeam(): Promise<TeamFixture> {
  team ??= Promise.resolve().then(createTeamFixture)
  return team
}

type StorageState = Exclude<
  NonNullable<Parameters<Browser['newContext']>[0]>['storageState'],
  string | undefined
>
const sessions = new Map<string, Promise<StorageState>>()

/**
 * A page for `role` in the shared team, signed in once per worker and reused through the
 * stored cookies. The page runs with the project's device settings (desktop or phone).
 */
async function openAs(browser: Browser, testInfo: TestInfo, role: string): Promise<BrowserContext> {
  const fixture = await sharedTeam()
  const person = fixture.members[role]
  if (!person) throw new Error(`No ${role} in the team`)
  const options = { ...testInfo.project.use }
  let state = sessions.get(role)
  if (!state) {
    state = (async () => {
      const context = await browser.newContext(options)
      const page = await context.newPage()
      await signInAs(page, person, fixture.password)
      const stored = await context.storageState()
      await context.close()
      return stored
    })()
    sessions.set(role, state)
  }
  return browser.newContext({ ...options, storageState: await state })
}

/** `test` with `as(role)`: a signed-in page for a role of the shared team, closed after the test. */
export const test = base.extend<{ as: (role: string) => Promise<Page> }>({
  as: async ({ browser }, use, testInfo) => {
    const contexts: BrowserContext[] = []
    await use(async (role) => {
      const context = await openAs(browser, testInfo, role)
      contexts.push(context)
      return context.newPage()
    })
    await Promise.all(contexts.map((c) => c.close()))
  },
})

export const isMobile = (testInfo: TestInfo) => testInfo.project.name === 'mobile'
