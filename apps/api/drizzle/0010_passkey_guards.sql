-- At most 10 passkeys per person. The registration before-hook refuses the 11th with a clear
-- message; this is the backstop for two tabs adding at once. The advisory lock serialises
-- inserts for one person, so both can't see 9 and both insert.
CREATE FUNCTION passkeys_limit() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  existing integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.user_id::text, 0));
  SELECT count(*) INTO existing FROM passkeys WHERE user_id = NEW.user_id;
  IF existing >= 10 THEN
    RAISE EXCEPTION 'PASSKEY_LIMIT'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'passkeys_limit';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER passkeys_limit
  BEFORE INSERT ON passkeys
  FOR EACH ROW EXECUTE FUNCTION passkeys_limit();
--> statement-breakpoint
-- Sessions made before 3d entered their organization when they were created.
UPDATE sessions SET organization_entered_at = created_at WHERE organization_entered_at IS NULL;
