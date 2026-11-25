-- Audit events are append-only (decision 0011). The app connects as the table owner, so a
-- trigger, not a REVOKE, is what guarantees nothing edits or removes history.
CREATE FUNCTION audit_events_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit events are append-only' USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER audit_events_no_update_or_delete
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
CREATE TRIGGER audit_events_no_truncate
  BEFORE TRUNCATE ON audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION audit_events_append_only();
--> statement-breakpoint
-- Every organization keeps at least one active owner. Checked at commit (deferred), so a
-- transaction can hand ownership over in two steps. The service checks first with a clear
-- message; this is the backstop for any write path that forgets.
CREATE FUNCTION members_keep_an_owner() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM members m
    JOIN roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
    WHERE m.organization_id = OLD.organization_id
      AND m.status = 'active'
      AND r.key = 'owner'
  ) AND EXISTS (SELECT 1 FROM organizations o WHERE o.id = OLD.organization_id) THEN
    RAISE EXCEPTION 'organization % needs at least one owner', OLD.organization_id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NULL;
END;
$$;
--> statement-breakpoint
CREATE CONSTRAINT TRIGGER members_keep_an_owner
  AFTER UPDATE OR DELETE ON members
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION members_keep_an_owner();
