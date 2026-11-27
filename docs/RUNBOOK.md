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
  - `superadmin reset-two-step <email> --break-glass --by <super-admin email> --reason "…"` is the break-glass reset for a super-admin who lost their phone and backup codes while the console is down. It clears their authenticator, backup codes and passkeys, ends their sessions and voids any old password link, and **emails them a link to set a new password**: a password alone never gets back in (the inbox is the proof). After the new password they set up two-step again; the console then asks *Confirm it's you* with the new code before it opens. The person gets a security alert; the other super-admins, the `--by` person and, when nobody else can be told, `SECURITY_ALERT_EMAIL` get the break-glass email. **Your own two-step too, from the host only:** `--by` may be the person themselves (a lone super-admin who lost phone and backup codes; host access is super-admin power anyway, decisions 0015 and 0021). A self-reset always emails `SECURITY_ALERT_EMAIL` as well as every other super-admin and the person, is recorded with channel `command`, and ends every session; then open the password link in your inbox, set a new password, and set up two-step again before the console opens. The console never resets your own. With the console up, use **Reset two-step** on another super-admin's row instead (it also emails a password link).
  - `superadmin revoke` now closes the person's staff account (signed out everywhere, password, authenticator and passkeys removed; their name stays on past activity).
- Read commands (`flags list | show`, `plans list | show`, `superadmin list`, which also lists open staff invitations) need nothing extra.
- Set `VENTO_OPERATOR` per person (e.g. in their login profile) so the platform trail records who ran each command; it's still required for break-glass.
- Schedule `node dist/platform/cli/main.mjs plans notify-trials` daily at 08:00 Lagos with `VENTO_CRON=1` in that job's environment only (recorded as **Scheduled**; it needs no `--break-glass`).
- Schedule `node dist/platform/cli/main.mjs approvals expire` daily (08:00 Lagos is fine, in the same job as `plans notify-trials`) with `VENTO_CRON=1` in that job's environment only. It marks approval requests past their 7 days as expired and writes one `approval.expired` audit event each (actor "System"). It needs no `--by` or `--break-glass` from cron, is safe to run again, and handles at most a batch per transaction so a backlog never holds locks long. It is only a tidy-up: a request past its 7 days already reads as expired and can't be approved, because expiry is checked on every read and decision. If the job stops, nothing breaks; the Approvals count and lists stay right. By hand it needs `--by <super-admin email>`: `pnpm approvals expire --by …`.
- Schedule `node dist/platform/cli/main.mjs files sweep` daily, in the same job as `approvals expire`, with `VENTO_CRON=1` in that job's environment only and the production `S3_*` variables. It deletes uploads that were never attached to a record 24 hours after they finished (the object and its row), retries cancels the bucket refused (rows left `deleting`), and removes the `incoming/` copy of files that were attached (their bytes stay under `kept/`). It drains everything in one run, carries on past a row that fails (logged as `file_sweep_*` with the file id, retried next run), and is safe to run again. Nothing breaks if it stops: unattached files only cost storage, and files under `kept/` are never touched. By hand it needs a super-admin: `pnpm files sweep --by <super-admin email>`.
- After any break-glass change, the person who made it tells the others why, and someone checks *Activity* in the console once it's back.

