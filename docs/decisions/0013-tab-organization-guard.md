# 0013 · Each tab names its organization; the server refuses a mismatch

- **Date:** 2026-11-26
- **Status:** accepted

## Context
A person can belong to several organizations, and the active organization lives on the session, which every tab of the browser shares. If they switch organization in one tab, another tab still shows the first organization's name and data, and its next request would silently read or change the second organization's data. Organization isolation (non-negotiable 1) must hold from the person's point of view, not only the server's.

## Decision
The web sends the organization its tab is showing in an `x-vento-organization` header on every oRPC call. `memberMiddleware` compares it with the session's organization before any query, and with the resolved membership before any write-back. Any mismatch is refused with `CONFLICT organization_changed`. The organization used for the request still comes only from the session; the header can only make a request fail. The web answers that error, or a `me` that names a different organization when the tab regains focus, with a full page reload and a notice. Switching organization in the same tab also ends in a full reload. `account.me` and `account.switchOrganization` are exempt, as are personal procedures that read no organization data, which are listed in the procedure-guard test.

## Consequences
- No request from an out-of-date tab can read or write another organization's data, including requests already in flight during a switch.
- Every new procedure that touches organization data must be built on `member` (or `memberPendingTwoStep`); the guard-walk test fails otherwise.
- Clients without the header (scripts, tests) keep working, with the session as the only source.
- A reload costs about one round trip; in-memory state in other tabs is discarded on purpose.

## Alternatives considered
- Organization in the URL (`/o/:org/...`) and in every input: puts the organization into request input, against non-negotiable 1, and lengthens every link.
- One session per tab (organization in sessionStorage-scoped cookies): Better Auth sessions are cookie-wide; would need a second session mechanism.
- BroadcastChannel only: helps only open tabs on the same device and can't stop a request already sent.
- Soft in-place reset (clear caches, navigate): easy to miss a store or a pending request; a reload is simpler and certain.
