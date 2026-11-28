#!/bin/sh
# Entrypoint of the local/CI storage container: starts the S3 server, then creates the bucket the
# way production is set up (private, versioned, 30-day non-current retention) and marks the
# container ready. The marker is what the healthcheck looks for, so `docker compose up --wait`
# (pnpm db:up) returns only once the bucket exists. Safe to run again: every step is idempotent.
# Done in the server's own container because `--wait` treats a finished one-shot container as a
# failure. Values come from the environment (docker-compose.yml, .github/workflows/ci.yml).
set -eu

READY=/tmp/storage-ready
BUCKET="${STORAGE_BUCKET:-vento-local}"
rm -f "$READY"

minio server /data &
server=$!
trap 'kill "$server" 2>/dev/null' TERM INT

export MC_CONFIG_DIR=/tmp/mc
until mc --quiet alias set local http://localhost:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" >/dev/null 2>&1 \
  && mc --quiet ready local >/dev/null 2>&1; do
  kill -0 "$server" 2>/dev/null || exit 1
  sleep 1
done
mc --quiet mb --ignore-existing "local/$BUCKET"
mc --quiet anonymous set none "local/$BUCKET"

# Versioning, as in production (30-day non-current retention below).
mc --quiet version enable "local/$BUCKET"

# Not set here, and why:
# - CORS: MinIO has no per-bucket CORS (`mc cors set` fails with "not implemented"). It is
#   server-wide through MINIO_API_CORS_ALLOW_ORIGIN in docker-compose.yml and ci.yml, and ETag is
#   exposed by default. Production sets bucket CORS on R2 or S3 (docs/RUNBOOK.md).
# - Aborting incomplete multipart uploads after 1 day: MinIO rejects that lifecycle action. It
#   clears stale uploads itself; MINIO_API_STALE_UPLOADS_EXPIRY=24h is set on the server.

# Import replaces the whole lifecycle config, which keeps this idempotent.
cat > /tmp/lifecycle.json <<JSON
{
  "Rules": [
    {
      "ID": "noncurrent-30d",
      "Status": "Enabled",
      "Filter": { "Prefix": "" },
      "NoncurrentVersionExpiration": { "NoncurrentDays": 30 }
    }
  ]
}
JSON
mc --quiet ilm import "local/$BUCKET" < /tmp/lifecycle.json

touch "$READY"
echo "storage-init: bucket $BUCKET ready"

wait "$server"
