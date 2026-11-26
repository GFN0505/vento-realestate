# 0017 · Transactional email through Postmark, with delivery tracked on invitations

- **Date:** 2026-11-26
- **Status:** accepted

## Context
Invitations, verification codes, password resets and security alerts must reach Gmail and Outlook inboxes from staging and production. The app has had only console and in-memory transports, and production refused to start. Owners need to know when an invitation didn't arrive. Tests run constantly and must never email anyone. Postmark is a data processor in the United States (NDPA 2023).

## Decision
All email goes through the existing Mailer interface, which now returns a result per message. A fetch-based Postmark transport (no SDK) sends on the default transactional stream with open and link tracking off, from no-reply@mail.{Vento domain} (a subdomain used only for app email, DKIM and custom Return-Path, DMARC). Invitations use the display name "{Organization} via Vento" and the inviter as Reply-To. APP_ENV (development, staging, production) decides the rules: staging and production require Postmark; staging wraps it in an allow-list of domains and addresses; tests, CI and e2e refuse Postmark at startup. By the owner's choice, development may also use Postmark for manual testing in the browser, only with an allow-list: listed recipients get real email and everyone else stays in the local `.mail/` folder. Invitations store a delivery state (queued, sent, failed, bounced, complained) and Postmark's message id. A bounce and spam-complaint webhook, authenticated with HTTP Basic credentials compared in constant time (Postmark does not sign webhooks), marks only pending invitations whose message id matches; a complaint outranks a bounce, and a replay changes nothing. That lookup is the one deliberate exception to filtering by organization: a webhook has no auth context, so it finds the row by our invitation UUID together with Postmark's MessageID for that send, behind the webhook secret. Delivery marks are facts, not audit events. Other bounces are counted in logs by tag only. Logs never contain addresses or links.

## Consequences
- Email reputation is separate from staff mailboxes; per-customer sending domains would need per-customer DNS and are out of scope.
- One more processor under the NDPA: DPA, privacy notice and cross-border transfer basis before launch; Postmark's activity log holds live one-time links, so its account access and retention are restricted.
- Swapping provider is one new transport plus the webhook adapter.
- A send failure never undoes a change; people resend.
- Webhook authenticity rests on a shared secret over HTTPS (optionally plus an IP allowlist), not a signature.

## Alternatives considered
- Resend or Amazon SES: SES needs more setup and reputation work; Resend was the other candidate, and Postmark was chosen in the app-shell owner's decisions for transactional deliverability.
- The Postmark SDK: adds a dependency for two HTTP calls.
- Sending from each developer's own domain: per-customer DNS and verification; not needed for transactional mail.
- Tracking every bounce on every email type: more schema for no user-facing benefit now; invitations are the only email a person waits on someone else for.
- A sandbox flag instead of an allow-list on staging: Postmark sandbox servers deliver nothing, so staging couldn't be tested end to end.
