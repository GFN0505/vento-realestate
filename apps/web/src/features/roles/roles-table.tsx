import { Link } from '@tanstack/react-router'
import type { Role } from '@vento/shared'
import { ChevronRightIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { peopleLine } from './role-people'

const th =
  'h-10 px-3 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em] first:pl-5'
const td = 'h-[64px] px-3 align-middle first:pl-5'

type Props = { roles: readonly Role[]; menu: (role: Role) => ReactNode }

/** Built-in roles in the default order, then custom roles A–Z under a quiet divider. */
export function RolesTable({ roles, menu }: Props) {
  const builtIn = roles.filter((r) => r.isSystem)
  const custom = roles.filter((r) => !r.isSystem)
  return (
    <div className="@container overflow-hidden rounded-[12px] border bg-card shadow-xs">
      <table className="w-full table-fixed text-[13px]">
        <caption className="sr-only">Roles</caption>
        <colgroup>
          <col className="w-[52%]" />
          <col className="w-[24%]" />
          <col className="w-[16%]" />
          <col className="w-12" />
        </colgroup>
        <thead className="border-b bg-muted/40">
          <tr>
            <th scope="col" className={th}>
              Role
            </th>
            <th scope="col" className={th}>
              People
            </th>
            <th scope="col" className={th}>
              Two-step
            </th>
            <th scope="col" className={th}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {builtIn.map((role) => (
            <RoleRow key={role.id} role={role} menu={menu(role)} />
          ))}
        </tbody>
        {custom.length > 0 && (
          <tbody className="divide-y border-t">
            <tr>
              <th
                scope="rowgroup"
                colSpan={4}
                className="h-9 bg-muted/40 px-5 text-left align-middle font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]"
              >
                Custom roles
              </th>
            </tr>
            {custom.map((role) => (
              <RoleRow key={role.id} role={role} menu={menu(role)} />
            ))}
          </tbody>
        )}
      </table>
    </div>
  )
}

function RoleRow({ role, menu }: { role: Role; menu: ReactNode }) {
  return (
    <tr className="group relative transition-colors hover:bg-muted/50">
      <td className={td}>
        <div className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-2">
            {/* The whole row is this link (stretched), so a click anywhere opens the role. */}
            <Link
              to="/settings/roles/$roleId"
              params={{ roleId: role.id }}
              className="truncate rounded-sm font-semibold outline-none after:absolute after:inset-0 hover:underline hover:underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            >
              {role.name}
            </Link>
            {!role.isSystem && <CustomTag />}
          </span>
          <span className="truncate text-muted-foreground text-xs" title={role.description}>
            {role.description}
          </span>
        </div>
      </td>
      <td className={td}>
        <Link
          to="/settings/team"
          search={{ role: role.id }}
          className="relative z-[1] rounded-sm text-foreground underline decoration-border underline-offset-4 outline-none hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-ring"
        >
          {peopleLine(role)}
        </Link>
      </td>
      <td className={`${td} text-muted-foreground`}>
        {role.requiresTwoStep ? <span className="text-foreground">Required</span> : '–'}
      </td>
      <td className={`${td} relative z-[1] pr-3 text-right`}>{menu}</td>
    </tr>
  )
}

export function CustomTag() {
  return (
    <span className="shrink-0 rounded-full border border-selected-border/50 bg-selected px-1.5 py-px font-semibold text-[11px] text-selected-foreground leading-4">
      Custom
    </span>
  )
}

/** Phones: one card per role (name, description, "3 people · Two-step required"). */
export function RolesCards({ roles }: { roles: readonly Role[] }) {
  const builtIn = roles.filter((r) => r.isSystem)
  const custom = roles.filter((r) => !r.isSystem)
  return (
    <div className="flex flex-col gap-4">
      <RoleCardList label="Built-in roles" roles={builtIn} />
      {custom.length > 0 && <RoleCardList label="Custom roles" roles={custom} heading />}
    </div>
  )
}

function RoleCardList({
  label,
  roles,
  heading,
}: {
  label: string
  roles: readonly Role[]
  heading?: boolean
}) {
  return (
    <section aria-label={label} className="flex flex-col gap-2">
      {heading && (
        <h2 className="px-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
          {label}
        </h2>
      )}
      <ul className="flex flex-col gap-2">
        {roles.map((role) => (
          <li key={role.id}>
            <Link
              to="/settings/roles/$roleId"
              params={{ roleId: role.id }}
              className="flex min-h-[76px] items-center gap-3 rounded-[14px] border bg-card px-3.5 py-3 outline-none active:bg-muted focus-visible:outline-2 focus-visible:outline-ring"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-2">
                  <span className="truncate font-semibold text-[14px]">{role.name}</span>
                  {!role.isSystem && <CustomTag />}
                </span>
                <span className="truncate text-muted-foreground text-xs">{role.description}</span>
                <span className="text-muted-foreground text-xs">
                  {peopleLine(role)}
                  {role.requiresTwoStep ? ' · Two-step required' : ''}
                </span>
              </span>
              <ChevronRightIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
