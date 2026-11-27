# Review guide: real email through Postmark

This pull request makes Vento's emails real: invitations, sign-in codes, password resets and security alerts. Most of it is setup outside the app. Allow about 20 minutes, plus waiting for Postmark to approve your domain.

Nothing changes until you set it up. Without the Postmark lines in `.env`, emails keep printing in the terminal and saving to `.mail/` as they do today.

## Before you start: what you need
1. **A sending domain** you control, used only for app email. For example `mail.yourdomain.com`.
2. **A Postmark account** (postmarkapp.com) with one server called "Vento staging".
3. In Postmark: **Sender signatures → Domains → Add domain**, then add the DKIM and Return-Path records it shows at your domain registrar. Return-Path can take up to 48 hours to verify.
4. Copy the server's **API token** from Postmark (Server → API Tokens). Never paste it into chat; it only goes in your `.env`.

Until Postmark approves your account, it only sends to addresses on your verified domain. That's fine for this review.

## 1. Send yourself a real invitation
Add these lines to your `.env`, with your own token, domain and email:
```
EMAIL_TRANSPORT=postmark
POSTMARK_SERVER_TOKEN=<your staging server token>
EMAIL_FROM="Vento Real Estate <no-reply@mail.yourdomain.com>"
EMAIL_ALLOWED_RECIPIENTS=you@yourdomain.com
```
Restart `pnpm dev`. As Olumide, go to Team → **Invite people** and invite your own address.

**You should see:** the email in your inbox within a minute, from "Vento Homes Ltd via Vento Real Estate", with Reply-To set to Olumide. In Gmail, ⋮ → **Show original** shows DKIM, SPF and DMARC as PASS.

- [ ] OK  ·  Notes:

## 2. Nobody else gets a real email
In the same invite, add an address that isn't on your allow-list, for example `someone@example.com`.

**You should see:** your address gets the real email. The other one doesn't: it's saved to `.mail/` as before. Run `pnpm mail` to see it.

- [ ] OK  ·  Notes:

## 3. Tests never send email
With the Postmark lines still in `.env`, run:
```bash
pnpm test
```
**You should see:** all tests pass, and no email arrives in your inbox. Tests, CI and the browser tests always use the pretend transport, whatever `.env` says.

- [ ] OK  ·  Notes:

## Not reviewable on your laptop
- **Bounces:** Postmark tells Vento when an email bounces, and the invitation then shows "Email not delivered". Postmark can't reach `localhost`, so this is checked once staging is hosted (RUNBOOK section 5, step 10).
- **Production:** the full setup checklist is in `docs/RUNBOOK.md` section 5: the second server, DMARC, approval, the webhook and the data-processing agreement. It's due before the first customer.

## When you're done
Reply with the numbers you're happy with. To go back to the pretend emails, delete the four lines from `.env` and restart `pnpm dev`.
