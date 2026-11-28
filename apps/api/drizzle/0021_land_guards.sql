-- Land & title guards (plan §3). The app connects as the table owner, so triggers, not grants,
-- keep these. Each raises check_violation naming itself in CONSTRAINT (isGuardViolation tells
-- them apart). The services check every rule first, under the parcel's lock, so a hit means a
-- write that skipped them (a bug or a hand-run statement): it fails as a server error rather
-- than changing history, and the request's error reference finds it in the logs.

-- A document version is history: never deleted, and only its removal (reason, who, when) may
-- change, so "remove with a reason" and its Undo are the only edits.
CREATE FUNCTION title_document_versions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'a title document version cannot be deleted'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'title_document_versions_append_only';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.document_id IS DISTINCT FROM OLD.document_id
    OR NEW.version_no IS DISTINCT FROM OLD.version_no
    OR NEW.file_id IS DISTINCT FROM OLD.file_id
    OR NEW.number IS DISTINCT FROM OLD.number
    OR NEW.issued_on IS DISTINCT FROM OLD.issued_on
    OR NEW.issued_by IS DISTINCT FROM OLD.issued_by
    OR NEW.note IS DISTINCT FROM OLD.note
    OR NEW.uploaded_by_user_id IS DISTINCT FROM OLD.uploaded_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'only the removal of a title document version can change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'title_document_versions_append_only';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER title_document_versions_append_only
  BEFORE UPDATE OR DELETE ON title_document_versions
  FOR EACH ROW EXECUTE FUNCTION title_document_versions_append_only();
--> statement-breakpoint
-- A document holds versions, so it stays; it never moves to another parcel or changes type.
CREATE FUNCTION title_documents_kept() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE'
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.parcel_id IS DISTINCT FROM OLD.parcel_id
    OR NEW.type IS DISTINCT FROM OLD.type
  THEN
    RAISE EXCEPTION 'a title document is kept on its parcel'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'title_documents_kept';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER title_documents_kept
  BEFORE UPDATE OR DELETE ON title_documents
  FOR EACH ROW EXECUTE FUNCTION title_documents_kept();
--> statement-breakpoint
-- Parcels are master data: archived, never deleted (non-negotiable 7).
CREATE FUNCTION parcels_kept() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'a parcel cannot be deleted; archive it'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'parcels_kept';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER parcels_kept
  BEFORE DELETE ON parcels
  FOR EACH ROW EXECUTE FUNCTION parcels_kept();
--> statement-breakpoint
-- A stage stays on its parcel and keeps its type: Undo, Activity and the vault read it by both.
CREATE FUNCTION title_stages_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.parcel_id IS DISTINCT FROM OLD.parcel_id
    OR NEW.type IS DISTINCT FROM OLD.type
  THEN
    RAISE EXCEPTION 'a title stage stays on its parcel with its type'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'title_stages_fixed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER title_stages_fixed
  BEFORE UPDATE ON title_stages
  FOR EACH ROW EXECUTE FUNCTION title_stages_fixed();
--> statement-breakpoint
-- Edit stages removes only a stage that never started (and has no documents: the stage_id foreign
-- key and the service check that). A started stage is in the parcel's history.
CREATE FUNCTION title_stages_started_kept() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status <> 'not_started' THEN
    RAISE EXCEPTION 'a title stage that has started cannot be removed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'title_stages_started_kept';
  END IF;
  RETURN OLD;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER title_stages_started_kept
  BEFORE DELETE ON title_stages
  FOR EACH ROW EXECUTE FUNCTION title_stages_started_kept();
--> statement-breakpoint
-- TRUNCATE skips row triggers; refuse it on the tables that hold title history.
CREATE FUNCTION land_no_truncate() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'land and title history cannot be truncated'
    USING ERRCODE = 'check_violation', CONSTRAINT = 'land_no_truncate';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER parcels_no_truncate
  BEFORE TRUNCATE ON parcels
  FOR EACH STATEMENT EXECUTE FUNCTION land_no_truncate();
--> statement-breakpoint
CREATE TRIGGER title_documents_no_truncate
  BEFORE TRUNCATE ON title_documents
  FOR EACH STATEMENT EXECUTE FUNCTION land_no_truncate();
--> statement-breakpoint
CREATE TRIGGER title_document_versions_no_truncate
  BEFORE TRUNCATE ON title_document_versions
  FOR EACH STATEMENT EXECUTE FUNCTION land_no_truncate();
--> statement-breakpoint
CREATE TRIGGER title_stages_no_truncate
  BEFORE TRUNCATE ON title_stages
  FOR EACH STATEMENT EXECUTE FUNCTION land_no_truncate();
--> statement-breakpoint
-- Record numbers are never handed out twice (P-0012 stays P-0012's): a counter only moves up,
-- keeps its organization and kind, and is never deleted or truncated.
CREATE FUNCTION record_counters_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' OR TG_OP = 'TRUNCATE'
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.kind IS DISTINCT FROM OLD.kind
    OR NEW.last_value < OLD.last_value
  THEN
    RAISE EXCEPTION 'a record counter only moves forward'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'record_counters_forward';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER record_counters_forward
  BEFORE UPDATE OR DELETE ON record_counters
  FOR EACH ROW EXECUTE FUNCTION record_counters_forward();
--> statement-breakpoint
CREATE TRIGGER record_counters_no_truncate
  BEFORE TRUNCATE ON record_counters
  FOR EACH STATEMENT EXECUTE FUNCTION record_counters_forward();
