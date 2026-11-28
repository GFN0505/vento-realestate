import { useNavigate } from '@tanstack/react-router'
import { useCommandState } from 'cmdk'
import { XIcon } from 'lucide-react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { type ReactNode, useState } from 'react'
import { Command, CommandEmpty, CommandInput, CommandList } from '@/components/ui/command'
import { Kbd } from '@/components/ui/kbd'
import { commandScore } from './command-filter'
import { CommandResults } from './command-results'
import { shellUi, useOverlay } from './shell-ui'

/**
 * ⌘K (board ExecutiveHome palette): Go to, Actions and Recently opened. Full screen with 44px
 * rows on phones. Lazy: its chunk downloads on idle after Home, or when the search bar is
 * hovered. Esc closes and Radix returns focus to where it was.
 */
export function CommandPalette() {
  const open = useOverlay('palette')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState<'root' | 'preview'>('root')
  const navigate = useNavigate()

  function onOpenChange(next: boolean) {
    if (next) return
    shellUi.close('palette')
    setSearch('')
    setPage('root')
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="data-[state=open]:fade-in-0 data-[state=closed]:fade-out-0 fixed inset-0 z-50 bg-overlay data-[state=closed]:animate-out data-[state=open]:animate-in max-sm:hidden motion-reduce:animate-none" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          // Opaque popover surface: nothing on the page shows through.
          className="data-[state=open]:fade-in-0 data-[state=open]:zoom-in-[0.98] data-[state=closed]:fade-out-0 fixed inset-0 z-50 flex flex-col overflow-hidden bg-popover text-popover-foreground outline-none duration-150 data-[state=closed]:animate-out data-[state=open]:animate-in sm:inset-x-0 sm:top-[110px] sm:bottom-auto sm:mx-auto sm:max-h-[min(520px,calc(100dvh-140px))] sm:w-[min(580px,calc(100vw-2rem))] sm:rounded-xl sm:border sm:shadow-[0_24px_64px_rgb(10_12_30/0.35)] motion-reduce:animate-none"
        >
          <DialogPrimitive.Title className="sr-only">Search or run a command</DialogPrimitive.Title>
          <Command
            label="Search or run a command"
            loop
            filter={(_value, text, keywords) =>
              commandScore(keywords?.[0] ?? '', text, keywords?.slice(1))
            }
            onKeyDown={(event) => {
              if (event.key === 'Backspace' && search === '' && page !== 'root') {
                event.preventDefault()
                setPage('root')
              }
            }}
          >
            <CommandInput
              value={search}
              onValueChange={setSearch}
              placeholder={
                page === 'preview' ? 'Choose a role to preview' : 'Type a page or action'
              }
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
            >
              <DialogPrimitive.Close
                aria-label="Close"
                className="-mr-2 inline-flex size-11 shrink-0 items-center justify-center rounded-lg text-muted-foreground outline-hidden focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-ring sm:hidden"
              >
                <XIcon aria-hidden className="size-5" />
              </DialogPrimitive.Close>
              <Kbd className="max-sm:hidden">Esc</Kbd>
            </CommandInput>
            <CommandEmpty>No pages or actions match "{search.trim()}".</CommandEmpty>
            <ResultsList>
              <CommandResults
                page={page}
                search={search}
                onPreviewPage={() => {
                  setSearch('')
                  setPage('preview')
                }}
                close={() => onOpenChange(false)}
                navigate={(to) => {
                  onOpenChange(false)
                  void navigate({ to })
                }}
              />
            </ResultsList>
            <div className="flex gap-4 border-t px-[18px] py-2.5 text-[11px] text-muted-foreground max-sm:hidden">
              <span>↑↓ to move</span>
              <span>↵ to open</span>
              <span>{page === 'root' ? 'Esc to close' : '⌫ to go back'}</span>
            </div>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

/**
 * With nothing matching, the list (a listbox) is hidden and only the "No pages or actions
 * match" line shows: an empty listbox is an error to screen readers (axe
 * `aria-required-children`). Its rows stay mounted so the filter can bring them back.
 */
function ResultsList({ children }: { children: ReactNode }) {
  const empty = useCommandState((state) => state.filtered.count === 0)
  return (
    <CommandList hidden={empty} className="max-sm:pb-[env(safe-area-inset-bottom)]">
      {children}
    </CommandList>
  )
}
