# Runbook

Operations for Vento Real Estate's environments (production host `realestate.ventoerp.com`, console at `realestate.ventoerp.com/console`). Owned by **devops**; this first version lists what must be true before the first customer goes live. Fill in deploys, backups, restore drills and incident steps as the infrastructure is chosen.

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

After `0011_console`, `vento_app` still has only `SELECT, INSERT` on `platform_audit_events`: the new `channel` and `idempotency_key` columns are written on insert, and old rows are never backfilled (pre-console rows keep `channel` null and are labelled at read time). The console's activity writes go to `sessions` and `platform_admins`, which are ordinary tables.

### 2. Ship the platform audit trail off the database
Stream `platform_audit_events` (and ideally `audit_events`) to an external, append-only log sink the app role can't write to or delete from, so a compromised database account can't rewrite who changed flags, plans or super-admins.

### 3. Command access on the API host (break-glass)
- Day-to-day platform changes are made in the **Vento Real Estate console** (`/console`), signed in with a staff account and fresh two-step (decisions 0021 and 0023). Host access is for **break-glass only** (the console or sign-in is down) and for the scheduled job. A shell plus `DATABASE_URL` on the API host is still super-admin power, so grant host access only to super-admins (decisions 0015 and 0021).
- Change commands (`flags stage | group | override`, `plans publish | assign | trial | addon | override`, `superadmin invite | revoke | reset-two-step`, and `plans bootstrap` once any super-admin exists) refuse without `--break-glass`: "Make this change in the Vento Real Estate console. If the console is down, add --break-glass." With it they also need `--by` (an active super-admin with two-step on) and `--reason`, run as before, are tagged **Command line** in the console's Activity, and, once the change commits, email every other active super-admin (subject "Moved Sales to off from the command line", with who, the host, the time and the reason) and the `--by` person ("This was run as you…", so a misuse of their name is noticed). When no other super-admin can be told, the email also goes to `SECURITY_ALERT_EMAIL`. A failed email is logged without addresses and never undoes the change.
- Example: `node dist/platform/cli/main.mjs flags stage sales off --break-glass --by ada@ventoerp.com --reason "Receipt allocation bug"`.
- **Super-admins join by invitation (decision 0023).** `superadmin grant` is retired and refuses: "Super-admins join by invitation. Use superadmin invite."
  - `superadmin invite --email <email> --name "…" --break-glass --by <super-admin email> --reason "…"` **emails** the staff invitation (48 hours) and never prints the link, so whoever holds the host can't use it. The email must not already have a customer account.
  - `superadmin reset-two-step <email> --break-glass --by <super-admin email> --reason "…"` is the break-glass reset for a super-admin who lost their phone and backup codes while the console is down. It clears their authenticator, backup codes and passkeys and ends their sessions; they **keep their password** and set up two-step again at their next sign-in before the console opens. The person gets a security alert; the other super-admins, the `--by` person and, when nobody else can be told, `SECURITY_ALERT_EMAIL` get the break-glass email. **`--by` must be a different active super-admin:** nobody can reset their own two-step, here or in the console. With the console up, use **Reset two-step** on their row instead (it also emails a password link).
  - `superadmin revoke` now closes the person's staff account (signed out everywhere, password, authenticator and passkeys removed; their name stays on past activity).
- Read commands (`flags list | show`, `plans list | show`, `superadmin list`, which also lists open staff invitations) need nothing extra.
- Set `VENTO_OPERATOR` per person (e.g. in their login profile) so the platform trail records who ran each command; it's still required for break-glass.
- Schedule `node dist/platform/cli/main.mjs plans notify-trials` daily at 08:00 Lagos with `VENTO_CRON=1` in that job's environment only (recorded as **Scheduled**; it needs no `--break-glass`).
- After any break-glass change, the person who made it tells the others why, and someone checks *Activity* in the console once it's back.

### 4. First super-admin and starting data
1. Run migrations.
2. `node dist/platform/cli/main.mjs plans bootstrap` (publishes Starter, Growth and Enterprise; asks first). On an empty environment it needs no `--break-glass`; once any super-admin exists it does.
3. `node dist/platform/cli/main.mjs superadmin invite --bootstrap --email <staff email> --name "…" [--reason "…"]` (works only while there is no active super-admin; the reason defaults to "First super-admin"). It **prints a one-time link** that works for 48 hours (and also emails it if email is set up). Running it again withdraws the open bootstrap invitation and prints a new link. The email must be a staff address with no customer account (for the owner, not the address they use in their own organization).
4. Open the link within 48 hours and finish the staff sign-up: name, password, two-step, backup codes (keep them safe), optionally a passkey. You land on the console **Dashboard**. Then sign out, sign in again at `/console` and confirm it opens before anyone relies on it: from now on the change commands need `--break-glass`.
5. **Straight away, invite a second super-admin** (*Super-admins* → **Invite super-admin**) and wait until they've joined. Nobody can reset their own two-step, so a lone super-admin who loses both phone and backup codes is locked out of the console, and the break-glass reset needs another super-admin as `--by`. Keep at least two at all times.
6. Leave every flag at `internal` until the owner releases it.

