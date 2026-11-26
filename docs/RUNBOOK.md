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

## Environment variables
Every variable is in `.env.example`. Production also needs `SUPPORT_EMAIL` (the API refuses to start without it).
