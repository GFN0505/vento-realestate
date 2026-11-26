import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  DEFAULT_ROLES,
  defaultPermissions,
  defaultRole,
  MODULE_LABELS,
  PERMISSION_ACTIONS,
  PERMISSION_MODULES,
  type PermissionSet,
} from '@vento/shared'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { TooltipProvider } from '@/components/ui/tooltip'
import { testCustomRole } from '@/test/me'
import { ACTION_LABELS } from './module-lines'
import { PermissionsGrid } from './permissions-grid'
import { useRoleDraft } from './use-role-draft'

function readOnly(permissions: PermissionSet) {
  return render(
    <TooltipProvider>
      <PermissionsGrid
        roleName="Role"
        permissions={permissions}
        saved={permissions}
        onToggle={null}
        ceiling={null}
      />
    </TooltipProvider>,
  )
}

function Editable({ ceiling }: { ceiling: PermissionSet }) {
  const role = testCustomRole()
  const draft = useRoleDraft(role)
  const [saved] = useState(role.permissions)
  return (
    <TooltipProvider>
      <PermissionsGrid
        roleName={role.name}
        permissions={draft.draft.permissions}
        saved={saved}
        onToggle={draft.toggle}
        ceiling={ceiling}
      />
    </TooltipProvider>
  )
}

describe('PermissionsGrid', () => {
  it.each(DEFAULT_ROLES.map((r) => [r.name, r] as const))(
    'shows exactly what %s can do, cell for cell',
    (_name, role) => {
      const permissions = defaultPermissions(role)
      readOnly(permissions)
      for (const module of PERMISSION_MODULES) {
        const row = screen.getByRole('rowheader', { name: new RegExp(`^${MODULE_LABELS[module]}`) })
          .parentElement as HTMLElement
        const cells = within(row).getAllByRole('cell')
        PERMISSION_ACTIONS.forEach((action, i) => {
          const expected = permissions[module].includes(action) ? 'Allowed' : 'Not allowed'
          expect(cells[i]).toHaveTextContent(expected)
        })
      }
    },
  )

  it('renders no inputs for a read-only role', () => {
    readOnly(defaultPermissions(defaultRole('sales')))
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0)
  })

  it('names each box and ticks View with any action, from the keyboard', async () => {
    render(<Editable ceiling={defaultPermissions(defaultRole('owner'))} />)
    const create = screen.getByRole('checkbox', { name: 'Documents & contracts: Create' })
    create.focus()
    await userEvent.keyboard(' ')
    expect(create).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Documents & contracts: View' })).toBeChecked()

    const salesView = screen.getByRole('checkbox', { name: 'Sales & CRM: View' })
    await userEvent.click(salesView)
    expect(salesView).not.toBeChecked()
  })

  it('locks the boxes the editor lacks', () => {
    render(<Editable ceiling={defaultPermissions(defaultRole('project_manager'))} />)
    expect(screen.getByRole('checkbox', { name: 'Finance: Edit' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Projects & construction: Edit' })).toBeEnabled()
    expect(screen.getByText(/actions you don't have yourself/)).toBeInTheDocument()
  })

  it('labels each column', () => {
    readOnly(defaultPermissions(defaultRole('viewer')))
    for (const action of PERMISSION_ACTIONS) {
      expect(
        screen.getByRole('columnheader', { name: new RegExp(ACTION_LABELS[action]) }),
      ).toBeInTheDocument()
    }
  })
})
