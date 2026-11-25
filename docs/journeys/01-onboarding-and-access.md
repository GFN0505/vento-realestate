# Onboarding and access

## J-ONB-01 · Set up a new organization
**Who / how often:** MD or admin, once per customer.
**Starts from:** Sign-up link from the website or a Vento sales invite.

**Steps**
1. *Sign up, verify email:* name, work email, password. Verifies email from the link.
2. *Onboarding, step 1 (organization):* organization name, state, logo (optional).
3. *Onboarding, step 2 (first entity):* entity name, RC number, TIN, VAT registered? Defaults: base currency NGN, financial year Jan–Dec.
4. *Onboarding, step 3 (first project and units):* project name, location, type, then "Add units now" (bulk create) or "Import from Excel" or "Skip".
5. Lands on *Executive home* with the *Setup checklist*: invite team, add bank account, set approval rules, connect Paystack, import buyers.

**Behind the scenes:** organization, owner member, entity, default chart of accounts for the entity, default approval rules, default role templates, current statutory rules all created in one transaction. Audit events written.
**Done when:** the user sees their project on Home and the checklist shows step 1 done.
**Watch for:** email already registered (offer sign in); leaving mid-onboarding and coming back resumes at the same step; RC/TIN format validation without blocking ("You can add this later").
**Target:** ≤ 5 minutes to first project. **Test:** `e2e/onboarding/new-organization.spec.ts` **Status:** draft

## J-ONB-02 · Invite the team and set roles
**Who / how often:** Admin, at setup then occasionally.
**Starts from:** Setup checklist, or *Settings → Team members*.

**Steps**
1. *Team members* → "Invite people". Paste several emails, pick a role template for each (Site engineer, Sales agent, Finance officer…).
2. Optionally limit access to entities or projects ("Halima: Palm Grove only").
3. "Send invites". Invitees get the invite email (and WhatsApp if a phone number was given).
4. Invitee: *Accept invitation* (shows organization and role) → set password → two-factor prompt (required for finance and owner roles) → lands on their role home.

**Behind the scenes:** invitations expire after 7 days; role changes are audit events; permissions are enforced server-side.
**Done when:** the member appears as `active` with their role.
**Watch for:** invite to someone already in another organization (allowed, they switch organizations); expired invite (resend); removing the last owner (blocked).
**Target:** 3 clicks per batch. **Test:** `e2e/settings/invite-members.spec.ts` **Status:** draft

## J-ONB-03 · Import existing buyers and payments from Excel
**Who / how often:** Finance or admin, at go-live and when migrating a project.
**Starts from:** Setup checklist or ⌘K "Import".

**Steps**
1. *Excel import wizard:* pick what to import (units, buyers, subscriptions, payments to date), download the template or upload their own file.
2. Map columns (auto-matched by header name, adjustable).
3. Preview with row-level errors ("Row 14: unit A-07 not found", "Row 22: amount is not a number"). Fix in the file and re-upload, or skip bad rows.
4. "Import 238 rows". Progress, then a summary with links.

**Behind the scenes:** one import job; rows created in batches inside transactions; historical receipts post to the ledger with their original dates in an open period, or to an opening-balance journal if the period is closed. Every created row is tagged with the job id.
**Done when:** the import shows `imported` and the records are visible.
**Watch for:** duplicates of existing buyers (match by phone/email and offer merge); money in strings like "85m" or "₦85,000,000" (parse or flag); undo after receipts have been allocated further (blocked with explanation).
**Target:** under 10 minutes for 500 rows. **Test:** `e2e/settings/excel-import.spec.ts` **Status:** draft

## J-ONB-04 · Sign in with two-factor, recover access
**Who / how often:** Everyone, daily.

**Steps**
1. *Sign in:* email and password → *two-factor challenge* (authenticator code; backup code link).
2. Forgot password: *Forgot / reset password* → email link → new password → signed in, other sessions ended.
3. Lost authenticator: backup code, or an owner resets their two-factor (audit event, the member is notified).

**Watch for:** rate-limited attempts with a clear wait message; session expired mid-form (draft kept, sign in again returns them to the page); *Session expired / signed out elsewhere* screen.
**Test:** `e2e/auth/sign-in.spec.ts` **Status:** draft
