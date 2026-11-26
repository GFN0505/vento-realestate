import { useQueryClient } from '@tanstack/react-query'
import { accountName, type Me, type SecurityOverview } from '@vento/shared'
import { LoaderCircleIcon, PencilIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { meQuery } from '@/features/account/api'
import { securityQuery } from '@/features/settings/security-queries'
import { apiErrorMessage, isHandledElsewhere, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { cn } from '@/lib/utils'

/**
 * Your name, edited in place (spec "You"): click it, type, Enter or leaving the field saves, Esc
 * cancels. A refused or failed save keeps what was typed, with the reason under it.
 */
export function NameField({ name }: { name: string }) {
  const id = useId()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  const [draft, setDraft] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)
  const editing = draft !== null

  function start() {
    setDraft(name)
    setError(null)
    // After the input renders.
    requestAnimationFrame(() => input.current?.select())
  }

  function stop() {
    setDraft(null)
    setError(null)
    requestAnimationFrame(() => trigger.current?.focus())
  }

  function show(saved: string) {
    queryClient.setQueryData<Me>(meQuery().queryKey, (me) =>
      me ? { ...me, user: { ...me.user, name: saved } } : me,
    )
    queryClient.setQueryData<SecurityOverview>(securityQuery().queryKey, (data) =>
      data ? { ...data, name: saved } : data,
    )
  }

  async function save() {
    if (draft === null || pending) return
    const parsed = accountName.safeParse(draft)
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Enter your name')
      return
    }
    if (parsed.data === name) return stop()
    if (!connection.isOnline()) return setError(OFFLINE_SAVE_ERROR)
    setPending(true)
    try {
      const result = await client.account.updateName({ name: parsed.data })
      show(result.name)
      // Team, the shell and every other cached view pick up the new name.
      void queryClient.invalidateQueries({ queryKey: meQuery().queryKey })
      toast.success(result.notice)
      stop()
    } catch (caught) {
      if (!isHandledElsewhere(caught)) setError(apiErrorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  if (!editing) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={trigger}
            type="button"
            onClick={start}
            aria-label={`${name}. Edit your name`}
            className="group -mx-2 inline-flex min-h-10 max-w-full items-center gap-2 rounded-md px-2 text-left outline-hidden transition-colors hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring max-md:min-h-11"
          >
            <span className="truncate font-heading font-semibold text-lg tracking-[-0.01em]">
              {name}
            </span>
            <PencilIcon
              aria-hidden
              className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
            />
          </button>
        </TooltipTrigger>
        <TooltipContent>Edit your name</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <div className="flex max-w-sm flex-col gap-1">
      <div className="relative">
        <label htmlFor={id} className="sr-only">
          Your name
        </label>
        <input
          ref={input}
          id={id}
          name="name"
          value={draft}
          autoComplete="name"
          autoCapitalize="words"
          enterKeyHint="done"
          spellCheck={false}
          maxLength={100}
          readOnly={pending}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setDraft(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              stop()
            }
          }}
          // Leaving the field saves, unless it was refused: then the reason stays in view.
          onBlur={() => !error && void save()}
          className={cn(
            '-mx-2 h-10 w-full rounded-md border border-ring bg-card px-2 pr-9 font-heading font-semibold text-lg tracking-[-0.01em] outline-none ring-[3px] ring-ring/30 max-md:h-11',
            'aria-invalid:border-destructive aria-invalid:ring-destructive/25',
          )}
        />
        {pending && (
          <LoaderCircleIcon
            aria-hidden
            className="absolute top-1/2 right-1 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
      </div>
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-[13px] text-destructive">
          {error}
        </p>
      ) : (
        <p className="text-muted-foreground text-xs max-md:hidden">Enter to save · Esc to cancel</p>
      )}
    </div>
  )
}
