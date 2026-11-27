-- Staff accounts are separate from customer accounts (decision 0023, admin-console plan §1b.3).
-- Runs in the migrator's single transaction, in this order.
--
-- 1. A super-admin who is also an active member of an organization stops being a super-admin
--    (owner's decision 2). Their membership, password, two-step and passkeys are untouched. The
--    platform trail stays append-only: this only inserts. Channel `command` (the new `account`
--    value can't be used in the transaction that adds it).
WITH gone AS (
  UPDATE platform_admins pa SET revoked_at = now(), updated_at = now()
  WHERE pa.revoked_at IS NULL
    AND EXISTS (SELECT 1 FROM members m WHERE m.user_id = pa.user_id AND m.status = 'active')
  RETURNING pa.user_id
)
INSERT INTO platform_audit_events (actor_user_id, actor_name, operator, action, target_type,
  target_key, before, reason, channel, metadata)
SELECT NULL, 'Vento Real Estate (setup)', 'migration 0014_staff_account_guards',
  'superadmin.revoked', 'user', g.user_id::text, jsonb_build_object('name', u.name),
  'Staff accounts are separate from customer accounts', 'command',
  jsonb_build_object('done', u.name || ' is no longer a Vento Real Estate super-admin.')
FROM gone g JOIN users u ON u.id = g.user_id;
--> statement-breakpoint
-- Their open console windows close (the rows revoked just above, in this same transaction).
UPDATE sessions s SET console_opened_at = NULL, console_active_at = NULL
WHERE s.console_opened_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM platform_admins pa WHERE pa.user_id = s.user_id AND pa.revoked_at IS NULL
  );
--> statement-breakpoint
-- 2. The remaining active super-admins become staff accounts (none has an active membership now).
UPDATE users SET account_kind = 'staff'
WHERE id IN (SELECT user_id FROM platform_admins WHERE revoked_at IS NULL);
--> statement-breakpoint
-- 3. One email, one kind, pinned in the database. Messages carry no personal data.
CREATE FUNCTION members_refuse_staff() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'active'
     AND EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.account_kind = 'staff') THEN
    RAISE EXCEPTION 'STAFF_ACCOUNT_MEMBER'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'members_refuse_staff';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER members_refuse_staff
  BEFORE INSERT OR UPDATE OF user_id, status ON members
  FOR EACH ROW EXECUTE FUNCTION members_refuse_staff();
--> statement-breakpoint
-- Insert only: revoked rows of former super-admins who are customers stay as history.
CREATE FUNCTION platform_admins_staff_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM users u WHERE u.id = NEW.user_id AND u.account_kind = 'staff') THEN
    RAISE EXCEPTION 'PLATFORM_ADMIN_NOT_STAFF'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'platform_admins_staff_only';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER platform_admins_staff_only
  BEFORE INSERT ON platform_admins
  FOR EACH ROW EXECUTE FUNCTION platform_admins_staff_only();
--> statement-breakpoint
CREATE FUNCTION users_account_kind_fixed() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.account_kind IS DISTINCT FROM OLD.account_kind THEN
    RAISE EXCEPTION 'ACCOUNT_KIND_FIXED'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'users_account_kind_fixed';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_account_kind_fixed
  BEFORE UPDATE OF account_kind ON users
  FOR EACH ROW EXECUTE FUNCTION users_account_kind_fixed();
