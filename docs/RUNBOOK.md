# Runbook

Operations for Vento's environments. Owned by **devops**; this first version lists what must be true before the first customer goes live. Fill in deploys, backups, restore drills and incident steps as the infrastructure is chosen.

## Pre-launch requirements
These come from the security audit of feature flags and plans (decisions 0015 and 0016). Each one must be done, and checked, before the first customer goes live.

### 1. Separate database roles
The app connects as the table owner today, so the append-only triggers on `audit_events`, `plan_versions` and `platform_audit_events` are a backstop, not a wall: an owner or superuser can `ALTER TABLE … DISABLE TRIGGER` or `SET session_replication_role = replica`. In production:

| Role | Used by | Rights |
|---|---|---|
| `vento_migrator` | The release step only (`node dist/db/migrate.mjs`) | Owns the schema and every table. Never used by the running app or by people. |
| `vento_app` | The API and the flag and plan commands | Not an owner, not a superuser, no `CREATEROLE`. `SELECT, INSERT, UPDATE, DELETE` on ordinary tables; **only `SELECT, INSERT`** on `audit_events`, `plan_versions` and `platform_audit_events`; `USAGE` on the schema and sequences. |

Sketch (adapt names and schema):
```sql
CREATE ROLE vento_app LOGIN PASSWORD '…' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT USAGE ON SCHEMA public TO vento_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO vento_app;
REVOKE UPDATE, DELETE, TRUNCATE ON audit_events, plan_versions, platform_audit_events FROM vento_app;
ALTER DEFAULT PRIVILEGES FOR ROLE vento_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO vento_app;
```
Check: as `vento_app`, `ALTER TABLE platform_audit_events DISABLE TRIGGER ALL` and `SET session_replication_role = replica` both fail, and `UPDATE plan_versions …` is refused. New append-only tables in later bricks get the same `REVOKE`.

### 2. Ship the platform audit trail off the database
Stream `platform_audit_events` (and ideally `audit_events`) to an external, append-only log sink the app role can't write to or delete from, so a compromised database account can't rewrite who changed flags, plans or super-admins.

### 3. Command access on the API host
- Anyone with a shell and `DATABASE_URL` on the API host has super-admin power until the R2 console (decision 0015). Grant host access only to Vento super-admins.
- Set `VENTO_OPERATOR` per person (e.g. in their login profile) so the platform trail records who ran each command.
- Schedule `node dist/platform/cli/main.mjs plans notify-trials` daily at 08:00 Lagos with `VENTO_CRON=1` in that job's environment only.

### 4. First super-admin and starting data
1. Run migrations.
2. `node dist/platform/cli/main.mjs plans bootstrap` (publishes Starter, Growth and Enterprise; asks first).
3. `node dist/platform/cli/main.mjs superadmin grant <email> --bootstrap --reason "…"` (the person needs two-step on).
4. Leave every flag at `internal` until the owner releases it.

### 5. Email through Postmark (decision 0017)
**Postmark servers and secrets**
- Two Postmark servers, "Vento staging" and "Vento production", each with its own server API token. Tokens and the webhook secret live in the secrets store only (never chat, email or the repo).
- Per host: `APP_ENV` (`staging` or `production`), `EMAIL_TRANSPORT=postmark`, `POSTMARK_SERVER_TOKEN`, `EMAIL_FROM="Vento Real Estate <no-reply@mail.{Vento domain}>"`, `POSTMARK_MESSAGE_STREAM=outbound`, `POSTMARK_WEBHOOK_SECRET` (32+ random characters: `openssl rand -hex 32`).
- Staging only: `EMAIL_ALLOWED_RECIPIENTS` (comma-separated domains and addresses, e.g. `you@example.com,@your-test-domain.com`; no wildcards or spaces). The seed and demo domains (`ventohomes.ng`, `lekkipartners.ng`) are refused at start-up, so seeded people never get real email. Anyone else is skipped and their invitation shows **Email not delivered**. Production must leave it empty; the API refuses to start otherwise.
- The API refuses to start with `NODE_ENV=production` and no `APP_ENV`, and refuses Postmark whenever `NODE_ENV=test`, `CI` or `VENTO_E2E=1` is set.

