import { isRecord, readJson, writeItem, writeJson } from '@/lib/storage'

/*
 * Decision 0013: each tab remembers which organization it is showing and names it on every API
 * call. The server refuses a mismatch; this tab then reloads into the session's organization
 * and says why. The binding lives in sessionStorage, so it survives a reload but not a new tab.
 */

type OrgRef = { id: string; name: string }
type Bound = OrgRef & { userId: string }

const TAB_KEY = 'vento-tab-org'
const NOTICE_KEY = 'vento-notice'
const lastOrgKey = (userId: string) => `vento-last-org:${userId}`

function isOrgRef(value: unknown): value is OrgRef {
  return isRecord(value) && typeof value.id === 'string' && typeof value.name === 'string'
}
function isBound(value: unknown): value is Bound {
  return isOrgRef(value) && typeof (value as Record<string, unknown>).userId === 'string'
}

let bound: Bound | null = readJson(TAB_KEY, isBound, 'session')
let pendingNotice: string | null = null
let reloading = false
/** The first bind of this page load works out notices; later ones only check. */
let booted = false
/** A switch started in this tab: its own reload follows, so don't race it. */
let switching = false

/** The organization id this tab expects, for the request header. */
export function expectedOrganizationId(): string | null {
  return bound?.id ?? null
}

/**
 * What to tell someone whose tab was showing `previous` and now shows `current`. `memberships`
 * are the organizations they still belong to.
 */
export function organizationNotice(
  previous: OrgRef | null,
  current: OrgRef | null,
  memberships: readonly { id: string }[],
): string | null {
  if (!previous || previous.id === current?.id) return null
  if (!memberships.some((m) => m.id === previous.id)) {
    return `You no longer have access to ${previous.name}.`
  }
  return current ? `You switched to ${current.name} in another tab.` : null
}

type MeLike = {
  user: { id: string }
  organization: OrgRef | null
  organizations: readonly { id: string }[]
}

/**
 * Binds this tab to the session's organization and works out the notice to show, if any. The
 * device's last organization only ever produces "no longer have access" (e.g. after being
 * removed and signing in again); "switched in another tab" needs this tab's own memory.
 */
export function bindTabOrganization(me: MeLike): void {
  const userId = me.user.id
  const previousTab = bound?.userId === userId ? bound : null
  const lastOnDevice = readJson(lastOrgKey(userId), isOrgRef)
  const stored = readJson(NOTICE_KEY, (v): v is string => typeof v === 'string', 'session')
  writeItem(NOTICE_KEY, null, 'session')

  const fromTab = organizationNotice(previousTab, me.organization, me.organizations)
  const fromDevice = previousTab
    ? null
    : organizationNotice(lastOnDevice, me.organization, me.organizations)
  const notice = stored ?? fromTab ?? (fromDevice?.startsWith('You no longer') ? fromDevice : null)
  if (notice) pendingNotice = notice

  const current = me.organization
  bound = current ? { userId, id: current.id, name: current.name } : null
  writeJson(TAB_KEY, bound, 'session')
  if (current) writeJson(lastOrgKey(userId), { id: current.id, name: current.name })
}

/**
 * Called by the app guard with every fresh `me`. On the first call of a page load it binds the
 * tab (and works out the notice). Afterwards, if the session now names a different
 * organization than the one on screen, the tab reloads: its caches belong to the old one.
 * Nothing bound yet (onboarding) just binds.
 */
export function syncTabOrganization(me: MeLike): 'ok' | 'reload' {
  if (!booted || bound === null || bound.userId !== me.user.id) {
    if (booted && bound !== null) {
      reloadForOrganizationChange()
      return 'reload'
    }
    booted = true
    bindTabOrganization(me)
    return 'ok'
  }
  if (me.organization?.id !== bound.id) {
    reloadForOrganizationChange()
    return 'reload'
  }
  return 'ok'
}

/** The notice from the last bind, once. The shell shows it as a toast after it mounts. */
export function takeOrganizationNotice(): string | null {
  const notice = pendingNotice
  pendingNotice = null
  return notice
}

/**
 * Switching in this tab: remember the target and the toast, then reload. A full reload drops
 * every cache, pending request and piece of state from the old organization in one step.
 */
export function reloadIntoOrganization(target: OrgRef, path: string, userId: string): void {
  reloading = true
  writeJson(TAB_KEY, { ...target, userId }, 'session')
  writeJson(NOTICE_KEY, `Switched to ${target.name}`, 'session')
  window.location.replace(path)
}

/** The server said this tab is out of date. Reload once per page load (no loops). */
export function reloadForOrganizationChange(): void {
  if (reloading || switching) return
  reloading = true
  window.location.replace('/')
}

/** Marks a switch in progress in this tab (true) or failed (false). */
export function setSwitchingOrganization(value: boolean): void {
  switching = value
}

/** After sign-out or joining another organization, forget what this tab was showing. */
export function forgetTabOrganization(): void {
  bound = null
  booted = false
  writeItem(TAB_KEY, null, 'session')
}

/** Test helper. */
export function resetTabOrganizationForTests() {
  bound = readJson(TAB_KEY, isBound, 'session')
  pendingNotice = null
  reloading = false
  booted = false
  switching = false
}
