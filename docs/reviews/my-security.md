# Review guide: brick 3d, My security and passkeys

Try each feature yourself, then tick it or note what to change. Nothing merges until every feature has your OK. Allow about 30 minutes, plus a phone or Mac with Face ID or Touch ID for passkeys.

## Before you start
When I tell you this branch is in your folder, run these in the project folder, one at a time:

```bash
pnpm install
```
```bash
pnpm db:migrate
```
```bash
pnpm db:seed
```

Restart `pnpm dev` (stop it with Ctrl+C, then run it again), because the passkey add-on is new.

Open **http://localhost:5173**. Demo people sign in with the password on the `SEED_PASSWORD` line of your `.env`. The authenticator secrets are in `.seed-logins.txt`.

| Person | Role | Note |
|---|---|---|
| Grace | Sales | Two-step off: try turning it on |
| Olumide | Owner | Two-step required by role |
| Bisi | Owner, Lekki Partners | "Two-step for everyone" is on there |
| Femi | Sales, Lekki Partners | Must set up two-step |

Passkeys use Face ID or Touch ID. On a Mac, Chrome or Safari works; `localhost` is allowed for testing.

---

## 1. My security for everyone
Sign in as **Grace**, click your name at the bottom of the side panel, then **My security**.

**You should see:**
- your name, editable in place;
- a *Sign-in* card (password; two-step **Off** with **Turn on**);
- *Passkeys*;
- *Where you're signed in*, with this device marked.

Grace can't open other Settings pages, only this one.

- [ ] OK  ·  Notes:

## 2. Turn on two-step yourself
As Grace, click **Turn on**. Confirm your password, scan the QR code with your authenticator app, enter the code and save your backup codes.

**You should see:**
- two-step **On**, and the number of backup codes left;
- **Make new codes**;
- **Turn off**, which asks for your password and a code.

- [ ] OK  ·  Notes:

## 3. Add a passkey and sign in with it
In *Passkeys*, click **Add a passkey** and use Touch ID or Face ID.

**You should see:** the passkey named after your device (for example "iCloud Keychain · Mac"), with Rename and Remove under ⋯. Then sign out. On the sign-in page, click the email field and pick your passkey, or click **Sign in with a passkey**. You're in with no code.

- [ ] OK  ·  Notes:

## 4. Where you're signed in
Sign in as the same person in a second browser, or a private window.

**You should see:**
- both devices listed, each with "Signed in …";
- **Sign out** ends the other one at once;
- **Sign out other devices** asks first.

- [ ] OK  ·  Notes:

## 5. Change password
**Change password**: the rules show from the start and tick as you type. A wrong current password is refused.

- [ ] OK  ·  Notes:

## 6. Required by your role
Sign in as **Olumide** (owner). Two-step shows as required by your role. There's no **Turn off**.

- [ ] OK  ·  Notes:

## 7. Require two-step for everyone
1. As **Bisi** (owner, Lekki Partners): **Settings → Organization → Security**. The switch is on, with a count of who has two-step.
2. Sign in as **Femi**. You're asked to set up two-step: a banner, or the setup sheet if the 7 days are up.
3. Back as Bisi, turn the switch off. It asks first, and every owner gets an email (shown in the API terminal).

**Also try:** a non-owner sees the card read-only. On Roles, every role shows "Required" while the switch is on.

- [ ] OK  ·  Notes:

## 8. Admin reset removes passkeys
As **Olumide**: on Team, open the person you added a passkey for (from step 3) → ⋯ → **Reset two-step**.

**You should see:** the confirm mentions their passkeys. Afterwards their passkey no longer signs in, and they must set a new password.

- [ ] OK  ·  Notes:

## 9. Looks and feel
- [ ] Calm and reassuring; plain words
- [ ] Light, dark, laptop and phone sizes look deliberate
- [ ] Tab through the page: every button shows a clear focus ring

## Good to know
- Passkeys are switched on for your own organizations only (early access). Customers get them after this review.
- Places ("Lagos, Nigeria") need the free DB-IP file, which is set up at deploy. On your laptop no place shows, and that's expected.

## When you're done
Reply with the feature numbers you're happy with, and what to change for any that aren't.