**Bounce webhook**
- In each server's default transactional stream: Webhooks → Add webhook → URL `https://postmark:{POSTMARK_WEBHOOK_SECRET}@{api host}/webhooks/postmark/bounce`, events **Bounce** and **Spam complaint**. Leave **Include bounce content** off: it keeps payloads small (the route refuses bodies over 64 KB) and the bounced message's personal data out. HTTPS only.
- Postmark doesn't sign webhooks; the Basic-auth secret is the check (compared in constant time). Optionally also allowlist Postmark's published webhook IPs at the proxy.
- Only requests with wrong credentials are rate-limited (30 a minute per IP), so callers without the secret can't use up Postmark's allowance; authenticated calls aren't limited. The route exists only when Postmark is the transport and the secret is set. Rotate the secret if it leaks (worst case: someone marks pending invitations "Email not delivered").
- Check: Postmark's "Send test" on the webhook gets 200; a wrong password gets 401.

**Account hygiene (Postmark's activity log holds live invitation and reset links)**
- Restrict Postmark account access to two people, both with two-step on.
- Set content retention to the shortest Postmark allows.
- Open and link tracking off on both servers (the API also sends with tracking off).
- The DPA is signed and Postmark is on the privacy notice (purpose, United States) before the first customer.

**Owner's setup checklist** (from the Team spec)
1. Choose the sending domain: a subdomain used only for app email, e.g. `mail.{Vento domain}`.
2. Create the Postmark account and the two servers.
3. Verify the domain (Sender signatures → Domains): the DKIM TXT record and the custom Return-Path CNAME (`pm-bounces.mail.{domain}` → `pm.mtasv.net`). Return-Path can take up to 48 hours.
4. Publish DMARC: TXT at `_dmarc` starting `v=DMARC1; p=none; rua=mailto:dmarc@{Vento domain}`; move to `p=quarantine` after 2–4 weeks of clean reports. Don't add Postmark to the root SPF record.
5. Request account approval in the Postmark dashboard (account owner only): "transactional account email for a B2B property software: invitations, sign-in verification, password resets and security alerts; about {N} a month". Until approved, Postmark only sends to addresses on the verified domain.
6. Turn off open and link tracking on both servers.
7. Add the bounce webhook above to each server.
8. Hand each server's token and the webhook secret to devops through the secrets store.
9. Sign Postmark's DPA and add Postmark to the privacy notice.
10. From staging, invite your own address: it lands in the inbox, and Gmail's "Show original" shows DKIM, SPF and DMARC passing. Invite an address outside the allow-list: the row shows **Email not delivered**. Invite Postmark's bounce test address (`hardbounce@bounce-testing.postmarkapp.com`): the row is marked within 5 minutes.

**Real email while testing by hand (development only)**
The owner may send real email from `pnpm dev`, only to the allow-list; everyone else still goes to `.mail/`. In `.env`:
```
EMAIL_TRANSPORT=postmark
POSTMARK_SERVER_TOKEN=<staging server token>
EMAIL_FROM="Vento Real Estate <no-reply@mail.{Vento domain}>"
EMAIL_ALLOWED_RECIPIENTS=you@example.com,@your-test-domain.com
```
`pnpm test` blanks the token and e2e forces the dev transport, so leaving these lines in `.env` is safe. The bounce webhook isn't reachable on localhost, so bounces aren't marked there.

**Checking the transport against Postmark** (opt-in, never in CI): `VENTO_EMAIL_INTEGRATION=1 POSTMARK_SERVER_TOKEN=POSTMARK_API_TEST pnpm --filter @vento/api email:check`. It uses Postmark's test token only, which delivers nothing.

## Deploy notes per migration
Checks to run against production **before** the release step, for migrations that add a constraint existing rows must already meet.

- **`0007_roles_and_organization`** adds `roles_system_key_consistent` (a built-in role has a key and `is_system`; a custom role has neither). Every row written by Vento so far satisfies it, but confirm first; the query must return no rows:
  ```sql
  select id, organization_id, key, is_system from roles where (key is null) <> (not is_system);
  ```
  If it returns rows, stop and fix them (a built-in with no key, or a custom role marked system) before migrating; otherwise the migration fails on that check and nothing in it is applied.

## Environment variables
Every variable is in `.env.example`. Production also needs `SUPPORT_EMAIL` (the API refuses to start without it) and the email settings in section 5.
