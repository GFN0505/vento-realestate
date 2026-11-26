# Review guide: feature flags and plans

Most of this slice is invisible to customers by design. You review it as **Vento's first super-admin**, using commands in a terminal, and then see the effect in the app. About 20 minutes.

## Before you start
Your `pnpm dev` keeps running. Open a **second terminal** in the project folder for the commands below. Every command that changes something shows what it will do and asks you to confirm; type `y`.

Your own organizations (GFN, GFN anD CO) are Vento **internal** organizations on **Enterprise**, so you still see every module as before.

---

## 1. Become the first super-admin
```bash
pnpm superadmin grant erpvento@gmail.com --bootstrap --reason "First Vento super-admin"
```
```bash
pnpm superadmin list
```
**You should see:** you listed as a super-admin. (Super-admins need two-step sign-in; your owner account already has it.)

- [ ] OK  ·  Notes:

## 2. See what's released and to whom
```bash
pnpm flags list
```
**You should see:** every module at stage `internal` (only Vento's own organizations see them), with the plans that include each. Compliance shows no plans because it's in every plan and never sold separately.

- [ ] OK  ·  Notes:

## 3. A new customer starts on Starter
1. Sign out, then **Create a company account** with a new email (e.g. `amaka@example.ng`) and company "Lekki Partners Ltd". Finish onboarding and two-step.
2. Look at the side panel and Home.

**You should see:** only Home. Nothing is released to customers yet, so nothing else appears anywhere, not in the side panel, ⌘K or Home. Typing `localhost:5173/sales` shows "We can't find that page".

- [ ] OK  ·  Notes:

## 4. Switch a module off for one organization
Back in your own account (GFN):
```bash
pnpm flags override "GFN" land off --by erpvento@gmail.com --reason "Review test"
```
Come back to the browser tab (or reload).

**You should see:** Land & title disappears from the side panel, ⌘K and Home within a few seconds. If you had it open, you're taken Home with a short notice.

Turn it back on:
```bash
pnpm flags override "GFN" land clear --by erpvento@gmail.com --reason "Review test done"
```

- [ ] OK  ·  Notes:

## 5. The owner's upgrade note
Give Lekki Partners early access to Sales so it can discover commissions (a Growth feature):
```bash
pnpm flags override "Lekki Partners Ltd" projects on --by erpvento@gmail.com --reason "Review"
```
```bash
pnpm flags override "Lekki Partners Ltd" sales on --by erpvento@gmail.com --reason "Review"
```
```bash
pnpm flags override "Lekki Partners Ltd" sales.commissions on --by erpvento@gmail.com --reason "Review"
```
Sign in as Amaka (the owner), press ⌘K and type "commissions".

**You should see:** one quiet row, "Commissions · Available on Growth", and Enter opens **Talk to Vento** (email or WhatsApp, with the company and plan filled in). Non-owners never see this, and Preview as role hides it.

- [ ] OK  ·  Notes:

## 6. A trial ending soon
```bash
pnpm plans trial "Lekki Partners Ltd" growth --days 5 --by erpvento@gmail.com --reason "Review"
```
As Amaka, reload Home.

**You should see:** a calm line, "Your Growth trial ends on …", visible to owners only. End it with:
```bash
pnpm plans trial "Lekki Partners Ltd" --end --by erpvento@gmail.com --reason "Review done"
```

- [ ] OK  ·  Notes:

## 7. Everything is recorded
Run `pnpm db:studio` and open `platform_audit_events`: every command above is there with your name, the operator, the reason and before/after. Lekki Partners' own `audit_events` show plain lines like "Vento started a Growth trial", with no internal reasons.

- [ ] OK  ·  Notes:

## Not reviewable yet
**Plan limits** (e.g. Starter's 2 entities and 10 people) can't be hit from a screen until 3b adds inviting people and entities. They're covered by API tests and will be in the 3b review.

## When you're done
Reply with the feature numbers you're happy with, and what to change for any that aren't.
