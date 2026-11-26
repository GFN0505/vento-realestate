import { SearchIcon } from 'lucide-react'
import { Kbd } from '@/components/ui/kbd'
import { loadPalette, shellUi } from '@/features/shell/shell-ui'
import { modKeyLabel } from '@/lib/platform'
import { cn } from '@/lib/utils'

const LABEL = 'Search or run a command'

/** Board ExecutiveHome search bar; on phones an icon button that opens ⌘K full screen. */
export function SearchButton({ variant }: { variant: 'bar' | 'icon' }) {
  const shared = {
    type: 'button' as const,
    onClick: () => shellUi.open('palette'),
    // Fetch the palette's code as soon as someone heads for it.
    onPointerEnter: () => void loadPalette(),
    onFocus: () => void loadPalette(),
    'aria-haspopup': 'dialog' as const,
  }
  if (variant === 'icon') {
    return (
      <button
        {...shared}
        aria-label={LABEL}
        className="inline-flex size-11 shrink-0 items-center justify-center rounded-[10px] bg-muted text-foreground outline-none transition-colors active:bg-border focus-visible:outline-2 focus-visible:outline-ring"
      >
        <SearchIcon aria-hidden className="size-5" strokeWidth={1.8} />
      </button>
    )
  }
  return (
    <button
      {...shared}
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        'flex h-9 min-w-0 flex-[1_1_220px] items-center gap-2.5 rounded-lg border bg-background px-3.5 text-left text-[13px] text-muted-foreground outline-none transition-colors hover:border-input-hover focus-visible:outline-2 focus-visible:outline-ring lg:max-w-[400px]',
      )}
    >
      <SearchIcon aria-hidden className="size-3.5 shrink-0" strokeWidth={1.8} />
      <span className="flex-1 truncate">{LABEL}…</span>
      <Kbd className="bg-transparent">{modKeyLabel('K')}</Kbd>
    </button>
  )
}
