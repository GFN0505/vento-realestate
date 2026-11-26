# Team (brick 3b)

- **Status:** draft
- **Module:** Platform
- **Journeys:** J-ONB-02 (now the full screen flow), J-ONB-06 (new: change access, reset two-step, remove a leaver), J-ONB-01 (step 7: the setup checklist)
- **Screens:** see [Screens this slice touches](#screens-this-slice-touches)
- **Decisions:** builds on 0003 (organization contains entities), 0010 (Vento owns roles and access), 0013 (tab organization guard); app-shell owner's decisions 5 (Postmark), 7 (removal), 12 (never show what a role can't view); feature-flags owner's decisions 2 and 3 (plan hints for owners only). A short decision record for the email transport, sender domain and bounce webhook is the architect's to write.
- **Branch:** `brick/03b-team`, cut from `brick/03-feature-flags` (PR #4 merges first)

## How 3b is cut (recommendation)
One slice for you to try, built as **two pull requests** so your Postmark setup never blocks the review:

| PR | What you can try | Waits on |
|---|---|---|
| **3b Team** | Settings in the sidebar, the *Team* page, inviting up to 20 people, changing access, resending and withdrawing invitations, removing people, resetting someone's two-step, the setup checklist on Home. Emails still land in the development mailbox (`pnpm mail`). | Nothing |
| **3b Email delivery** | Real invitation, verification, reset and security emails from staging and production through Postmark, with bounced invitations flagged on the *Team* page. | You: a Postmark account, the sending domain verified, account approval (see [What the owner must do](#what-the-owner-must-do-for-postmark)) |

Why not one PR: Postmark takes up to a day to approve an account and DNS changes can take 48 hours. The Team screens shouldn't wait for either.

## Problem
Olumide has set up Vento Homes Ltd and its first entity, and nobody else can get in. To bring in Aisha from finance, Grace from sales and Kunle on site, someone today would have to run a seed script. He needs to invite his team in one go from his laptop or phone, give each person the right role and only the companies (entities) they work on, see who has joined, and act the day someone leaves or loses their phone. The emails that carry these invitations must actually arrive, from a sender that Gmail and Outlook trust.

## Persona and job
| Who | Job | How often |
|---|---|---|
| **MD / owner** (Olumide Bankole) | Bring the team in at setup; make someone a second owner; see how many places the plan has left | Once at setup, then monthly |
| **Admin** | Invite new staff, change roles when people move jobs, remove leavers the day they leave, reset two-step for someone who lost their phone | Weekly |
| **Admin limited to one SPV** (a project director for Parkview) | Invite and manage the Parkview team without seeing or granting the other entities | Monthly |
| **Invitee** (Aisha Bello, finance) | Receive the email in her inbox, not spam, and join | Once |
| **Every other member** | Nothing new. They never see Settings, the checklist or plan details. | – |

## Success looks like
- Inviting **5 colleagues takes under 60 seconds and 3 clicks** (Invite people → paste the list and pick a role → Send 5 invitations).
- Changing a member's role takes **2 clicks**; removing a leaver takes **3 clicks**; the removed person's next request is refused (2a rule, now from the screen).
- **No dead ends:** every refusal (already a member, already invited, plan limit, own access, last owner, entity you can't grant) says what to do, keeps what was typed, and marks the exact email or row it's about.
- **99% of invitations reach Postmark's "delivered" state within 1 minute** in production. A bounced invitation shows on the *Team* page **within 5 minutes**.
- **Staging never emails anyone outside the allowed list.** A test sends to an outside address and checks it was skipped.
- **Every change is in the audit trail** (2a events, unchanged) and **every procedure refuses other organizations' IDs** (2a isolation test extended to the new procedures).
- The *Team* page is usable **within 1 second** on a repeat visit over slow 3G and works at **375 px** with no sideways scroll.

## User flow
**Invite the team (J-ONB-02): 3 clicks**
1. *Team* (Settings in the sidebar, or **Invite people** on the Home checklist, or ⌘K "Invite") → **Invite people** (1).
2. *Invite people* sheet: paste or type emails (a column from Excel, "Aisha Bello <aisha@ventohomes.ng>" lists from Gmail or Outlook, commas, spaces or new lines all work). Pick **Role** for everyone (2); any row can take a different role from its own menu. **Entity access** is "All entities" unless changed to "Only some entities".
3. **Send 5 invitations** (3). Toast "Invitations sent to 5 people". The sheet closes and the five appear at the top of the list as *Invited*.

**Change someone's role: 2 clicks**
1. On their row, open the role menu (1) → pick **Finance** (2). Saved at once. Toast "Aisha Bello is now Finance · Undo".

**Change entity access: 4 clicks**
1. Click the row (1) → *Member* sheet → **Entity access** → "Only some entities" (2) → tick **Parkview Residences SPV Ltd** (3) → **Save changes** (4).

**Remove a leaver: 3 clicks**
1. Row menu ⋯ (1) → **Remove from Vento Homes Ltd** (2) → confirm **Remove Grace Umeh** (3).

**Reset a lost two-step: 3 clicks**
1. Row menu ⋯ (1) → **Reset two-step** (2) → confirm **Reset two-step** (3). They're emailed a link to set a new password.

**Resend or withdraw an invitation: 2 clicks**
1. Row menu ⋯ on the invitation (1) → **Resend** or **Withdraw** (2).

**Setup checklist on Home: 1 click to act**
1. *Home* shows *Finish setting up* to owners and admins: organization, first entity and two-step ticked; **Invite your team** open with **Invite people**, which opens the same invite sheet over Home.

## The Team page
**Layout.** *Settings* layout (below) → page title **Team** → one line of context → toolbar → the list.

- **Context line** (everyone who can view Team): "8 people · 3 invited". For **owners on a plan with a people limit** it reads "8 of 10 people on your Starter plan" (members plus open invitations, from `me.plan`). At the limit it adds **Talk to Vento**. Nobody else sees a plan name. Internal and unlimited organizations show the plain count.
- **Primary action:** **Invite people** (top right; on phones, a sticky button above the tabs). Shown only with permission to invite.
- **Toolbar:** search ("Search by name or email"), a **Role** filter, and three chips: **Everyone** (default) · **Invited** · **Removed**. All held in the address (`/settings/team?q=aisha&role=…&show=invited`) and remembered on this device.
- **One list, people first.** Active members and open invitations (pending or expired) sit in one list, sorted by name (invitations by email), so "who's on my team, including who I've asked" is a single glance. Withdrawn, declined and accepted invitations aren't listed (accepted ones are members). Server-paginated, 50 per page.

| Column | Member row | Invitation row |
|---|---|---|
| Person | Initials avatar, name, email under it; "You" tag on your own row | Email; "Invited by Olumide Bankole" under it |
| Role | Role name; for editable rows, a menu to change it in place | Role name (change it by withdrawing and inviting again) |
| Entity access | "All entities", one name, or "2 entities" with the names in a tooltip | Same |
| Two-step | Badge: **On** (emerald) · **Off** (slate) · **Set up at next sign-in** (amber: the role requires it and it isn't set up yet) · **Reset, waiting for new password** (amber) | – |
| Last active | "Today", "Yesterday", "3 days ago", then "12 Nov 2026" | Badge **Invited · expires 3 Dec** (amber) · **Expired 30 Nov** (rose) · **Email not delivered** (rose) |
| ⋯ | Change access · Reset two-step (only when two-step is on) · Remove from {organization} | Resend · Withdraw · Copy email |

- **Removed** chip: name, email, role they had, "Removed 12 Nov 2026 by Olumide Bankole", and **Invite again** (opens the invite sheet with their email and last role filled in).
- **Phones (below 768 px):** each row becomes a card (avatar, name, role · entity access, then the two-step or invitation badge); tapping opens the *Member* or *Invitation* sheet full height; actions live in the sheet.
- **Rows that can't be changed** by the viewer (their own row, an owner's row for an admin, a member with access to entities the viewer can't see) show no ⋯ menu and no role menu; their sheet says why in one line.

**Member sheet** (side sheet; full screen on phones). Name, email, joined date, last active, two-step status. Then **Access**: Role (select; a role that requires two-step notes "Finance needs two-step sign-in. They'll set it up at their next sign-in if it's off.") and Entity access ("All entities" / "Only some entities" with a tick list) → **Save changes** (disabled until something changes). Then, set apart at the bottom, **Reset two-step** and **Remove from Vento Homes Ltd** as quiet text buttons, the second in rose.

**Invitation sheet.** Email, role, entity access, invited by, sent and expiry dates, delivery state → **Resend** (primary) · **Withdraw**.

## Invite people sheet
- **Emails box** (`type="text"`, `inputMode="email"`, `autoComplete="off"`, `autoCapitalize="none"`, `spellCheck={false}`, cursor in it on desktop only). Each recognised address becomes a row as soon as it's followed by a comma, space, new line or paste, and the box clears. Typing an address and pressing Enter adds it; pressing Enter on an empty box with rows sends.
- **Each row:** the email, its role (defaults to the role chosen for everyone), and a remove ×. Problems show on the row, not in a banner: "Check this email" · "Did you mean grace@gmail.com?" (accept with one tap) · "Already a member" · "Already invited" with **Resend instead** · "That's you".
- **Role for everyone:** required; no preset, so nobody is made an owner or admin by accident. The menu lists the organization's roles with one line each ("Sales: leads, units, subscriptions and payment plans"); **Owner** appears only for owners. Picking a role that can approve shows "Can approve: Sales & CRM, Finance, HR & payroll" under it.
- **Entity access:** for an unlimited granter, "All entities" (default) or "Only some entities" with a tick list of active entities. For a granter limited to some entities, the list shows only theirs, all ticked by default, and "All entities" isn't offered. A granter limited to one entity sees "Parkview Residences SPV Ltd" as fixed text. Entity access applies to everyone in this batch: "Invite people who need different access in separate batches."
- **Limits:** up to 20 rows. Pasting more fills 20 and leaves the rest in the box: "You can invite 20 people at a time. Send these, then invite the rest." Duplicates are merged with "Removed 1 duplicate".
- **Plan places (owners, limited plans):** when the rows exceed the places left, the owner sees the plan-limit message above the button and **Send** stays disabled until enough rows are removed. Everyone else learns of a limit only from the server's refusal, shown with **PlanLimitMessage** (who to ask, never the plan).
- **Send button** names the count: **Send invitation** / **Send 5 invitations**. Pending state while sending; can't double-submit.

## Settings layout
- **Settings joins the sidebar footer and the user menu** for members whose role can view settings (owner and admin today). It follows the 3a rule exactly: not in the sidebar, More sheet, ⌘K or Preview for anyone else; a typed `/settings` link gives *403* naming who to ask.
- **Left sub-navigation** (SettingsNav component; designs SetOrg and DSAdditions) lists only sections that are built **and** that the member can view, in this order as they ship: *Organization*, *Entities*, *Team*, *Roles & permissions* (3c) · *My security* (3d, every member). Unbuilt sections are absent, never disabled.
- **One section, no sub-navigation.** In 3b only *Team* exists, so `/settings` opens *Team* directly and the sub-navigation isn't drawn (a menu with one entry is clutter). It appears, with no layout shift for the page content, when 3c adds a second section. Unit tests cover the 2+ section layout now.
- **Phones:** `/settings` shows the SettingsMobile list of sections when there are two or more; with one, it opens that section. Settings is reached from **More**.
- `/settings` redirects to the first section the member can view. Each section has its own address; back and forward work.

## Setup checklist on Home
- **Who sees it:** members who can invite people (settings create: owners and admins). Not shown in Preview as a role that can't, and never to anyone else.
- **Where:** on *Home* under the greeting, above the role's numbers. It's organization-wide and stays the same whichever entity is chosen (it's about setting up the organization, not an entity's figures).
- **Items in 3b,** each derived from data (nobody ticks anything by hand):

| Item | Done when | Detail shown | Action when open |
|---|---|---|---|
| Create your organization | Always (it exists) | "Vento Homes Ltd" | – |
| Add your first entity | An active entity exists | Its name | – |
| Turn on two-step sign-in | The viewer has two-step on | "On for you" | – (owners and admins can't reach Home without it) |
| Invite your team | Another active member exists, or any invitation has been sent | "3 people invited" / "Aisha Bello joined" | **Invite people** → the invite sheet, over Home |

- **Items that arrive later** appear only once their feature is available to the organization and the viewer can act on it: *Add your other entities* (3c), *Set approval rules* (brick 4), *Add a bank account*, *Connect Paystack*, *Import buyers and payments*, *Add your first project*, *Upload your BoQ*, *Turn on reminders* (their bricks). Each brick adds its own item with its own done rule. Nothing points to a page that doesn't exist.
- **Progress:** "Finish setting up" with "3 of 4 done" and a thin progress bar in the action colour.
- **Hide:** **Hide checklist** (in the card's ⋯ menu) hides it for this person on every device. Toast "Checklist hidden · Undo". ⌘K **Show setup checklist** brings it back.
- **All done:** when every visible item is done, the card shows "You're set up. New steps appear here as you add projects and sales." with **Hide checklist**, then disappears the next day. If a later brick adds an open item, the card returns unless the person hid it.

## Acceptance criteria

### Permissions (server-side; the UI only mirrors them)
| Action | Needs | Extra rules |
|---|---|---|
| See *Team*, the context line, the checklist's items | settings `view` | Checklist also needs settings `create` |
| Invite, resend | settings `create` | Only owners invite owners |
| Change role or entity access | settings `edit` | Not your own; owner's access only by owners; last owner kept |
| Reset two-step | settings `edit` | Not your own; an owner's only by owners |
| Remove, withdraw | settings `delete` | Not your own; owners only by owners; last owner kept |

- **Given** each of the nine roles, **when** it calls each Team procedure, **then** the result matches the table above; the expected result is read from the shared permission table (2a test, extended to the new procedures).
- **Given** Grace (sales) types `/settings/team`, **then** she sees *403* ("Settings is for owners and admins. Ask Olumide Bankole (owner)…"), and no team data is requested.
- **Given** a custom role (3c) with settings `view` only, **then** *Team* shows the list without **Invite people**, role menus or ⋯ menus, and every change procedure refuses it with "Only owners and admins can change people's access. Ask Olumide Bankole (owner)."
- **Given** an admin previewing as Sales, **then** Settings, *Team* and the checklist disappear, as for Sales.

### Own access and owners
- **Given** anyone, **then** their own row has no role menu or ⋯ menu, and its sheet reads "This is you. Ask another owner or admin to change your access." The server refuses regardless: "You can't change your own access. Ask another owner or admin."
- **Given** an admin, **then** owner rows are read-only ("Only owners can change an owner's access."), **Owner** isn't offered in any role menu, and the server refuses owner changes from admins.
- **Given** an owner changes someone's role to **Owner**, **then** a confirm asks first: "Make Aisha Bello an owner?" / "Owners can do everything in Vento Homes Ltd, including changing who has access and removing other owners." → **Make owner**. Every other role change saves at once with **Undo**.
- **Given** an owner demotes or removes another owner, **then** it works while at least one other owner stays. **Given** two owners try to remove each other at the same moment, **then** the second is refused with "Vento Homes Ltd needs at least one owner. Make someone else an owner first." and the list refreshes.
- **Given** someone becomes an owner, **then** every owner (including the new one) gets a security alert email "Vento: Aisha Bello is now an owner of Vento Homes Ltd" (see open question 5).

### Entity grant rule
- **Given** an admin limited to Parkview Residences SPV Ltd, **then** the invite sheet and member sheet offer only Parkview, never "All entities". The server refuses anything wider (2a rule): an entity outside their limit is "not found", and "all entities" is refused with "You can only give access to the entities you can see."
- **Given** the same limited admin, **when** they view a member whose access includes entities outside their own limit, **then** the row shows only the entity names they can see plus "and 1 other" (or "All entities"), no role or ⋯ menu, and the sheet reads "Aisha Bello has access to entities you can't see. Ask Olumide Bankole (owner) to change it." **New server rule:** changing, resetting or removing a member, or resending or withdrawing an invitation, whose access isn't within the granter's own is refused with the same message (open question 4).
- **Given** an entity is archived (3c) or deleted elsewhere while the sheet is open, **when** Send or Save is pressed, **then** "One of the entities you chose is no longer available. Choose again." and the tick list refreshes; the typed emails stay.

### Inviting
- **Given** 1 to 20 valid emails and a role, **when** **Send** is pressed, **then** all invitations are created in one transaction (2a: all or nothing), each audited as `invitation.sent`, and the emails go after commit.
- **Given** a batch containing people who are already members or already invited, **then** nothing is sent and **every** such row is marked at once ("Already a member", "Already invited · Resend instead"), not just the first. *API change:* the `already_member` and `already_invited` refusals carry the full list of emails. **Resend instead** resends that invitation and removes the row.
- **Given** the viewer's own email, **then** the row says "That's you" before sending.
- **Given** a removed member's email, **then** they can be invited again (2a), and the *Removed* list's **Invite again** pre-fills it.
- **Given** an owner on Starter with 8 of 10 places used and 3 rows, **then** the sheet shows "You have 2 places left on your Starter plan and 3 people here. Remove 1, or talk to Vento about Growth." with **Talk to Vento**, and **Send** is disabled. **Given** an admin in the same organization, **then** the sheet lets them send; the server refuses with `plan_limit` and **PlanLimitMessage** shows "Your organization has reached its limit of 10 people. Ask Olumide Bankole (owner)."; the rows stay.
- **Given** two admins fill the last place at the same moment, **then** only one batch succeeds (2a/feature-flags concurrency rule) and the other sees the limit message.
- **Given** an expired invitation, **when** resent, **then** it takes a place again and may hit the plan limit (feature-flags rule).
- **Given** a pending invitation, **when** **Resend** is pressed twice within a minute, **then** the second is refused: "We sent it less than a minute ago. Try again shortly." (*New server rule:* once a minute per invitation.)
- **Given** **Withdraw**, **then** it runs at once with the toast "Invitation to aisha@ventohomes.ng withdrawn" (no confirm; inviting again sends a new email), and its link shows "This invitation was withdrawn." (2a).

### Changing access, resetting two-step, removing
- **Given** a role change from the row menu, **then** it saves at once, the row updates optimistically, and the toast offers **Undo** for 8 seconds; Undo saves the previous role and limits as a second audited change. If the save fails, the row returns to the old role and the toast says why.
- **Given** an entity access change in the sheet, **then** **Save changes** stays disabled until something differs, "Only some entities" requires at least one tick ("Choose at least one entity, or allow all"), and success closes the sheet with "Access updated for Kunle Ojo".
- **Given** a change takes effect, **then** the member's next request uses it, without signing in again (2a), and their sidebar follows (3a).
- **Given** **Reset two-step**, **then** a confirm explains the consequence (copy below); on confirm all their sessions end, two-step is cleared, a security alert and a set-new-password link are emailed, and the badge becomes **Reset, waiting for new password** until they finish. The action is offered only when two-step is on.
- **Given** **Remove**, **then** the confirm (copy below) names the person and the organization; on confirm their sessions in this organization end at once, the row moves to *Removed*, the toast reads "Grace Umeh removed. History kept.", and the place frees up on the plan.
- **Given** the person was already removed, or their access changed, by someone else since the list loaded, **then** the action is refused as "not found" or applied to the latest state, the message reads "Grace Umeh is no longer a member. The list is up to date.", and the list refetches.

### Organization isolation
- **Given** any Team procedure (including the new list and checklist procedures) called with a member, invitation, role or entity ID from another organization, **then** the answer is "not found" and nothing is revealed or changed. The 2a isolation test is extended to every new procedure.
- **Given** two tabs and an organization switch in one, **then** the other tab's next Team request is refused by the tab guard before reading or writing (decision 0013), including a half-filled invite sheet; what was typed stays on screen.
- **Given** the checklist's "done" checks, **then** they count only the active organization's members, invitations and entities.

### Email delivery (PR "3b Email delivery")
- **Given** development, **then** emails still go to the console and `.mail` folder (`EMAIL_TRANSPORT=dev`), and tests use `memory`.
- **Given** staging or production, **then** the API refuses to start unless `EMAIL_TRANSPORT=postmark` and `POSTMARK_SERVER_TOKEN` and `EMAIL_FROM` are set (production already refuses dev transports).
- **Given** staging, **then** an email to an address outside `EMAIL_ALLOWED_RECIPIENTS` (comma-separated domains or addresses) is skipped and logged as "skipped (not allowed on staging)" with the tag only, never the address.
- **Given** any email, **then** it goes on Postmark's default transactional stream, with open tracking and link tracking **off** (links carry one-time tokens and must not be rewritten), the existing HTML and plain-text bodies, the email's tag, and for invitations a metadata field holding the invitation ID (no personal data).
- **Given** Postmark refuses or fails to accept an invitation email (network error, 5xx, or an inactive recipient), **then** the invitation is still created (2a: a failed send never undoes the change), one retry is made for network or 5xx errors, and if it still fails the row shows **Email not delivered** with **Resend**. A failed security alert or reset email is logged by tag and error code only.
- **Given** a hard bounce or spam complaint for an invitation, **when** Postmark calls the bounce webhook, **then** the invitation is marked **Email not delivered** with "The address bounced. Check it and invite again." or "The person marked it as spam."; the webhook checks its secret, ignores unknown IDs, and is idempotent. Other bounces are counted in the logs by tag only.
- **Given** a person whose address Postmark has suppressed, **when** they ask for a verification or reset email, **then** Vento's reply to them is unchanged (no account enumeration), and the log notes "inactive recipient" by tag.

### Empty, error, loading and offline
- **Given** an organization with only its owner, **then** the list shows the owner's row and an empty-state panel under it: "Bring in your team. Invite colleagues by email and choose what each one can see." → **Invite people**.
- **Given** a search or filter with no results, **then** "No one matches "kunle"." → **Clear filters**. *Invited* with none: "No open invitations." *Removed* with none: "Nobody has been removed."
- **Given** loading, **then** a skeleton in the final layout (rows on desktop, cards on phones); the context line reserves its height.
- **Given** the list fails to load, **then** "Team couldn't load. Check your connection and try again." → **Try again**.
- **Given** offline, **then** the 3a banner shows; actions are attempted and fail with the 3a offline message, keeping what was typed. Role menus don't change optimistically while offline.
- **Given** the session expires with the invite sheet open, **then** 2a's session-expired dialog appears over it and the rows stay after signing in again.

### Mobile and keyboard
- **Given** 375 px, **then** cards replace the table, the sticky **Invite people** sits above the tabs and the home indicator, every target is at least 44 px, sheets are full height, and the invite sheet's **Send** stays visible above the keyboard.
- **Given** the keyboard, **then** Tab moves through toolbar, rows and their menus; Enter on a row opens its sheet; Esc closes sheets and menus and returns focus to the row; in the invite sheet, Enter adds an email and Enter on an empty box sends; Backspace on an empty box removes the last row.
- **Given** ⌘K, **then** it offers **Invite people**, **Go to Team** and **Show setup checklist** (each only with permission). On *Team*, `i` opens **Invite people** and `/` focuses search; both are listed under `?`.

## Behind the scenes
- **Existing API (2a), used as is:** `roles.list`, `members.updateAccess`, `members.remove`, `members.resetTwoStep`, `invitations.create`, `invitations.resend`, `invitations.withdraw`, `entities.list`. All audited.
- **API additions (small; for the architect):**
  - `team.list({ q, roleId, show: 'everyone' | 'invited' | 'removed', page, pageSize })`: one paginated list of members and open invitations (or removed members), sorted by name/email, with entity names filtered to the viewer's own access limits and a `canManage` flag per row computed with the rules above. Replaces two calls and keeps one pagination.
  - Member fields: `lastActiveAt` (updated at most once an hour per member per organization on any request) and `twoStep: 'on' | 'off' | 'setup_required' | 'reset_pending'`.
  - Invitation fields: `delivery: 'sent' | 'failed' | 'bounced' | 'complained'` and its time; Postmark's message ID or the metadata ID stored for the webhook.
  - Conflict data: `already_member` and `already_invited` carry `emails: string[]`.
  - New server rules: resend once a minute per invitation; limited granters can manage only members and invitations within their own access (open question 4).
  - `account.me` (or a small `checklist.get`) returns the checklist items available to the viewer with done state and detail; `checklist.hide` / `checklist.show` store a per-member hidden flag.
  - Security alert "is now an owner" to all owners (open question 5).
- **Email transport:** a `postmark` transport beside `dev` and `memory`, behind the existing `Mailer` type. Env (documented in `.env.example`, values never in the repo): `EMAIL_TRANSPORT`, `EMAIL_FROM`, `POSTMARK_SERVER_TOKEN`, `POSTMARK_MESSAGE_STREAM` (default `outbound`), `POSTMARK_WEBHOOK_SECRET`, `EMAIL_ALLOWED_RECIPIENTS` (staging only). Webhook: `POST /webhooks/postmark/bounce`, authenticated by the secret, rate-limited, writes no personal data to logs.
- **Sender:** `From: Vento Real Estate <no-reply@mail.{vento domain}>` for account emails; invitations use the display name "{Organization} via Vento" and `Reply-To` the inviter, so a question goes to a colleague, not a no-reply box (open question 7).
- **Audit:** no new event types. Hiding the checklist changes no data and isn't audited. Undo of a role change is an ordinary `member.access_changed`. Webhook delivery marks are not audit events (they are delivery facts, not changes by a person).
- **Data protection (NDPA 2023):** Postmark is a data processor hosted outside Nigeria. It receives recipient email addresses, names and organization names inside the emails, and one-time links. Before launch: the privacy notice lists Postmark (purpose: delivering account and service emails; location: United States), a data processing agreement is signed with Postmark, and the cross-border transfer basis is recorded (confirm with counsel). Open and link tracking stay off. No buyer data goes through Postmark in this brick.

## What the owner must do for Postmark
1. **Choose the sending domain.** Recommended: a subdomain of Vento's main domain used only for app email, e.g. `mail.{vento domain}`, so app email reputation is separate from staff mailboxes.
2. **Create the Postmark account** (company details, as the account owner) and **two servers**: "Vento production" and "Vento staging". Each has its own server API token.
3. **Verify the domain** in Postmark (Sender signatures → Domains): add the **DKIM** TXT record and the **custom Return-Path** CNAME (`pm-bounces.mail.{domain}` → `pm.mtasv.net`) at your DNS host. Return-Path verification can take up to 48 hours.
4. **Publish DMARC** for the domain: a TXT record at `_dmarc` starting with `v=DMARC1; p=none; rua=mailto:dmarc@{vento domain}`. After 2–4 weeks of clean reports, move to `p=quarantine`. Don't add Postmark to your root SPF record; the custom Return-Path handles SPF alignment.
5. **Request account approval** from the Postmark dashboard (only the account owner can), describing the email as "transactional account email for a B2B property software: invitations, sign-in verification, password resets and security alerts; about {N} a month". Until approved, Postmark sends only to addresses on your verified domain. Approval usually takes about a day.
6. **Turn off open and link tracking** on both servers (the code also sends with tracking off).
7. **Add the bounce webhook** in each server's default transactional stream (Webhooks → Bounce and Spam complaint) to the URL devops gives you, with the secret.
8. **Hand the secrets to devops** through the secrets store (never chat or email): each server's API token and the webhook secret. Devops sets them in staging and production, plus `EMAIL_ALLOWED_RECIPIENTS` for staging.
9. **Sign Postmark's data processing agreement** and add Postmark to the privacy notice before the first customer goes live (release plan section 6).
10. **Send yourself a test** from staging (invite your own address) and check it lands in the inbox with DKIM and DMARC passing (Gmail: ⋮ → "Show original").

## UI copy
| Where | Copy |
|---|---|
| Sidebar, user menu, More | "Settings" |
| Settings sub-navigation (as sections ship) | "Organization" · "Entities" · "Team" · "Roles & permissions" · "My security" |
| Team header | Title "Team" · "8 people · 3 invited" · owner on a limited plan: "8 of 10 people on your Starter plan" · at the limit: "10 of 10 people on your Starter plan" **Talk to Vento** |
| Team actions | **Invite people** · search "Search by name or email" · "Role: All roles" · chips "Everyone" "Invited" "Removed" |
| Row tags and badges | "You" · two-step "On" / "Off" / "Set up at next sign-in" / "Reset, waiting for new password" · "Invited · expires 3 Dec" · "Expired 30 Nov" · "Email not delivered" · last active "Today" / "Yesterday" / "3 days ago" / "12 Nov 2026" · removed "Removed 12 Nov 2026 by Olumide Bankole" |
| Row menu | Member: "Change access" · "Reset two-step" · "Remove from Vento Homes Ltd" · Invitation: "Resend" · "Withdraw" · "Copy email" · Removed: **Invite again** |
| Read-only reasons | "This is you. Ask another owner or admin to change your access." · "Only owners can change an owner's access." · "Aisha Bello has access to entities you can't see. Ask Olumide Bankole (owner) to change it." |
| Invite sheet | Title "Invite people" · "They'll get an email to join Vento Homes Ltd. Invitations last 7 days." · label "Emails" · placeholder "Paste or type emails" · "Role" (placeholder "Choose a role") · "Entity access" with "All entities" / "Only some entities" · "Invite people who need different access in separate batches." · two-step note "Finance needs two-step sign-in. They'll set it up when they join." · approve note "Can approve: Sales & CRM, Finance, HR & payroll" · **Send invitation** / **Send 5 invitations** · **Cancel** |
| Invite row problems | "Check this email" · "Did you mean grace@gmail.com?" · "Already a member" · "Already invited" **Resend instead** · "That's you" · "Removed 1 duplicate" · "You can invite 20 people at a time. Send these, then invite the rest." |
| Plan places (owner, before sending) | "You have 2 places left on your Starter plan and 3 people here. Remove 1, or talk to Vento about Growth." **Talk to Vento** |
| Plan limit (server; feature-flags copy) | Owner: "Your plan includes 10 people, and 10 are in or invited. Remove someone or talk to Vento about Growth." · Others: "Your organization has reached its limit of 10 people. Ask Olumide Bankole (owner)." |
| Member sheet | Facts "Joined 25 Nov 2026" · "Last active today" · "Two-step on" · section "Access" · **Save changes** · "Reset two-step" · "Remove from Vento Homes Ltd" |
| Make owner confirm | Title "Make Aisha Bello an owner?" · "Owners can do everything in Vento Homes Ltd, including changing who has access and removing other owners." · **Make owner** · **Cancel** |
| Remove confirm (board copy, adjusted) | Title "Remove Grace Umeh?" · "They lose access to Vento Homes Ltd immediately and are signed out there. Everything they did stays in the audit trail under their name. You can invite them again later." · **Keep access** · **Remove Grace Umeh** |
| Reset two-step confirm | Title "Reset Aisha Bello's two-step?" · "Use this when they've lost their phone and backup codes. They'll be signed out everywhere and must set a new password from the link we email them, then set up two-step again. This applies in every organization they belong to." · **Reset two-step** · **Cancel** |
| Toasts | "Invitation sent to aisha@ventohomes.ng" · "Invitations sent to 5 people" · "Invitation sent again to aisha@ventohomes.ng" · "Invitation to aisha@ventohomes.ng withdrawn" · "Aisha Bello is now Finance · Undo" · "Access updated for Kunle Ojo" · "Grace Umeh removed. History kept." · "Two-step reset for Aisha Bello. We've emailed them a link to set a new password." (the 2a notice) · "Email copied" · "Checklist hidden · Undo" |
| Errors | "We sent it less than a minute ago. Try again shortly." · "One of the entities you chose is no longer available. Choose again." · "Grace Umeh is no longer a member. The list is up to date." · "Choose at least one entity, or allow all" · "Choose a role" · 2a copy for own access, last owner, owner-only and permission denied |
| Delivery problems | "The address bounced. Check it and invite again." · "The person marked it as spam." · "We couldn't send this email. Try Resend." |
| Empty and filtered states | "Bring in your team. Invite colleagues by email and choose what each one can see." **Invite people** · "No one matches "kunle"." **Clear filters** · "No open invitations." · "Nobody has been removed." |
| List error | "Team couldn't load. Check your connection and try again." **Try again** |
| Setup checklist | Title "Finish setting up" · "3 of 4 done" · "Create your organization" · "Add your first entity" · "Turn on two-step sign-in" ("On for you") · "Invite your team" ("Bring in finance, sales and site staff") **Invite people** · done details "3 people invited" / "Aisha Bello joined" · menu "Hide checklist" · all done: "You're set up. New steps appear here as you add projects and sales." · ⌘K "Show setup checklist" |
| New-owner alert email | Subject "Vento: Aisha Bello is now an owner of Vento Homes Ltd" · body "Olumide Bankole made Aisha Bello an owner of Vento Homes Ltd at 10:30 on 26 Nov 2026. Owners can do everything, including changing who has access. If this wasn't expected, sign in and check Team: {link}" |
| Staging log | "Email skipped (not allowed on staging): invitation" |

## Departures from the approved designs
To be logged in `docs/design/CHANGES.md` when built.

| Board | Change | Why |
|---|---|---|
| RolesSettings | Tabs "Roles & permissions · Approval limits · Users" become separate settings sections; *Team* is its own page under the left sub-navigation | The designer's own follow-up (older settings pages should move to the left nav); permissions are 3c, approval limits brick 4 |
| RolesSettings (users tab) | Adds two-step and last active columns and invitation rows; **Remove** moves into a ⋯ menu; role is changed in place; "Invite user" → **Invite people** | The scope asks for two-step and activity at a glance; a red Remove on every row invites mistakes |
| RolesSettings | No "On leave" status, no "Sales (external agent)" member, "MD" shown as the role "Owner" | Leave belongs to HR; external realtors use the realtor portal, not team seats; roles use their real names |
| RolesSettings remove dialog | "loses access to Vento Homes Ltd" instead of "to Vento" | A person can belong to other organizations, which they keep |
| SetOrg, DSAdditions, SettingsMobile | Fourteen settings sections → only built sections the member can view; no sub-navigation while there's only one | Decision 12 and "nothing extra" |
| Onboarding (checklist) | Eight items ticked by hand → items derived from data, only for features that exist; "organisation" → "organization" | A checklist must never claim something is done that isn't, or point to a missing page |
| EmailInvite | Sent from Vento's sending domain with "Vento Homes Ltd via Vento" as the name and the inviter as Reply-To, not from `no-reply@ventohomes.ng`; no "Notification settings" link | Sending from each developer's domain needs per-customer DNS; invitations are transactional and can't be unsubscribed from |

## Screens this slice touches
| Screen (row in SCREENS.md) | Boards | What 3b builds |
|---|---|---|
| Settings layout with left sub-navigation | SetOrg, DSAdditions, SettingsMobile | Layout and SettingsNav, hidden while one section |
| Team members and invitations | RolesSettings | The list, filters, context line, row menus, confirms |
| Invite people sheet (new row) | – | Pattern: side sheet form |
| Member and invitation sheets (new row) | – | Pattern: side sheet with facts and actions |
| Setup checklist on Home | Onboarding (checklist), DSAdditions (ChecklistRow) | Card with derived items |
| App shell | – | Settings in the sidebar footer, user menu and More |
| Plan limit message | – | First real use |
| Emails: invite, verify, reset | EmailInvite, EmailVerify, EmailReset | Delivered by Postmark; From and Reply-To |
| Email: security alert | – | Adds "is now an owner" |

## Domain changes
To add to `docs/DOMAIN.md` once approved:
- **Setup checklist** (Platform): "Steps that help owners and admins set up an organization, each done when the data says so (never ticked by hand). Items appear only when their feature is available and the viewer can act. Hidden per person; brought back from ⌘K."
- **Invitation** (notes): add "Delivery is tracked separately from status: `sent`, `failed`, `bounced` or `complained`. A bounced or failed invitation stays `pending` until withdrawn or expired."
- **Member** (notes): add "Last active is updated at most hourly and shown to people who can view Team."
- **Access rules:** add "A member limited to some entities can change, reset or remove only members and invitations whose access lies within their own." (if open question 4 is approved) and "An invitation can be resent once a minute."
- **Security alert** (notes): add "someone made an owner" to the list.

## Out of scope
- Roles and permissions matrix, custom roles, organization profile, entities (3c). My security, sessions, passkeys (3d). The *Removed* list doesn't reactivate anyone directly; it invites again.
- Approval rules for removing members or granting owner (brick 4 decides whether any of these need a checker).
- Project limits (with Projects). Per-person entity limits inside one batch (send separate batches).
- Inviting by WhatsApp or SMS, invitation links without an email, bulk CSV upload (paste covers it), SCIM or Google Workspace sync.
- A member leaving an organization by themselves, transferring ownership as a single action, and deleting a person's account.
- Buyer-facing email, broadcast streams and marketing email; per-organization sending domains; email open or click tracking.
- Billing: the usage line and limit messages only point to **Talk to Vento**.

## Open questions (defaults in bold)
1. **Two pull requests for 3b** (Team screens first, Postmark second) so DNS and Postmark approval don't block your review? **Yes.**
2. **Settings sub-navigation with one section:** hide it until a second section ships (3c), or show a one-item menu now? **Hide it.**
3. **One list for members and invitations** (with *Invited* and *Removed* chips), rather than separate tabs? **One list.**
4. **Limited admins and wider access:** an admin limited to Parkview can't change, reset or remove someone who also has other entities, and sees only the entity names within their own limit. **Yes** (a new server rule; today they could narrow or remove such a person).
5. **New-owner alert:** when someone is made an owner, email every owner. **Yes**, as a security alert that can't be muted. (Removal sends no email; the person sees "You no longer have access" at their next sign-in, as decided.)
6. **Role changes save at once with Undo**, and only "make owner" asks to confirm; removal and two-step reset always confirm. **Yes.**
7. **Sender:** `Vento Real Estate <no-reply@mail.{your domain}>`, invitations named "{Organization} via Vento" with the inviter as Reply-To. **Yes.** Which domain should Vento send from?
8. **Staging sends only to an allowed list** of domains and addresses (your team and test inboxes). **Yes.**
9. **Bounce handling minimum:** invitations only are marked "Email not delivered" (from the send result or Postmark's bounce webhook); other bounces are counted in logs. **Yes.**
10. **Last active** shown to owners and admins, by day. **Yes.**
11. **Setup checklist:** hidden per person, back from ⌘K; once hidden it stays hidden even when new steps ship. **Yes.**
12. **Resend limit** of once a minute per invitation. **Yes.**
