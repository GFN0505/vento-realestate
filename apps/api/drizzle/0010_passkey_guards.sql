-- Guards on new passkeys, serialised per person by an advisory lock (also taken by an admin's
-- two-step reset, members.service.ts), so two writes for one person can't both see stale facts:
--  * at most 10 per person: the registration before-hook refuses the 11th with a clear message;
--    this is the backstop for two tabs adding at once;
--  * none while a two-step reset is pending: a registration in flight when an owner or admin
--    resets the person either lands first and is deleted by the reset, or waits and is refused.
CREATE OR REPLACE FUNCTION passkeys_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  existing integer;
  reset_pending boolean;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  SELECT u.password_reset_required OR u.two_step_setup_required INTO reset_pending
  FROM users u WHERE u.id = NEW.user_id;
  IF reset_pending THEN
    RAISE EXCEPTION 'PASSKEY_RESET_PENDING'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'passkeys_reset_pending';
  END IF;
  SELECT count(*) INTO existing FROM passkeys WHERE user_id = NEW.user_id;
  IF existing >= 10 THEN
    RAISE EXCEPTION 'PASSKEY_LIMIT'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'passkeys_limit';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS passkeys_limit ON passkeys;
--> statement-breakpoint
CREATE TRIGGER passkeys_limit
  BEFORE INSERT ON passkeys
  FOR EACH ROW EXECUTE FUNCTION passkeys_limit();
--> statement-breakpoint
-- The signature counter only moves forward (compare-and-swap): of two sign-ins racing with copies
-- of one key, the second is refused, and the API reports a suspected clone. Authenticators that
-- don't count (always 0, like Apple's) are left alone.
CREATE OR REPLACE FUNCTION passkeys_counter_forward() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.counter > 0 OR OLD.counter > 0) AND NEW.counter <= OLD.counter THEN
    RAISE EXCEPTION 'PASSKEY_COUNTER_REPLAY'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'passkeys_counter_forward';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
DROP TRIGGER IF EXISTS passkeys_counter_forward ON passkeys;
--> statement-breakpoint
CREATE TRIGGER passkeys_counter_forward
  BEFORE UPDATE OF counter ON passkeys
  FOR EACH ROW EXECUTE FUNCTION passkeys_counter_forward();
--> statement-breakpoint
-- Sessions made before 3d entered their organization when they were created.
UPDATE sessions SET organization_entered_at = created_at WHERE organization_entered_at IS NULL;
