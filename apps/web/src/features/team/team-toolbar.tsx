import { useQuery } from '@tanstack/react-query'
import { SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { useMediaQuery } from '@/lib/use-media-query'
import { cn } from '@/lib/utils'
import type { TeamSearch, TeamShow } from './team-search'

type Props = {
  search: TeamSearch
  update: (patch: Partial<TeamSearch>, options?: { replace?: boolean }) => void
}

const SEARCH_DEBOUNCE_MS = 300
export const TEAM_SEARCH_ID = 'team-search'

// Counts live in the line under the title, so the chips stay single words.
const CHIPS: { show: TeamShow; label: string }[] = [
  { show: 'everyone', label: 'Everyone' },
  { show: 'invited', label: 'Invited' },
  { show: 'removed', label: 'Removed' },
]

/** Search, Role and the Everyone · Invited · Removed chips, all held in the address. */
export function TeamToolbar({ search, update }: Props) {
  const roles = useQuery(rolesQuery())
  const narrow = useMediaQuery('(max-width: 639px)')
  const [text, setText] = useState(search.q ?? '')
  const show = search.show ?? 'everyone'
  const updateRef = useRef(update)
  updateRef.current = update

  // What this box last put in the address. Its echo is ignored, so a slow answer to an earlier
  // search never overwrites what's being typed now.
  const sent = useRef(search.q)

  // Follow the address when it changes elsewhere (Clear filters, back and forward).
  useEffect(() => {
    if (search.q === sent.current) return
    sent.current = search.q
    setText(search.q ?? '')
  }, [search.q])

  useEffect(() => {
    const q = text.trim() || undefined
    if (q === sent.current) return
    const timer = window.setTimeout(() => {
      sent.current = q
      updateRef.current({ q }, { replace: true })
    }, SEARCH_DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  return (
    // Phones: search and role on one row, the chips full width below. Wider: one row.
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 md:flex md:items-center md:gap-2">
      <div className="relative md:w-72">
        <SearchIcon
          aria-hidden
          className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
        />
        <Input
          id={TEAM_SEARCH_ID}
          type="search"
          name="q"
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={narrow ? 'Search people' : 'Search by name or email'}
          aria-label="Search by name or email"
          aria-keyshortcuts="/"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="search"
          className="pl-9"
        />
      </div>
      <Select
        value={search.role ?? 'all'}
        onValueChange={(role) => update({ role: role === 'all' ? undefined : role })}
      >
        <SelectTrigger
          aria-label="Filter by role"
          className="h-11 w-auto max-w-44 shrink-0 gap-1.5 md:h-10 md:max-w-56"
        >
          <span className="text-muted-foreground max-md:hidden">Role:</span>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All roles</SelectItem>
          {roles.data?.items.map((role) => (
            <SelectItem key={role.id} value={role.id}>
              {role.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <fieldset
        aria-label="Show"
        className="col-span-2 grid grid-cols-3 items-center gap-1.5 md:ml-auto md:flex"
      >
        {CHIPS.map((chip) => {
          const on = chip.show === show
          return (
            <button
              key={chip.show}
              type="button"
              aria-pressed={on}
              onClick={() => update({ show: chip.show === 'everyone' ? undefined : chip.show })}
              className={cn(
                'inline-flex h-11 min-w-0 items-center justify-center gap-1.5 rounded-full border px-2 font-semibold text-[13px] outline-hidden transition-colors focus-visible:outline-2 focus-visible:outline-ring md:h-8 md:px-3.5',
                on
                  ? 'border-selected-border bg-selected text-selected-foreground'
                  : 'border-border bg-card text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {chip.label}
            </button>
          )
        })}
      </fieldset>
    </div>
  )
}
