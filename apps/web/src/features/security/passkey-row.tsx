import { useQueryClient } from '@tanstack/react-query'
import { type PasskeyItem, passkeyName, type SecurityOverview } from '@vento/shared'
import {
  EllipsisIcon,
  FingerprintIcon,
  LoaderCircleIcon,
  PencilIcon,
  Trash2Icon,
} from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { securityQuery } from '@/features/settings/security-queries'
import { apiErrorMessage, isHandledElsewhere, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { isNotFound } from '@/lib/error-data'
import { client } from '@/lib/orpc'
import { securityUi, useSecurityUi } from './security-dialogs'
import { SecurityRow } from './security-section'
import { passkeyUseWords } from './security-words'

const menuTrigger =
  'inline-flex size-9 items-center justify-center rounded-md text-muted-foreground outline-hidden transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring data-[state=open]:bg-muted data-[state=open]:text-foreground max-sm:size-11'

/** One passkey: its name (renamed in place), when it was added and last used, and ⋯. */
export function PasskeyRow({ passkey }: { passkey: PasskeyItem }) {
  const renaming = useSecurityUi((s) => s.renaming === passkey.id)
  return (
    <SecurityRow
      icon={FingerprintIcon}
      tone="brand"
      inlineAction
      label={renaming ? <RenameField passkey={passkey} /> : passkey.name}
      action={
        !renaming && (
          <DropdownMenu>
            <DropdownMenuTrigger aria-label={`Actions for ${passkey.name}`} className={menuTrigger}>
              <EllipsisIcon aria-hidden className="size-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-44">
              <DropdownMenuItem onSelect={() => securityUi.rename(passkey.id)}>
                <PencilIcon aria-hidden />
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                variant="destructive"
                onSelect={() => securityUi.open({ name: 'remove-passkey', passkey })}
              >
                <Trash2Icon aria-hidden />
                Remove
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )
      }
    >
      {passkeyUseWords(passkey.createdAt, passkey.lastUsedAt)}
    </SecurityRow>
  )
}

/** Rename in place (spec): 1–40 characters, Enter or leaving the field saves, Esc cancels. */
function RenameField({ passkey }: { passkey: PasskeyItem }) {
  const id = useId()
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [value, setValue] = useState(passkey.name)
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    input.current?.select()
  }, [])

  async function save() {
    if (pending) return
    const parsed = passkeyName.safeParse(value)
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Enter a name')
    if (parsed.data === passkey.name) return securityUi.rename(null)
    if (!connection.isOnline()) return setError(OFFLINE_SAVE_ERROR)
    setPending(true)
    try {
      const { notice } = await client.account.passkeys.rename({ id: passkey.id, name: parsed.data })
      queryClient.setQueryData<SecurityOverview>(securityQuery().queryKey, (data) =>
        data
          ? {
              ...data,
              passkeys: {
                ...data.passkeys,
                items: data.passkeys.items.map((p) =>
                  p.id === passkey.id ? { ...p, name: parsed.data } : p,
                ),
              },
            }
          : data,
      )
      toast.success(notice)
      securityUi.rename(null)
    } catch (caught) {
      if (isHandledElsewhere(caught)) return
      if (isNotFound(caught)) {
        toast.error(apiErrorMessage(caught))
        securityUi.rename(null)
        void queryClient.invalidateQueries({ queryKey: securityQuery().queryKey })
        return
      }
      setError(apiErrorMessage(caught))
    } finally {
      setPending(false)
    }
  }

  return (
    <span className="flex w-full max-w-xs flex-col gap-1">
      <span className="relative">
        <label htmlFor={id} className="sr-only">
          Passkey name
        </label>
        <input
          ref={input}
          id={id}
          name="passkey-name"
          value={value}
          placeholder="Name this passkey"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="done"
          maxLength={60}
          readOnly={pending}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(event) => {
            setValue(event.target.value)
            if (error) setError(null)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              void save()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              securityUi.rename(null)
            }
          }}
          onBlur={() => !error && void save()}
          className="h-9 w-full rounded-md border border-ring bg-card px-2.5 pr-8 font-semibold text-sm outline-none ring-[3px] ring-ring/30 aria-invalid:border-destructive aria-invalid:ring-destructive/25 max-md:h-11 max-md:text-base"
        />
        {pending && (
          <LoaderCircleIcon
            aria-hidden
            className="absolute top-1/2 right-2 size-4 -translate-y-1/2 animate-spin text-muted-foreground"
          />
        )}
      </span>
      {error && (
        <span id={`${id}-error`} role="alert" className="font-normal text-[13px] text-destructive">
          {error}
        </span>
      )}
    </span>
  )
}
