# Review guide: brick 2a, Accounts and access

Try each feature yourself, then tick it or note what to change. Nothing merges until every feature has your OK. About 30–40 minutes in total.

## Before you start (once)
Open a terminal in the project folder and run, one at a time:

```bash
pnpm db:up
```
```bash
pnpm db:migrate
```
```bash
pnpm db:seed
```
```bash
pnpm dev
```

Then open **http://localhost:5173** in your browser.

- **Emails** don't leave your computer. To see the latest ones (codes and links), open a second terminal and run `pnpm mail`. Add a number for more: `pnpm mail 10`.
- **Two-step sign-in** needs an authenticator app on your phone: Google Authenticator, Microsoft Authenticator or similar.
- **Demo company:** Vento Homes Ltd, with three entities and eight people. Sign in as any of them with the password on the `SEED_PASSWORD` line of your `.env` file:

| Person | Email | Role | Two-step |
|---|---|---|---|
| Olumide Bankole | olumide@ventohomes.ng | Owner (MD) | Required |
| Aisha Bello | aisha@ventohomes.ng | Finance | Required |
| Kemi Adebayo | kemi@ventohomes.ng | HR | Required |
| Ngozi Adeyemi | ngozi@ventohomes.ng | Land & legal | Optional |
| Kunle Ojo | kunle@ventohomes.ng | Project manager (Parkview SPV only) | Optional |
| Grace Umeh | grace@ventohomes.ng | Sales | Optional |
| Ope Martins | ope@ventohomes.ng | Facility | Optional |
| Tunde Ola | tunde@ventohomes.ng | Viewer | Optional |

- `pnpm db:seed` also prints two invitation links: one pending, one expired. Running it again gives fresh links (only scrambled versions are stored, so old links can't be shown again).
- **Light and dark:** the app follows your computer's appearance setting. Try both.
- **Phone size:** in Chrome, press ⌥⌘I, then the phone icon, and pick a phone.

---

## 1. Create a company account and verify the email
1. On the sign-in page choose **Create a company account**.
2. Enter your name, a company name, an email (any, e.g. `you@example.ng`) and a password. Watch the rules tick as you type. Try `password1234` first: it should be refused as too common.
3. Tick the terms box and **Create account**.
4. Run `pnpm mail`, copy the 6-digit code, enter it, and choose **Verify email**. Or open the link instead.

**You should see:** the onboarding page after verifying.

**Also try:**
- A wrong code.
- **Resend**: it's limited to once a minute.
- Signing up again with the same email. You should see the normal "check your email" step, and `pnpm mail` shows that the existing account got a notice. Nobody can find out who has an account.

- [ ] OK  ·  Notes:

## 2. Set up your organization and first entity
1. **Your organization:** check the name, choose the head office state and the financial-year start month, then **Continue**.
2. **First entity:** the name, holding company or SPV, an RC number and TIN (try an RC with letters to see the gentle warning; it still lets you finish), VAT registered, then **Finish setup**.

**You should see:** "Set up two-step sign-in", because owners must use it.

**Also try:** close the tab after step 1, sign in again, and you should land on step 2.

- [ ] OK  ·  Notes:

## 3. Set up two-step sign-in and backup codes
1. Confirm your password.
2. Scan the QR code with your authenticator app (or type the key shown), and enter the 6-digit code.
3. Download or copy the 10 backup codes, tick **I've saved my backup codes**, and continue.

**You should see:** the temporary signed-in page: "You're signed in to … as Owner."

- [ ] OK  ·  Notes:

## 4. Sign in, wrong tries and lockout
1. **Sign out**, then sign in as **Olumide** with the seed password. He has to set up two-step first; do it with your app.
2. Sign out and sign in again: password, then the code from your app.
3. Sign in as **Tunde** (viewer): no two-step needed, straight in.

**Also try:**
- A wrong password, and an email that doesn't exist. Both get the same message.
- Sign in with **Use a backup code** instead of the app code. The same backup code won't work twice.
- Five wrong codes in a row. Sign-in pauses for 15 minutes with a live countdown, and `pnpm mail` shows a security alert. (Use your own test account for this, not Olumide, or wait 15 minutes afterwards.)
- **Keep me signed in on this device**: lasts 30 days. Without it you're signed out after 30 minutes idle.
- **Sign out everywhere** on the signed-in page.

- [ ] OK  ·  Notes:

## 5. Forgot and reset password
1. On sign-in choose **Forgot password?** and enter Grace's email (`grace@ventohomes.ng`).
2. The page says a link is on its way. Try an email that doesn't exist: you get the same message.
3. Open the link from `pnpm mail`, choose a new password, and sign in with it.

**Also try:** using the same link twice (it works once), and reusing one of your last 5 passwords (refused).

- [ ] OK  ·  Notes:

## 6. Accept an invitation
1. Sign out. Open the **pending** invitation link printed by `pnpm db:seed`.
2. Check what it shows: the company, who invited you, the role, which entities, what the role can approve, and whether two-step is required.
3. Enter a name and password, accept, and set up two-step if asked.

**You should see:** "You're signed in to Vento Homes Ltd as …" with the invited role.

**Also try:**
- The **expired** link: it should name who to ask for a new one.
- A made-up link, e.g. `/accept-invitation/abc`: "This invitation link doesn't work".
- Opening the pending link while signed in as someone else: it offers **Sign out and continue**.

- [ ] OK  ·  Notes:

## 7. Session expiry
Waiting 30 minutes is slow, so this one is optional. Sign in without **Keep me signed in**, leave the tab idle for 30 minutes, then click anything.

**You should see:** a "Your session has ended" dialog over the page. Sign in again (password and code) and you're back where you were.

- [ ] OK  ·  Notes:

## 8. Looks and feel (across all screens)
- [ ] Matches the approved designs closely, with your logo
- [ ] Reads well in dark mode
- [ ] Works at phone size (nothing cut off, buttons easy to tap)
- [ ] Wording is clear and in your voice

## Behind the scenes (optional)
Run `pnpm db:studio` and open https://local.drizzle.studio to see the tables:
- `organizations`, `entities`, `members`, `roles` and `role_permissions` (the permission table you approved)
- `invitations`
- `audit_events`: every access change. The database refuses to edit or delete these rows.

## When you're done
Reply with the feature numbers you're happy with, and what to change for any that aren't. I'll fix those on this branch, and you can re-check before we merge.
