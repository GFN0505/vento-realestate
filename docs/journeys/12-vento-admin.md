# Vento admin

Journeys for Vento staff (super-admins), not for customers. Until the super-admin console ships (R2), these run as commands (`pnpm flags …`, `pnpm plans …`) where devops grants database access. The steps below name the command now and the console screen later.

Spec: [feature-flags](../specs/feature-flags.md). Plan: [release-plan](../release-plan.md).

## J-ADM-01 · Release a feature, stage by stage
**Who / how often:** Vento super-admin, every release (every few weeks); a kill switch is rare.
**Starts from:** the feature being *releasable* (built, tested, reviewed, help article written, and the owner's hands-on review done; release plan section 6) and the owner deciding to release it, to everyone or to chosen organizations first. Steps 2–4 are optional: a feature can go straight from `internal` to `on`.

**Steps**
1. `pnpm flags show sales` (later *Feature flags*): stage `internal`, organizations that have it, prerequisites, plans that include it.
2. Once per pilot: `pnpm flags group "Lekki Partners Ltd" pilot --reason "Pilot agreement signed" --by ada@vento.ng`.
3. `pnpm flags stage sales pilot --reason "Release 1 pilot" --by ada@vento.ng` → "Sales will be available to 3 organizations (1 internal, 2 pilot). Continue? (y/N)" → `y` → "Sales is now at pilot. Takes effect within 30 seconds."
4. A pilot member who can view Sales reloads or changes page: **Sales** appears in their sidebar with "Early access".
5. At release: `pnpm flags stage sales on …`. The "Early access" tag disappears; standard organizations whose plan includes Sales now see it.
6. If something breaks: `pnpm flags stage sales off --reason "Receipt allocation bug" …` → "Sales is now off for everyone, including overrides and plans."

**Behind the scenes:** each change writes a platform audit event in the same transaction (who, before → after, reason); release group and override changes also write to that organization's audit trail ("Vento turned on Estates for your organization"). API servers refresh their snapshot within 10 seconds; web apps refetch on the next page change or tab focus. Paystack webhooks keep recording money whatever the stage.
**Done when:** the feature is available to exactly the organizations its stage, groups, plans and overrides say.
**Watch for:** unknown key (refused, closest key suggested); missing `--reason` or a `--by` who isn't a super-admin (refused); a prerequisite unavailable to an organization ("Buyer portal needs Sales and Finance…"); moving to `on` a feature that no plan includes (warning); lowering a stage hides data from organizations that used it (warning with record count; nothing deleted); a member mid-task when it goes off (toast, back to Home); a person in an internal and a standard organization never sees internal-only features in the standard one.
**Target:** 1 command, under 1 minute; effective within 30 seconds. **Test:** `apps/api/src/platform/flags-cli.test.ts` (commands) and `e2e/shell/feature-availability.spec.ts` (navigation, 404, no flash) **Status:** draft

## J-ADM-02 · Put an organization on a plan, start a trial, record a deal
**Who / how often:** Vento super-admin, when a customer signs, upgrades, trials or negotiates; weekly once selling.
**Starts from:** a signed order, a trial request or a pilot agreement.

**Steps**
1. `pnpm plans assign "Lekki Partners Ltd" growth --reason "Signed annual Growth" --by ada@vento.ng` (later *Organization detail*). If they're over a Growth limit: "Lekki Partners Ltd has 7 active projects; Growth includes 5. Nothing is archived, but they can't add projects. Continue? (y/N)".
2. Trial: `pnpm plans trial "Lekki Partners Ltd" enterprise --days 30 --reason "Board pack trial" --by …`. Enterprise features and limits apply until the end date.
3. Deal: `pnpm plans override "Lekki Partners Ltd" limit projects 8 --reason "Negotiated: 8 projects" --by …`.
4. AI: `pnpm plans addon "Lekki Partners Ltd" ai --budget 150000 --reason … --by …`. The owner then sees *Settings → AI* (J-AI-04).
5. The owner sees in their audit trail "Vento moved your organization to Growth", "Vento started a 30-day Enterprise trial (ends 2 Jan 2027)".

**Behind the scenes:** platform and organization audit events in the same transaction; API servers refresh within 10 seconds. A trial ends by itself at its end date (no job needed); a daily job emails the owner 7 days and 1 day before, and Home shows the trial line to owners in the last 7 days. When it ends, its features disappear, data stays, and creates over the restored limits are refused.
**Done when:** the organization's available features and limits match its plan, add-ons and overrides.
**Watch for:** two creates racing for the last slot (only one succeeds); members and pending invitations both count towards `members`; archived records don't count; a non-owner hitting a limit is told whom to ask, never the plan or price; plan contents changed later (a new version; this organization keeps its version until reassigned); Starter organization owner searching ⌘K for "commissions" ("Available on Growth" with **Talk to Vento**), non-owners see nothing.
**Target:** 1 command each, under 1 minute. **Test:** `apps/api/src/platform/plans-cli.test.ts`, `apps/api/src/platform/limits.test.ts`, `apps/api/src/platform/limits.concurrency.test.ts`; `e2e/settings/plan-limits.spec.ts` arrives with 3b **Status:** draft

## Settled by the owner (26 Nov 2026)
- Pilots are optional; if used, they're on Enterprise at no charge while piloting.
- Trial reminders go to owners 7 days and 1 day before the end.
- Changes take effect within 30 seconds.
- No second approver for flag and plan changes while fewer than four people are super-admins.
