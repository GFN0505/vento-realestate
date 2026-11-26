# Review guide: brick 3c, Roles and organization

Try each feature yourself, then tick it or note what to change. Nothing merges until every feature has your OK. Allow about 30 minutes.

This builds on Team (pull request #5). Review and merge Team first; then this one is next.

## Before you start
When I tell you this branch is in your folder, run these in the project folder, one at a time:

```bash
pnpm db:migrate
```
```bash
pnpm db:seed
```

Your running `pnpm dev` picks up the change. Open **http://localhost:5173**. Demo people sign in with the password on the `SEED_PASSWORD` line of your `.env`. The authenticator secrets are in `.seed-logins.txt`.

| Person | Role | Organization |
|---|---|---|
| Olumide | Owner | Vento Homes Ltd |
| Funmi | Admin, Parkview only | Vento Homes Ltd |
| Bayo | Site engineer (a custom role) | Vento Homes Ltd |
| Bisi | Owner | Lekki Partners Ltd (Starter: 2 of 2 companies) |

---

## 1. "Company", not "Entity"
As **Olumide**, look at the menu at the top of the page, then open Team and the Invite form.

**You should see:** "Company: All companies" at the top, with **+ Add company** at the bottom of that menu. "Entity" appears nowhere: Team says "Company access", and the invite form says "Only some companies".

- [ ] OK  ·  Notes:

## 2. Organization details
Settings (bottom of the side panel). It opens on **Organization**, with a side menu: Organization, Companies, Team, Roles & permissions.

**You should see:**
- the name, head office state and financial year;
- **Save changes** saves only what you changed;
- leaving with unsaved changes asks first.

The Company menu at the top is hidden here, because these pages cover the whole organization.

- [ ] OK  ·  Notes:

## 3. Add a company
**Companies → Add company**. Notice the line about estates being projects. Add "Ajah Court SPV Ltd" as a Project company (SPV) with RC `1999001`.

**You should see:** it in the list and in the Company menu, with a **Switch to it** option in the message.

**Also try:**
- **RC `1789234`:** refused, naming Parkview.
- **RC `1832276`:** belongs to the archived Ikoyi Crest, so it offers **Restore it instead**.
- **+ Add company** from the top menu.

- [ ] OK  ·  Notes:

## 4. Archive and restore
- **Archive "Ajah Court":** row ⋯ → **Archive**. It goes at once, and **Undo** brings it back.
- **Archive the holding company:** it asks first.
- **Restore Ikoyi Crest:** under **Archived**, "Archived … by Olumide Bankole" → **Restore**.

**You should see:** the last active company can never be archived.

- [ ] OK  ·  Notes:

## 5. The plan limit
As **Bisi** (Lekki Partners, Starter, already at 2 of 2), click **Add company**.

**You should see:** the plan message instead of a form that can't save, with **Talk to Vento** and **See archived companies**.

- [ ] OK  ·  Notes:

## 6. See what each role can do
As **Olumide**: **Roles & permissions**. Click **Sales**, then **Owner**.

**You should see:** a grid of areas against View, Create, Edit, Delete, Export and Approve, with a line saying built-in roles can't be changed. The list shows who has each role (a link to Team) and whether two-step is required.

**Also try:** a laptop-width window (about 1024 px) and phone size: the grid becomes a list of areas, each opening a sheet of switches.

- [ ] OK  ·  Notes:

## 7. Make your own role
Open **Project manager** → **Duplicate role** → name it "Surveyor" → **Create role**. Untick **Sales: View**, then tick **Documents: Create**.

**You should see:**
- a bar reading "2 changes · applies to nobody yet" → **Save changes**, with **Undo** in the message;
- ticking Finance: Edit locks the two-step switch on;
- **Preview this role** shows Vento as a Surveyor, and **Stop preview** ends it.

**Also try:**
- **Discard** (with Undo).
- Leaving with unsaved ticks: it asks first.
- Renaming by clicking the name.

- [ ] OK  ·  Notes:

## 8. Giving and deleting roles
- **Give "Surveyor" to someone:** on Team, open their role menu. Custom roles sit under the built-ins.
- **Open "Site engineer":** Delete is disabled with "Move 1 person to another role first" (Bayo has it).
- **Delete "Auditor":** nobody has it, so ⋯ → **Delete role** works.

- [ ] OK  ·  Notes:

## 9. Who can't do what
- **Funmi (admin, Parkview only):**
  - Organization is read-only and names whom to ask.
  - Companies shows only Parkview, and she can fix its details, but she can't add, archive or restore.
  - She can't create roles.
- **Bayo (site engineer):** his side panel shows only what his role allows. There's no Settings.
- **Your own role:** read-only, "You have this role…".

- [ ] OK  ·  Notes:

## 10. Home checklist
For an owner with one company (sign up a new test company, or ask me for a fixture), Home shows "Add your other companies (SPVs)". **We only have one company** marks it done, with Undo.

- [ ] OK  ·  Notes:

## 11. Looks and feel
- [ ] Classy and calm; feels like Team and the rest of Vento
- [ ] The grid reads at a glance: allowed, not allowed, locked and changed all look different
- [ ] Light, dark, laptop and phone sizes all look deliberate
- [ ] Wording is clear

## When you're done
Reply with the feature numbers you're happy with, and what to change for any that aren't.
