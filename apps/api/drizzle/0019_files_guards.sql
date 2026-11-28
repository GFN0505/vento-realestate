-- Private file storage guards (decision 0025). The app connects as the table owner, so triggers,
-- not grants, keep these. Each raises check_violation naming itself in CONSTRAINT, so
-- isGuardViolation maps a hit to plain copy and a raw trigger error never reaches a user.

-- A file a record holds is kept for the life of the organization: "remove with a reason" hides a
-- version and keeps the file. Only unattached uploads may be deleted (the daily sweep, a cancel).
CREATE FUNCTION files_attached_kept() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.attached_at IS NOT NULL THEN
    RAISE EXCEPTION 'a file attached to a record cannot be deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'files_attached_kept';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER files_attached_kept
  BEFORE DELETE ON files
  FOR EACH ROW EXECUTE FUNCTION files_attached_kept();
--> statement-breakpoint
-- Once checked, a file is what was checked: its size, type and hash never change, and it stays
-- ready unless it is unattached and on its way out (`deleting`). It never moves organization,
-- uploader or purpose. Its key changes once, from `incoming/` to `kept/`, in the update that
-- attaches it (files_object_key_layout fixes the exact value); once attached it stays attached.
-- Statuses: uploading → ready | rejected | deleting; ready → deleting (unattached);
-- rejected → deleting; deleting is final. The hash is the integrity evidence for title documents.
CREATE FUNCTION files_ready_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.purpose IS DISTINCT FROM OLD.purpose
    OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id
    OR (NEW.object_key IS DISTINCT FROM OLD.object_key AND NOT (
      OLD.attached_at IS NULL AND NEW.attached_at IS NOT NULL
      AND OLD.object_key LIKE 'incoming/%' AND NEW.object_key LIKE 'kept/%'
    ))
    OR (OLD.status = 'ready' AND (
      NEW.status NOT IN ('ready', 'deleting')
      OR NEW.size_bytes IS DISTINCT FROM OLD.size_bytes
      OR NEW.content_type IS DISTINCT FROM OLD.content_type
      OR NEW.sha256 IS DISTINCT FROM OLD.sha256
      OR NEW.completed_at IS DISTINCT FROM OLD.completed_at
    ))
    OR (OLD.status = 'rejected' AND NEW.status NOT IN ('rejected', 'deleting'))
    OR (OLD.status = 'deleting' AND NEW.status IS DISTINCT FROM OLD.status)
    OR (NEW.status = 'deleting' AND NEW.attached_at IS NOT NULL)
    OR (OLD.attached_at IS NOT NULL AND NEW.attached_at IS DISTINCT FROM OLD.attached_at)
    OR (OLD.incoming_deleted_at IS NOT NULL
      AND NEW.incoming_deleted_at IS DISTINCT FROM OLD.incoming_deleted_at)
  THEN
    RAISE EXCEPTION 'a checked file cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'files_ready_fixed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER files_ready_fixed
  BEFORE UPDATE ON files
  FOR EACH ROW EXECUTE FUNCTION files_ready_fixed();
--> statement-breakpoint
-- TRUNCATE skips row triggers; refuse it so attached files can't go that way either.
CREATE FUNCTION files_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'files cannot be truncated'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'files_attached_kept';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER files_no_truncate
  BEFORE TRUNCATE ON files
  FOR EACH STATEMENT EXECUTE FUNCTION files_no_truncate();
