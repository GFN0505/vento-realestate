-- Encumbrance guards (land slice 2, plan §3). As in 0021: the app connects as the table owner, so
-- triggers keep these, each raising check_violation naming itself in CONSTRAINT (isGuardViolation).
-- The services check every rule first under the parcel's lock; a hit means a write that skipped
-- them. Enum values are compared as text in these bodies too, like the table's checks.

-- An encumbrance is history: never deleted. Its type, parcel, block choice, evidence (document and
-- pinned version) and who recorded it never change; it only goes active → cleared, and a cleared
-- one is frozen. Clearing needs the approval (security L3): a pending *Clear an encumbrance*
-- request for it at its last step, whose last step someone has approved in this transaction's
-- view, made against this version of it and naming this clearance version. The engine records
-- that decision before it runs the execute, so only the approval's execute can pass; a raw UPDATE
-- (or a bug that skips the engine) can't unblock sales.
CREATE FUNCTION encumbrances_kept() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'an encumbrance cannot be deleted; clear it'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'encumbrances_kept';
  END IF;
  IF OLD.status::text = 'cleared' THEN
    RAISE EXCEPTION 'a cleared encumbrance cannot change'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'encumbrances_cleared_frozen';
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id
    OR NEW.organization_id IS DISTINCT FROM OLD.organization_id
    OR NEW.parcel_id IS DISTINCT FROM OLD.parcel_id
    OR NEW.type IS DISTINCT FROM OLD.type
    OR NEW.blocks_sales IS DISTINCT FROM OLD.blocks_sales
    OR NEW.evidence_document_id IS DISTINCT FROM OLD.evidence_document_id
    OR NEW.evidence_version_id IS DISTINCT FROM OLD.evidence_version_id
    OR NEW.recorded_by_user_id IS DISTINCT FROM OLD.recorded_by_user_id
    OR NEW.created_at IS DISTINCT FROM OLD.created_at
  THEN
    RAISE EXCEPTION 'an encumbrance keeps its parcel, type, block choice and evidence'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'encumbrances_fixed';
  END IF;
  IF NEW.status::text = 'cleared' AND NOT EXISTS (
    SELECT 1 FROM approval_requests r
    JOIN approval_decisions d ON d.organization_id = r.organization_id AND d.request_id = r.id
      AND d.position = r.step_count AND d.decision::text = 'approve'
    WHERE r.organization_id = NEW.organization_id
      AND r.action_key = 'land.encumbrance.clear'
      AND r.subject_type = 'encumbrance' AND r.subject_id = NEW.id
      AND r.status::text = 'pending' AND r.current_step = r.step_count
      AND (r.payload->>'version')::int = OLD.version
      AND (r.payload->>'clearanceVersionId')::uuid = NEW.clearance_version_id
  ) THEN
    RAISE EXCEPTION 'an encumbrance is cleared only by its approved clearing request'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'encumbrances_cleared_by_approval';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER encumbrances_kept
  BEFORE UPDATE OR DELETE ON encumbrances
  FOR EACH ROW EXECUTE FUNCTION encumbrances_kept();
--> statement-breakpoint
CREATE TRIGGER encumbrances_no_truncate
  BEFORE TRUNCATE ON encumbrances
  FOR EACH STATEMENT EXECUTE FUNCTION land_no_truncate();
--> statement-breakpoint
-- An archived parcel is read-only: nothing new is recorded on it. And an encumbrance starts active:
-- inserting one already cleared would skip the approval (security L3).
CREATE FUNCTION encumbrances_parcel_active() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status::text <> 'active' THEN
    RAISE EXCEPTION 'an encumbrance is recorded active'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'encumbrances_cleared_by_approval';
  END IF;
  IF EXISTS (
    SELECT 1 FROM parcels p
    WHERE p.organization_id = NEW.organization_id AND p.id = NEW.parcel_id
      AND p.archived_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'an encumbrance cannot be recorded on an archived parcel'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'encumbrances_parcel_active';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER encumbrances_parcel_active
  BEFORE INSERT ON encumbrances
  FOR EACH ROW EXECUTE FUNCTION encumbrances_parcel_active();
--> statement-breakpoint
-- A parcel with an active encumbrance can't be archived (titling isn't affected). Backs up the
-- service's "Clear the caveat before archiving this parcel."; both lock the parcel row.
CREATE FUNCTION parcels_not_encumbered() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM encumbrances e
    WHERE e.organization_id = NEW.organization_id AND e.parcel_id = NEW.id
      AND e.status::text = 'active'
  ) THEN
    RAISE EXCEPTION 'a parcel with an active encumbrance cannot be archived'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'parcels_not_encumbered';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER parcels_not_encumbered
  BEFORE UPDATE OF archived_at ON parcels
  FOR EACH ROW EXECUTE FUNCTION parcels_not_encumbered();
--> statement-breakpoint
-- A version an encumbrance shows (its evidence, or the clearance its approvers approved) stays in
-- the vault (security M1). Backs up removeVersion's "evidence_for_encumbrance"; the version a
-- pending clearing request names is the service's check (it lives in the request's payload).
CREATE FUNCTION title_document_versions_pinned_kept() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.removed_at IS NULL AND NEW.removed_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM encumbrances e
    WHERE e.organization_id = NEW.organization_id
      AND (e.evidence_version_id = NEW.id OR e.clearance_version_id = NEW.id)
  ) THEN
    RAISE EXCEPTION 'an encumbrance''s evidence version cannot be removed'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'title_document_versions_pinned_kept';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER title_document_versions_pinned_kept
  BEFORE UPDATE OF removed_at ON title_document_versions
  FOR EACH ROW EXECUTE FUNCTION title_document_versions_pinned_kept();
