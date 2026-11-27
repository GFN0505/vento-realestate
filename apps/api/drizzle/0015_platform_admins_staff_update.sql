-- A super-admin row can only ever be active for a staff account (audit L5). 0014 checked inserts;
-- this also refuses an update that points an active row at a customer, or reactivates a revoked
-- row of a customer (a legacy pre-1b super-admin). Revoking (revoked_at set) is always allowed.
CREATE OR REPLACE FUNCTION platform_admins_staff_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (TG_OP = 'INSERT' OR NEW.revoked_at IS NULL)
     AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.account_kind = 'staff') THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_NOT_STAFF'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'platform_admins_staff_only';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS platform_admins_staff_only ON platform_admins;
--> statement-breakpoint
CREATE TRIGGER platform_admins_staff_only
  BEFORE INSERT OR UPDATE OF user_id, revoked_at ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION platform_admins_staff_only();