### 4. First super-admin and starting data
1. Run migrations.
2. `node dist/platform/cli/main.mjs plans bootstrap` (publishes Starter, Growth and Enterprise; asks first). On an empty environment it needs no `--break-glass`; once any super-admin exists it does.
3. `node dist/platform/cli/main.mjs superadmin invite --bootstrap --email <staff email> --name "…" [--reason "…"]` (works only while there is no active super-admin; the reason defaults to "First super-admin"). It **emails a one-time link** that works for 48 hours and tells `SECURITY_ALERT_EMAIL` (again when it's accepted). Add `--print-link` only when email isn't set up yet: the link is then printed with a warning, and terminal output may be kept in shell history or deploy logs, so clear them afterwards. Running it again withdraws the open bootstrap invitation (recorded in the platform trail) and sends a new link. The email must be a staff address with no customer account (for the owner, not the address they use in their own organization).
4. Open the link within 48 hours and finish the staff sign-up: name, password, two-step, backup codes (keep them safe), optionally a passkey. You land on the console **Dashboard**. Then sign out, sign in again at `/console` and confirm it opens before anyone relies on it: from now on the change commands need `--break-glass`.
5. **Straight away, invite a second super-admin** (*Super-admins* → **Invite super-admin**) and wait until they've joined, so a lost phone can be reset from the console. A lone super-admin who loses both phone and backup codes isn't locked out: from the host, `pnpm superadmin reset-two-step <your email> --break-glass --by <your email> --reason "…"` clears your two-step (the security inbox is told) and emails you a password link; set a new password from your inbox, then set up two-step again. Still keep two: it's the path that doesn't need host access.
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

### 8. File storage (decision 0025)
One private S3-compatible bucket per environment, reached only through `apps/api/src/storage`. The API refuses to start with `STORAGE_DRIVER=memory` in production.

Keys: uploads land at `incoming/org/{organizationId}/{fileId}`; attaching a file to a record copies it to `kept/org/{organizationId}/{fileId}`. Nothing in the app deletes under `kept/`.

**Local.** `pnpm db:up` also starts `vento-storage` (Chainguard MinIO, pinned by digest in `docker-compose.yml`; MinIO stopped publishing community images in Oct 2025). Its entrypoint, `docker/storage-init.sh`, creates the bucket and reports healthy only once it exists, so `--wait` covers it. Fixed local values: endpoint `http://localhost:9000`, region `us-east-1`, bucket `vento-local`, access key `vento`, secret `vento-local-secret`, path-style. The data sits in the `vento-storage` Docker volume: `pnpm db:down` keeps it, `docker compose down -v` deletes it (with the database).
- The bucket is private, versioned, with 30-day non-current retention. CORS is server-wide (MinIO has no per-bucket CORS) for `http://localhost:5173` (dev, CI e2e) and `http://localhost:5193` (local e2e), and exposes `ETag`. Stale multipart uploads are cleared by the server after 24 hours (`MINIO_API_STALE_UPLOADS_EXPIRY`); MinIO rejects the S3 abort-after-1-day lifecycle action.
- To bump the image: `docker pull cgr.dev/chainguard/minio:latest`, copy the digest from `docker inspect --format '{{index .RepoDigests 0}}' cgr.dev/chainguard/minio:latest`, run the storage contract test, then update the digest in `docker-compose.yml` and `.github/workflows/ci.yml`. If the image can't be pulled, SeaweedFS (S3 mode) is the fallback.
- To inspect: `docker exec vento-storage sh -c 'mc alias set l http://localhost:9000 vento vento-local-secret && mc ls l/vento-local'`.

**Production bucket** (Cloudflare R2 with EU jurisdiction, or AWS S3 af-south-1 if hosting is on AWS; same jurisdiction as the production database). Do this before `land` leaves `internal`, once counsel has confirmed the NDPA transfer basis and the DPIA is done.
1. Create the bucket, private. R2: create it with the **EU jurisdiction**, and don't connect a public domain or enable the `r2.dev` URL. S3: Block all public access on (all four settings), ACLs disabled (bucket owner enforced).
2. TLS only. S3: a bucket policy with a `Deny` on `s3:*` for `Principal: *` when `aws:SecureTransport` is `false`. R2 serves HTTPS only; keep custom-domain "HTTP" off.
3. CORS from `WEB_ORIGIN` only (`https://realestate.ventoerp.com`): methods `PUT`, `GET`, `HEAD`; allowed headers `*`; **expose `ETag`** (multipart uploads can't finish without it); max age 3000. The rule for `HEAD` is harmless and `GET` serves the signed links.
4. Lifecycle: abort incomplete multipart uploads after **1 day**. On S3 this is `AbortIncompleteMultipartUpload` with `DaysAfterInitiation: 1`; on R2 the same rule under Object lifecycle rules (*Abort incomplete multipart uploads*, 1 day). R2 adds a default lifecycle rule (abort after 7 days) to new buckets: change it to 1 day rather than adding a second. Verify it took: S3 `aws s3api get-bucket-lifecycle-configuration --bucket <bucket>` shows the rule; R2 `npx wrangler r2 bucket lifecycle list <bucket>` (or the dashboard) shows it. Note the date.
5. Protect `kept/`. S3: versioning on with **30-day non-current retention** (`NoncurrentVersionExpiration` of 30 days). R2 has no object versioning: add a **bucket lock** rule on prefix `kept/` with no expiry (*Settings → Bucket lock rules*, or `npx wrangler r2 bucket lock add <bucket> --prefix kept/ ...`), so no credential can delete or overwrite a kept file. Record which one in the DPIA.
5a. Backup: copy `kept/` to a bucket in a different provider account (its own credentials, not reachable with the production keys), daily. Set this up with the production bucket and test a restore of one file.
6. Encryption at rest: both providers encrypt with AES-256 by default. Verify and note the date: S3 `get-bucket-encryption` shows SSE-S3 (or SSE-KMS); R2 states it in the docs and the dashboard has no switch. Don't use SSE-C.
7. Credentials: two keys, each scoped to this one bucket, never account-wide.
   - **API key.** S3: an IAM user with `s3:GetObject`, `s3:PutObject` (uploads and the attach copy), `s3:AbortMultipartUpload`, `s3:ListMultipartUploadParts` and `s3:DeleteObject` on `arn:aws:s3:::<bucket>/incoming/*` only, plus `s3:ListBucket` on the bucket (without it a HEAD on a missing key answers 403 instead of 404, and completion checks break). Add an explicit `Deny` on `s3:DeleteObject` for `<bucket>/kept/*`. R2: tokens can't be limited by prefix or action beyond *Object Read & Write*, so use an *Object Read & Write* token for this bucket only; the `kept/` bucket lock (step 5) is what stops deletes there.
   - **Sweep key** (the daily job): S3: `s3:ListBucket`, `s3:AbortMultipartUpload` and `s3:DeleteObject` on `<bucket>/incoming/*` only. R2: a second *Object Read & Write* token for this bucket (again the bucket lock protects `kept/`).
   - Store as secrets in the host's secret store, never in the repo: `S3_ENDPOINT` (R2: `https://<account-id>.eu.r2.cloudflarestorage.com`; S3: the regional endpoint), `S3_REGION` (R2: `auto`; S3: `af-south-1`), `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` (`false` on both S3 and R2), and `STORAGE_DRIVER=s3`. The API refuses to start with the local placeholder keys. Rotate each key on staff changes and yearly: create the new key, deploy, delete the old one.
8. Check: from the deployed app upload a file, open it from its record (the link must expire in 5 minutes and answer `Cache-Control: private, no-store`), and confirm a request without a signature gets 403. Try deleting a `kept/` object with the API key: it must be refused. Then run `node dist/platform/cli/main.mjs files sweep --by <super-admin email>` once.
9. Content-Security-Policy: if one is set at the host or CDN, `connect-src` must allow the bucket origin (uploads and `HEAD`), and `img-src` and `frame-src` must allow it for previews.
10. Restore: with versioning (S3) an accidentally deleted or overwritten object is restored within 30 days by removing its delete marker or copying the previous version back. On R2 the bucket lock means a kept file can't be deleted in the first place; anything else comes back from the out-of-account backup (5a).
11. `X-Content-Type-Options: nosniff` isn't sent on file links today (presigned GETs can't set it). Adding it needs a CDN rule or a Worker in front of the bucket; planned, not required for internal use.

## Deploy notes per migration
Checks to run against production **before** the release step, for migrations that add a constraint existing rows must already meet.

- **`0007_roles_and_organization`** adds `roles_system_key_consistent` (a built-in role has a key and `is_system`; a custom role has neither). Every row written by Vento Real Estate so far satisfies it, but confirm first; the query must return no rows:
  ```sql
  select id, organization_id, key, is_system from roles where (key is null) <> (not is_system);
  ```
  If it returns rows, stop and fix them (a built-in with no key, or a custom role marked system) before migrating; otherwise the migration fails on that check and nothing in it is applied.
- **`0011_console`** is additive: a `platform_channel` enum, three nullable columns on `sessions` (`second_factor_at`, `console_opened_at`, `console_active_at`), `platform_admins.last_console_at`, and on `platform_audit_events` the nullable `channel` and `idempotency_key`, two indexes and the check `platform_audit_events_console_actor` (a console row always has a person). Existing rows have `channel` null, so the check passes without a pre-check, and `ADD COLUMN` fires no row trigger, so the append-only triggers don't block it. No backfill. Order: deploy, then make sure one super-admin can open the console (§4 steps 3–5) before anyone needs a change; until then a change needs `--break-glass`.

- **`0012_second_factor_guards`** is additive: two nullable columns on `two_factors` (`last_totp_step`, so an authenticator code is accepted once; `backup_codes_unproven_at`, so backup codes made with only a password can't open the console). No pre-check, no backfill.

- **`0013_staff_accounts`** is additive: enum `account_kind` and `users.account_kind` (not null, default `customer`: a constant default, so no table rewrite), the `staff_invitation_status` enum and the platform table `staff_invitations`, the value `account` on `platform_channel`, and the index `audit_events_action_created_idx (action, created_at desc)` for the console Dashboard. The index is a plain `CREATE INDEX` inside the migrator's single transaction (so not `CONCURRENTLY`); that's fine while `audit_events` is small. The migration's `CREATE INDEX` has no `IF NOT EXISTS`, so building the index by hand beforehand would make it fail. If `audit_events` is already large at deploy, don't pre-build it: either accept the write lock on `audit_events` for the build (minutes, not hours, at today's sizes) or have the migration changed to `IF NOT EXISTS` before it reaches main and build it first with `CREATE INDEX CONCURRENTLY audit_events_action_created_idx ON audit_events (action, created_at DESC)`. Once production data is large, any later index on `audit_events` should be built concurrently, in its own migration. No pre-check, no backfill.

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
Every variable is in `.env.example`. Production also needs the storage variables in §8 and `SUPPORT_EMAIL` (the API refuses to start without it), and should set `SECURITY_ALERT_EMAIL` (a monitored security inbox that receives break-glass notices, including `superadmin reset-two-step`, when no other super-admin can be told; unset, the server logs a warning and sends nothing). Production values (decision 0022): `WEB_ORIGIN=https://realestate.ventoerp.com`; `EMAIL_FROM="Vento Real Estate <no-reply@realestate.ventoerp.com>"` with the Postmark sender signature, DKIM and Return-Path on that domain; `SUPPORT_EMAIL` (the **Talk to Vento Real Estate** address) and `SECURITY_ALERT_EMAIL` on Vento Real Estate addresses; TLS for the host.
