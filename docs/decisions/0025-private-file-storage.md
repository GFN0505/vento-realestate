# 0025 · Private file storage: one S3-compatible bucket, direct multipart uploads, short-lived signed links

- **Date:** 2026-11-27
- **Status:** accepted (owner, 27 Nov 2026). Provider: Cloudflare R2 with EU jurisdiction, unless production hosting goes on AWS, then S3 af-south-1; the account is set up before production. The NDPA basis and DPIA are confirmed before `land` leaves `internal`.

## Context
Land & title is the first feature that stores files: title documents that name sellers and families
(personal data under the NDPA 2023). Receipts, site photos, contracts and KYC will reuse whatever we
choose. Users are often on phones on weak networks; files are up to 25 MB; nothing may be lost or be
public; "remove" must keep history. The API caps /rpc bodies at 1 MB and should not carry file bytes.

## Decision
- **Storage:** one private S3-compatible bucket per environment, reached only through
  `apps/api/src/storage` (a driver interface with `s3` and test-only `memory` implementations, using
  `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`). Block all public access; bucket policy
  denies non-TLS requests; CORS allows PUT/GET only from WEB_ORIGIN and exposes ETag.
- **Key layout:** `incoming/org/{organizationId}/{fileId}` for uploads, `kept/org/{organizationId}/{fileId}`
  for files a record holds; never a file name or anything personal. Attaching a file to a record
  copies it inside the bucket (`CopyObject`, size checked by HEAD) and records the kept key; that
  is the only change the key may make (a check constraint fixes the exact value, the guard trigger
  allows it once). `signDownload` reads only kept keys. The sweep later deletes the `incoming/`
  copy (`incoming_deleted_at`). The API never deletes under `kept/` (the driver refuses it too).
  The copy can't be in the record's transaction: if the attach loses a race or the caller rolls
  back, the `kept/` copy is an orphan nothing points at and nothing serves. That's accepted for
  now and reconciled later against a bucket listing; a retried attach reuses the copy rather than
  overwrite it.
- **Encryption:** TLS in transit; provider-managed AES-256 at rest (on by default and verified at
  setup). No SSE-C: it would put a key in the browser. KYC (later) may add a customer-managed key
  (KMS) without changing the API.
- **Upload:** the browser uploads straight to the bucket with S3 multipart (5 MiB parts, URLs signed
  for 15 minutes, re-signed on resume). Each part URL signs its exact Content-Length, so the bucket
  refuses a body larger or smaller than declared (verified on MinIO by the contract test). A cap of
  20 per person counts unfinished uploads and finished ones no record took yet. Parts retry with backoff, pause offline and resume while the
  page is open. One code path for every size.
- **Checks on completion (server):** size from HEAD ≤ the purpose's limit and equal to the declared
  size; type from the file's first bytes (never the name or the browser's type) against the purpose's
  list; SHA-256 recorded. A failure marks the row rejected, then deletes the object, and the upload
  is refused with plain words. If the bucket finished the upload but the checks didn't run (a
  timeout), the next completion call finds the object and runs them.
- **Purposes are data:** `FILE_PURPOSES` in packages/shared names each purpose's feature, permission,
  size limit and types. The upload procedures check them in the same order as the middleware
  (feature → NOT_FOUND, then permission → FORBIDDEN).
