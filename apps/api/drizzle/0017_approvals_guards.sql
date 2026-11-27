-- Approval decisions are append-only, like audit events (decision 0024, 0011). The app connects as
-- the table owner, so a trigger, not a REVOKE, is what guarantees nobody rewrites who approved.
CREATE FUNCTION approval_decisions_append_only() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'approval decisions are append-only' USING ERRCODE = 'restrict_violation';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER approval_decisions_no_update_or_delete
  BEFORE UPDATE OR DELETE ON approval_decisions
  FOR EACH ROW EXECUTE FUNCTION approval_decisions_append_only();
--> statement-breakpoint
CREATE TRIGGER approval_decisions_no_truncate
  BEFORE TRUNCATE ON approval_decisions
  FOR EACH STATEMENT EXECUTE FUNCTION approval_decisions_append_only();
--> statement-breakpoint
-- A role named in an approval rule can't be deleted (archived). The roles service checks first
-- with "Site manager approves in 2 rules. Change those rules first."; this is the backstop, named
-- in CONSTRAINT so isGuardViolation maps it to the same copy. Erasing such a role is refused by
-- the approval_rule_step_roles foreign key.
CREATE FUNCTION roles_not_in_rule() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.archived_at IS NULL AND NEW.archived_at IS NOT NULL AND EXISTS (
    SELECT 1 FROM approval_rule_step_roles sr
    WHERE sr.organization_id = NEW.organization_id AND sr.role_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'a role named in an approval rule cannot be archived'
      USING ERRCODE = 'check_violation', CONSTRAINT = 'roles_not_in_rule';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER roles_not_in_rule
  BEFORE UPDATE OF archived_at ON roles
  FOR EACH ROW EXECUTE FUNCTION roles_not_in_rule();
--> statement-breakpoint
-- The two default rules (spec open question 6) for every organization that exists now, created by
-- its first owner. New organizations get them at sign-up (seedDefaultRules, same catalog values):
--   access.role.update        any amount, step 1: Owner or Admin
--   access.member.make_owner  any amount, step 1: Owner
-- One statement: the CTE is materialised once (uuidv7() is volatile), and the foreign keys are
-- checked at its end, after all three inserts.
WITH defaults AS MATERIALIZED (
  SELECT d.action_key, d.role_keys, o.id AS organization_id, owner.member_id AS owner_member_id,
    uuidv7() AS rule_id, uuidv7() AS step_id
  FROM organizations o
  CROSS JOIN (VALUES
    ('access.role.update', ARRAY['owner', 'admin']),
    ('access.member.make_owner', ARRAY['owner'])
  ) AS d(action_key, role_keys)
  JOIN LATERAL (
    SELECT m.id AS member_id FROM members m
    JOIN roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
    WHERE m.organization_id = o.id AND m.status = 'active' AND r.key = 'owner'
    ORDER BY m.joined_at, m.id
    LIMIT 1
  ) owner ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM approval_rules ar
    WHERE ar.organization_id = o.id AND ar.action_key = d.action_key
  )
),
new_rules AS (
  INSERT INTO approval_rules (id, organization_id, action_key, min_amount, applies_to_all, created_by_member_id)
  SELECT rule_id, organization_id, action_key, NULL, true, owner_member_id FROM defaults
),
new_steps AS (
  INSERT INTO approval_rule_steps (id, organization_id, rule_id, position)
  SELECT step_id, organization_id, rule_id, 1 FROM defaults
)
INSERT INTO approval_rule_step_roles (organization_id, step_id, role_id)
SELECT d.organization_id, d.step_id, r.id
FROM defaults d
JOIN roles r ON r.organization_id = d.organization_id AND r.key = ANY (d.role_keys);
--> statement-breakpoint
-- Approvers must use two-step (plan question 5): every role with Approve anywhere, built-in or
-- custom. Holders without it get the usual banner and 7 days. version + 1, as any role save.
UPDATE roles r SET requires_two_step = true, version = r.version + 1, updated_at = now()
WHERE NOT r.requires_two_step AND EXISTS (
  SELECT 1 FROM role_permissions rp
  WHERE rp.role_id = r.id AND rp.organization_id = r.organization_id AND rp.action = 'approve'
);
