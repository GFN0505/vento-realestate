# Onboarding and access

## J-ONB-01 · Set up a new organization
**Who / how often:** MD or admin, once per customer.
**Starts from:** Sign-up link from the website or a Vento sales invite.

Spec: [accounts-and-access](../specs/accounts-and-access.md) (steps 1–4 and the two-step setup; step 5 onwards comes with Projects and Sales).

**Steps**
1. *Sign up:* name, company, work email, password (≥ 8 characters with an uppercase letter, a lowercase letter, a number and a special character) and confirm password, accept terms and privacy notice → **Create account**.
2. *Verify email:* link or 6-digit code from the email (valid 30 minutes) → **Verify email**.
3. *Onboarding, step 1 (organization):* organization name (pre-filled from Company), head office state, financial year start (January). Base currency NGN is shown, not chosen → **Continue**.
4. *Onboarding, step 2 (first entity):* entity name (pre-filled), type (holding company or SPV), RC number, TIN, VAT registered? RC and TIN can be left for later → **Finish setup**.
5. *Set up two-step:* the owner scans the QR code, enters a code and saves 10 backup codes.
6. *Onboarding, step 3 (first project and units):* project name, location, type, then "Add units now" (bulk create) or "Import from Excel" or "Skip". *(Projects and Sales bricks.)*
7. Lands on *Home* inside the *App shell* (brick 3a replaces the temporary signed-in page). From brick 3b ([team](../specs/team.md)), Home also shows the *Setup checklist* to owners and admins: "Create your organization", "Add your first entity" and "Turn on two-step sign-in" ticked from the data, then "Invite your team" with **Invite people** (opens the *Invite people sheet* over Home). Other steps (other entities, approval rules, bank account, Paystack, import, first project, BoQ, reminders) appear only once their feature is available. **Hide checklist** hides it for this person; ⌘K "Show setup checklist" brings it back.