- **Access:** a file is reachable only through the record that holds it. The owning module checks
  view permission and company access, then returns a presigned GET valid for 5 minutes, with the
  sniffed content type, a Content-Disposition and `Cache-Control: private, no-store` forced. Only
  an attached file, asked for under its own purpose, gets a link; anything else is NOT_FOUND.
  Links are never cached or logged. Issuing a link is an audited event in the owning module
  (PR 2's `land.documents.link` writes it).
- **Retention:** files attached to a record are kept for the life of the organization; "remove with
  a reason" hides a version and keeps the file (a database trigger refuses deleting an attached file).
  Unattached uploads are deleted 24 h after they finished (or started, if they never did) by
  `pnpm files sweep`; incomplete multipart uploads are aborted by a 1-day bucket lifecycle rule.
  Deletes go through a tombstone: the row is marked `deleting` with a conditional update (so a
  concurrent attach, which needs `ready`, can't take it), then the bucket delete, then the row; a
  bucket failure leaves the row `deleting` and the next sweep retries it, so a cancel never fails
  on the bucket and the sweep never stops on one row. Bucket versioning is on with 30-day non-current retention
  as an accident net where the provider supports it (S3 and the local container). Cloudflare R2 does
  not support object versioning (checked 27 Nov 2026: PutBucketVersioning is listed as unimplemented),
  so on R2 there is no undelete. Instead, a **bucket lock** rule on the `kept/` prefix stops anyone,
  the app included, from deleting or overwriting kept files.
- **Split credentials:** the API's key can't delete under `kept/` (S3: an IAM `Deny` on
  `s3:DeleteObject` for `kept/*`; R2 tokens can't be scoped by prefix, so the bucket lock does
  it). The sweep job's key deletes only under `incoming/`. Neither is an account-wide key.
- **Backup:** a copy of `kept/` outside the provider account (a second account or provider, with
  its own credentials) so an account compromise or closure can't take the only copy. Set up with
  the production bucket.
- **Before `land` leaves `internal`:** retention per purpose (how long each kind of file is kept
  after its record or organization closes), and an audited purge path for it, run by Vento staff,
  that is the only way anything under `kept/` is ever deleted. Deleting an organization's files on
  account closure is part of that spec.
- **Malware:** not scanned in this release (spec, raise in the security audit). Scanning is
  required before buyer or KYC uploads (files from outside the organization) ship. Mitigations
  now: four types only, content sniffing, files served from the bucket's own domain (never our
  origin), forced content type, downloads as attachments, previews in the browser's own viewer.
  `X-Content-Type-Options: nosniff` is **not** delivered today: S3 and R2 presigned GETs can't set
  it. It needs a CDN rule or a Worker in front of the bucket, later. The SHA-256 lets a later scan
  job or hash lookup run over existing files.
- **Local and tests:** an S3-compatible container in docker compose, started by `pnpm db:up`, with the
  bucket and CORS created by an init step. Service tests use the `memory` driver (like the email
  `memory` transport); one contract test and the e2e suite run against the container, locally and
  in CI. Production refuses to start with `memory` or with the local container's placeholder keys.
  The S3 client has connection and request timeouts, so a hung bucket fails a request instead of
  holding it. On R2, `S3_FORCE_PATH_STYLE=false` (virtual-hosted style, R2's default).
- **Where the data sits (NDPA 2023):** the bucket lives in the same jurisdiction as the production
  database (which already holds the same personal data). If that is outside Nigeria, the transfer
  rests on NDPA Part VIII (ss. 41–43) and the NDPC's General Application and Implementation
  Directive 2025 (Art. 45 and Schedule 5): the provider's data processing agreement with contractual
  clauses giving an adequate level of protection, a DPIA before the first customer upload, the
  sub-processor and location named in our customer DPA and privacy notice, and the transfer recorded
  in our records of processing. Vento Real Estate is the processor; each developer is the controller.
  Legal counsel confirms this before `land` leaves `internal`.

## Owner choices (needed before production use)
1. Provider and region (recommendation below), and the account that owns it.
2. Legal confirmation of the transfer basis and the DPIA.

| Option | For | Against |
|---|---|---|
| **Cloudflare R2, EU jurisdiction** (recommended unless hosting is on AWS) | No egress fees (buyer-portal photos and document downloads will dominate traffic), S3 API incl. presigned multipart, encryption at rest by default, simple | Data in the EU, so a cross-border transfer (GDPR gives a strong basis); fewer compliance features than AWS (no customer-managed keys) |
| **AWS S3 af-south-1 (Cape Town)** | The most proven; KMS customer keys, Object Lock, access logging; closest AWS region | Egress is expensive from af-south-1; still a transfer outside Nigeria (South Africa, POPIA) |
| **Nigerian-hosted object storage** (local cloud or colocation) | No cross-border transfer; lowest latency | S3 multipart/presign/CORS compatibility, durability and SLA unproven; we'd operate it |

## Consequences
- Every later file feature adds a purpose and a record-level link procedure; nothing else.
- Moving provider is config plus a bucket copy (S3 API only, no provider SDK features).
- We run one more container locally and in CI, and one more daily job.
- Every link is a round trip to the API (by design: access is checked each time).

## Alternatives considered
- Through the API (stream to the bucket): uses API bandwidth and memory, needs its own body limits, and
  isn't resumable without more code.
- tus (resumable upload protocol) server: resumable across reloads, but a new server dependency and
  the bytes still pass through the API. Resuming within the page is what the spec asks.
- Single presigned PUT: simplest, but a dropped connection restarts 25 MB from zero.
- Public or long-lived URLs: unacceptable for title and KYC documents.
- Files in Postgres (bytea): bloats backups and the database, and has no signed links.
