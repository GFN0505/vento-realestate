-- Brick 3c backfill: who archived each archived entity, from the audit trail (null when it
-- can't be found), in the same shape as 3b's removed_by_user_id backfill.
UPDATE entities e SET archived_by_user_id = (
  SELECT a.actor_user_id FROM audit_events a
  WHERE a.organization_id = e.organization_id AND a.action = 'entity.archived'
    AND a.target_type = 'entity' AND a.target_id = e.id
  ORDER BY a.created_at DESC
  LIMIT 1
)
WHERE e.status = 'archived';
--> statement-breakpoint
-- No active member or pending invitation may hold an archived (deleted) custom role. The
-- services lock the role row and check first with a clear message; these triggers are the
-- backstop for any write path that forgets. Each names its guard in CONSTRAINT, so the API can
-- map a hit to the same copy (isGuardViolation).
CREATE FUNCTION members_role_not_archived() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  role_archived_at timestamptz;
BEGIN
  IF NEW.status = 'active' THEN
    -- FOR SHARE: an archive of this role in flight (it holds the row FOR UPDATE) finishes
    -- first and this check sees it; an archive that starts later waits for this transaction,
    -- and roles_archive_unheld then sees this row.
    SELECT r.archived_at INTO role_archived_at FROM roles r
    WHERE r.id = NEW.role_id AND r.organization_id = NEW.organization_id
    FOR SHARE;
    IF role_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'an active member cannot hold an archived role'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'members_role_not_archived';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER members_role_not_archived
  BEFORE INSERT OR UPDATE OF role_id, status ON members
  FOR EACH ROW EXECUTE FUNCTION members_role_not_archived();
--> statement-breakpoint
CREATE FUNCTION invitations_role_not_archived() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  role_archived_at timestamptz;
BEGIN
  IF NEW.status = 'pending' THEN
    -- FOR SHARE: an archive of this role in flight (it holds the row FOR UPDATE) finishes
    -- first and this check sees it; an archive that starts later waits for this transaction,
    -- and roles_archive_unheld then sees this row.
    SELECT r.archived_at INTO role_archived_at FROM roles r
    WHERE r.id = NEW.role_id AND r.organization_id = NEW.organization_id
    FOR SHARE;
    IF role_archived_at IS NOT NULL THEN
      RAISE EXCEPTION 'a pending invitation cannot offer an archived role'
        USING ERRCODE = 'check_violation', CONSTRAINT = 'invitations_role_not_archived';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER invitations_role_not_archived
  BEFORE INSERT OR UPDATE OF role_id, status ON invitations
  FOR EACH ROW EXECUTE FUNCTION invitations_role_not_archived();
--> statement-breakpoint
CREATE FUNCTION roles_archive_unheld() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND (
    EXISTS (
      SELECT 1 FROM members m
      WHERE m.organization_id = NEW.organization_id AND m.role_id = NEW.id
        AND m.status = 'active'
    ) OR EXISTS (
      SELECT 1 FROM invitations i
      WHERE i.organization_id = NEW.organization_id AND i.role_id = NEW.id
        AND i.status = 'pending'
    )
  ) THEN
    RAISE EXCEPTION 'a role someone holds cannot be archived'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'roles_archive_unheld';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER roles_archive_unheld
  BEFORE UPDATE OF archived_at ON roles
  FOR EACH ROW EXECUTE FUNCTION roles_archive_unheld();
