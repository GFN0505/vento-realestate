# 0019 · Passkeys count as two-step; the authenticator app stays the fallback

- **Date:** 2026-11-26
- **Status:** proposed (with the brick 3d plan)

## Context
Brick 3d adds passkeys (Face ID, Touch ID, a fingerprint, Windows Hello or the device PIN) through Better Auth's passkey plugin. Two-step sign-in (decision 0010, brick 2a) is an authenticator-app code after the password, required by some roles and, from 3d, by an organization-wide setting. We had to decide whether a passkey sign-in also has to pass the code step, whether a passkey can replace the app for people who are required to use two-step, and which web domain the passkeys are bound to. All three are hard to reverse: once people sign in with passkeys every day, adding a code step back or forcing the app on them is a visible step backwards, and passkeys can't be moved to another domain.

## Decision
- **A passkey sign-in counts as two-step.** Vento refuses passkeys that don't check the person (`userVerification: 'required'`) and passkeys the browser can't find without an email (`residentKey: 'required'`). A passkey is possession of the device plus the person's face, finger or PIN, and it can't be phished onto another website. Signing in with one asks for no code. Better Auth's two-factor plugin only challenges `/sign-in/email`, so this is its default; a test pins it.
- **Where two-step is required, the authenticator app must be set up as well.** The passkey is the fast path on top of it. Without the app and backup codes, losing the one phone with the passkey would need an admin reset every time.
- **Passkeys are bound to the web app's own host name** (`rpID` = the host of `WEB_ORIGIN`, the origin = `WEB_ORIGIN`; decision 0009 puts web and API on one origin). Development and e2e use `localhost`; staging and production each use their own host, so a staging passkey never works in production.
- **Passkey sign-in skips the sign-in lock but never the password-reset block.** Locks stop guessing, and a passkey can't be guessed. An admin's two-step reset removes the person's passkeys too.

## Consequences
- Every sign-in path we add later (buyer portal, realtor portal) must say whether it counts as two-step, and the gating middleware must keep treating "two-step on" as "the app is set up", not "signed in with a second factor".
- Changing the production host name (for example from `app.vento.ng` to another domain) makes every passkey stop working. People fall back to password and code and add new passkeys; the release notes must warn them. A move to a shared parent domain (`rpID: 'vento.ng'`) needs a new record.
- The security agent audits the passkey routes before `platform.passkeys` moves beyond `pilot`.
- A required member can't go passkey-only. Passkey-only accounts, and requiring passkeys for an organization, stay out of scope.

## Alternatives considered
- Passkey plus a code: no faster than today, so nobody would add one, and it adds nothing a passkey doesn't already prove.
- A passkey replaces the app for required members: losing the device means an admin reset; the support load lands on owners.
- `rpID` on the parent domain: lets passkeys follow us across subdomains but also across staging and production; not needed while the web app has one host.
