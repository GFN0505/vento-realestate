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

After `0011_console`, `vento_app` still has only `SELECT, INSERT` on `platform_audit_events`: the new `channel` and `idempotency_key` columns are written on insert, and old rows are never backfilled (pre-console rows keep `channel` null and are labelled at read time). The console's activity writes go to `sessions` and `platform_admins`, which are ordinary tables.

### 2. Ship the platform audit trail off the database
Stream `platform_audit_events` (and ideally `audit_events`) to an external, append-only log sink the app role can't write to or delete from, so a compromised database account can't rewrite who changed flags, plans or super-admins.

### 3. Command access on the API host (break-glass)
- Day-to-day platform changes are made in the **Vento console** (`/console`), signed in with fresh two-step (decision 0021). Host access is for **break-glass only** (the console or sign-in is down) and for the scheduled job. A shell plus `DATABASE_URL` on the API host is still super-admin power, so grant host access only to Vento super-admins (decisions 0015 and 0021).
- Change commands (`flags stage | group | override`, `plans publish | assign | trial | addon | override`, `superadmin grant | revoke`, and `plans bootstrap` once any super-admin exists) refuse without `--break-glass`: "Make this change in the Vento console. If the console is down, add --break-glass." With it they also need `--by` (an active super-admin with two-step on) and `--reason`, run as before, are tagged **Command line** in the console's Activity, and email every other active super-admin once the change commits (subject "Moved Sales to off from the command line", with who, the host, the time and the reason). A failed email is logged without addresses and never undoes the change.
- Example: `node dist/platform/cli/main.mjs flags stage sales off --break-glass --by ada@ventoerp.com --reason "Receipt allocation bug"`.
- Read commands (`flags list | show`, `plans list | show`, `superadmin list`) need nothing extra.
- Set `VENTO_OPERATOR` per person (e.g. in their login profile) so the platform trail records who ran each command; it's still required for break-glass.
- Schedule `node dist/platform/cli/main.mjs plans notify-trials` daily at 08:00 Lagos with `VENTO_CRON=1` in that job's environment only (recorded as **Scheduled**; it needs no `--break-glass`).
- After any break-glass change, the person who made it tells the others why, and someone checks *Activity* in the console once it's back.

### 4. First super-admin and starting data
1. Run migrations.
2. `node dist/platform/cli/main.mjs plans bootstrap` (publishes Starter, Growth and Enterprise; asks first). On an empty environment it needs no `--break-glass`; once any super-admin exists it does.
3. `node dist/platform/cli/main.mjs superadmin grant <email> --bootstrap --reason "…"` (the person needs two-step on; works only while there are no super-admins). Then that person signs in at `/console` and confirms it opens before anyone relies on it: from now on the change commands need `--break-glass`, and further super-admins are added in the console (*Super-admins* → **Add super-admin**).
4. Leave every flag at `internal` until the owner releases it.

### 5. IP geolocation database (decision 0020)
- Download DB-IP **IP to City Lite** (MMDB, CC BY 4.0, https://db-ip.com/db/download/ip-to-city-lite) at deploy and once a month after (DB-IP publishes at the start of each month). Put it outside the repository (`*.mmdb` is git-ignored) and point `GEOIP_DB_PATH` at it.
- The API reads it once at startup, in the background, and keeps it in memory (about 120 MB). Replacing the file takes effect at the next restart. Without the file the API runs normally and My security shows no places; the log has one `place_lookup_unavailable` line.
- If the instance is short of memory, use the country-only Lite file instead (a few MB); places then read "Nigeria" instead of "Lekki, Lagos".
- The attribution "IP geolocation by DB-IP" is shown under the sessions list and must stay in the privacy notice.

### 6. Passkey domain (decision 0019)
Passkeys are bound to the host of `WEB_ORIGIN`, which must be `https://` in production (the API refuses to start otherwise). Choose the production host before `platform.passkeys` reaches `on`: moving to another host makes every passkey stop working.

### 7. Dependency release age
`pnpm-workspace.yaml` sets `minimumReleaseAge: 4320` (3 days). A dependency update that pnpm refuses as too new waits, or is added to `minimumReleaseAgeExclude` as an exact `name@version` after review, never as a bare name.

## Deploy notes per migration
Checks to run against production **before** the release step, for migrations that add a constraint existing rows must already meet.

- **`0007_roles_and_organization`** adds `roles_system_key_consistent` (a built-in role has a key and `is_system`; a custom role has neither). Every row written by Vento so far satisfies it, but confirm first; the query must return no rows:
  ```sql
  select id, organization_id, key, is_system from roles where (key is null) <> (not is_system);
  ```
  If it returns rows, stop and fix them (a built-in with no key, or a custom role marked system) before migrating; otherwise the migration fails on that check and nothing in it is applied.
- **`0011_console`** is additive: a `platform_channel` enum, three nullable columns on `sessions` (`second_factor_at`, `console_opened_at`, `console_active_at`), `platform_admins.last_console_at`, and on `platform_audit_events` the nullable `channel` and `idempotency_key`, two indexes and the check `platform_audit_events_console_actor` (a console row always has a person). Existing rows have `channel` null, so the check passes without a pre-check, and `ADD COLUMN` fires no row trigger, so the append-only triggers don't block it. No backfill. Order: deploy, then make sure one super-admin can open the console (§4 step 3) before anyone needs a change; until then a change needs `--break-glass`.

## Environment variables
Every variable is in `.env.example`. Production also needs `SUPPORT_EMAIL` (the API refuses to start without it).
