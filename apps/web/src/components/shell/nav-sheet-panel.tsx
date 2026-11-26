import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import { SidebarHeader } from './sidebar'
import { SidebarFooterNav, SidebarNav } from './sidebar-nav'

/** The navy sidebar as a left sheet on tablets. Focus is trapped; Esc closes. */
export function NavSheetPanel({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-[min(85vw,272px)] border-sidebar-edge border-r bg-sidebar px-3 py-4 text-sidebar-foreground"
      >
        <SheetTitle className="sr-only">Navigation</SheetTitle>
        <SheetDescription className="sr-only">Your modules</SheetDescription>
        <SidebarHeader />
        <div className="-mx-3 min-h-0 flex-1 overflow-y-auto px-3 pt-4 pb-3">
          <SidebarNav onNavigate={() => onOpenChange(false)} />
        </div>
        <div className="border-sidebar-border/50 border-t pt-2">
          <SidebarFooterNav onNavigate={() => onOpenChange(false)} />
        </div>
      </SheetContent>
    </Sheet>
  )
}
