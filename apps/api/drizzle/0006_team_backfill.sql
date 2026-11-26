-- Brick 3b backfill. Invitations sent before delivery was tracked went through the dev
-- transport, so they read as sent.
UPDATE invitations SET delivery = 'sent', delivery_changed_at = last_sent_at;
--> statement-breakpoint
-- Last active from the newest session in that organization, for people active today.
UPDATE members m SET last_active_at = s.at
FROM (
  SELECT user_id, active_organization_id AS organization_id, max(last_active_at) AS at
  FROM sessions
  WHERE active_organization_id IS NOT NULL
  GROUP BY 1, 2
) s
WHERE s.user_id = m.user_id AND s.organization_id = m.organization_id AND m.status = 'active';
--> statement-breakpoint
-- Who removed each removed member, from the audit trail (null when it can't be found).
UPDATE members m SET removed_by_user_id = (
  SELECT a.actor_user_id FROM audit_events a
  WHERE a.organization_id = m.organization_id AND a.action = 'member.removed'
    AND a.target_type = 'member' AND a.target_id = m.id
  ORDER BY a.created_at DESC
  LIMIT 1
)
WHERE m.status = 'removed';
