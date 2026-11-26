# Plan: App shell (brick 3a)

- **Status:** approved by the owner on 26 Nov 2026, in build. All recommended answers apply; decisions 0013 and 0014 accepted. Owner added: modules a role can't view are never shown anywhere in navigation (sidebar, tabs, ⌘K, shortcuts, Home, preview); only a direct link reaches 403. Item F (accepting an invitation switches organization) is in scope.
- **Spec:** [docs/specs/app-shell.md](../specs/app-shell.md) (draft; open questions unanswered, so this plan uses the **recommended defaults**. Anything that would change if you choose differently is marked **⟲ if the owner picks otherwise**.)
- **Journeys:** J-ONB-05 (new), J-ONB-01 step 7 and J-ONB-02 step 4 (changed)
- Written by the architect agent on 26 Nov 2026 against branch `brick/03-app-shell` (cut from `main` after 2a merged), TanStack Router 1.170.46, oRPC 1.16.5, Better Auth 1.7.28.

## Summary (plain English)
This brick replaces the temporary "you're signed in" page with Vento's real workspace. After signing in, a member lands on Home. A navy sidebar shows only the modules their role can open. On a phone they get Home plus three tabs and a **More** sheet. Every module has its real address now: a module that isn't built yet shows a designed *Coming soon* page, and a module the role can't open shows a *403* page naming who to ask. A command palette (⌘K) and shortcuts (`?`, `[`, `g h`) get people anywhere in a few keystrokes. The theme (light by default, dark or follow the device) and the collapsed sidebar are remembered on the device and applied before the page draws, so nothing flickers. People in two developer groups can switch organization in two clicks. Each browser tab tells the server which organization it is showing, and the server refuses any request from a tab that is out of date before it touches any data. That tab then reloads into the right organization with a notice. The entity switcher is a view filter kept in the page address; it never grants access. Owners and admins can preview any role's navigation without their own access changing. 404, 500 (with a reference to quote) and offline pages complete the slice. The API change is small: two additions to `account`, one new read-only `access` procedure, the tab check in the existing member middleware, and an error reference on server failures. There's no database migration, no new table and no new audit event. One new runtime dependency (`cmdk` for the palette, lazy-loaded) and one new test dependency (`@axe-core/playwright`).

---

## 1. Summary (technical)
- **Routes:** `_app` stays the auth and next-step guard. A new pathless layout, `_app/_shell`, renders the AppShell around Home, nine module routes, and a splat route for 404. Onboarding and two-step setup stay outside the shell.
- **One navigation registry** (`features/shell/nav.ts`) maps each module to its route, icon, label, permission module, group, status (`built | soon | hidden`), Coming soon line and ⌘K keywords. The sidebar, mobile tabs, More sheet, ⌘K and the 403 guard all read it.
- **Tab organization guard:** the web sends `x-vento-organization: <id>` on every oRPC call. `memberMiddleware` refuses a mismatch with `CONFLICT organization_changed` **before loading the membership or writing anything**. The organization still comes only from the session (non-negotiable 1). On that error the web does a full reload and shows a notice.
- **New procedures:** `account.me` gains `organizations[]`, `account.switchOrganization` is added, and `access.whoCanChangeAccess` is new.
- **Error reference:** an oRPC `clientInterceptor` turns any unexpected error into `INTERNAL_SERVER_ERROR { reference: 'ERR-7F3A-1126' }`. The same reference goes into the log line.
- **Client state:** theme and sidebar state in `localStorage`, applied by the inline script in `index.html` before first paint. Entity in the URL (`?entity=`), remembered per organization in `localStorage`. Preview role in `sessionStorage`, so it lasts for the tab only.
- **Budget:** first-load JS ≤ 200 KB gzip, enforced by a new `bundle:check` script in CI. ⌘K, the shortcuts dialog, the error pages and menus that are rarely opened are lazy chunks.

## 2. Domain model
No new entities. 3a adds behaviour around 2a's model:

```
User 1─* Member *─1 Organization 1─* Entity
Session.activeOrganizationId ─▶ Organization      (server truth)
Browser tab: expectedOrganizationId (memory + sessionStorage)   (a claim the server checks)
Device: theme, sidebarCollapsed, lastEntity[org], recentPages[user, org], lastOrganization[user]
Tab:    previewRole{organizationId, roleId}
```

**Who owns what:** nothing new is persisted on the server. `users.lastActiveOrganizationId` and `sessions.activeOrganizationId` already exist (2a) and are now written by `switchOrganization` as well. Nothing is entity-owned.

**State machines**
```
Tab organization:  loading ──me──▶ bound(X)
                   bound(X) ──user switches here──▶ reload → bound(Y)   toast "Switched to Y"
                   bound(X) ──API says organization_changed, or me returns Y on focus──▶ reload → bound(Y)
                                 toast "You switched to Y in another tab."  (X still in me.organizations)
                                 toast "You no longer have access to X."    (X not in me.organizations)
                   bound(X) ──me has no organization──▶ /onboarding, "access ended" panel with Sign out
Preview:           off ──owner/admin picks role──▶ on(roleId) ──Stop preview / tab closed / org switch──▶ off
                   on ──reload──▶ on   (sessionStorage)
Theme:             light (default) ⇄ dark ⇄ system   (system follows prefers-color-scheme live)
Entity filter:     all ⇄ entity(id)   invalid id in link → all + toast; member limited to 1 entity → fixed label
Connection:        online ──offline event or network failure + failed /health probe──▶ offline ──online event or probe ok──▶ online
Module nav status: hidden ⇄ soon ──module ships──▶ built     (one field per module in nav.ts)
```

**Invariants**
- The organization for every request comes from the session. The header can only make a request fail, never succeed where it otherwise wouldn't.
- Every procedure that reads or writes organization data runs on `member` or `memberPendingTwoStep`, so the guard covers it. A walking test fails if a non-public procedure skips the guard and isn't on the short personal allow-list (§9).
- Preview never reaches the server: no request carries the preview role.
- The entity filter never widens access. Future list procedures intersect `entityId` with `entityScope` (decision 0014).
- A member who can't view a module never triggers that module's data requests. The guard runs in `beforeLoad`, before any loader.

## 3. Database
**No migration.** Existing indexes cover the new reads:
- `me.organizations`: `members (user_id)` index, joined to `organizations` and `roles` by primary key.
- `access.whoCanChangeAccess`: `roles (organization_id, …)`, `role_permissions (role_id, module, action)` unique, `members (organization_id, status)`.
- `switchOrganization` updates one `sessions` row and one `users` row by primary key, in one transaction.

