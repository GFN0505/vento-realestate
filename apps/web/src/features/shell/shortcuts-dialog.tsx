import { Fragment } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { isApplePlatform } from '@/lib/platform'
import { shellUi, useOverlay } from './shell-ui'
import { CLOSE_SHORTCUT, SHORTCUTS } from './shortcuts'

function KeyList({ keys }: { keys: readonly string[] }) {
  return (
    <span className="flex items-center gap-1 text-muted-foreground text-xs">
      {keys.map((key) =>
        key === 'then' ? (
          <span key={key}>then</span>
        ) : (
          <Kbd key={key}>{key === 'mod' ? (isApplePlatform() ? '⌘' : 'Ctrl') : key}</Kbd>
        ),
      )}
    </span>
  )
}

/** `?`: the shortcuts, generated from the one registry (pattern: dialog with a two-column list). */
export function ShortcutsDialog() {
  const open = useOverlay('shortcuts')
  const rows = [...SHORTCUTS.filter((s) => !s.page), CLOSE_SHORTCUT]
  const pageRows = SHORTCUTS.filter((s) => s.page)
  return (
    <Dialog open={open} onOpenChange={(next) => !next && shellUi.close('shortcuts')}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Single keys work when you're not typing in a field.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <dl className="grid grid-cols-[1fr_auto] items-center gap-x-6 gap-y-3 text-[13px]">
            {rows.map((row) => (
              <Fragment key={row.label}>
                <dt
                  className={'desktopOnly' in row && row.desktopOnly ? 'max-lg:hidden' : undefined}
                >
                  {row.label}
                </dt>
                <dd
                  className={'desktopOnly' in row && row.desktopOnly ? 'max-lg:hidden' : undefined}
                >
                  <KeyList keys={row.keys} />
                </dd>
              </Fragment>
            ))}
            {pageRows.map((row, index) => (
              <Fragment key={row.id}>
                {index === 0 || pageRows[index - 1]?.page?.name !== row.page?.name ? (
                  <dt className="col-span-2 mt-2 border-t pt-3 font-semibold text-[11px] text-muted-foreground uppercase tracking-[0.04em]">
                    On {row.page?.name}
                  </dt>
                ) : null}
                <dt>{row.label}</dt>
                <dd>
                  <KeyList keys={row.keys} />
                </dd>
              </Fragment>
            ))}
          </dl>
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}