**Behind the scenes:** step 1 creates the organization and the person as its owner in one transaction; step 2 creates the entity. Each step saves, so the user can leave and resume. Audit events written for each. Later bricks add the entity's default chart of accounts, default approval rules and current statutory rules.
**Done when:** the organization and first entity exist, the owner has two-step on and sees the signed-in page (later: their project on Home with checklist step 1 done).
**Watch for:** email already registered (offer sign in); unverified email (back to *Verify email*); leaving mid-onboarding and coming back resumes at the next unfinished step; RC/TIN format warnings never block ("You can add this later"); RC number already used by another entity in the organization is refused when adding entities (brick 3; it can't happen for the first entity).
**Target:** under 3 minutes and 4 clicks to a saved organization and entity; ≤ 5 minutes to first project. **Test:** `e2e/onboarding/new-organization.spec.ts` **Status:** built (steps 1–2; step 3 with Projects)

## J-ONB-02 · Invite the team and set roles
**Who / how often:** Owner or admin, at setup then occasionally.
**Starts from:** *Setup checklist* on Home ("Invite your team" → **Invite people**), *Settings → Team*, or ⌘K "Invite".

Spec: [team](../specs/team.md) (brick 3b, the screens and email delivery) on [accounts-and-access](../specs/accounts-and-access.md) (brick 2a, the invitee's side and the API).

**Steps**
1. *Team* → **Invite people** (1 click), or **Invite people** on the checklist (the same sheet opens over Home).
2. *Invite people sheet:* paste or type up to 20 emails (lists copied from Excel, Gmail or Outlook work; duplicates merge; typos get "Did you mean…?"). Pick **Role** for everyone (2 clicks: open, choose); any row can take another role from its own menu. Roles show one line each; **Owner** is offered to owners only. A role that requires two-step or can approve says so under the menu.
3. *Entity access:* "All entities" by default, or "Only some entities" with a tick list ("Kunle: Parkview Residences SPV Ltd only"). An admin limited to some entities sees only theirs, and never "All entities". It applies to the whole batch. Project limits arrive with the Projects brick.
4. **Send 5 invitations** (1 click). Toast "Invitations sent to 5 people". They appear on *Team* after the members (first under the *Invited* chip) as "Invited · expires 3 Dec".
5. Invitee: *Invitation email* (from "Vento Homes Ltd via Vento", Reply-To the inviter) → *Accept invitation* (organization, who invited them, role, entities, what the role can approve, whether two-step is required) → name, password and confirm password, or sign in if they already use Vento → *Set up two-step* where the role requires it → lands on *Home* with their role's sidebar. On *Team* their row becomes a member with "Two-step on" and "Last active today".
6. Later, on an invitation's ⋯ menu: **Resend** (new link, fresh 7 days) or **Withdraw** (2 clicks).

**Behind the scenes:** one transaction creates the batch (all or nothing); each invitation is an audit event; emails go after commit through Postmark in staging and production (console in development; staging only to allowed addresses), with tracking off. A failed send or a bounce marks the invitation "Email not delivered". Members plus open invitations count against the plan's people limit, checked inside the transaction. Permissions are checked on the server for every action.
**Done when:** the invitee appears as an active member with their role, entity access and two-step on.
**Watch for:** some emails already members or already invited (nothing sent; every such row is marked, with **Resend instead** for invited ones); your own email ("That's you"); more than 20 pasted (20 kept, the rest left in the box); an owner with fewer places left than rows (plan message with **Talk to Vento**, Send disabled); an admin hitting the limit (server refusal, "Ask Olumide Bankole (owner)", rows kept); two admins taking the last place at once (one succeeds); an entity archived while the sheet is open; resending within a minute (refused); invite to someone already in another organization (allowed; they join with their existing account); opened while signed in as someone else ("This invitation is for…"); expired, withdrawn or bounced invitations; a removed member invited again (from *Removed* → **Invite again**); organization switched in another tab (refused, typing kept); session expired with the sheet open (typing kept); 375 px with the keyboard open (Send stays visible).
**Target:** 3 clicks and under 60 seconds for a batch of 5; invitee active with two-step in under 3 minutes; invitation delivered within 1 minute. **Test:** `e2e/auth/accept-invitation.spec.ts` (2a), `e2e/settings/invite-members.spec.ts` (3b), `e2e/home/setup-checklist.spec.ts` (3b) **Status:** built for accepting (2a); screens and delivery in brick 3b (draft)

## J-ONB-06 · Change someone's access, reset their two-step, remove a leaver
**Who / how often:** Owner or admin; role and access changes monthly, a lost phone or a leaver a few times a year.
**Starts from:** *Settings → Team*, a colleague's message ("I lost my phone"), or HR telling the admin someone has left.

Spec: [team](../specs/team.md) (brick 3b) on [accounts-and-access](../specs/accounts-and-access.md) (2a rules).

**Steps**
1. *Team* → search "aisha" (the search and filters stay in the address).
2. **Change role:** the role menu on Aisha's row → **Finance** (2 clicks). Saved at once; toast "Aisha Bello is now Finance · Undo". Making someone an **Owner** asks to confirm first and emails every owner.
3. **Change entity access:** click the row → *Member sheet* → "Only some entities" → tick **Parkview Residences SPV Ltd** → **Save changes** (4 clicks). Toast "Access updated for Kunle Ojo".
4. **Reset two-step** (lost phone and backup codes): ⋯ → **Reset two-step** → confirm (3 clicks). The badge becomes "Reset, waiting for new password"; they get a security alert and a link to set a new password, then set up two-step again at sign-in (J-ONB-04).
5. **Remove a leaver:** ⋯ → **Remove from Vento Homes Ltd** → **Remove Grace Umeh** (3 clicks). Toast "Grace Umeh removed. History kept." The row moves to the *Removed* chip with **Invite again**.

**Behind the scenes:** each change is one transaction and an audit event (`member.access_changed`, `two_step.reset`, `member.removed`, `session.revoked_by_removal`); an Undo is a second audited change. A change applies on the member's next request; removal ends their sessions in this organization at once; a two-step reset ends all their sessions everywhere. The removed member's place frees up on the plan.
**Done when:** the row shows the new role, access or two-step state, or the person is under *Removed*.
**Watch for:** your own row (read-only: "This is you…"); an admin and an owner's row (read-only: "Only owners can change an owner's access."); an admin limited to Parkview and a member with wider access (read-only, names outside their limit hidden); two owners removing each other at once (the second refused: "Vento Homes Ltd needs at least one owner…"); the member already removed by someone else ("Grace Umeh is no longer a member. The list is up to date."); Reset two-step offered only when two-step is on; role menus don't change while offline; preview as a role without settings (Team disappears); phone at 375 px (cards, actions in the sheet).
**Target:** role change in 2 clicks, removal or reset in 3; under 10 seconds each. **Test:** `e2e/settings/manage-members.spec.ts` **Status:** draft

## J-ONB-03 · Import existing buyers and payments from Excel
**Who / how often:** Finance or admin, at go-live and when migrating a project.
**Starts from:** Setup checklist or ⌘K "Import".

**Steps**
1. *Excel import wizard:* pick what to import (units, buyers, subscriptions, payments to date), download the template or upload their own file.
2. Map columns (auto-matched by header name, adjustable).
3. Preview with row-level errors, each fixable in the preview table with one click. Nothing saves until Import ("Row 14: unit A-14 not found", "Row 22: amount is not a number"). Fix in the file and re-upload, or skip bad rows.
4. "Import 238 rows". Progress, then a summary with links.

**Behind the scenes:** one import job; rows created in batches inside transactions; historical receipts post to the ledger with their original dates in an open period, or to an opening-balance journal if the period is closed. Every created row is tagged with the job id.
**Done when:** the import shows `imported` and the records are visible.
**Watch for:** duplicates of existing buyers (match by phone/email and offer merge); money in strings like "85m" or "₦85,000,000" (parse or flag); undo is available for 7 days and removes exactly what the import added; blocked with an explanation once those records are used further (e.g. receipts allocated).
**Target:** under 10 minutes for 500 rows. **Test:** `e2e/settings/excel-import.spec.ts` **Status:** draft

## J-ONB-04 · Sign in with two-factor, recover access
**Who / how often:** Everyone, daily.

Spec: [accounts-and-access](../specs/accounts-and-access.md).

**Steps**
1. *Sign in:* email, password, optional "Keep me signed in on this device" (30 days) → **Sign in** → *Two-step check* (authenticator code, or "Use a backup code") → **Verify**. If the role requires two-step and it isn't set up, *Set up two-step* comes first.
2. Forgot password: *Forgot password* → email link (30 minutes, works once) → *Reset password* (new password and confirm password, not one of the last 5) → signed in after the two-step check; every other session ends.
3. Lost authenticator: a backup code, or an owner (for anyone) or admin (for non-owners) resets their two-step (audit event, security alert to the member); they set it up again at next sign-in.

**Behind the scenes:** sign-ins, failures, lockouts, password and two-step changes are audit events visible to the owners of every organization the person belongs to; security alerts can't be muted.
**Done when:** the member is signed in on their page.
**Watch for:** five wrong two-step or backup codes lock sign-in for 15 minutes and email the user (10 wrong passwords in 15 minutes do the same); the code boxes turn rose with a message saying what to do; the same message for a wrong email or a wrong password; forgot-password never reveals whether an account exists; session expired mid-form (input kept on the device, signing in again returns them to the page); *Session expired / signed out elsewhere* screen; a member who requires two-step can't turn it off; the only owner losing their phone and codes needs Vento support.
**Target:** under 20 seconds and 2 clicks for a daily sign-in. **Test:** `e2e/auth/sign-in.spec.ts` **Status:** built

## J-ONB-05 · Find your way around the workspace
**Who / how often:** Every member, many times a day. Admins previewing roles: at setup and when roles change.
**Starts from:** Signing in, a shared link, or ⌘K from any page.

Spec: [app-shell](../specs/app-shell.md) (brick 3a).

**Steps**
1. After *Sign in*, the member lands on *Home* in the *App shell* (or on the page they were trying to reach). The sidebar shows only the modules their role can view; on a phone, *Home* plus up to three module tabs and **More**.
2. Click a sidebar entry (1 click) or press ⌘K, type "sal", Enter. Only modules **available** to the organization (released to it and in its plan, see [feature-flags](../specs/feature-flags.md)) and viewable by the role appear. A module the role can't view opens *403*, which names the owner or admin to ask; a module that isn't available opens *404*. Features the organization has early opens carry an "Early access" tag. In Vento's internal organizations only, a module that isn't built yet shows "Soon" and opens its *Module placeholder*. Owners searching ⌘K for a feature outside their plan see one row, "Available on Growth", with **Talk to Vento**.
3. *Entity switcher* → pick **Parkview Residences SPV Ltd** (2 clicks). The choice stays in the address and is remembered on this device for this organization.
4. People in two organizations: click the organization name at the top of the sidebar → pick **Lekki Partners Ltd** (2 clicks). *Home* of that organization opens; *Set up two-step* first if its role requires it.
5. Avatar → **Light**, **Dark** or **System** (2 clicks).
6. Owners and admins: avatar → **Preview as role** → **Sales** (3 clicks). The sidebar, tabs and Home become Sales', under a "Previewing as Sales" banner → **Stop preview**.
7. `?` lists the shortcuts; `[` collapses the sidebar; `g` then `h` goes Home.

**Behind the scenes:** switching organization is checked on the server against active memberships and updates the session and the default for next sign-in; the browser cache is cleared. Every request says which organization the tab expects, and a mismatch is refused before any read or write. Preview changes navigation only; requests still run with the admin's own access. No audit events (no data or access changes).
**Done when:** the member is on the page they wanted, in the right organization and entity.
**Watch for:** two tabs, organization switched in one (the other reloads with "You switched to Lekki Partners Ltd in another tab."); removed from the current organization mid-session (moved to the next organization, or "You no longer have access to Vento Homes Ltd." with Sign out); role changed mid-session (navigation updates on the next page or tab focus, open page becomes *403* if no longer allowed); shared link with an entity they can't see, archived or made up ("That entity isn't available. Showing all entities."); member limited to one entity (label, no menu); unknown address, or a module not available to the organization (*404*, signed out: *404* with Sign in); a feature switched off or a trial ending mid-task (next call refused, app returns Home with "Sales isn't available on your account right now. What you were typing wasn't saved."); no flash of unavailable items on load; server failure (*500* with a reference to copy); connection lost (offline banner; typed input kept); session expired (2a dialog over the page); reduced motion; 375 px width; dark mode.
**Target:** any allowed module in 1 click on a laptop, 1–2 taps on a phone, or ⌘K + 3 keystrokes; organization or entity switch in 2 clicks. **Test:** `e2e/shell/navigation.spec.ts`, `e2e/shell/command-palette.spec.ts`, `e2e/shell/organizations.spec.ts`, `e2e/shell/theme-and-preview.spec.ts`, `e2e/shell/errors-offline.spec.ts`, `e2e/shell/accessibility.spec.ts` **Status:** built
