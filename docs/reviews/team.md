# Review guide: brick 3b, Team

Try each feature yourself, then tick it or note what to change. Nothing merges until every feature has your OK. Allow about 30 minutes.

Emails print in the API terminal (where `pnpm dev` runs) unless you've set up Postmark. Real delivery comes in its own pull request.

## Before you start
In a terminal in the project folder, run each of these:

```bash
pnpm db:migrate
```
```bash
pnpm db:seed
```
```bash
pnpm dev
```

Open **http://localhost:5173**. Demo people sign in with the password on the `SEED_PASSWORD` line of your `.env`. Their emails, and the authenticator secrets for those who need two-step, are in `.seed-logins.txt`.

| Person | Role | Organization |
|---|---|---|
| Olumide | Owner | Vento Homes Ltd |
| Funmi | Admin, Parkview only | Vento Homes Ltd |
| Grace | Sales | Vento Homes Ltd |
| Bisi | Owner | Lekki Partners Ltd (Starter plan) |

---

## 1. Setup checklist on Home
Sign in as **Bisi** (Lekki Partners).

**You should see:** "Finish setting up" with the done steps folded into one line and **Invite your team** open. Its **Invite people** opens the invite sheet over Home. ⋯ → **Hide checklist** shows Undo. ⌘K "Show setup checklist" brings it back. Grace (sales) never sees it.

- [ ] OK  ·  Notes:

## 2. The Team list
As **Olumide**: Settings (bottom of the side panel) → **Team**.

**You should see:**
- owners first, then everyone A to Z, then open invitations, including one expired and one "Email not delivered";
- search, the role filter, and the **Invited** and **Removed** chips;
- the search and filters kept in the address bar.

**Also try:** dark mode and a phone-size window (cards).

- [ ] OK  ·  Notes:

## 3. The list follows the company you pick
Still on Team, pick **Parkview** in the Entity menu at the top.

**You should see:** "People who can work in Parkview Residences SPV Ltd": the owners, everyone with all entities, and Parkview-only people. Kunle and Funmi (Parkview only) are there. Pick **Lekki Pearl Estates** instead and they disappear. **Show all entities** clears it.

- [ ] OK  ·  Notes:

## 4. Invite people
Click **Invite people** and paste this whole line:

`ada@example.ng, tobi@example.ng, tobi@example.ng, chidi@gmial.com, kemi@, grace@ventohomes.ng`

**You should see:**
- the duplicate merged;
- "Did you mean chidi@gmail.com?";
- "kemi@" marked "Check this email", with **Remove**;
- Grace marked as already on the team;
- one role preselected, and "Access: All entities · Change".

**Send** counts only the unmarked rows. After sending, **View invited** shows them, and the marked rows stay in the sheet. The emails print in the API terminal.

**Also try:**
- **Give people different roles**;
- opening the sheet while Parkview is picked at the top (access starts as Parkview only);
- Esc, then reopening the sheet (your draft is kept).

- [ ] OK  ·  Notes:

## 5. Manage people
On a member's row:
- **Change their role** in place: the toast has Undo.
- **Make someone an Owner:** asks first.
- **Click the row** to change their entity access, then **Save changes**.
- **⋯ → Reset two-step:** they get an email.
- **⋯ → Remove from team:** they move to **Removed**, with **Invite again**.

On an invitation's ⋯: **Resend** and **Withdraw** (with Undo).

- [ ] OK  ·  Notes:

## 6. What other people can and can't do
- **Funmi** (admin, Parkview only): sees only Parkview names ("and 1 other" for wider access), can't change owners, and invites only to Parkview.
- **Grace** (sales): no Settings anywhere. `localhost:5173/settings/team` says she doesn't have access and names who to ask.
- **Your own row:** read-only.

- [ ] OK  ·  Notes:

## 7. Plan limits
As **Bisi** (Starter, 10 people), open Invite people and paste 9 or more addresses (Lekki has 2 people, so 8 places are left).

**You should see:** "You have N places left on your Starter plan. Talk to Vento for more." above a disabled Send, with **Send only N**. Rows that don't fit say "No place left on your plan".

- [ ] OK  ·  Notes:

## 8. Looks and feel
- [ ] Classy and calm; feels like the rest of Vento
- [ ] Simple: inviting a batch takes 3 clicks
- [ ] Light, dark and phone size all look deliberate
- [ ] Wording is clear

## When you're done
Reply with the feature numbers you're happy with, and what to change for any that aren't. I'll fix those on this branch for you to re-check before we merge.
