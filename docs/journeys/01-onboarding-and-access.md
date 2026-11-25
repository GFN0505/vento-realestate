# Onboarding and access

## J-ONB-01 · Set up a new organization
**Who / how often:** MD or admin, once per customer.
**Starts from:** Sign-up link from the website or a Vento sales invite.

Spec: [accounts-and-access](../specs/accounts-and-access.md) (steps 1–4 and the two-step setup; step 5 onwards comes with Projects and Sales).

**Steps**
1. *Sign up:* name, company, work email, password (≥ 12 characters, a number, not a common or leaked password), accept terms and privacy notice → **Create account**.
2. *Verify email:* link or 6-digit code from the email (valid 30 minutes) → **Verify email**.
3. *Onboarding, step 1 (organization):* organization name (pre-filled from Company), head office state, financial year start (January). Base currency NGN is shown, not chosen → **Continue**.
4. *Onboarding, step 2 (first entity):* entity name (pre-filled), type (holding company or SPV), RC number, TIN, VAT registered? RC and TIN can be left for later → **Finish setup**.
5. *Set up two-step:* the owner scans the QR code, enters a code and saves 10 backup codes.
6. *Onboarding, step 3 (first project and units):* project name, location, type, then "Add units now" (bulk create) or "Import from Excel" or "Skip". *(Projects and Sales bricks.)*
7. Lands on *Executive home* with the *Setup checklist*: invite team, add bank account, set approval rules, connect Paystack, import buyers. *(Brick 3; until then a temporary signed-in page.)*

**Behind the scenes:** step 1 creates the organization and the person as its owner in one transaction; step 2 creates the entity. Each step saves, so the user can leave and resume. Audit events written for each. Later bricks add the entity's default chart of accounts, default approval rules and current statutory rules.
**Done when:** the organization and first entity exist, the owner has two-step on and sees the signed-in page (later: their project on Home with checklist step 1 done).
**Watch for:** email already registered (offer sign in); unverified email (back to *Verify email*); leaving mid-onboarding and coming back resumes at the next unfinished step; RC/TIN format warnings never block ("You can add this later"); RC number already used by another entity in the organization (refused).
**Target:** under 3 minutes and 4 clicks to a saved organization and entity; ≤ 5 minutes to first project. **Test:** `e2e/onboarding/new-organization.spec.ts` **Status:** draft

## J-ONB-02 · Invite the team and set roles
**Who / how often:** Admin, at setup then occasionally.
**Starts from:** Setup checklist, or *Settings → Team members*.

Spec: [accounts-and-access](../specs/accounts-and-access.md). Brick 2a builds the invitee's side (step 4) and the API for steps 1–3; the *Team members* screen comes in brick 3.

**Steps**
1. *Team members* → "Invite people". Paste up to 20 emails and pick a role for each (owner, admin, land & legal, project manager, sales, finance, HR, facility, viewer; owner-made roles such as "Site engineer" from brick 3). Only owners can invite owners.
2. Optionally limit access to entities ("Kunle: Parkview Residences SPV Ltd only"). Project limits arrive with the Projects brick.
3. "Send invites". Invitees get the invite email (WhatsApp once a provider is chosen).
4. Invitee: *Invitation email* → *Accept invitation* (shows organization, who invited them, role, entities, what the role can approve, whether two-step is required) → name and password, or sign in if they already use Vento → *Set up two-step* (required for owner, admin and finance) → lands on their role home (temporary signed-in page until brick 3).

**Behind the scenes:** invitations expire after 7 days; resending replaces the link and restarts the 7 days; invitations, role and limit changes, and removals are audit events; permissions are enforced server-side on every request; a role change takes effect on the member's next request.
**Done when:** the member appears as `active` with their role and limits.
**Watch for:** invite to someone already in another organization (allowed; they join with their existing account and switch organizations); email already a member (refused); opened while signed in as someone else ("This invitation is for…"); expired or withdrawn invite (ask for a new one); nobody can change their own access; removing or demoting the last owner (blocked); a removed member's sessions end at once and their history stays.
**Target:** 3 clicks per batch; invitee active with two-step in under 3 minutes. **Test:** `e2e/auth/accept-invitation.spec.ts` (2a, seeded invitation), `e2e/settings/invite-members.spec.ts` (brick 3) **Status:** draft

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
2. Forgot password: *Forgot password* → email link (30 minutes, works once) → *Reset password* (new password, not one of the last 5) → signed in after the two-step check; every other session ends.
3. Lost authenticator: a backup code, or an owner (for anyone) or admin (for non-owners) resets their two-step (audit event, security alert to the member); they set it up again at next sign-in.

**Behind the scenes:** sign-ins, failures, lockouts, password and two-step changes are audit events visible to the owners of every organization the person belongs to; security alerts can't be muted.
**Done when:** the member is signed in on their page.
**Watch for:** five wrong two-step or backup codes lock sign-in for 15 minutes and email the user (10 wrong passwords in 15 minutes do the same); the code boxes turn rose with a message saying what to do; the same message for a wrong email or a wrong password; forgot-password never reveals whether an account exists; session expired mid-form (input kept on the device, signing in again returns them to the page); *Session expired / signed out elsewhere* screen; a member who requires two-step can't turn it off; the only owner losing their phone and codes needs Vento support.
**Target:** under 20 seconds and 2 clicks for a daily sign-in. **Test:** `e2e/auth/sign-in.spec.ts` **Status:** draft
