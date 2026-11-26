import { type ClipboardEvent, type KeyboardEvent, type Ref, useId } from 'react'
import { FieldLabel } from '@/components/ui/field'
import { splitTyped } from './parse-emails'
import { inviteDraft, useInviteDraft } from './use-invite-draft'

type Props = {
  inputRef: Ref<HTMLTextAreaElement>
  error: string | null
  /** Enter on an empty box with rows sends. */
  onSubmit: () => void
}

/**
 * The Emails box. A textarea rather than an input so a pasted column keeps its line breaks
 * (inputs drop them). Each address becomes a row once a comma, space or new line follows it, or
 * on paste; Enter adds what's typed; Enter on an empty box sends; Backspace on an empty box
 * removes the last row.
 */
export function EmailBox({ inputRef, error, onSubmit }: Props) {
  const draft = useInviteDraft()
  const id = useId()
  const describedBy = [`${id}-notice`, error ? `${id}-error` : null].filter(Boolean).join(' ')

  function onChange(value: string) {
    const { complete, partial } = splitTyped(value)
    if (complete.trim()) inviteDraft.add(complete, partial)
    else inviteDraft.setText(value)
  }

  function onPaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const pasted = event.clipboardData.getData('text')
    if (!pasted.trim()) return
    event.preventDefault()
    inviteDraft.add(`${draft.text} ${pasted}`)
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (draft.text.trim()) inviteDraft.add(draft.text)
      else if (draft.rows.length > 0) onSubmit()
    }
    if (event.key === 'Backspace' && draft.text === '' && draft.rows.length > 0) {
      event.preventDefault()
      inviteDraft.removeLast()
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel htmlFor={id}>Emails</FieldLabel>
      <textarea
        ref={inputRef}
        id={id}
        name="emails"
        rows={1}
        value={draft.text}
        placeholder="Paste or type emails"
        inputMode="email"
        autoComplete="off"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="done"
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        onChange={(event) => onChange(event.target.value)}
        onPaste={onPaste}
        onKeyDown={onKeyDown}
        // Anything left typed becomes a row when the person moves on.
        onBlur={() => {
          if (draft.text.includes('@')) inviteDraft.add(draft.text)
        }}
        className="field-sizing-content max-h-32 min-h-12 w-full resize-none rounded-md border border-input bg-card px-3 py-2.5 text-base text-foreground leading-6 outline-none transition-[border-color,box-shadow] duration-150 ease-out placeholder:text-muted-foreground hover:border-input-hover focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 aria-invalid:border-destructive md:min-h-10 md:py-2 md:text-sm"
      />
      {/* Reserved line: notices appear without moving anything above them. */}
      <p
        id={`${id}-notice`}
        aria-live="polite"
        className="min-h-[18px] text-muted-foreground text-xs leading-[18px]"
      >
        {error ? (
          <span id={`${id}-error`} className="text-destructive">
            {error}
          </span>
        ) : (
          (draft.notice ?? 'Separate with commas, spaces or new lines. Up to 20 at a time.')
        )}
      </p>
    </div>
  )
}
