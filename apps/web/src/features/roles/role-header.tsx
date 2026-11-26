import { Link } from '@tanstack/react-router'
import { ROLE_NAME_MAX, type Role } from '@vento/shared'
import { ChevronLeftIcon, CopyIcon, EyeIcon, ShieldCheckIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { peopleLine } from './role-people'
import type { RoleDraftApi } from './use-role-draft'

type Props = {
  role: Role
  /** The editable name and description; null for a read-only role. */
  draft: RoleDraftApi | null
  /** Why the name can't be saved ("Enter a name for the role", "A role called … already exists."). */
  nameError: string | null
  onDuplicate: (() => void) | null
  onPreview: (() => void) | null
  menu: ReactNode
}

const inPlace =
  'min-w-0 rounded-md border border-transparent bg-transparent px-2 -mx-2 outline-none transition-[border-color,box-shadow] duration-150 hover:border-input focus-visible:border-ring focus-visible:bg-card focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive'

/**
 * The role's name and what it's for (editable in place on custom roles), who holds it, and
 * Duplicate role · Preview this role · ⋯ (boards SetPermissions, PermissionsMobile).
 */
export function RoleHeader({ role, draft, nameError, onDuplicate, onPreview, menu }: Props) {
  const dirty = draft?.dirty ?? false
  return (
    <header className="flex flex-col gap-3">
      <Link
        to="/settings/roles"
        className="-ml-1 inline-flex w-fit items-center gap-1 rounded-sm font-medium text-[13px] text-muted-foreground outline-none hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
      >
        <ChevronLeftIcon aria-hidden className="size-4" />
        Roles & permissions
      </Link>
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2.5">
            <h1
              tabIndex={-1}
              className="min-w-0 font-heading font-semibold text-[22px] leading-tight tracking-[-0.02em] sm:text-2xl"
            >
              {draft ? (
                <input
                  aria-label="Role name"
                  name="role-name"
                  value={draft.draft.name}
                  maxLength={ROLE_NAME_MAX}
                  autoComplete="off"
                  spellCheck={false}
                  aria-invalid={nameError ? true : undefined}
                  aria-describedby={nameError ? 'role-name-error' : undefined}
                  onChange={(event) => draft.setName(event.target.value)}
                  // Sized to the name (plus room to type), so the Custom tag sits beside it.
                  style={{
                    width: `calc(${Math.max(6, draft.draft.name.length + 1) * 0.52}em + 1rem)`,
                  }}
                  className={cn(
                    inPlace,
                    'h-10 max-w-full font-heading font-semibold tracking-[-0.02em]',
                  )}
                />
              ) : (
                role.name
              )}
            </h1>
            {role.isSystem ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-semibold text-[11px] text-foreground">
                <ShieldCheckIcon aria-hidden className="size-3" />
                Built-in
              </span>
            ) : (
              <span className="shrink-0 rounded-full border border-selected-border bg-selected px-2 py-0.5 font-semibold text-[11px] text-selected-foreground">
                Custom
              </span>
            )}
          </div>
          {nameError && (
            <p id="role-name-error" role="alert" className="text-[13px] text-destructive">
              {nameError}
            </p>
          )}
          {draft ? (
            <input
              aria-label="What this role is for"
              name="role-description"
              value={draft.draft.description}
              placeholder="What this role is for"
              maxLength={200}
              autoComplete="off"
              onChange={(event) => draft.setDescription(event.target.value)}
              className={cn(
                inPlace,
                'h-8 text-[13px] text-muted-foreground focus-visible:text-foreground',
              )}
            />
          ) : (
            <p className="text-[13px] text-muted-foreground">{role.description}</p>
          )}
          <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[13px]">
            <Link
              to="/settings/team"
              search={{ role: role.id }}
              className="rounded-sm font-semibold text-link underline-offset-4 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-ring max-md:py-2"
            >
              {peopleLine(role)}
            </Link>
            {role.requiresTwoStep && (
              <span className="text-muted-foreground">· Two-step required</span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {onDuplicate && (
            <SaveFirstButton onClick={onDuplicate} dirty={dirty} reason="duplicate">
              <CopyIcon aria-hidden />
              Duplicate role
            </SaveFirstButton>
          )}
          {onPreview && (
            <SaveFirstButton onClick={onPreview} dirty={dirty} reason="preview">
              <EyeIcon aria-hidden />
              Preview this role
            </SaveFirstButton>
          )}
          {menu}
        </div>
      </div>
    </header>
  )
}

const SAVE_FIRST = {
  preview: 'Save your changes to preview them.',
  duplicate: 'Save or discard your changes first.',
} as const

/**
 * Preview and Duplicate wait for unsaved ticks: aria-disabled keeps the button focusable so its
 * reason can be read.
 */
function SaveFirstButton({
  onClick,
  dirty,
  reason,
  children,
}: {
  onClick: () => void
  dirty: boolean
  reason: keyof typeof SAVE_FIRST
  children: ReactNode
}) {
  const id = `${reason}-reason`
  const button = (
    <Button
      variant="outline"
      onClick={() => !dirty && onClick()}
      aria-disabled={dirty || undefined}
      aria-describedby={dirty ? id : undefined}
      className="aria-disabled:cursor-not-allowed aria-disabled:opacity-60 max-md:h-11 max-md:flex-1"
    >
      {children}
    </Button>
  )
  if (!dirty) return button
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent id={id}>{SAVE_FIRST[reason]}</TooltipContent>
    </Tooltip>
  )
}
