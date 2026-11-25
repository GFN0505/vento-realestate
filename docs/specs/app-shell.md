# App shell (brick 3a)

- **Status:** approved (26 Nov 2026), in build
- **Module:** Platform
- **Journeys:** J-ONB-05 (new), J-ONB-01 (step 7 changed)
- **Screens:** see [Screens this slice touches](#screens-this-slice-touches)
- **Decisions:** 0013 (tab organization guard), 0014 (entity is a view filter). Builds on 0003 and 0010

## How brick 3 is sliced (recommendation)
Brick 2a was one large review. Brick 3 is cut into **four slices**. Each one can be tried in a single sitting and leaves the app working. The first is mostly screen work; the three after it each add one area of settings on top of the API that 2a already built and tested.

| Slice | What you can try at the end | Size |
|---|---|---|
| **3a App shell** (this spec) | Sign in and land on your Home in the real workspace. The sidebar shows only your role's modules. Switch theme, entity and organization. Use ⌘K and shortcuts. Preview any role as an admin. See the 403, 404, 500 and offline pages. The temporary signed-in page is gone. | Mostly frontend; 3 small API additions |
| **3b Team** | Settings with its left navigation. Invite up to 20 people, change roles and entity limits, resend or withdraw invitations, remove members, reset someone's two-step. The setup checklist appears on Home. Real emails go out through the chosen provider. | Screens on 2a's API, plus the email provider |
| **3c Roles and organization** | See the permissions matrix, copy a built-in role and edit it ("Site engineer"). Edit the organization profile. Add, edit and archive entities, with RC, TIN and VAT; a duplicate RC number is refused. | Screens on 2a's API, plus custom roles |
| **3d My security and passkeys** | Turn two-step on or off with a code, regenerate backup codes, see and end your sessions, and sign in with Face ID or Touch ID (passkeys). | New sign-in method; the security agent reviews it before merge |

**Why four slices, not three:** passkeys add a new way to sign in. They deserve their own review and their own security audit, separate from forty settings screens. Team comes before roles because inviting colleagues is what a new customer does first; custom roles can wait a week.

## Problem
Today a member signs in and sees a holding page. To start using Vento they need a workspace they can find their way around in: their own modules and nothing else, the right company (entity) in view, a way to jump anywhere fast, and pages that explain what went wrong when something does. People who work for two developer groups need to move between them without data from one ever appearing under the other's name.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **Every member** (Grace Umeh, sales) | Get to the right screen fast, on a laptop or a phone on site | Many times a day |
| **MD / owner** (Olumide Bankole) | See the whole group or one SPV at a time | Daily |
| **Admin** | Check what each role sees before giving it to someone | At setup, then when roles change |
| **Consultant or group accountant** (Tunde Ola) | Switch between the two developer groups they work for | Weekly |

## Success looks like
- Any module a member can use is **1 click** away on a laptop and **1–2 taps** away on a phone, or **⌘K plus 3 keystrokes**.
- **Zero layout shift and no theme flash** on load: the right theme and sidebar width are applied before the first paint (measured: layout shift score 0 in the e2e run).
- ⌘K opens **within 100 ms** of the key press. Home is usable **within 1 second** on a mid-range Android phone on a slow 3G profile. First-load JavaScript stays **under 200 KB** gzipped.
- Switching organization takes **2 clicks**. In tests, **no request ever reads or changes one organization's data while the screen shows another's name**, including with two tabs open.
- For each of the nine roles, the sidebar and mobile tabs **match the permission table exactly**. The test derives its expected result from the table.
- **No WCAG 2.2 AA failures** in an automated accessibility check, in light and dark, at 375 px and 1280 px.

## User flow
**Daily start (1 click after sign-in)**
1. Sign in (unchanged from 2a). Vento opens *Home*, or the page the person was trying to reach.
2. The sidebar shows the modules their role can view. Click one to open it. Each module shows a *Coming soon* page until its brick ships.

**Jump anywhere with ⌘K (keyboard only)**
1. Press ⌘K (Ctrl K on Windows), or tap the search bar.
2. Type "sal" → **Go to Sales** is highlighted → Enter.

**Switch entity (2 clicks)**
1. Top bar → **Entity: All entities**.
2. Pick **Parkview Residences SPV Ltd**. The choice is kept in the page address and remembered on this device for this organization.

**Switch organization (2 clicks; only for people in two or more)**
1. Click the organization name at the top of the sidebar (on a phone: **More** → the organization name).
2. Pick the other organization. Vento opens its *Home*. If the role there requires two-step and it isn't set up yet, *Set up two-step* comes first.

**Change theme (2 clicks)**
1. Click your avatar. 2. Pick **Light**, **Dark** or **System**. Light is the default.

**Preview as role (3 clicks; owners and admins)**
1. Avatar → **Preview as role** → **Sales**.
2. The sidebar, mobile tabs and Home become Sales'. A banner stays at the top: "Previewing as Sales". **Stop preview** returns to your own view.

## Navigation rules
**Sidebar** (navy, both themes; `lg` and wider). One entry per module, in this order, shown only if the member's role can **view** that module:

| Group | Entries |
|---|---|
| Overview | Home |
| Land & assets | Land & title · Projects · Estates |
| Revenue | Sales · Finance |
| People & governance | HR & payroll · Compliance · Documents · Reports |

- Group headings appear only when the sidebar holds more than six entries (owner, admin, viewer); shorter lists show a single "Workspace" heading, as on the role boards.
- Settings joins the bottom of the sidebar in 3b. Approvals joins Overview in brick 4. Sub-areas such as Subscriptions, Commissions, Site diary and Board pack become entries when their modules ship.
- Collapsible to icons with tooltips. The state is remembered on this device. `[` toggles it.
- Between 768 px and 1024 px the sidebar opens as a sheet from a menu button in the top bar.

**Mobile tabs** (below 768 px). Home, plus up to three modules, plus **More**. The modules come from a priority list per role, keeping only those the member can view:

| Role | Tabs after Home |
|---|---|
| Owner, Admin | Projects · Sales · Reports (Approvals replaces Sales in brick 4) |
| Land & legal | Land & title · Documents · Compliance |
| Project manager | Projects · Documents · Compliance |
| Sales | Sales · Documents · Compliance |
| Finance | Finance · Sales · Reports |
| HR | HR & payroll · Documents |
| Facility | Estates · Projects · Documents |
| Viewer | Projects · Sales · Reports |
| Custom role (3c) | The first three modules it can view, in sidebar order |

**More** opens a sheet with the rest of the role's modules, the organization switcher, the entity switcher, theme, Preview as role (owners and admins), Keyboard shortcuts and Sign out. When a module's own screens ship, its tab moves to the screen in the design (for example Diary, Receipts or Leads).

**Unbuilt modules.** A sidebar entry for a module that isn't built yet carries a small "Soon" tag and opens a designed *Coming soon* page at the module's real address (`/land`, `/sales`…), so links and ⌘K keep working when the module arrives. A member without view permission gets the *403* page instead, never a *Coming soon* page. See open question 2 for what happens before the first customer.

**Entity switcher.** "All entities" plus each active entity the member can access, each labelled "Holding company" or "SPV". A member limited to one entity sees its name as a label, with no menu. The choice is a filter for the pages that use it; it never grants access. Home ignores it until it has numbers to show.

**Organization switcher.** It appears only for people who belong to two or more organizations. Everyone else sees the organization name as a label.

## Acceptance criteria

### Role-based navigation and permissions
- **Given** each of the nine roles, **when** its member signs in, **then** the sidebar entries and mobile tabs equal the tables above, filtered by the role's view permission from the 2a default table. The test reads the table from the shared permissions file.
- **Given** Grace (sales), **when** she opens `/hr` by typing the address, **then** she sees the *403* page naming the people who can change her access, and no HR data is requested.
- **Given** a member whose role is changed while they're signed in, **when** they next open a page or come back to the tab, **then** the sidebar and tabs show the new role. If the open page is no longer allowed, it becomes the *403* page.
- **Given** a member whose new role requires two-step and who hasn't set it up, **then** the shell sends them to *Set up two-step* (2a rule) before anything else.
- **Given** an owner or admin, **then** **Preview as role** lists the nine roles (and custom roles from 3c). **Given** any other member, **then** the menu entry isn't shown. The roles and their permissions come from `roles.list`, which the server already limits to owners and admins.
- **Given** an admin previewing as Viewer, **then** every request still runs with the admin's own access (the preview changes navigation only), and the banner says so. **When** they reload the tab, **then** the preview continues. **When** they close the tab or click **Stop preview**, **then** it ends.

### Organization switching and isolation
- **Given** a person who belongs to Vento Homes Ltd and Lekki Partners Ltd, **when** they switch, **then** the server checks they're an active member of the target, makes it the active organization for this session and their default for next sign-in, clears everything cached in the browser, and opens *Home*.
- **Given** a switch request for an organization they don't belong to, or were removed from, **then** the answer is "not found", the same as for an organization that doesn't exist.
- **Given** two tabs on Vento Homes Ltd, **when** the person switches to Lekki Partners Ltd in one tab, **then** the other tab's next request is refused before it reads or writes anything. That tab reloads into Lekki Partners Ltd with the notice "You switched to Lekki Partners Ltd in another tab." The browser only tells the server which organization the tab expects; the server still takes the organization from the session.
- **Given** a member who is removed from the organization they're working in, **when** they make their next request, **then** they move to their next organization with "You no longer have access to Vento Homes Ltd." If they have no other organization, they see that message with **Sign out**.
- **Given** any request, **then** the organization still comes only from the session (non-negotiable 1). The isolation test from 2a is extended to the new procedures.

### Entity switcher
- **Given** Kunle (limited to Parkview Residences SPV Ltd), **then** the switcher shows "Parkview Residences SPV Ltd" as a label without a menu.
- **Given** a shared link with an entity the recipient can't access, an archived entity, or a made-up ID, **then** the page shows all their entities with the toast "That entity isn't available. Showing all entities." It never says whether the entity exists.
- **Given** a member picks an entity, **when** they open another page, **then** the entity stays selected, and reloading or sharing the link keeps it.

### Theme
- **Given** a first visit, **then** the theme is light. **Given** **System**, **then** the theme follows the device, including when the device changes while Vento is open.
- **Given** any choice, **then** it is remembered on this device and applied before the first paint (no flash of the wrong theme).
- **Given** dark mode, **then** the sidebar stays navy, and every screen in this slice passes AA contrast.

### ⌘K command palette
- **Given** any signed-in page, **when** ⌘K or Ctrl K is pressed (even inside a text field), **then** the palette opens with the cursor in it. Esc closes it and returns focus where it was.
- **Given** the palette, **then** it offers: **Go to** each module and page the member can open; **Switch entity** to each entity; **Switch organization** (if more than one); **Theme: Light / Dark / System**; **Preview as role** (owners and admins); **Keyboard shortcuts**; **Sign out**; **Sign out everywhere else** (until 3d brings the sessions list). It also shows up to five **Recently opened** pages from this device.
- **Given** typing, **then** matching ignores case and word order ("sales go" finds **Go to Sales**), and the first result is highlighted so Enter runs it.
- **Given** no match, **then** it shows the filtered-empty copy below. Search for records (units, buyers, documents) is added by each module as it ships.
- **Given** a phone, **then** the palette opens full screen from the search icon, with 44 px rows.

### Keyboard
- `?` opens *Keyboard shortcuts*; ⌘K / Ctrl K opens the palette; `[` collapses or expands the sidebar; `g` then `h` goes Home; Esc closes any sheet, menu or dialog. Single-key shortcuts never fire while typing in a field.
- Every control in the shell can be reached and used with the keyboard. A "Skip to content" link comes first. Menus use arrow keys. Focus is visible everywhere.
- After a page change, focus moves to the page title and the browser tab title becomes "{Page} · {Organization}" (for example "Home · Vento Homes Ltd"), so screen readers announce where you are.

### Error and offline pages
- **Given** an address that doesn't exist, or a record that's missing or outside the member's limits, **then** the *404* page appears inside the shell, with **Search** (opens ⌘K), the last three pages opened on this device, and **Go to home**. Signed out, the same page appears without the shell and offers **Sign in**.
- **Given** the server fails, **then** the *500* page appears inside the shell with a reference the person can copy. The reference matches the server log entry for that request. If the shell itself can't load, the page appears on its own. **Try again** retries without a full reload.
- **Given** the connection drops, **then** the offline banner appears above the page within 2 seconds and disappears when the connection returns. **Given** a save is attempted offline, **then** nothing is lost: what was typed stays, and the form says it couldn't save.
- **Given** a page whose data hasn't loaded opens while offline, **then** the *Offline* page appears with **Try again**. It retries by itself when the connection returns.
- **Given** the session expires anywhere in the shell, **then** 2a's session-expired dialog appears over the page and the page stays as it was.

### Phone, motion and loading
- **Given** 375 px width, **then** nothing scrolls sideways, every target is at least 44 px, and the bottom tabs sit above the phone's home indicator (safe area).
- **Given** "reduce motion" is on, **then** the sidebar, sheets and palette appear without sliding or scaling.
- **Given** a page loading, **then** its content area shows a skeleton in the final layout while the shell stays in place. Moving the pointer over a sidebar entry, or touching it, starts loading that page.
- **Given** back and forward, **then** they move between pages, keep the selected entity, and restore the scroll position.

## Excellence checklist, applied
| Line | How this slice meets it |
|---|---|
| Every action in ⌘K | All shell actions listed above, including theme, entity, organization and preview |
| Shortcuts with `?` | ⌘K, `?`, `[`, `g h`, Esc; the list is generated from one registry, so later bricks add theirs to it |
| Remembered preferences | Sidebar collapsed, theme, last entity per organization, recently opened pages: per device |
| No layout shift | Theme and sidebar width set before first paint; skeletons match the final layout; long names truncate with a tooltip rather than wrap |
| URLs hold state | Entity in the address; every module and error page has its own address; preview survives a reload |
| Feels instant | Pages preload on hover and touch; ⌘K loads in the background after Home so it opens without delay |
| Weak connection | Shell code is split by page; the offline banner and page are honest about what works |
| Light and dark | Every screen built in both, checked for AA contrast |
| Words | Domain terms, sentence case, no codes on screen except the error reference |

## Behind the scenes
- **New API procedures (small):**
  - `account.me` also returns the person's active organizations (name and role).
  - `account.switchOrganization` checks membership, updates the session and the default for next sign-in, and returns the next step (for example two-step setup).
  - `access.whoCanChangeAccess({ module })` returns the plural role names that can view the module and up to two active owners or admins by name, for the *403* page. It never returns emails.
- **Tab guard.** Each request from the web app names the organization the tab expects. A mismatch is refused with "organization changed" before any read or write.
- **Error reference.** Every API error response carries its request ID; the *500* page shows it in a short form (`ERR-7F3A-1125`). Personal data never goes into logs or error reports.
- **Audit.** Nothing new is audited. Switching organization and previewing a role change no data and no access.
- **Removed:** the temporary signed-in page and its route.

## Screens this slice touches
| Screen (row in SCREENS.md) | Boards | What 3a builds |
|---|---|---|
| App shell | [ExecutiveHome](../design/claude-design/ExecutiveHome.dc.html), [ExecutiveHomeMobile](../design/claude-design/ExecutiveHomeMobile.dc.html), role homes and their Mobile boards (sidebars and tabs), [Main](../design/claude-design/Main.dc.html) (bottom nav) | Sidebar, top bar, entity and organization switchers, user menu, preview banner, mobile tabs and More sheet |
| ⌘K command palette | [ExecutiveHome](../design/claude-design/ExecutiveHome.dc.html) (palette), [Main](../design/claude-design/Main.dc.html) | Navigation and shell actions; no record search yet |
| Keyboard shortcuts help (`?`) | – | Pattern: dialog with a two-column list |
| 403, 404, 500, offline banner and page | [Error403](../design/claude-design/Error403.dc.html), [Error404](../design/claude-design/Error404.dc.html), [Error500](../design/claude-design/Error500.dc.html), [OfflineBanner](../design/claude-design/OfflineBanner.dc.html), [OfflinePage](../design/claude-design/OfflinePage.dc.html) and their Mobile and Dark boards | All five, with the departures below |
| Module placeholder (new row) | – | Pattern: empty state per module |
| Executive home, Role homes | [ExecutiveHome](../design/claude-design/ExecutiveHome.dc.html) (header only) | Greeting and date line only; the numbers, queue and panels come with their modules |
| Design system | [Main](../design/claude-design/Main.dc.html), [States](../design/claude-design/States.dc.html) | Sheet, DropdownMenu, Popover, Command, Tooltip, Skeleton, Badge and StatusBadge, Avatar (initials), Kbd, EmptyState, PageHeader |

## Departures from the approved designs
To be logged in `docs/design/CHANGES.md` when built.

| Board | Change | Why |
|---|---|---|
| Shell top bar | No Approvals link and no notifications bell yet | Nothing feeds them until brick 4; an empty bell is clutter (open question 3) |
| User menu | Theme is Light / Dark / System instead of a Dark mode switch; no "AI suggestions" switch; Settings arrives in 3b | Owner's decision on themes; the AI add-on comes later |
| Sidebar | Built from the role's view permissions, one entry per module; "Board pack" becomes "Reports"; labels in sentence case | One rule that also works for custom roles; Reports holds dashboards, returns and board packs (open question 4) |
| Sidebar header | Shows the organization name under the Vento lockup; it's the organization switcher for people in two or more | The boards have no organization switching |
| Entity switcher | Notes say "Holding company" or "SPV", not project counts | There are no projects yet |
| Mobile tabs | Home plus three modules instead of sub-area tabs (Diary, Receipts, Leads…) | Those screens don't exist yet; each tab moves when its screen ships |
| 403 | Names owners and admins as the people who can change access; no **Request access** button | Only owners and admins change access; requests need Approvals (brick 4) |
| 404 | "archived" instead of "deleted or merged" | Vento archives; nothing is deleted |
| 500 | No "your work is saved up to 14:32" line; no status page link | We can't promise it on every page; there's no status page yet |
| Offline page and banner | No list of pages available offline; the banner doesn't mention saved receipts | The offline cache and queue arrive with the site diary brick |
| Preview as role | A banner stays visible while previewing; buyer portal isn't in the list | Nobody should forget they're previewing; the portal comes later |

## UI copy
| Where | Copy |
|---|---|
| Sidebar groups | "Overview" · "Land & assets" · "Revenue" · "People & governance" · "Workspace" |
| Sidebar entries | "Home" · "Land & title" · "Projects" · "Estates" · "Sales" · "Finance" · "HR & payroll" · "Compliance" · "Documents" · "Reports" · tag "Soon" · "Collapse" / "Expand sidebar" |
| Top bar | "Search or run a command…" with "⌘K" (Windows: "Ctrl K") · "Entity" · "All entities" · notes "Holding company" / "SPV" |
| Organization switcher | Heading "Organizations" · each row: name and "Owner" / "Finance"… · tick on the current one |
| User menu | Name, then "Finance · aisha@ventohomes.ng" · "Theme" with "Light" "Dark" "System" · "Preview as role" · "Keyboard shortcuts" · "Sign out" |
| Preview banner | "Previewing as Sales. You still have your own access." · **Stop preview** |
| Home greeting | "Good morning, Olumide" (afternoon, evening) · "Vento Homes Ltd · All entities · Thursday, 26 November 2026" |
| Home body (until modules ship) | "Your home fills in as modules arrive: the numbers that matter to you as Finance, and the work waiting for you." · Tip: "Press ⌘K anywhere to jump to a page or run an action." |
| Coming soon page | Title: the module name · badge "Coming soon" · one line (below) · **Back to home** |
| Coming soon lines | Land & title: "Track parcels from purchase to perfected title: survey plans, C of O, governor's consent and encumbrances." · Projects: "Run phases, budgets, BoQs, contractors, purchase orders and the site diary." · Estates: "Manage handed-over estates: service charge, utilities and maintenance." · Sales: "Sell off-plan: leads, units, subscriptions, payment plans and commissions." · Finance: "Receipts, ledgers per entity, FX, construction finance and tax." · HR & payroll: "Staff, site workers and payroll with PAYE, pension and NHF." · Compliance: "Permits, buyer KYC, AML reviews and the UBO register." · Documents: "Contracts and letters from templates, with approvals and e-signature." · Reports: "Dashboards, project returns and board packs." |
| ⌘K | Placeholder "Type a page or action" · groups "Recently opened", "Go to", "Actions" · footer "↑↓ to move · ↵ to open · Esc to close" · empty: "No pages or actions match "{text}"." |
| Keyboard shortcuts | Title "Keyboard shortcuts" · "Search or run a command ⌘K" · "Show shortcuts ?" · "Collapse sidebar [" · "Go to home G then H" · "Close Esc" |
| 403 | Title "You don't have access to HR & payroll" · "HR & payroll is for owners, admins, HR and finance. Ask Olumide Bankole (owner) to change your access." (roles and names come from the server) · "You're signed in as Grace Umeh · Sales" · **Go to your home** |
| 404 | Title "We can't find that page" · "The link may be old, or the record may have been archived. Try searching for it." · **Search** · "Recently opened:" · **Go to home** (signed out: **Sign in**) |
| 500 | Title "Something went wrong on our side" · "Anything you saved before this is safe. Try again, or quote this reference if it keeps happening." · "Reference ERR-7F3A-1125" · **Copy** · **Try again** · toast "Reference copied" |
| Offline banner | "You're offline. You can keep reading; saving resumes when you reconnect." · **Retry now** |
| Offline page | Title "You're offline" · "This page needs a connection to open. We'll load it as soon as you're back." · **Try again** |
| Save attempted offline | "You're offline, so this wasn't saved. What you typed is still here." |
| Organization switching | Toasts: "Switched to Lekki Partners Ltd" · "You switched to Lekki Partners Ltd in another tab." · "You no longer have access to Vento Homes Ltd." |
| Entity not available | Toast "That entity isn't available. Showing all entities." |
| Sign out | Toasts "Signed out" · "Signed out of 3 other devices" |

## Out of scope
- Settings pages, the setup checklist and real emails (3b); custom roles, organization profile and entities (3c); My security and passkeys (3d).
- Notifications panel and preferences, the Approvals link and inbox, **Request access** (brick 4 or the first notification source).
- Record search in ⌘K, and Ask Vento (each module adds its records; Ask Vento comes with the AI add-on).
- Role-home numbers, queues and panels (with their modules).
- Pages kept for offline use, the offline save queue and "Waiting to sync" (site diary brick).
- Project switcher (Projects brick). Branding (see open question 6). My profile (name) and changing email.

## Owner's decisions (26 Nov 2026)
All recommendations in this spec and the plan were approved:
1. Brick 3 is four slices: 3a shell, 3b team, 3c roles and organization, 3d My security and passkeys.
2. Unbuilt modules the role can view show in the sidebar with a "Soon" tag and a Coming soon page (one switch per module hides them before the first customer).
3. No notifications bell or Approvals link until brick 4.
4. The sidebar follows each role's view permissions; "Board pack" is "Reports".
5. Email provider: Postmark, connected in 3b; console in development; named in the privacy notice with a data processing agreement before launch.
6. Branding moves to the first customer-facing document.
7. A removed member is signed out of that organization at once and sees "You no longer have access" at the next sign-in (2a's rule).
8. Speed: Home within 1 s on a repeat visit over slow 3G; first visit LCP ≤ 2.5 s on Fast 4G.
9. Recently opened pages in ⌘K are cleared on sign-out.
10. Accepting an invitation as an existing user switches to the new organization (in 3a).
11. Theme is remembered per device.
12. **Modules a role can't view are never shown**: not in the sidebar, mobile tabs or More, ⌘K results, shortcuts, Home, or Preview as role. Only a direct link (e.g. pasted by a colleague) reaches the 403 page that names who can grant access.
Plan questions B (group headings above 6 entries), D (role names from data on the 403 page), G (Preview needs settings.view) and H accepted as recommended.

## Open questions (answered above)
1. **Four slices (3a–3d) instead of three.** *Recommended:* yes, as in the table at the top. Passkeys get their own review and security audit.
2. **Modules that aren't built yet.** Show them with a "Soon" tag and a *Coming soon* page, or hide them? *Recommended:* show them now, so you can review role-based navigation hands-on. Hide any still unbuilt before the first customer goes live; this is a single switch per module.
3. **Notifications bell and Approvals link.** *Recommended:* leave both out of the top bar until something feeds them: Approvals in brick 4, the bell with the first notification source (approvals or receipts). Security alerts stay email-only.
4. **Sidebar from permissions, not the designer's hand-picked lists.** The boards give, for example, Land & legal no Sales entry, even though the role can view Sales. *Recommended:* derive the sidebar from view permissions. It's one rule that also works for custom roles, and you can tighten a role in 3c if an entry isn't wanted. Also, call the analytics module "Reports" rather than "Board pack".
5. **Email provider (wired in 3b).** *Recommended:* **Postmark**. It is built only for transactional email and has a long deliverability record, which matters for invitations, resets and security alerts; it keeps a separate stream for bulk mail (later buyer reminders); and it keeps 45 days of message history, which helps support. Resend is a fine alternative with a nicer developer experience. Development keeps printing to the console. Both are hosted abroad, so the privacy notice must list the provider as a processor (NDPA 2023), with a data processing agreement signed before launch.
6. **Branding (logo and document colours).** *Recommended:* move it out of brick 3 and build it with the first customer-facing document or email from the developer (receipt or offer letter). That is when a logo has somewhere to appear, and when file storage and the document letterhead are built. The organization profile (name, state, financial year) stays in 3c.

## Later slices
**3b Team.** The settings layout with its left sub-navigation (SetOrg and DSAdditions boards; on phones the SettingsMobile list), showing only sections that exist. Settings joins the sidebar and the user menu. *Team members* (RolesSettings board): a list of members and pending invitations with role, entities, two-step status and last active. **Invite people** opens a sheet for up to 20 emails, a role each and optional entity limits, sent with **Send 3 invitations**. Pending invitations can be resent or withdrawn. Role and limits are changed in a side sheet. Removing a member is confirmed ("They lose access to Vento immediately. Their history stays under their name."). An owner or admin can reset someone's two-step. All the rules, errors and toasts from the 2a spec apply. The setup checklist (ChecklistRow) appears on Home for owners and admins: organization, first entity and two-step are already ticked, "Invite your team" is the first open item, and more items appear as their features ship. Postmark sends the real emails. Journey J-ONB-02 completes, tested by `e2e/settings/invite-members.spec.ts`.

**3c Roles and organization.** *Permissions* (SetPermissions and PermissionsMobile boards, PermissionCell): the role × module matrix for the nine built-in roles, read-only. **Duplicate role** copies one into an editable custom role ("Site engineer"): a name, actions per module, and whether two-step is required. A custom role can be deleted only when nobody holds it. Changes apply on members' next request and are audited, and each role has **Preview this role**. The "up to a limit" cell state arrives with approval rules in brick 4. *Organization* (SetOrg board): name, head office state and financial year. *Entities*: list, add, edit and archive, with RC number, TIN and VAT registration. A duplicate RC number is refused with the other entity's name. Archiving warns about members limited only to that entity, and the last active entity can't be archived. Bank accounts, UBOs and directors stay with Finance and Compliance.

**3d My security and passkeys.** *My security* (SecuritySettings and SecurityMobile boards). Turn two-step on, or off where the role allows it; turning it off asks for a current code (2a decision 11). Regenerate backup codes, shown once. See active sessions (device, masked IP, last active, "This device") and end one, or **Sign out everywhere else**. See which roles must use two-step. **Passkeys:** add one with Face ID, Touch ID or Windows Hello, name it, remove it, and use **Sign in with a passkey** on the sign-in page. Adding or removing a passkey sends a security alert and is audited. The 3d spec will ask you to decide whether a passkey sign-in counts as two-step. *Recommended:* yes, because a passkey is tied to the device and checks your face or fingerprint. Members who must use two-step keep their authenticator app and backup codes as the fallback. The security agent audits 3d before merge.
