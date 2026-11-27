# 0022 · The product is always called Vento Real Estate

- **Date:** 2026-11-27
- **Status:** accepted (owner, 27 Nov 2026, with the admin-console plan, slice 1b). Updates the host named in 0019 and 0021.

## Context
Vento has other products (Vento Hotels; Vento Manufacturing, the original "Vento ERP"), so "Vento" alone on a screen, in an email or in an authenticator app doesn't say which product it is. The owner asked that this product always says "Vento Real Estate" (docs/specs/admin-console.md, slice 1b) and moved it to its own host, realestate.ventoerp.com. Until then the copy said "Vento" in many places, and the docs named app.ventoerp.com as the host.

## Decision
- **Every user-visible word says "Vento Real Estate", never "Vento" alone:** product and page titles, the console ("Vento Real Estate console", "Vento Real Estate staff · all customers"), email senders, subjects, bodies and footers, the authenticator app issuer and the passkey relying-party name (`auth.ts` `appName` and TOTP `issuer`, `webauthn-settings.ts` `rpName`), customer audit entries (actor "Vento Real Estate"), the platform actors ("Vento Real Estate (setup)", "Vento Real Estate (scheduled)"), errors, help articles, PDFs and the logo's accessible name. The possessive is "Vento Real Estate's". Buyer messages still start with the developer's name ("Vento Homes: …").
- **Three short forms are allowed** (owner, 27 Nov 2026): the logo lockup "Vento | REAL ESTATE" counts as the full name; the console's phone top bar may read "Staff · all customers" beside the lockup (the sidebar always has the full label); the AI feature is called **Ask**, with the AI marker. Adding another short form needs the owner.
- **Not covered:** code and configuration names (`VentoMark`, `talkToVento`, `@vento/*`, `vento_app`, `VENTO_*`), customer data that contains the word (the demo customer "Vento Homes Ltd"), test fixtures that aren't shown to people (`test.vento.ng`, `support@vento.ng`), and past audit rows (append-only; they keep "Vento").
- **Enforced by a test, not a constant.** `findBareVento` (`packages/shared/src/brand/bare-vento.ts`) finds "Vento" not followed by " Real Estate" after removing comments and an allow-list (`Vento Homes`, the lockup, and exact strings listed with a reason). Copy tests in the web and API run it over source copy, every rendered email template and the help articles, and fail with file, line and string.
- **The host is realestate.ventoerp.com**, and the console is at realestate.ventoerp.com/console. Nothing in the code names the host: it comes only from `WEB_ORIGIN` (CORS, trusted origins, email links, the passkey relying party). Passkeys are therefore bound to realestate.ventoerp.com; this replaces the example host in decision 0019 and the console address in decision 0021.

## Consequences
- Customers and staff always know which Vento product they're in, and new copy can't drift back (the test fails the build).
- Longer strings: buttons and titles are written for the full name; the three short forms are the only exceptions.
- Moving the host before launch costs nothing: no passkeys existed on app.ventoerp.com. Moving it again later would make every passkey stop working (decision 0019); people would fall back to password and code.
- Authenticator entries made before the change keep the old "Vento" label until two-step is set up again.
- Production's sender (`EMAIL_FROM`), its Postmark signature, DKIM and Return-Path, `SUPPORT_EMAIL` and `SECURITY_ALERT_EMAIL` use Vento Real Estate addresses (RUNBOOK).

## Alternatives considered
- "Vento" with "Real Estate" only in the logo: ambiguous in emails, authenticator apps and audit trails, where there's no logo.
- A product-name constant in code instead of a test: helps new code but doesn't catch a hard-coded string; the test does both jobs with no indirection in every sentence.
- Keeping app.ventoerp.com: the generic host would be wrong once other Vento products share the domain.
