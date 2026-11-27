import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { CheckIcon, ChevronDownIcon } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useEffect, useRef, useState } from 'react'
import {
  Command,
  CommandEmpty,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { orpc } from '@/lib/orpc'
import { cn } from '@/lib/utils'

type Props = {
  value: string | undefined
  onChange: (userId: string | undefined) => void
  /** The log's dates: only people who did something in them are offered. */
  range: { from: string; to: string }
  /** The range can't be searched; the list waits. */
  disabled: boolean
  className?: string
}

/** "Grace Umeh (removed)": a removed member keeps their history under their name. */
export function personLabel(person: { name: string; removed: boolean }): string {
  return person.removed ? `${person.name} (removed)` : person.name
}

/**
 * Person (board AuditLog): a searchable list of who acted in these dates, removed members
 * included, from `audit.people`. The search runs on the server, 300 ms after typing stops.
 */
export function PersonFilter({ value, onChange, range, disabled, className }: Props) {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  // The chosen person's name, so the button keeps it when they're outside the current results.
  const [chosen, setChosen] = useState<string | null>(null)
  useEffect(() => {
    const timer = window.setTimeout(() => setQ(text.trim()), 300)
    return () => window.clearTimeout(timer)
  }, [text])
  const people = useQuery(
    orpc.audit.people.queryOptions({
      input: { ...range, q: q || undefined, page: 1, pageSize: 100 },
      staleTime: 60_000,
      placeholderData: keepPreviousData,
      enabled: !disabled && (open || value !== undefined),
    }),
  )
  const items = people.data?.items ?? []
  const current = items.find((p) => p.userId === value)
  const label = value ? (current ? personLabel(current) : (chosen ?? 'Chosen person')) : 'Anyone'
  const pick = (userId: string | undefined, name: string | null) => {
    setChosen(name)
    onChange(userId)
    setOpen(false)
    setText('')
  }
  const trigger = useRef<HTMLButtonElement>(null)

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger
        ref={trigger}
        aria-label={`Person: ${label}`}
        disabled={disabled}
        className={cn(
          'flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-card pr-3 pl-3 text-left text-base outline-none transition-[border-color,box-shadow] hover:border-input-hover focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-60 md:h-10 md:w-auto md:min-w-40 md:text-[13px]',
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDownIcon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={6}
          className="z-50 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border bg-popover shadow-lg"
        >
          <Command shouldFilter={false} label="People">
            <CommandInput
              value={text}
              onValueChange={setText}
              placeholder="Search people"
              aria-label="Search people"
            />
            <CommandList className="max-h-72">
              <CommandEmpty>
                {people.isError
                  ? "People couldn't load. Check your connection."
                  : people.isPending
                    ? 'Loading people…'
                    : 'Nobody matches.'}
              </CommandEmpty>
              {!q && (
                <CommandItem value="anyone" onSelect={() => pick(undefined, null)}>
                  Anyone
                  {!value && <CheckIcon aria-label="Chosen" className="ml-auto" />}
                </CommandItem>
              )}
              {items.map((person) => (
                <CommandItem
                  key={person.userId}
                  value={person.userId}
                  onSelect={() => pick(person.userId, personLabel(person))}
                >
                  <span className={cn('truncate', person.removed && 'text-muted-foreground')}>
                    {personLabel(person)}
                  </span>
                  {value === person.userId && <CheckIcon aria-label="Chosen" className="ml-auto" />}
                </CommandItem>
              ))}
            </CommandList>
          </Command>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  )
}
