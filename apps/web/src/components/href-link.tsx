import { useRouter } from '@tanstack/react-router'
import type { ComponentProps } from 'react'

type Props = Omit<ComponentProps<'a'>, 'href'> & {
  /** An app path the server sent (a record's page), e.g. "/settings/roles/…". */
  href: string
}

/**
 * A link to an app path known only at run time (the server's `recordLink`). A plain click stays
 * in the app; modified clicks (new tab, new window) keep the browser's behaviour.
 */
export function HrefLink({ href, onClick, ...props }: Props) {
  const router = useRouter()
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event)
        if (event.defaultPrevented || event.button !== 0) return
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
        event.preventDefault()
        void router.navigate({ href })
      }}
      {...props}
    />
  )
}
