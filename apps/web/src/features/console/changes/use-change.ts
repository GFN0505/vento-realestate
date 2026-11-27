import { useQueryClient } from '@tanstack/react-query'
import type { Done, PreviewLine } from '@vento/shared/console'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { consoleKey } from '../api'
import { type ChangeFailure, changeFailure } from './change-errors'

export type ApplyExtras<E> = { expected: E; reason: string; idempotencyKey: string }

export type ChangeProcedures<P, E> = {
  preview: (input: P) => Promise<{ lines: PreviewLine[]; expected: E }>
  apply: (input: P & ApplyExtras<E>) => Promise<Done>
}

type Review<P, E> = { input: P; lines: PreviewLine[]; expected: E }

/** Spec: a reason is required, trimmed, 3 to 500 characters. Mirrors the shared `reason`. */
export function reasonProblem(reason: string): string | null {
  const trimmed = reason.trim()
  if (trimmed.length < 3) return 'Add a reason so the activity says why.'
  if (trimmed.length > 500) return 'Keep the reason to 500 characters or fewer.'
  return null
}

/**
 * One console change (plan §9.4): fields → preview (the command's own lines) → reason → apply.
 * The idempotency key is made when the confirm step opens and kept across retries until success
 * or close, so a dropped connection or a mid-task "Confirm it's you" never applies it twice.
 * A failure keeps the step, the fields and the reason.
 */
export function useChange<
  C extends {
    preview: (input: never) => Promise<{ lines: PreviewLine[]; expected: unknown }>
    apply: (input: never) => Promise<Done>
  },
>(client: C, onDone: () => void) {
  type P = Parameters<C['preview']>[0]
  type E = Awaited<ReturnType<C['preview']>>['expected']
  // The contract types apply's input as the preview fields plus these three; for a union of
  // fields (overrides) TypeScript can't see that, so it's stated once here.
  const procedures = client as unknown as ChangeProcedures<P, E>
  const queryClient = useQueryClient()
  const [review, setReview] = useState<Review<P, E> | null>(null)
  const [reason, setReason] = useState('')
  const [showReasonError, setShowReasonError] = useState(false)
  const [pending, setPending] = useState<'preview' | 'apply' | null>(null)
  const [failure, setFailure] = useState<ChangeFailure | null>(null)
  const key = useRef<string | null>(null)

  async function preview(input: P, { keepKey = false } = {}): Promise<boolean> {
    setPending('preview')
    setFailure(null)
    try {
      const { lines, expected } = await procedures.preview(input)
      if (!keepKey || !key.current) key.current = crypto.randomUUID()
      setReview({ input, lines, expected })
      return true
    } catch (error) {
      setFailure(changeFailure(error))
      return false
    } finally {
      setPending(null)
    }
  }

  async function apply() {
    if (!review || pending) return
    if (reasonProblem(reason)) return setShowReasonError(true)
    const idempotencyKey = key.current ?? crypto.randomUUID()
    key.current = idempotencyKey
    setPending('apply')
    setFailure(null)
    try {
      const extras: ApplyExtras<E> = {
        expected: review.expected,
        reason: reason.trim(),
        idempotencyKey,
      }
      const done = await procedures.apply(Object.assign({}, review.input, extras))
      toast.success(done.message)
      key.current = null
      void queryClient.invalidateQueries({ queryKey: consoleKey() })
      onDone()
    } catch (error) {
      const refused = changeFailure(error)
      setFailure(refused)
      if (refused.stale) {
        // Someone else changed it: refresh the page and these lines; the reason stays.
        void queryClient.invalidateQueries({ queryKey: consoleKey() })
        const message = refused.message
        if (await preview(review.input, { keepKey: true })) setFailure({ ...refused, message })
      }
    } finally {
      setPending(null)
    }
  }

  return {
    step: review ? ('review' as const) : ('fields' as const),
    lines: review?.lines ?? [],
    reason,
    setReason(value: string) {
      setReason(value)
      if (showReasonError && !reasonProblem(value)) setShowReasonError(false)
    },
    /** Leaving the field with a short reason says what's needed (validate on blur). */
    blurReason: () => setShowReasonError(reason.trim() !== ''),
    reasonError: showReasonError ? reasonProblem(reason) : null,
    canApply: review !== null && reasonProblem(reason) === null && pending === null,
    pending,
    failure,
    preview: (input: P) => preview(input),
    apply,
    /** Back to the fields: a new preview makes a new key. */
    back() {
      setReview(null)
      setFailure(null)
      key.current = null
    },
    dirty: reason.trim() !== '',
  }
}

/** What the frames need: everything but `preview`, which each sheet calls with its own input. */
export type ChangeController = Omit<ReturnType<typeof useChange<AnyChange>>, 'preview'>
type AnyChange = {
  preview: (input: never) => Promise<{ lines: PreviewLine[]; expected: unknown }>
  apply: (input: never) => Promise<Done>
}
