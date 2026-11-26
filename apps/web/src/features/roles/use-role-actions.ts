import { useNavigate } from '@tanstack/react-router'
import type { Role } from '@vento/shared'
import { startPreview } from '@/features/preview/preview-role'
import { canPreview, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { orgWideRefusal } from '@/features/settings/org-wide-access'

/**
 * What the viewer may do with roles on this screen. The server's `role.can` says what it would
 * allow; the effective (previewed) permissions narrow it, as everywhere else in Settings.
 */
export function useRoleRights() {
  const me = useMe()
  const { permissions } = useEffectiveAccess()
  const navigate = useNavigate()
  const create = orgWideRefusal(me, permissions, 'create') === null
  const edit = orgWideRefusal(me, permissions, 'edit') === null
  const remove = orgWideRefusal(me, permissions, 'delete') === null
  return {
    create,
    canEdit: (role: Role) => edit && role.can.edit && role.readOnly === null,
    canDelete: (role: Role) => remove && role.can.delete,
    canDuplicate: (role: Role) => create && role.can.duplicate,
    /** 3a's preview: navigation only, requests keep the previewer's own access. */
    preview:
      canPreview(me) && me.organization
        ? (role: Role) => {
            if (!me.organization) return
            startPreview(me.organization.id, role.id)
            void navigate({ to: '/' })
          }
        : null,
  }
}
