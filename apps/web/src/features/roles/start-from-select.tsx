import type { Role } from '@vento/shared'
import type { Ref } from 'react'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

type Props = {
  id: string
  roles: readonly Role[]
  value: string
  onChange: (roleId: string) => void
  triggerRef?: Ref<HTMLButtonElement>
}

/** Built-in roles, then custom ones under a quiet label (server order: built-ins, then A–Z). */
export function RoleOptions({ roles }: { roles: readonly Role[] }) {
  const builtIn = roles.filter((r) => r.isSystem)
  const custom = roles.filter((r) => !r.isSystem)
  return (
    <>
      <SelectGroup>
        {builtIn.map((role) => (
          <SelectItem key={role.id} value={role.id} description={role.description}>
            {role.name}
          </SelectItem>
        ))}
      </SelectGroup>
      {custom.length > 0 && (
        <>
          <SelectSeparator />
          <SelectGroup>
            <SelectLabel>Custom roles</SelectLabel>
            {custom.map((role) => (
              <SelectItem key={role.id} value={role.id} description={role.description}>
                {role.name}
              </SelectItem>
            ))}
          </SelectGroup>
        </>
      )}
    </>
  )
}

/** "Start from" in New role: only roles within the creator's own permissions. */
export function StartFromSelect({ id, roles, value, onChange, triggerRef }: Props) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger ref={triggerRef} id={id}>
        <SelectValue placeholder="Choose a role" />
      </SelectTrigger>
      <SelectContent className="max-w-[min(420px,calc(100vw-2rem))]">
        <RoleOptions roles={roles} />
      </SelectContent>
    </Select>
  )
}
