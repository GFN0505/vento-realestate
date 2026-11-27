import { Link } from '@tanstack/react-router'
import { ChevronRightIcon, LogOutIcon, UserRoundIcon } from 'lucide-react'
import { sheetRow } from '@/components/shell/more-sheet'
import { ThemeSegments } from '@/components/shell/theme-segments'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHandle,
  SheetTitle,
} from '@/components/ui/sheet'
import { useMe } from '@/features/preview/use-effective-permissions'
import { CONSOLE_MORE } from './console-nav'
import { useLeaveConsole } from './use-leave-console'

type Props = { open: boolean; onOpenChange: (open: boolean) => void }

/** Phones: Plans, Activity, Super-admins, My account, theme and Sign out. */
export function ConsoleMoreSheet({ open, onOpenChange }: Props) {
  const me = useMe()
  const leave = useLeaveConsole()
  const close = () => onOpenChange(false)
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="gap-1 overflow-y-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]"
      >
        <SheetHandle />
        <SheetTitle className="sr-only">More</SheetTitle>
        <SheetDescription className="sr-only">
          Other console pages and your account
        </SheetDescription>
        <div className="px-3 pt-2 pb-3 pr-14">
          <p className="truncate font-semibold text-[15px]">{me.user.name}</p>
          <p className="truncate text-muted-foreground text-xs">{me.user.email}</p>
        </div>
        <div className="flex flex-col border-t pt-2 pb-1">
          {CONSOLE_MORE.map((item) => (
            <Link key={item.key} to={item.to} onClick={close} className={sheetRow}>
              <item.icon aria-hidden strokeWidth={1.8} />
              <span className="flex-1">{item.label}</span>
              <ChevronRightIcon aria-hidden />
            </Link>
          ))}
          <Link to="/console/account" onClick={close} className={sheetRow}>
            <UserRoundIcon aria-hidden strokeWidth={1.8} />
            <span className="flex-1">My account</span>
            <ChevronRightIcon aria-hidden />
          </Link>
        </div>
        <section aria-label="Theme" className="border-t pt-3 pb-1">
          <ThemeSegments />
        </section>
        <div className="mt-1 flex flex-col border-t pt-2">
          <button
            type="button"
            className={sheetRow}
            onClick={() => {
              close()
              void leave.signOut()
            }}
          >
            <LogOutIcon aria-hidden />
            Sign out
          </button>
        </div>
      </SheetContent>
    </Sheet>
  )
}
