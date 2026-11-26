import { SearchIcon } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'

const DEBOUNCE_MS = 300

type Props = {
  id: string
  /** What the address holds now. */
  value: string | undefined
  /** Called 300 ms after typing stops, with the trimmed text (undefined when empty). */
  onSearch: (q: string | undefined) => void
  label: string
  placeholder: string
  shortcut?: string
  className?: string
}

/**
 * A list's search box, synced to the address. A slow answer to an earlier search never overwrites
 * what's being typed now, and Clear filters or back and forward update the box.
 */
export function SearchField({
  id,
  value,
  onSearch,
  label,
  placeholder,
  shortcut,
  className,
}: Props) {
  const [text, setText] = useState(value ?? '')
  const onSearchRef = useRef(onSearch)
  onSearchRef.current = onSearch
  // What this box last put in the address; its echo is ignored.
  const sent = useRef(value)

  useEffect(() => {
    if (value === sent.current) return
    sent.current = value
    setText(value ?? '')
  }, [value])

  useEffect(() => {
    const q = text.trim() || undefined
    if (q === sent.current) return
    const timer = window.setTimeout(() => {
      sent.current = q
      onSearchRef.current(q)
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [text])

  return (
    <div className={cn('relative', className)}>
      <SearchIcon
        aria-hidden
        className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-muted-foreground"
      />
      <Input
        id={id}
        type="search"
        name="q"
        value={text}
        onChange={(event) => setText(event.target.value)}
        placeholder={placeholder}
        aria-label={label}
        aria-keyshortcuts={shortcut}
        autoComplete="off"
        spellCheck={false}
        enterKeyHint="search"
        className="pl-9"
      />
    </div>
  )
}
