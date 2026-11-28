-- Clearing an encumbrance (land slice 2, plan §3): Finance's Approve in Land & title and the
-- default rule, for every organization that exists now. New organizations get both at sign-up
-- (syncSystemRoles and seedDefaultRules read the same catalog values). Safe to run again: each
-- statement skips what's already there. Each change is in the organization's audit trail, by
-- "System" (SYSTEM_ACTOR: no user), so owners can see why Finance can approve and where the rule
-- came from (security L1).

-- (b) first, so the rule's step 1 names roles that can approve in Land & title. Built-in roles
-- are never edited by customers, so this matches DEFAULT_ROLES (Finance: land viewApprove).
-- Finance already requires two-step, so 0017's "approvers use two-step" still holds. The audit
-- event reads role_permissions as it was before this statement (a CTE's insert isn't visible to
-- the statement's own reads), so `before` is Finance's Land & title rights without Approve.
WITH added AS (
  INSERT INTO role_permissions (organization_id, role_id, module, action)
  SELECT r.organization_id, r.id, 'land', 'approve'
  FROM roles r
  WHERE r.key = 'finance' AND r.is_system
  ON CONFLICT (role_id, module, action) DO NOTHING
  RETURNING role_id
),
bumped AS (
  UPDATE roles r SET version = r.version + 1, updated_at = now()
  WHERE r.id IN (SELECT role_id FROM added)
  RETURNING r.id, r.organization_id, r.name, r.version
),
was AS (
  SELECT b.id, coalesce((
    SELECT jsonb_agg(rp.action ORDER BY array_position(
      ARRAY['view', 'create', 'edit', 'delete', 'export', 'approve'], rp.action::text))
    FROM role_permissions rp
    WHERE rp.role_id = b.id AND rp.module = 'land'
  ), '[]'::jsonb) AS actions
  FROM bumped b
)
INSERT INTO audit_events (organization_id, actor_user_id, actor_name, action, target_type,
  target_id, target_label, before, after, metadata)
SELECT b.organization_id, NULL, 'System', 'role.updated', 'role', b.id, b.name,
  jsonb_build_object('permissions', jsonb_build_object('land', w.actions)),
  jsonb_build_object('permissions', jsonb_build_object('land', w.actions || '["approve"]'::jsonb)),
  jsonb_build_object(
    'version', b.version,
    'changes', jsonb_build_array(jsonb_build_object(
      'module', 'land', 'added', jsonb_build_array('approve'), 'removed', '[]'::jsonb)),
    'migration', '0024_encumbrance_clear_rule')
FROM bumped b JOIN was w ON w.id = b.id;
--> statement-breakpoint
-- (a) One all-company rule per organization with an active owner and no rule for the action:
--   land.encumbrance.clear  any amount, step 1: Land & legal, Finance or Admin; step 2: Owner
-- One statement, as in 0017: the CTEs are materialised once (uuidv7() is volatile) and the
-- foreign keys are checked at its end. approval_rules.created_by_member_id is NOT NULL with a
-- same-organization key to members, so the rule names the first owner as its creator (as rules
-- seeded at sign-up do); the audit event says System made it.
WITH defaults AS MATERIALIZED (
  SELECT o.id AS organization_id, owner.member_id AS owner_member_id, uuidv7() AS rule_id
  FROM organizations o
  JOIN LATERAL (
    SELECT m.id AS member_id FROM members m
    JOIN roles r ON r.id = m.role_id AND r.organization_id = m.organization_id
    WHERE m.organization_id = o.id AND m.status = 'active' AND r.key = 'owner'
    ORDER BY m.joined_at, m.id
    LIMIT 1
  ) owner ON true
  WHERE NOT EXISTS (
    SELECT 1 FROM approval_rules ar
    WHERE ar.organization_id = o.id AND ar.action_key = 'land.encumbrance.clear'
  )
),
steps AS MATERIALIZED (
  SELECT d.organization_id, d.rule_id, s.position, s.role_keys, uuidv7() AS step_id
  FROM defaults d
  CROSS JOIN (VALUES
    (1, ARRAY['land_legal', 'finance', 'admin']),
    (2, ARRAY['owner'])
  ) AS s(position, role_keys)
),
new_rules AS (
  INSERT INTO approval_rules (id, organization_id, action_key, min_amount, applies_to_all, created_by_member_id)
  SELECT rule_id, organization_id, 'land.encumbrance.clear', NULL, true, owner_member_id FROM defaults
),
new_steps AS (
  INSERT INTO approval_rule_steps (id, organization_id, rule_id, position)
  SELECT step_id, organization_id, rule_id, position FROM steps
),
-- The words approval_rule.created keeps (the service's ruleWords): built-in role names are
-- fixed, and "Approved by" lists a step's roles in system order, as loadRules reads them.
audited AS (
  INSERT INTO audit_events (organization_id, actor_user_id, actor_name, action, target_type,
    target_id, target_label, after, metadata)
  SELECT organization_id, NULL, 'System', 'approval_rule.created', 'approval_rule', rule_id,
    'Clear an encumbrance',
    jsonb_build_object(
      'action', 'Clear an encumbrance',
      'when', 'Any amount',
      'approvedBy', 'Admin, Land & legal or Finance → Owner',
      'companies', 'All companies'),
    jsonb_build_object(
      'actionKey', 'land.encumbrance.clear',
      'version', 1,
      'migration', '0024_encumbrance_clear_rule')
  FROM defaults
)
INSERT INTO approval_rule_step_roles (organization_id, step_id, role_id)
SELECT st.organization_id, st.step_id, r.id
FROM steps st
JOIN roles r ON r.organization_id = st.organization_id AND r.key = ANY (st.role_keys);
