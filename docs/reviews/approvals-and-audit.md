# Review guide: brick 4, Approvals and audit log

Try each feature yourself, then tick it or note what to change. Nothing merges until every feature has your OK. Allow about 45 minutes.

Emails print in the API terminal (where `pnpm dev` runs) unless you've set up Postmark. Approving never happens from an email: the button only opens Vento Real Estate.

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

Open **http://localhost:5173**. Demo people sign in with the password on the `SEED_PASSWORD` line of your `.env`. Their emails, and the authenticator secrets for those who need two-step, are in `.seed-logins.txt`. Use two browser windows (one private) so you can be two people at once.

| Person | Role | What they're for here |
|---|---|---|
| Olumide Bankole (`olumide@ventohomes.ng`) | Owner, the only one at first | Approves, sets rules, reads the audit log |
| Ope Martins (`ope@ventohomes.ng`) | Admin | Has a request waiting for Olumide |
| Chinedu Eze (`chinedu@ventohomes.ng`) | Facility | Holds a role with Approve, so he gets the two-step banner |
| Bayo Ogunleye (`bayo@ventohomes.ng`) | Custom role "Site engineer", Parkview only | The role the seeded requests are about |
| Funmi Akande (`funmi@ventohomes.ng`) | Admin, Parkview only | Can't read the audit log |

---

## 1. The Approvals page
As **Olumide**: **Approvals** in the side panel (it has a count at the top too).

**You should see:** three tabs, **Waiting for me · 1**, **My requests** and **Decided**. One request is open on the right: "Site engineer: Projects & construction Approve added", asked by Ope with the reason "Halima signs off site POs now". It shows a before and after table, the policy line, and the steps ("Requested by Ope Martins", "Owner or Admin"). The primary button reads **Approve role change**. **Decided** has one approved and one rejected request.

**Also try:** J and K move through the list; the address bar shows `?id=` when you open one.

- [ ] OK  ·  Notes:

## 2. Approve Ope's request (2 clicks)
Still as Olumide, click **Approve role change**.

**You should see:** a toast, and the request leaves your list. It is now under **Decided**. Open **Settings → Roles & permissions → Site engineer**: Projects now has Approve ticked, and the role requires two-step. The role page's ⋯ → **View history** shows the entry "approved by Olumide Bankole". An email to Ope prints in the terminal.

- [ ] OK  ·  Notes:

## 3. Two-step banner for roles with Approve
Sign in as **Bayo** (Site engineer), then as **Chinedu** (Facility).

**You should see:** the thin amber banner about setting up two-step within 7 days. Chinedu's role (Facility) has Approve, so it requires two-step now too. Ngozi (Land & legal) and Kunle (Project manager) have the same.

- [ ] OK  ·  Notes:

## 4. Reject with a comment
As **Ope**: **Settings → Roles & permissions → Site engineer**, untick one box (say Documents: Create), and click **Send for approval**. Type a reason and send.

**You should see:** the page now says "Waiting for approval by Owner or Admin · nothing changes until it's approved" with **Cancel request**, and the grid is read-only. Under **Approvals** → **My requests** it shows as waiting.

Then as **Olumide**, open the request, try **Reject** with no comment ("Enter a comment to reject."), then type "Not now" and click **Reject**.

**You should see:** Ope's role page is editable again and nothing changed. Ope's **My requests** shows "Rejected: “Not now”".

- [ ] OK  ·  Notes:

## 5. Your own request
As **Ope**, send another change to Site engineer (as in step 4) and open it under **My requests**.

**You should see:** "This is your own request. … will review it. You can cancel it while it waits." with **Cancel my request**, and no Approve or Reject. Cancel it. As Olumide, a second request for the same role while one is waiting is refused with a link to the first.

- [ ] OK  ·  Notes:

## 6. Make someone an owner
As **Olumide** (the only owner): **Settings → Team**, change Tunde Ola's role to **Owner** and confirm.

**You should see:** because Olumide is the only owner, nobody else could approve, so it goes ahead at once and the audit log marks it "No one else could approve this".

Now there are two owners. Sign in as Tunde in the other window (set up two-step if asked). Back as **Olumide**, make **Kemi Adebayo** an owner.

**You should see:** the confirm asks **Why?** and the button reads **Send for approval**. Kemi's row says "Owner · waiting for approval". Tunde sees it under **Approvals** (his button reads "Make Kemi Adebayo an owner"). Olumide can't approve it himself. After Tunde approves, Kemi is an owner and every owner gets the usual email.

- [ ] OK  ·  Notes:

## 7. Invite an owner, then resend
As **Olumide**: **Invite people**, paste a new email, choose **Owner**.

**You should see:** a note "Owner invitations need approval before they're sent." and a **Why?** box. After sending, no invitation email prints. Tunde approves it under **Approvals**; the invitation now appears on Team and its email prints.

Open that invitation's ⋯ → **Resend** (after a minute).

**You should see:** resending an owner's invitation needs approval too: **Why?**, then Tunde approves, and only then the new link prints.

- [ ] OK  ·  Notes:

## 8. Approval rules
As **Olumide**: **Settings → Approval rules**.

**You should see:** two rules, "Change a role's permissions" (Owner or Admin) and "Make someone an owner" (Owner), with Any amount and all companies.

- **Add rule:** try adding a second rule with the same action, amount and companies: it is refused. Add one for "Change a role's permissions" limited to Parkview with approver **Owner**. Roles that can't approve in that area are off, and hovering shows why.
- **Edit** it (add a second step) and save.
- **Delete rule:** confirm; the toast has **Undo**. Open the same rule in two windows, change it in one, and delete in the other: it is refused until you reopen it.
- Every other owner gets an email about each change.
- As **Ope** or **Funmi** the page is read-only: "Only owners can change approval rules."
- Delete a role used in a rule (make a test role, put it in a rule): refused with "… approves in 1 rule. Change that rule first."

- [ ] OK  ·  Notes:

## 9. Audit log
As **Olumide**: **Settings → Audit log**.

**You should see:** the last 7 days, newest first, in plain words: When, Who, Module, What, Before → after, Where. No codes or ids.

- Search "Site engineer": the role changes and the approvals show up. Click a row: every field, who approved it, and a link to the record.
- Filter by **Module**, **Person** (it lists people who appear in the log for those dates, including the removed Emeka Nwosu), **Company** and **Dates** (a preset, then a custom From and To; more than a year apart is refused).
- Copy the address into the other window: the same view opens.
- Changes by Vento Real Estate staff show "Vento Real Estate"; an admin from another organization shows "An admin in another organization".
- **Export CSV:** open it in a spreadsheet. A matching **Exported the audit log** entry appears.
- As **Funmi** (Parkview only) or Grace (sales): the page says you don't have access.

- [ ] OK  ·  Notes:

## 10. Phone and dark mode
Make the window phone-size (375 px) and switch to dark mode (avatar menu).

**You should see:**
- **Approvals** as a bottom tab for owners and admins (Sales moves to More); a request opens as its own page and **Approve** and **Reject** sit in a bar above the tabs;
- Approval rules as one card per rule; Audit log rows as cards, and Module and Where drop out of the table when the column is narrow;
- everything readable in dark mode, with no sideways scroll.

- [ ] OK  ·  Notes:

## 11. Looks and feel
- [ ] Approving feels quick: 2 clicks
- [ ] The words make sense to a non-technical owner
- [ ] The audit log answers "who changed this?" in under 30 seconds
- [ ] Light, dark and phone size all look deliberate

## When you're done
Reply with the feature numbers you're happy with, and what to change for any that aren't. I'll fix those on this branch for you to re-check before we merge.
