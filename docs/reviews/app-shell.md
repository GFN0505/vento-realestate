# Review guide: brick 3a, App shell

Try each feature yourself, then tick it or note what to change. Nothing merges until every feature has your OK. About 20–30 minutes.

## Before you start
Your `pnpm dev` keeps working as before. If it isn't running, in a terminal in the project folder run each of these:

```bash
pnpm db:migrate
```
```bash
pnpm dev
```

Open **http://localhost:5173** and sign in with your own account (GFN), which is the owner of its organization.

To see other roles, load the demo company (it doesn't touch your accounts):

```bash
pnpm db:seed
```

Demo people sign in with the password on the `SEED_PASSWORD` line of your `.env`. Tunde (viewer) and Grace (sales) need no two-step; owners, admins, finance and HR need an authenticator app.

| Person | Email | Role |
|---|---|---|
| Olumide Bankole | olumide@ventohomes.ng | Owner |
| Grace Umeh | grace@ventohomes.ng | Sales |
| Tunde Ola | tunde@ventohomes.ng | Viewer |
| Kunle Ojo | kunle@ventohomes.ng | Project manager (Parkview SPV only) |

---

## 1. Home
1. Sign in. You land on Home.

**You should see:** a navy hero with your greeting and the date; four key-number tiles for your role (placeholders until Finance and Sales ship), and "Your workspace" cards for the modules you can open.

**Also try:** dark mode (your name at the bottom of the side panel → Dark), and a phone-size window.

- [ ] OK  ·  Notes:

## 2. Side panel
1. Look at the modules listed: only the ones your role can open.
2. Drag the panel's right edge wider and narrower (220–320px). Reload: it remembers. Double-click the edge to reset.
3. Press `[` to collapse it to icons; press again to open.
4. Click a module, e.g. **Projects**: its Coming soon page.

**Also try:** sign in as **Grace (sales)**: HR & payroll and Finance-only items shouldn't appear at all.

- [ ] OK  ·  Notes:

## 3. Access you don't have
1. Signed in as Grace, type **localhost:5173/hr** in the address bar.

**You should see:** "You don't have access to HR & payroll", naming who can give access. The module is never shown in her menus.

- [ ] OK  ·  Notes:

## 4. Command palette and shortcuts
1. Press **⌘K**, type "sales", press Enter.
2. Press **?** to see all shortcuts; try `g` then `h` to go Home.

- [ ] OK  ·  Notes:

## 5. Entity and organization switching
1. Use the **Entity** menu at the top to pick one company, then All entities. The address bar keeps your choice, so back/forward and shared links work.
2. If you belong to two organizations (your second account can be invited later in 3b), click the organization card at the top of the side panel to switch.

- [ ] OK  ·  Notes:

## 6. Theme and Preview as role
1. Your name (bottom-left) → choose Light, Dark or System. Reload: no flash.
2. As the owner: your name → **Preview as role** → Sales. The banner stays until you press **Stop preview**, and you see what Sales sees, never more than you can.

- [ ] OK  ·  Notes:

## 7. Errors and offline
1. Visit **localhost:5173/nothing-here**: the Not found page.
2. Turn your Wi-Fi off, click a module you haven't opened: Vento's "You're offline" page (not Chrome's). Turn Wi-Fi back on: it continues by itself.

- [ ] OK  ·  Notes:

## 8. Looks and feel
- [ ] Classy and calm; feels like one product with sign-in
- [ ] Light and dark both look deliberate
- [ ] Phone size works (bottom tabs, More)
- [ ] Wording is clear

## When you're done
Reply with the feature numbers you're happy with, and what to change for any that aren't. I'll fix those on this branch for you to re-check before we merge.
