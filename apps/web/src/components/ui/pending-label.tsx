import { LoaderCircleIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * A button's label that keeps its width while the action runs: the words stay (invisible) and a
 * spinner sits over them, so nothing beside the button moves. Put `relative` on the button.
 */
export function PendingLabel({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <>
      <span className={pending ? 'invisible' : undefined}>{children}</span>
      {pending && (
        <LoaderCircleIcon aria-hidden className="absolute inset-0 m-auto size-4 animate-spin" />
      )}
    </>
  )
}
