import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { createRoleInput, ROLE_NAME_MAX, type Role } from '@vento/shared'
import { LoaderCircleIcon } from 'lucide-react'
import { useId, useRef, useState } from 'react'
import { toast } from 'sonner'
import { SaveErrorAlert } from '@/components/access-changed-alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { rolesQuery } from '@/features/preview/use-effective-permissions'
import { roleQuery } from '@/features/settings/role-queries'
import { errorReason, OFFLINE_SAVE_ERROR } from '@/lib/api-errors'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { hasFinePointer } from '@/lib/pointer'
import { markJustCreated } from './just-created'
import { StartFromSelect } from './start-from-select'

type Props = {
  open: boolean
  /** The role you came from; else Viewer. */
  from: string | undefined
  onClose: () => void
}

const copyOf = (role: Role | undefined) => (role ? `Copy of ${role.name}` : '')

/**
 * New role (pattern: dialog). A name, prefilled and selected so typing replaces it, and the role
 * to start from. Creates it with that role's ticks and two-step, then opens its page to edit.
 */
export function NewRoleDialog({ open, from, onClose }: Props) {
  const roles = useQuery(rolesQuery())
  const sources = roles.data?.items.filter((r) => r.can.duplicate) ?? []
  const preset =
    sources.find((r) => r.id === from) ?? sources.find((r) => r.key === 'viewer') ?? sources[0]
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New role</DialogTitle>
          <DialogDescription>
            It starts with the same access as the role you pick. Change the ticks next.
          </DialogDescription>
        </DialogHeader>
        {preset ? (
          <NewRoleForm
            key={`${open}:${preset.id}`}
            sources={sources}
            preset={preset}
            onClose={onClose}
          />
        ) : roles.isError ? (
          <DialogBody>
            <p role="alert" className="text-[13px] text-muted-foreground">
              Roles couldn't load. Check your connection and try again.
            </p>
            <Button
              variant="outline"
              onClick={() => void roles.refetch()}
              disabled={roles.isFetching}
              className="w-fit max-sm:h-11"
            >
              Try again
            </Button>
          </DialogBody>
        ) : roles.isSuccess ? (
          <DialogBody>
            <p className="text-[13px] text-muted-foreground">
              There's no role you can start from. A new role copies one within your own access.
            </p>
          </DialogBody>
        ) : (
          <DialogBody aria-hidden>
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </DialogBody>
        )}
      </DialogContent>
    </Dialog>
  )
}

function NewRoleForm({
  sources,
  preset,
  onClose,
}: {
  sources: readonly Role[]
  preset: Role
  onClose: () => void
}) {
  const ids = { name: useId(), from: useId() }
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [sourceId, setSourceId] = useState(preset.id)
  const [name, setName] = useState(copyOf(preset))
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)
  const source = sources.find((r) => r.id === sourceId)

  function pickSource(id: string) {
    // An untouched "Copy of …" follows the new choice; a typed name stays.
    if (name === copyOf(source)) setName(copyOf(sources.find((r) => r.id === id)))
    setSourceId(id)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    const parsed = createRoleInput.safeParse({ name, sourceRoleId: sourceId })
    if (!parsed.success) {
      setFieldError(parsed.error.issues[0]?.message ?? 'Enter a name for the role')
      nameRef.current?.focus()
      return
    }
    if (!connection.isOnline()) {
      setError(new Error(OFFLINE_SAVE_ERROR))
      return
    }
    setPending(true)
    try {
      const { role } = await client.roles.create(parsed.data)
      queryClient.setQueryData(roleQuery(role.id).queryKey, role)
      void queryClient.invalidateQueries({ queryKey: rolesQuery().queryKey })
      toast.success(`${role.name} created`)
      markJustCreated(role.id)
      void navigate({ to: '/settings/roles/$roleId', params: { roleId: role.id }, search: {} })
    } catch (caught) {
      if (errorReason(caught) === 'role_name_taken' && caught instanceof Error) {
        setFieldError(caught.message)
        nameRef.current?.select()
      } else {
        setError(caught)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form noValidate onSubmit={(event) => void submit(event)}>
      <DialogBody className="gap-4">
        <Field data-invalid={!!fieldError}>
          <FieldLabel htmlFor={ids.name}>Name</FieldLabel>
          <Input
            ref={nameRef}
            id={ids.name}
            name="role-name"
            value={name}
            maxLength={ROLE_NAME_MAX + 10}
            autoComplete="off"
            autoCapitalize="sentences"
            enterKeyHint="done"
            // Desktop: the cursor waits in the name with it selected; phones keep the keyboard down.
            autoFocus={hasFinePointer()}
            onFocus={(event) => hasFinePointer() && event.currentTarget.select()}
            onChange={(event) => {
              setName(event.target.value)
              setFieldError(null)
            }}
            onBlur={() => setName((v) => v.trim())}
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? `${ids.name}-error` : undefined}
          />
          <FieldError id={`${ids.name}-error`}>{fieldError}</FieldError>
        </Field>
        <Field>
          <FieldLabel htmlFor={ids.from}>Start from</FieldLabel>
          <StartFromSelect id={ids.from} roles={sources} value={sourceId} onChange={pickSource} />
        </Field>
        <SaveErrorAlert error={error} />
      </DialogBody>
      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose} className="max-sm:h-11">
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={pending}
          aria-busy={pending || undefined}
          className="max-sm:h-11"
        >
          {pending && <LoaderCircleIcon aria-hidden className="animate-spin" />}
          Create role
        </Button>
      </DialogFooter>
    </form>
  )
}