### 5. IP geolocation database (decision 0020)
- Download DB-IP **IP to City Lite** (MMDB, CC BY 4.0, https://db-ip.com/db/download/ip-to-city-lite) at deploy and once a month after (DB-IP publishes at the start of each month). Put it outside the repository (`*.mmdb` is git-ignored) and point `GEOIP_DB_PATH` at it.
- The API reads it once at startup, in the background, and keeps it in memory (about 120 MB). Replacing the file takes effect at the next restart. Without the file the API runs normally and My security shows no places; the log has one `place_lookup_unavailable` line.
- If the instance is short of memory, use the country-only Lite file instead (a few MB); places then read "Nigeria" instead of "Lekki, Lagos".
- The attribution "IP geolocation by DB-IP" is shown under the sessions list and must stay in the privacy notice.

### 6. Passkey domain (decision 0019)
Passkeys are bound to the host of `WEB_ORIGIN`, which must be `https://` in production (the API refuses to start otherwise). Production is `WEB_ORIGIN=https://realestate.ventoerp.com` (decision 0022); the console is on the same host, so staff passkeys work there too. Don't move the host once passkeys are in use: moving to another host makes every passkey stop working.

### 7. Dependency release age
`pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (3 days). A dependency update that pnpm refuses as too new waits, or is added to `minimumReleaseAgeExclude` as an exact `name@version` after review, never as a bare name.

## Deploy notes per migration
Checks to run against production **before** the release step, for migrations that add a constraint existing rows must already meet.

- **`0007_roles_and_organization`** adds `roles_system_key_consistent` (a built-in role has a key and `is_system`; a custom role has neither). Every row written by Vento Real Estate so far satisfies it, but confirm first; the query must return no rows:
  ```sql
  select id, organization_id, key, is_system from roles where (key is null) <> (not is_system);
  ```
  If it returns rows, stop and fix them (a built-in with no key, or a custom role marked system) before migrating; otherwise the migration fails on that check and nothing in it is applied.
- **`0011_console`** is additive: a `platform_channel` enum, three nullable columns on `sessions` (`second_factor_at`, `console_opened_at`, `console_active_at`), `platform_admins.last_console_at`, and on `platform_audit_events` the nullable `channel` and `idempotency_key`, two indexes and the check `platform_audit_events_console_actor` (a console row always has a person). Existing rows have `channel` null, so the check passes without a pre-check, and `ADD COLUMN` fires no row trigger, so the append-only triggers don't block it. No backfill. Order: deploy, then make sure one super-admin can open the console (§4 steps 3–5) before anyone needs a change; until then a change needs `--break-glass`.

- **`0012_second_factor_guards`** is additive: two nullable columns on `two_factors` (`last_totp_step`, so an authenticator code is accepted once; `backup_codes_unproven_at`, so backup codes made with only a password can't open the console). No pre-check, no backfill.

- **`0013_staff_accounts`** is additive: enum `account_kind` and `users.account_kind` (not null, default `customer`: a constant default, so no table rewrite), the `staff_invitation_status` enum and the platform table `staff_invitations`, the value `account` on `platform_channel`, and the index `audit_events_action_created_idx (action, created_at desc)` for the console Dashboard. The index is a plain `CREATE INDEX` inside the migrator's single transaction (so not `CONCURRENTLY`); that's fine while `audit_events` is small. If it has grown large by the time this runs, build the index by hand with `CREATE INDEX CONCURRENTLY` first so the migration finds it. No pre-check, no backfill.

- **`0014_staff_account_guards`** changes who is a super-admin and **can't be undone by itself** (decision 0023). In one transaction it:
  1. revokes every active super-admin who is also an active member of an organization, writing one platform audit event each (`superadmin.revoked`, actor "Vento Real Estate (setup)", operator `migration 0014_staff_account_guards`, reason "Staff accounts are separate from customer accounts", channel `command`) and closing their console windows. Their customer membership, password, two-step and passkeys are untouched;
  2. turns the remaining active super-admins into staff accounts;
  3. adds three triggers: a staff account can't become an active member, only a staff account can get a `platform_admins` row, and an account's kind can't change.

  **The owner's own account is probably affected:** if it belongs to an organization, it stops being a super-admin, and the same email can never be one (a customer email can't become staff). Before deploying, list who loses super-admin and tell them:
  ```sql
  select distinct u.email
  from platform_admins pa
  join users u on u.id = pa.user_id
  join members m on m.user_id = pa.user_id and m.status = 'active'
  where pa.revoked_at is null;
  ```
  Each of them needs a separate staff email (for example their @ventoerp.com address) to come back. After the deploy, if `superadmin list` shows nobody, run the bootstrap invitation at once (§4 steps 3–5: `superadmin invite --bootstrap`, finish the staff sign-up from the printed link within 48 hours, then invite a second super-admin straight away). Until then the console is unusable and every change needs `--break-glass`, which itself needs an active super-admin.

### Local development after 0014
The seed makes Ada Okafor (`ada@ventoerp.com`) and Tunde Bello (`tunde@ventoerp.com`) staff accounts with no organization and prints a link for Chika Obi's open staff invitation. On a local database seeded before staff accounts, Ada is still a customer account and her kind can't change, so the seed stops and prints the reset command. It **deletes all local development data** (Docker volumes):
```sh
docker compose down -v && pnpm db:up && pnpm db:migrate && pnpm db:seed
```

## Environment variables
Every variable is in `.env.example`. Production also needs `SUPPORT_EMAIL` (the API refuses to start without it), and should set `SECURITY_ALERT_EMAIL` (a monitored security inbox that receives break-glass notices, including `superadmin reset-two-step`, when no other super-admin can be told; unset, the server logs a warning and sends nothing). Production values (decision 0022): `WEB_ORIGIN=https://realestate.ventoerp.com`; `EMAIL_FROM="Vento Real Estate <no-reply@realestate.ventoerp.com>"` with the Postmark sender signature, DKIM and Return-Path on that domain; `SUPPORT_EMAIL` (the **Talk to Vento Real Estate** address) and `SECURITY_ALERT_EMAIL` on Vento Real Estate addresses; TLS for the host.
