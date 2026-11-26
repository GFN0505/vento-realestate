-- Plan versions and the platform audit trail are append-only (decision 0015). The app connects
-- as the table owner, so triggers, not REVOKE, guarantee nothing edits or removes them.
CREATE FUNCTION platform_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only', TG_TABLE_NAME USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER platform_audit_events_no_update_or_delete
  BEFORE UPDATE OR DELETE ON platform_audit_events
  FOR EACH ROW EXECUTE FUNCTION platform_append_only();
--> statement-breakpoint
CREATE TRIGGER platform_audit_events_no_truncate
  BEFORE TRUNCATE ON platform_audit_events
  FOR EACH STATEMENT EXECUTE FUNCTION platform_append_only();
--> statement-breakpoint
CREATE TRIGGER plan_versions_no_update_or_delete
  BEFORE UPDATE OR DELETE ON plan_versions
  FOR EACH ROW EXECUTE FUNCTION platform_append_only();
--> statement-breakpoint
CREATE TRIGGER plan_versions_no_truncate
  BEFORE TRUNCATE ON plan_versions
  FOR EACH STATEMENT EXECUTE FUNCTION platform_append_only();
--> statement-breakpoint
-- Starting data. Every organization that exists before feature flags is one of Vento's own
-- (no customer has been released anything yet), so it becomes `internal`: it keeps seeing
-- every module, "Soon" tags included, exactly as before. Plans are published afterwards by
-- `pnpm plans bootstrap`, which puts internal organizations without a plan on Enterprise.
-- Organizations created from now on start as `standard` (onboarding inserts their row).
INSERT INTO organization_plans (organization_id, release_group)
SELECT id, 'internal' FROM organizations
ON CONFLICT (organization_id) DO NOTHING;
