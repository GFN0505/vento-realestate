import { Link } from '@tanstack/react-router'
import { CheckIcon, ChevronRightIcon, EyeIcon, KeyboardIcon, LogOutIcon } from 'lucide-react'
import { type ReactNode, useState } from 'react'
import { Avatar } from '@/components/avatar'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHandle,
  SheetTitle,
} from '@/components/ui/sheet'
import { useSwitchOrganization } from '@/features/organization/switch-organization'
import { canPreview, useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { moreItems, type NavTag, navTag } from '@/features/shell/nav'
import { shellUi } from '@/features/shell/shell-ui'
import { useShellActions } from '@/features/shell/use-shell-actions'
import { cn } from '@/lib/utils'
import { PreviewRolesSheet } from './preview-roles-sheet'
import { ThemeSegments } from './theme-segments'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

export const sheetRow =
  'flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] outline-none transition-colors active:bg-muted focus-visible:outline-2 focus-visible:outline-ring [&_svg]:size-5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground'

/** Phones: the rest of the role's modules and the account menu (spec "More"). */
export function MoreSheet({ open, onOpenChange }: Props) {
  const me = useMe()
  const access = useEffectiveAccess()
  const actions = useShellActions()
  const switchOrganization = useSwitchOrganization()
  const [view, setView] = useState<'main' | 'preview'>('main')
  const close = () => onOpenChange(false)
  const modules = moreItems(access, access.roleKey)

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setView('main')
      }}
    >
      <SheetContent
        side="bottom"
        className="gap-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHandle />
        <SheetTitle className="sr-only">More</SheetTitle>
        <SheetDescription className="sr-only">
          Modules, organization, theme and your account
        </SheetDescription>
        {view === 'preview' ? (
          <PreviewRolesSheet onBack={() => setView('main')} onDone={close} />
        ) : (
          <>
            <div className="flex items-center gap-3 px-3 pt-2 pb-3 pr-14">
              <Avatar name={me.user.name} className="size-10 text-sm" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-[15px]">{me.user.name}</p>
                <p className="truncate text-muted-foreground text-xs">
                  {me.member ? `${me.member.role.name} · ` : ''}
                  {me.user.email}
                </p>
              </div>
            </div>
            {modules.length > 0 && (
              <Section title="Modules">
                {modules.map((item) => (
                  <Link key={item.key} to={item.to} onClick={close} className={sheetRow}>
                    <item.icon aria-hidden strokeWidth={1.8} />
                    <span className="flex-1 truncate">{item.label}</span>
                    <NavTagBadge tag={navTag(access, item)} />
                  </Link>
                ))}
              </Section>
            )}
            {me.organizations.length > 1 && (
              <Section title="Organizations">
                {me.organizations.map((org) => (
                  <button
                    key={org.id}
                    type="button"
                    disabled={switchOrganization.isPending}
                    onClick={() =>
                      org.id !== me.organization?.id &&
                      switchOrganization.mutate({ organizationId: org.id })
                    }
                    aria-current={org.id === me.organization?.id ? 'true' : undefined}
                    className={sheetRow}
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">{org.name}</span>
                      <span className="text-muted-foreground text-xs">{org.roleName}</span>
                    </span>
                    {org.id === me.organization?.id && (
                      <CheckIcon aria-label="Current" className="text-brand!" />
                    )}
                  </button>
                ))}
              </Section>
            )}
            <Section title="Theme">
              <ThemeSegments />
            </Section>
            <div className="mt-2 flex flex-col border-t pt-2">
              {canPreview(me) && (
                <button type="button" className={sheetRow} onClick={() => setView('preview')}>
                  <EyeIcon aria-hidden />
                  <span className="flex-1">Preview as role</span>
                  <ChevronRightIcon aria-hidden />
                </button>
              )}
              <button
                type="button"
                className={cn(sheetRow, 'pointer-coarse:max-md:hidden')}
                onClick={() => {
                  close()
                  shellUi.open('shortcuts')
                }}
              >
                <KeyboardIcon aria-hidden />
                Keyboard shortcuts
              </button>
              <button
                type="button"
                className={sheetRow}
                onClick={() => {
                  close()
                  void actions.signOut()
                }}
              >
                <LogOutIcon aria-hidden />
                Sign out
              </button>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function NavTagBadge({ tag }: { tag: NavTag | null }) {
  if (tag === 'soon') return <Badge variant="outline">Soon</Badge>
  if (tag === 'early_access') return <Badge variant="brand">Early access</Badge>
  return null
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-0.5 border-t pt-2 pb-1">
      <h2 className="px-3 pt-1 pb-1 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
        {title}
      </h2>
      {children}
    </section>
  )
}