## 4. Contract (packages/shared)

**Error map changes (`common/errors.ts`)**
- `conflictReason` += `'organization_changed'`. The message ("This tab is showing a different organization. Reloading…") is never shown; the web reloads instead.
- Add `INTERNAL_SERVER_ERROR: { status: 500, message: 'Something went wrong on our side', data: z.object({ reference: z.string() }) }`.
- New `common/http.ts`: `export const ORGANIZATION_HEADER = 'x-vento-organization'`.
- New `common/reference.ts`: `errorReference(requestId, at) → 'ERR-' + first 4 hex of the id, upper case + '-' + MMDD in Africa/Lagos` (+ test).
- New `common/text.ts`: `joinNames()` moves here from `apps/api/src/access/who-can-grant.ts`, so the web can build the 403 sentence.

| Procedure | Builder | Input → Output | Errors |
|---|---|---|---|
| `account.me` (changed) | `authed`, **not guarded** (it is how a tab learns the truth) | – → `me` + `organizations: { id, name, roleName }[]` (active memberships, by name) | UNAUTHORIZED |
| `account.switchOrganization` (new) | `authed`, not guarded (it changes the organization on purpose) | `z.strictObject({ organizationId: id })` → `{ organization: { id, name }, nextStep }` | NOT_FOUND (not a member, removed, or doesn't exist: one answer) |
| `access.whoCanChangeAccess` (new) | `member` (guarded), no permission check: it's what the 403 page needs | `z.strictObject({ module: permissionModule })` → `{ roles: string[] /* plural names that can view, system order */, contacts: { name, roleName }[] /* ≤ 2 */ }` | – |

Notes:
- `contacts` are active members whose role has `settings.edit` (the permission `members.updateAccess` needs), owners first, then by `joinedAt`, excluding the caller. No emails, ever (not in the schema). Works unchanged for 3c custom roles.
- `switchOrganization` uses `loadMembership(db, userId, organizationId)` and checks that the result really is that organization (the function falls back to another one otherwise). It calls `setActiveOrganization` (session + `users.lastActiveOrganizationId`) inside `db.transaction`, then computes `nextStep` with the same rules as `getMe`. Not audited (spec: no data or access change). Switching to the current organization is a no-op that returns it.
- Register `access: accessContract` in `packages/shared/src/contract.ts`.

## 5. Permissions
| Procedure | Check | Who passes by default | Entity/project limits |
|---|---|---|---|
| `account.me`, `account.switchOrganization` | `authed` | anyone signed in | n/a (personal) |
| `access.whoCanChangeAccess` | `member` + organization guard | all nine roles | none (returns names only) |
| `roles.list` (existing, used by Preview) | `settings.view` | owner, admin | – |
| `entities.list` (existing, used by the switcher) | `member` | all; filtered by entity limits | yes (2a) |

**Organization guard** (`apps/api/src/access/middleware.ts`, inside `memberMiddleware`, so it applies to both `member` and `memberPendingTwoStep`):
```ts
const expected = context.headers.get(ORGANIZATION_HEADER)          // absent → no check (API tools, tests)
if (expected && !isUuid(expected)) throw organizationChanged()
if (expected && session.activeOrganizationId && expected !== session.activeOrganizationId)
  throw organizationChanged()                                     // no query at all
const membership = await loadMembership(db, user.id, session.activeOrganizationId)
if (expected && membership?.organizationId !== expected) throw organizationChanged()   // no write-back
if (membership && membership.organizationId !== session.activeOrganizationId) await setActiveOrganization(...)
```
`resolveMembership` is split into load + write-back so the refusal happens before the write. `getMe` keeps using the combined helper.

**Web-side checks (cosmetic, mirrored by the server):** sidebar, tabs, ⌘K and the module `beforeLoad` use `hasPermission(effectivePermissions, module, 'view')`. `effectivePermissions` is the preview role's permissions when previewing, otherwise `me.member.permissions`. Preview is shown to members with `settings.view` (owners and admins by default; a 3c custom role with Settings view would also get it).

## 6. Shell decisions (the eight asked for)

### 6.1 Route structure
```
routes/__root.tsx                standalone 404 (signed out, with Sign in) and standalone 500/offline (shell failed)
routes/_auth.tsx …               unchanged
routes/_app.tsx                  guard: me (revalidateIfStale), nextStep redirects, bind tab organization,
                                 preload roles.list if a preview is stored; signed out on the splat → notFound({ routeId: rootRouteId })
routes/_app/onboarding.tsx       + "access ended" panel (see 6.4)
routes/_app/two-step.setup.tsx   unchanged
routes/_app/_shell.tsx           AppShell layout; validateSearch {entity}; search.middlewares [retainSearchParams(['entity'])];
                                 notFoundComponent = NotFoundPage (in shell); errorComponent = ShellRouteError
routes/_app/_shell/index.tsx     Home (replaces routes/_app/index.tsx, deleted)
routes/_app/_shell/{land,projects,estates,sales,finance,hr,compliance,documents,reports}.tsx
                                 moduleRoute('sales'): beforeLoad guard + staticData { module, title } + ComingSoonPage
routes/_app/_shell/$.tsx         splat → throw notFound() → shell 404
```
- **Module routes:** one small file per module, with typed `to: '/sales'` now and later. When Sales ships, `sales.tsx` becomes its layout (`Outlet`) and keeps the same `moduleRoute('sales')` guard. `hidden` status makes `beforeLoad` throw `notFound()`.
- **403:** `moduleRoute` `beforeLoad` throws `ModuleForbiddenError(module)` when the effective permissions lack `view`. The route's error component renders the 403 page inside the shell, and no loader runs, so no module data is requested. The `_shell` layout also checks the leaf match's `staticData.module` against live permissions, so a role changed mid-session turns the open page into 403 when `me` refetches.
- **Deep links:** unchanged 2a behaviour. Signed out → `/sign-in?redirect=<href>` → back to the page, including `?entity=`.
- **Error boundaries:** `ShellRouteError` (router `defaultErrorComponent` inside the shell) dispatches as follows:
  - `ModuleForbiddenError` or `FORBIDDEN{permission}` → 403.
  - `NOT_FOUND` → `notFound()` → 404.
  - Network `TypeError` or a failed chunk import while offline → Offline page.
  - Anything else → 500, with `data.reference` when the server sent one.

  If `me` itself fails (500 or no network), the root `errorComponent` shows the same 500 or Offline page without the shell.
- **Try again:** `reset()` + `router.invalidate()`, with no full reload. The Offline page also does this on the `online` event.
- **Offline detection:** `lib/connection.ts` is a tiny store fed by TanStack Query's `onlineManager` (online/offline events), plus network failures. A fetch `TypeError` while `navigator.onLine` is true starts a `/rpc/health/check` probe every 3 s until it succeeds, which covers lie-fi. The banner shows within 2 s of the browser event. **Retry now** probes and refetches active queries.
- **Query client:** `networkMode: 'always'` for queries and mutations, so offline requests fail fast into the designed states instead of pausing silently. No retry while offline. `apiErrorMessage` returns "You're offline, so this wasn't saved. What you typed is still here." when the store says offline. Forms already keep their input (react-hook-form).
- **Scrolling:** window scroll (fixed sidebar), so the existing `scrollRestoration: true` restores position on back and forward. `defaultPendingComponent = PageSkeleton` (PageHeader skeleton plus content blocks in the final layout).

### 6.2 Navigation model
`apps/web/src/features/shell/nav.ts`:
```ts
type NavItem = {
  key: 'home' | 'land' | 'projects' | 'estates' | 'sales' | 'finance' | 'hr' | 'compliance' | 'documents' | 'reports'
  module: PermissionModule | null      // null = Home, always shown
  label: string                        // "Land & title", "Estates", "Reports"…
  to: LinkProps['to']                  // '/land' …
  icon: LucideIcon                     // lucide equivalents of the board icons
  group: 'overview' | 'land_assets' | 'revenue' | 'people'
  status: 'built' | 'soon' | 'hidden'  // ⟲ the "one switch per module"
  comingSoon?: string                  // spec copy
  keywords: string[]                   // ⌘K synonyms: "parcels C of O", "leads buyers subscriptions"…
}
export const NAV: readonly NavItem[]   // spec order
export function sidebarSections(perms): { heading: string; items: NavItem[] }[]   // > 6 entries → groups, else "Workspace"
export function mobileTabs(perms, roleKey: SystemRoleKey | null): NavItem[]        // Home + ≤ 3 from MOBILE_TAB_PRIORITY[roleKey], else first 3 viewable
export function moreItems(perms, roleKey): NavItem[]
```
- Mapping to permission modules: `facility → Estates (/estates)`, `analytics → Reports (/reports)`. `settings` stays off the sidebar until 3b.
- `MOBILE_TAB_PRIORITY` copies the spec table, keyed by `SystemRoleKey`.
- Pure functions with exhaustive unit tests over `DEFAULT_ROLES`.
- **⟲ Hide unbuilt modules (Q2):** set `status: 'hidden'` per module. The sidebar, tabs and ⌘K drop them and the routes 404. Nothing else changes.
- **⟲ Designer's hand-picked sidebars (Q4):** add `ROLE_SIDEBAR: Record<SystemRoleKey, NavKey[]>` intersected with view permissions. Custom roles keep the permission rule, and the e2e tables become hard-coded. "Reports" vs "Board pack" is one `label` string.

### 6.3 ⌘K
- **Library:** shadcn `Command` on **cmdk** (about 5 KB gzip, lazy). It gives a tested combobox and listbox with `aria-activedescendant`, arrow keys and grouping, and later supports async record search (`shouldFilter={false}`). A home-made list would be about 150 lines of fiddly accessibility code for no size win, since it's lazy either way. Run `pnpm why @radix-ui/react-dialog` after install to confirm one copy alongside the `radix-ui` umbrella.
- **Filter:** our own `commandFilter(value, search, keywords)`. It lower-cases, splits into tokens, and every token must prefix-match a word of label + keywords, in any order ("sales go" → Go to Sales). Scored by match position, so cmdk highlights the first result and Enter runs it.
- **Indexed in 3a:**
  - **Recently opened** (≤ 5, this device).
  - **Go to** Home and every viewable non-hidden module.
  - **Actions:**
    - Switch entity → each
    - Switch organization → each other (if > 1)
    - Theme: Light / Dark / System
    - Preview as role → nested list (owners and admins; loads `roles.list` when opened), plus Stop preview when previewing
    - Keyboard shortcuts
    - Sign out
    - Sign out everywhere else (`account.sessions.revokeOthers`, stays signed in, toast from `notice`)
- **Shortcuts:** one registry, `features/shell/shortcuts.ts` (`{ id, keys, label, group, run, allowInFields }`), and one window `keydown` listener (`use-shortcuts.ts`, no dependency).
  - Bindings: `mod+k` (also in fields), `?`, `[`, `g` then `h` (1 s window), `Esc` (handled by Radix).
  - Single keys are ignored in inputs, textareas, selects, contenteditable, while `isComposing`, or with modifiers.
  - The `?` dialog is generated from the same registry, so later bricks add rows by adding entries.
  - Kbd labels use ⌘ on Apple platforms, otherwise Ctrl (`lib/platform.ts`).
- **Performance:** the palette chunk is imported on `requestIdleCallback` after Home's first render and on pointer-enter or focus of the search bar. The key listener lives in the shell chunk. If ⌘K is pressed before the chunk arrives, the open state is set immediately and the dialog appears when the chunk resolves. Target ≤ 100 ms, measured in e2e.
- **Phone:** the search icon in the top bar opens the palette full-screen with 44 px rows.

### 6.4 Organization switching and the tab guard
1. **Binding:** `lib/tab-organization.ts` holds `expected: {id, name} | null` in memory and mirrors it to `sessionStorage['vento-tab-org']`. `_app` `beforeLoad` binds it from `me`.
2. **Sending:** `lib/orpc.ts` `RPCLink({ headers: () => expected ? { [ORGANIZATION_HEADER]: expected.id } : {} })`. The first `me` of a page load goes out without it.
3. **Refusal:** server as in §5.
4. **Reaction:** an `RPCLink` `interceptors` `onError` sees every call, including direct `client.*` calls. On `CONFLICT organization_changed` it calls `reloadForOrganizationChange()` once per page load (a loop guard), which does `window.location.replace('/')`. `toastApiError` ignores this reason.
5. **Notice after reload:** `_app` compares the stored `vento-tab-org` with `me.organization`:
   - Same → nothing.
   - Different and the old one is still in `me.organizations` → "You switched to {new} in another tab."
   - Not in the list → "You no longer have access to {old}."
6. **Focus:** `meQuery` gets `staleTime: 30_000`, `refetchOnWindowFocus: 'always'`. If `me.organization.id !== expected.id`, the same reload path runs, which also covers "come back to the tab" without any request.
7. **Switching in this tab:** `switchOrganization` mutation, then write `vento-tab-org` = target and `vento-notice` = "Switched to Lekki Partners Ltd", clear the preview, then `window.location.replace(NEXT_STEP_PATH[nextStep] ?? '/')`. **A full reload is deliberate.** It drops every in-memory cache, React state and pending request in one step. Assets are cached, so the cost is about one `me` round trip.
8. **Removed from the organization:** 2a's `removeMember` **deletes the removed person's sessions in that organization**, so their next request gets 2a's *Session expired* dialog. After signing in again they land in their next organization, and the device record `vento-last-org:{userId}` triggers "You no longer have access to Vento Homes Ltd.". With no other organization, `/onboarding` shows an "access ended" panel (message, **Sign out**, link "Set up a new organization"). This differs slightly from the spec's wording; see open question A.

### 6.5 Entity switcher state
- **URL is the truth:** `?entity=<uuid>` on the `_shell` layout. `validateSearch` is hand-written (UUID regex, no zod in the entry chunk). `retainSearchParams(['entity'])` keeps it across links and back/forward.
- **Device memory:** `localStorage['vento-entity:{orgId}']`. When the URL has no entity, the stored one is added with `replace` (silently dropped if no longer available). Choosing in the switcher updates both.
- **Options:** `entities.list({ status: 'active', pageSize: 100 })`, already filtered by limits on the server.
  - "All entities" plus each option, with the note "Holding company" or "SPV".
  - A member limited to exactly one entity gets a label, not a menu, and the param is ignored.
- **Invalid link** (unknown, archived, outside limits, made up): remove the param (`replace`) and toast "That entity isn't available. Showing all entities." The message is the same in every case.
- **What "current entity" means before modules exist:** `useCurrentEntity()` returns `{ entity: Entity | null, options, locked }`. In 3a only Home's date line uses it ("Vento Homes Ltd · Parkview Residences SPV Ltd · Thursday, 26 November 2026"). From brick 4 on, list procedures take an optional `entityId` input that the service intersects with `entityScope`. It's never a header and never authorization (decision 0014).

### 6.6 Theme and Preview as role
- **Theme:** `lib/theme.ts` with key `vento-theme` (`light | dark | system`; missing = light).
  - Toggles `.dark` and `style.colorScheme` on `<html>`.
  - Listens to `matchMedia('(prefers-color-scheme: dark)')` while on System.
  - Listens to `storage` events so other tabs follow.
  - The inline script in `index.html` already applies the theme before paint. Extend it to set `data-sidebar="collapsed"` from `vento-sidebar`, so `--sidebar-width` is right on first paint (CLS 0).
  - A unit test reads `index.html` and checks the storage keys match `lib/theme.ts`.
  - **Per device only.** ⟲ If you want it to follow the person across devices, that needs a user preference column and a procedure (small, later).
- **Preview:** `features/preview/preview-role.ts`, stored as `sessionStorage['vento-preview'] = { organizationId, roleId }` and ignored if the organization differs. Permissions come from `roles.list` (preloaded in `_app` `beforeLoad` when a preview is stored, so there's no flash of the admin's own nav).
  - Feeds `useEffectivePermissions()` and the role name on Home, the tabs and the 403 line ("Previewing as Sales").
  - The banner "Previewing as Sales. You still have your own access." sits above the top bar and offsets the layout, which is accepted as a deliberate shift on a user action. **Stop preview** clears it.
  - No request ever carries it.

### 6.7 Bundle budget
- **Today (2a production build, 25 Nov):** 139 KB gzip of JS in the entry's static graph (`index` 79.5 KB, router 19.6 KB, button and radix 16.1 KB, oRPC 10.5 KB…). That leaves about 60 KB for the shell.
- **Shell estimate:** radix DropdownMenu, Tooltip and Popper (about 15 KB), Sheet (Dialog, shared), shell code (about 12 KB), about 15 lucide icons (about 6 KB) → **about 175–185 KB**. Tight but inside.
- **Lazy, never in first load:**
  - cmdk and the palette
  - shortcuts dialog
  - 403, 500 and Offline pages
  - Coming soon pages (route chunks)
  - preview role list
  - org switcher menu content
  - `auth-client` (already lazy through `sign-out.ts`)
  - the session-expired dialog (already lazy)
- **Enforcement:** `vite.config.ts` gets `build.manifest: true`. New `apps/web/scripts/check-bundle.ts`:
  - Walks the manifest from `index.html` plus the `_app`, `_app/_shell` and `_app/_shell/index` route chunks (including the `?tsr-split=component` entries).
  - Gzips each file and prints a table.
  - Fails if first load is > 200 KB or any chunk is > 80 KB.
  - Run in CI after `pnpm build`. Report the before and after numbers in the PR (performance skill).
- **Fallback if over budget:** lazy-load menu contents (triggers stay static) before anything else.

### 6.8 Accessibility
- **Landmarks:** `<a class="skip-link" href="#main">Skip to content</a>` is the first focusable element. Then `<nav aria-label="Main">` (sidebar), `<header>` (top bar), `<main id="main" tabIndex={-1}>`, and on phones `<nav aria-label="Tabs">`.
- **Route change:** `useRouteFocus()` subscribes to the router's `onResolved`. When the pathname changes (not search-only, not the first load), focus moves to the page `h1` (`tabIndex={-1}`, rendered by `PageHeader`). `usePageTitle(title)` sets `document.title = "{Page} · {Organization}"` and records the recent page.
- **Sidebar collapse:** a button with `aria-expanded` and the label "Collapse"/"Expand sidebar", plus `[`. Collapsed items keep `aria-label` and show a Radix Tooltip on focus and hover. Below `lg` the sidebar is a Sheet (focus trapped, Esc closes, focus returns to the menu button).
- **Menus:** Radix DropdownMenu (arrow keys, typeahead, Esc). Visible focus ring is `ring-ring`.
- **Phone:**
  - Bottom tabs are ≥ 44 px with `pb-[env(safe-area-inset-bottom)]`; `index.html` viewport gets `viewport-fit=cover`.
  - The active tab has `aria-current="page"`.
  - No horizontal scroll at 375 px; long organization and entity names truncate with a tooltip.
- **Reduced motion:** `motion-reduce:` variants remove slide and scale on the sheet, palette and sidebar width.
- **Checking:** axe (WCAG 2.0/2.1/2.2 A and AA tags) in e2e, light and dark, at 375 and 1280.

## 7. UI

| Screen (SCREENS.md row) | Boards to follow | Design? | Built in 3a from |
|---|---|---|---|
| App shell | ExecutiveHome (+Dark), ExecutiveHomeMobile (+Dark), role homes and their Mobile boards (sidebars and tabs), Main (bottom nav) | yes, with the departures in the spec | `components/shell/*` |
| ⌘K command palette | ExecutiveHome (palette), Main | yes | `features/shell/command-palette.tsx` |
| Keyboard shortcuts help | – | pattern (dialog with a two-column list) | `features/shell/shortcuts-dialog.tsx` |
| 403 / 404 / 500 / offline banner / offline page | Error403, Error404, Error500, OfflineBanner, OfflinePage (+Mobile, +Dark, OfflineMobile) | yes, with departures | `components/errors/*` |
| Module placeholder (Coming soon) | – | pattern (EmptyState) | `features/shell/coming-soon-page.tsx` |
| Executive / role homes (header only) | ExecutiveHome header | partly | `features/shell/home-page.tsx` |
| Design system additions | Main, States | yes | `components/ui/*`, `components/*` |

- **States:** Home and Coming soon have no data, so they have loading (skeleton), offline and error states only. The entity switcher has loading (a skeleton the width of the label), error (label "All entities", retry on open) and the single-entity label. The 403 page has a loading state for the who-to-ask sentence (a fixed-height skeleton line, no shift).
- **Reuse:** `VentoMark` (`tone="navy"`, mark only when collapsed), `Button`, `Dialog`, `Sonner`, `SessionExpiredDialog`, `lib/format.ts` (date line: "Thursday, 26 November 2026", test pinned), `toastApiError`, `safeRedirect`.
- **New primitives:** shadcn `sheet`, `dropdown-menu`, `tooltip`, `command`, `skeleton`, `badge`, `kbd`, plus app-level `avatar` (initials only, no Radix Avatar), `page-header`, `empty-state`, `status-badge`. Popover isn't needed in 3a; it comes with the first combobox.
- **Tokens:** add `--sidebar-accent` (hover/active item background) and `--sidebar-active-foreground` from the board values to `styles.css` (no hex in components). The dark board uses navy `#080B1A` while DESIGN-NOTES and `styles.css` have `#0B0E1F`, the same as the dark page background. The ui-designer should confirm which before build.

## 8. Files

**packages/shared**
- `src/common/errors.ts`: `organization_changed` conflict reason; `INTERNAL_SERVER_ERROR` with `reference`
- `src/common/http.ts`: `ORGANIZATION_HEADER`
- `src/common/reference.ts` + `.test.ts`: `errorReference()`
- `src/common/text.ts` + `.test.ts`: `joinNames()` (moved from the API)
- `src/common/index.ts`: export the above
- `src/account/schema.ts`: `me.organizations`, `switchOrganizationInput`, `switchOrganizationOutput`
- `src/account/contract.ts`: `switchOrganization`
- `src/access/schema.ts`: `whoCanChangeAccessInput`, `whoCanChangeAccessOutput`
- `src/access/contract.ts`: `accessContract`
- `src/contract.ts`: register `access`

**apps/api**
- `src/access/context.ts`: split `resolveMembership` into `loadMembership` + `writeBackActiveOrganization`; `listActiveMemberships(db, userId)`
- `src/access/middleware.ts`: organization guard in `memberMiddleware`
- `src/access/who-can-grant.ts`: import `joinNames` from shared
- `src/lib/errors.ts`: `organizationChanged()`
- `src/app.ts`:
  - `clientInterceptors`: map non-ORPC or ≥ 500 errors to `INTERNAL_SERVER_ERROR {reference}`, log `{requestId, reference, stack}`
  - `requestId({ headerName: '' })` plus our own `X-Request-Id` response header, so a client can't choose the id
- `src/modules/account/account.service.ts`: `organizations` in `getMe`, `switchOrganization()`
- `src/modules/account/account.router.ts`: `switchOrganization`
- `src/modules/account/account.service.test.ts`: new cases
- `src/modules/access/access.service.ts` + `access.router.ts` + `access.service.test.ts`: `whoCanChangeAccess`
- `src/router.ts`: register `access`
- `src/test/router-client.ts`: `expectedOrganizationId` option → header
- `src/test/procedure-guard.test.ts`: organization-guard walk
- `src/test/isolation.test.ts`: `switchOrganization`, `whoCanChangeAccess`
- `src/test/e2e-fixtures.ts`: `team`, `multi-org`, `set-role`, `remove-member`
- `src/app.test.ts` (new): 500 reference in body equals the logged reference; client `X-Request-Id` ignored

**apps/web**
- `package.json`: `cmdk`; dev `@axe-core/playwright`; script `bundle:check`
- `index.html`: sidebar pre-paint in the inline script; `viewport-fit=cover`
- `vite.config.ts`: `build.manifest: true`
- `scripts/check-bundle.ts`: budget check
- `src/styles.css`: `--sidebar-width`, sidebar accent tokens, skip-link and safe-area utilities
- `src/router.tsx`: `defaultErrorComponent`, `defaultPendingComponent`, `staticData` typing (`module`, `title`)
- `src/routes/__root.tsx`: standalone `NotFoundPage` and `StandaloneError`
- `src/routes/_app.tsx`: guard additions (6.1, 6.4, 6.6)
- `src/routes/_app/index.tsx`: **delete** (temporary page)
- `src/routes/_app/onboarding.tsx`: access-ended panel
- `src/routes/_app/_shell.tsx`: shell layout, entity search, 404 and error components
- `src/routes/_app/_shell/index.tsx`: Home
- `src/routes/_app/_shell/{land,projects,estates,sales,finance,hr,compliance,documents,reports}.tsx`: module routes
- `src/routes/_app/_shell/$.tsx`: splat 404
- `src/components/ui/{sheet,dropdown-menu,tooltip,command,skeleton,badge,kbd}.tsx`: shadcn primitives
- `src/components/{avatar,page-header,empty-state,status-badge}.tsx`: app-level components
- `src/components/shell/app-shell.tsx`: layout, landmarks, skip link
- `src/components/shell/sidebar.tsx`, `sidebar-nav.tsx`: navy sidebar, groups, collapse, tooltips
- `src/components/shell/top-bar.tsx`: search button, entity switcher, avatar, menu button (md–lg)
- `src/components/shell/mobile-tabs.tsx`, `more-sheet.tsx`: phone navigation
- `src/components/shell/{entity-switcher,organization-switcher,user-menu}.tsx`: switchers and user menu
- `src/components/shell/{preview-banner,offline-banner,page-skeleton}.tsx`: banners and skeleton
- `src/components/errors/{forbidden-page,not-found-page,server-error-page,offline-page,shell-route-error}.tsx`: error pages and dispatcher
- `src/components/route-error.tsx`: **delete** (replaced by `components/errors`)
- `src/features/shell/nav.ts` + `nav.test.ts`: registry, sections, tabs, More
- `src/features/shell/module-route.ts`: `moduleRoute()`, `ModuleForbiddenError`
- `src/features/shell/{shortcuts.ts,use-shortcuts.ts}` + `shortcuts.test.ts`: registry and listener
- `src/features/shell/{command-palette.tsx,command-filter.ts}` + `command-filter.test.ts`: palette and matching
- `src/features/shell/shortcuts-dialog.tsx`: `?` help
- `src/features/shell/{home-page.tsx,greeting.ts}` + `greeting.test.ts`: Home
- `src/features/shell/coming-soon-page.tsx`: placeholder
- `src/features/shell/{use-page-title.ts,use-route-focus.ts,recent-pages.ts}` + `recent-pages.test.ts`: titles, focus and recents
- `src/features/organization/{tab-organization.ts,switch-organization.ts}` + `tab-organization.test.ts`: guard client side and notices
- `src/features/entity/{current-entity.ts,entity-search.ts}` + `current-entity.test.ts`: entity filter
- `src/features/preview/{preview-role.ts,use-effective-permissions.ts}` + `preview-role.test.ts`: preview
- `src/features/account/api.ts`: `meQuery` staleTime 30 s, focus refetch
- `src/features/account/sign-out.ts`: clear preview, recents and entity choices for this user
- `src/lib/orpc.ts`: header and `onError` interceptor
- `src/lib/query-client.ts`: `networkMode: 'always'`, no retry offline
- `src/lib/api-errors.ts` + test: offline copy, `errorReference` accessor, ignore `organization_changed`
- `src/lib/{theme,connection,platform,storage}.ts` + `theme.test.ts`, `connection.test.ts`: device state helpers
- `e2e/support/sign-in.ts`: wait for the Home greeting instead of "Welcome,"
- `e2e/auth/{sign-in,reset-password,accept-invitation}.spec.ts`, `e2e/onboarding/new-organization.spec.ts`: land on Home; "Sign out everywhere" becomes user menu or ⌘K "Sign out everywhere else" (stays signed in)
- `e2e/support/fixtures.ts`: `createTeamFixture`, `createMultiOrgFixture`, `setRole`, `removeMember`
- `e2e/support/axe.ts`: `expectNoA11yViolations(page)`
- `e2e/shell/{navigation,entity-switcher,preferences,switch-organization,error-pages}.spec.ts`

**Root**
- `.github/workflows/ci.yml`: `pnpm --filter @vento/web bundle:check` after build

## 9. Tests

**API (Vitest, real Postgres, `withRollback`, `clientAs`)**
| Area | Cases |
|---|---|
| `account.me` | `organizations` lists active memberships only (removed ones absent), with role names, ordered by name |
| `switchOrganization` | Happy path: session `activeOrganizationId` and `users.lastActiveOrganizationId` both updated. Not a member, removed, or random id → NOT_FOUND, nothing changed. Target role needs two-step and the user has none → `nextStep: 'two_step_setup'`. Current organization → no-op |
| Organization guard | Matching header passes. Header ≠ session organization → CONFLICT `organization_changed` with a **db stub that throws on any query** (proves no read). `entities.create` with a stale header → refused, no entity row, no audit row. Removed-elsewhere case (session org = header, membership falls back) → refused and the session is **not** written back. Malformed header → refused. Absent header → old behaviour |
| Guard walk (`procedure-guard.test.ts`) | Every procedure not in `PUBLIC_PROCEDURES` or the personal allow-list (`account.*`, `invitations.accept`, `onboarding.createOrganization`) answers CONFLICT `organization_changed` to a mismatched header. A new non-public procedure must be added to the list on purpose |
| `whoCanChangeAccess` | `hr` → owners, admins, HR staff, finance staff, in system order. Contacts ≤ 2, owners first, caller excluded, removed members excluded, other organizations' members never returned. Output has no email field (schema parse plus a JSON scan for `@`) |
| Isolation | `switchOrganization` with another organization's id → NOT_FOUND and session unchanged. `whoCanChangeAccess` only ever names own-organization people |
| Error reference | HTTP through `createApp`: a procedure whose db throws → 500, `data.reference` matches `/^ERR-[0-9A-F]{4}-\d{4}$/`, and the logger spy got the same reference and requestId. A client-sent `X-Request-Id` is ignored. No personal data in the log line |

**Web units (Vitest + Testing Library)**
- `nav.test.ts`: for each of the nine `DEFAULT_ROLES`, sidebar entries equal `NAV` filtered by `defaultRoleAllows(key, module, 'view')`, in spec order. Groups appear iff > 6 entries (pinned: owner, admin, finance, project manager, viewer grouped; land & legal, sales, HR, facility "Workspace"). Mobile tabs equal the spec table (hard-coded expected values). A custom role gets its first three in sidebar order. `hidden` hides everywhere.
- `command-filter.test.ts`: case, word order ("sales go"), keyword hit ("parcels" → Land & title), no match → 0.
- `shortcuts.test.ts`: single keys ignored in input, textarea and contenteditable and while composing; `mod+k` works in fields; `g h` sequence and timeout.
- `theme.test.ts`: default light; system follows a mocked `matchMedia` change; storage keys match `index.html`.
- `current-entity.test.ts`: invalid, archived or outside-limits id → all + toast flag; single-entity member → locked; stored choice is per organization.
- `tab-organization.test.ts`: notice rule (same / switched elsewhere / access ended); the reload loop guard.
- `preview-role.test.ts`: ignored for another organization; cleared on switch.
- `recent-pages.test.ts`: ≤ 5, deduped, per user and organization, cleared on sign-out.
- `greeting.test.ts`: morning, afternoon, evening boundaries; date line format.
- `api-errors.test.ts`: offline copy; reference extraction.

**Playwright (`e2e/shell/`, desktop + mobile projects, `vento_e2e` database via the existing web servers)**
Fixtures (new CLI commands in `apps/api/src/test/e2e-fixtures.ts`, unique organization names per run so specs stay parallel):
- `team`: Vento Homes Ltd-style organization, three entities, one member per role, Kunle limited to Parkview, TOTP secrets for owner, admin, finance and HR.
- `multi-org`: Tunde, finance in A and owner in B, plus a B variant whose role needs two-step he hasn't set up.
- `set-role <email> <role>`.
- `remove-member <email>`.

| Spec | Covers |
|---|---|
| `navigation.spec.ts` | Each of the nine roles: sidebar link names (desktop) and tab names (mobile) equal the table derived from `default-roles.ts`. Grace types `/hr` → 403 names the owner, and the network log shows only `account/me`, `entities/list`, `access/whoCanChangeAccess` (no HR data). ⌘K "sal" Enter → Sales Coming soon; "sales go" works. `?` dialog. `g h`. Skip link is the first tab stop. Focus lands on the `h1` after navigation. Tab title "Sales · {org}". Back/forward keep `?entity` and scroll. Role changed mid-session (`set-role`) → on tab focus the sidebar updates and the open `/finance` turns 403. Palette opens ≤ 100 ms after prefetch. axe on Home, palette, Coming soon |
| `entity-switcher.spec.ts` | Pick Parkview → URL `?entity=`, survives navigation and reload. Kunle sees a label with no menu. Shared link with archived, foreign or made-up id → all + toast. Choice remembered per organization |
| `preferences.spec.ts` | First visit is light. Dark persists over reload with **no flash** (an init script records the `<html>` class at `DOMContentLoaded`). System follows `page.emulateMedia({ colorScheme })`. `[` collapse persists. **CLS = 0** on Home load (buffered `layout-shift` observer). Preview as Sales → banner, Sales' sidebar and tabs, survives reload, ends on Stop and in a new tab. Non-admin has no Preview entry. Reduced motion has no transform animations. axe light/dark × 375/1280 |
| `switch-organization.spec.ts` | 2-click switch → Lekki Home + toast. Single-organization member sees a label. **Two tabs:** switch in tab B; tab A's next request (`page.evaluate` fetch with the stale header) → 409 and nothing written; tab A reloads with "You switched to Lekki Partners Ltd in another tab." Target role needs two-step → Set up two-step first. `remove-member` → session-ended dialog → sign in → next organization with "You no longer have access to …"; with no other organization → onboarding access-ended panel with Sign out |
| `error-pages.spec.ts` | Unknown path signed in → 404 in shell with the last three pages and Search opening ⌘K. Signed out → standalone 404 with Sign in. 500: `page.route` returns an oRPC 500 body with a reference → page shows it, Copy toasts "Reference copied", Try again recovers without a reload. `context.setOffline(true)` → banner within 2 s; opening an unvisited page → Offline page; back online → loads by itself. "Sign out everywhere else" offline → offline copy and still signed in. `ageSessions` → session-expired dialog over Home. axe on each page |

Existing 2a specs are updated to land on Home (§8).

## 10. Build order
1. **Shared (½ day, blocks both tracks):** errors, header constant, `errorReference`, `joinNames`, `me.organizations`, `switchOrganization`, `accessContract`.
2. **In parallel:**
   - **Backend (1–1½ days):** guard + split membership helper → `getMe` organizations, `switchOrganization` → `whoCanChangeAccess` → 500 interceptor and request id → unit, guard-walk and isolation tests → e2e fixture commands.
   - **Frontend (4–5 days):**
     1. Primitives and tokens.
     2. `nav.ts` + tests.
     3. Route restructure (`_shell`, module routes, splat), deleting the temporary page.
     4. Static shell from the boards (light, dark, 375/768/1280).
     5. Theme and sidebar pre-paint.
     6. Entity switcher.
     7. Error and offline pages, connection store, query-client changes.
     8. ⌘K, shortcuts, `?`.
     9. Preview.
     10. Organization switcher + tab guard client (needs the backend's `switchOrganization` and header on about day 2).
3. **Then:** update the 2a e2e specs → `e2e/shell/*` → axe → `bundle:check` in CI → docs. Reviewer and ui-designer pass; security agent reviews the guard and the error interceptor (small, but it touches every request).

## 11. Environment
No new variables. Email provider (Postmark) is 3b; development keeps printing to the console.

## 12. Docs to change (the implementer commits these)
- **`docs/design/SCREENS.md`:**
  - App shell, ⌘K, 403/404/500/offline → `built`.
  - Keyboard shortcuts help and Module placeholder → `pattern`.
  - Executive home and Role homes → note "header only (3a)".
  - Design system row: add the 3a primitives.
- **`docs/design/CHANGES.md`:** the eleven departures from the spec table, plus "dark sidebar shade" if the ui-designer changes the token.
- **`docs/ARCHITECTURE.md`:**
  - Web layout: `_app/_shell`, `features/shell/nav.ts` as the navigation registry.
  - Request flow step 4: the organization guard and the header.
  - Step 6: `INTERNAL_SERVER_ERROR` with a reference matching the log line.
  - Bundle check in Quality gates.
- **`docs/journeys/01-onboarding-and-access.md`:** J-ONB-05 **Test** line becomes the five `e2e/shell/*` specs; the "removed mid-session" watch-for reads "session ends (2a); after signing in again: next organization with 'You no longer have access to …', or the access-ended panel with Sign out"; status `built` when merged. J-ONB-01 step 7 and J-ONB-02 step 4 are already updated in the working tree.
- **`docs/DOMAIN.md`:** the three terms already added (Active organization, Current entity, Role preview) are enough. Add one line under Active organization: "Each browser tab names the organization it is showing; the server refuses a request from a tab that's out of date."
- **`docs/specs/README.md`:** app-shell status `planned` → `built`.
- **Skills:**
  - `add-module`: "Replace the module's placeholder route and set its `status: 'built'` in `features/shell/nav.ts`; add record search to ⌘K; procedures must use `member` (the guard-walk test enforces it)."
  - `add-list-page`: "Read `useCurrentEntity()` and pass `entityId`; the service intersects it with `entityScope`; use `PageHeader` (title, focus, recents)."
  - `testing-patterns`: `clientAs(..., { expectedOrganizationId })`, `e2e/support/axe.ts`.
  - `design-system`: shell components and the lazy-load rule for palette and menus.
- **Decision records:** 0013 and 0014 below; add both rows to `docs/decisions/README.md`.

### Decision record 0013
```markdown
# 0013 · Each tab names its organization; the server refuses a mismatch

- **Date:** 2026-11-26
- **Status:** proposed

## Context
A person can belong to several organizations, and the active organization lives on the session, which every tab of the browser shares. If they switch organization in one tab, another tab still shows the first organization's name and data, and its next request would silently read or change the second organization's data. Organization isolation (non-negotiable 1) must hold from the person's point of view, not only the server's.

## Decision
The web sends the organization its tab is showing in an `x-vento-organization` header on every oRPC call. `memberMiddleware` compares it with the session's organization before any query, and with the resolved membership before any write-back. Any mismatch is refused with `CONFLICT organization_changed`. The organization used for the request still comes only from the session; the header can only make a request fail. The web answers that error, or a `me` that names a different organization when the tab regains focus, with a full page reload and a notice. Switching organization in the same tab also ends in a full reload. `account.me` and `account.switchOrganization` are exempt, as are personal procedures that read no organization data, which are listed in the procedure-guard test.

## Consequences
- No request from an out-of-date tab can read or write another organization's data, including requests already in flight during a switch.
- Every new procedure that touches organization data must be built on `member` (or `memberPendingTwoStep`); the guard-walk test fails otherwise.
- Clients without the header (scripts, tests) keep working, with the session as the only source.
- A reload costs about one round trip; in-memory state in other tabs is discarded on purpose.

## Alternatives considered
- Organization in the URL (`/o/:org/...`) and in every input: puts the organization into request input, against non-negotiable 1, and lengthens every link.
- One session per tab (organization in sessionStorage-scoped cookies): Better Auth sessions are cookie-wide; would need a second session mechanism.
- BroadcastChannel only: helps only open tabs on the same device and can't stop a request already sent.
- Soft in-place reset (clear caches, navigate): easy to miss a store or a pending request; a reload is simpler and certain.
```

### Decision record 0014
```markdown
# 0014 · The current entity is a view filter in the URL, never an access input

- **Date:** 2026-11-26
- **Status:** proposed

## Context
Finance, payroll, contracts and bank data belong to entities (SPVs), and members can be limited to some entities. The shell adds an entity switcher. We must decide where the choice lives and what it means to the server before any entity-owned module ships.

## Decision
The chosen entity is held in the page address (`?entity=<id>`), kept across navigation, and remembered per organization on the device. It is a filter only. Procedures that support it take an optional `entityId` input; the service intersects it with the member's entity limits (`entityScope`), so an entity outside the limits returns an empty list or NOT_FOUND, exactly like one that doesn't exist. It is never a header and never part of the session. The web drops an unavailable entity from a link with one neutral message.

## Consequences
- Links carry the entity, so shared links and back/forward work.
- Access stays defined in one place (member entity limits); the switcher can't widen it.
- Every entity-aware list procedure must accept `entityId` explicitly and test the intersection.

## Alternatives considered
- Entity on the session (like the organization): breaks shared links and makes two tabs fight over one value.
- Entity in a request header: invisible in links, and invites treating it as authorization.
- Local storage only: not shareable, and lost when someone opens a link on another device.
```

## 13. Risks and open questions

**⟲ The spec's open questions (this plan assumes the recommended answer)**
| # | Recommended (planned) | If you pick otherwise |
|---|---|---|
| 1 | Four slices 3a–3d | Only later slices merge; 3a unchanged |
| 2 | Show unbuilt modules with "Soon" | Set `status: 'hidden'` per module in `nav.ts`; role tests then expect Home only; the Coming soon page stays for later |
| 3 | No bell and no Approvals link in 3a | Adding them needs a designed empty panel and a data source; about 1 day, and it adds to the bundle |
| 4 | Sidebar from view permissions; "Reports" | Add a `ROLE_SIDEBAR` table (6.2); e2e tables become hard-coded; the label is one string |
| 5 | Postmark in 3b, console in dev | No effect on 3a |
| 6 | Branding out of brick 3 | No effect on 3a |

**New questions this plan raises**
- **A. Removal vs. the spec's wording.** 2a deletes a removed member's sessions in that organization, so they see *Session expired* first, not an immediate move to the next organization. The plan keeps 2a's stricter rule and shows "You no longer have access to …" after they sign in again (or the access-ended panel with Sign out). *Recommended:* keep 2a's rule. The alternative, moving the session to the next organization, weakens a security decision.
- **B. Group headings.** "> 6 entries" also gives Finance (10) and Project manager (7) grouped sidebars; the spec names only owner, admin and viewer. *Recommended:* keep the rule as written. A threshold of 7 or more would ungroup PM but not Finance.
- **C. "Home usable within 1 s on slow 3G"** isn't reachable on a cold load (about 180 KB of JS at about 50 KB/s is over 3 s). *Recommended:* cold load measured against the performance skill (LCP ≤ 2.5 s on Fast 4G), and ≤ 1 s for a **warm** load on slow 3G (hashed assets cached, only `me` and `entities.list` on the wire).
- **D. 403 wording** uses the stored plural names: "for owners, admins, HR staff and finance staff", where the spec says "HR and finance". *Recommended:* accept, since the names are data and change with 3c custom roles.
- **E. Recently opened pages are cleared on Sign out** (page titles will later include buyer names; office PCs are shared, NDPA). *Recommended:* yes.
- **F. Accepting an invitation as an existing user** currently leaves them in their old organization. *Recommended (follow-up, not planned here):* make `invitations.accept` switch to the new organization, about a one-line change, with a guard-aware reload.
- **G. Preview gate** is `settings.view` (owners and admins by default). A 3c custom role given Settings view would also get Preview. *Recommended:* accept.
- **H. Theme per device only.** Per person needs a preference column and a procedure; later if wanted.

**Risks**
- **Bundle headroom is about 15–25 KB.** Mitigated by the CI check and the lazy list (6.7). Radix popper is the biggest unknown; measure after primitives land, before the shell code.
- **Duplicate Radix copies** from cmdk's own `@radix-ui/*` dependencies. Check with `pnpm why`; pin to the umbrella's versions if they differ.
- **The inline theme script** must stay in sync with `lib/theme.ts` (a test reads both). A future Content-Security-Policy needs a hash for it; none exists today.
- **TanStack details to verify early:** `notFound({ routeId: rootRouteId })` from `_app` `beforeLoad` renders the root's standalone 404; route errors inside `_shell` keep the shell mounted; `retainSearchParams` on a pathless layout. If the first fails, fall back to redirecting a signed-out unknown path to sign-in.
- **`networkMode: 'always'`** changes how every query behaves offline. Cached data still shows, but a page never opened before now shows the Offline page instead of a spinner. That's intended, and the e2e covers it.
- **Dark sidebar token** differs between the board (`#080B1A`) and DESIGN-NOTES (`#0B0E1F`, equal to the dark page). The ui-designer decides before build.
- **Request id hardening:** we stop accepting a client-sent `X-Request-Id`. Any proxy that sets one won't be correlated; log the proxy's id separately if devops needs it.
