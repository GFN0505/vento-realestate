import { Link } from '@tanstack/react-router'
import { CircleHelpIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { useEffectiveAccess, useMe } from '@/features/preview/use-effective-permissions'
import { canView, navItemForModule } from '@/features/shell/nav'
import { readRecentPages } from '@/features/shell/recent-pages'
import { shellUi } from '@/features/shell/shell-ui'
import { usePageTitle } from '@/features/shell/use-page-title'
import { modKeyLabel } from '@/lib/platform'
import { ErrorState, ErrorText } from './error-state'

const TITLE = "We can't find that page"
const LINE = 'The link may be old, or the record may have been archived. Try searching for it.'

/** Board Error404 inside the shell: Search (⌘K), the last three pages opened here, Home. */
export function NotFoundPage() {
  const me = useMe()
  const { permissions } = useEffectiveAccess()
  usePageTitle('Page not found', { recent: false })
  const recent = me.organization
    ? readRecentPages(me.user.id, me.organization.id)
        .filter((p) => {
          const item = p.module ? navItemForModule(p.module) : undefined
          return !item || canView(permissions, item)
        })
        .slice(0, 3)
    : []

  return (
    <ErrorState
      icon={CircleHelpIcon}
      tone="blue"
      title={TITLE}
      actions={
        <>
          <Button asChild>
            <Link to="/">Go to home</Link>
          </Button>
          <Button variant="outline" onClick={() => shellUi.open('palette')}>
            Search
            <Kbd className="ml-1 max-md:hidden">{modKeyLabel('K')}</Kbd>
          </Button>
        </>
      }
    >
      <ErrorText>{LINE}</ErrorText>
      {recent.length > 0 && (
        <p className="text-muted-foreground text-xs leading-relaxed">
          Recently opened:{' '}
          {recent.map((page, i) => (
            <span key={page.href}>
              {i > 0 && ' · '}
              <a
                href={page.href}
                className="font-medium text-link hover:text-link-hover hover:underline max-md:inline-flex max-md:min-h-11 max-md:items-center"
              >
                {page.title}
              </a>
            </span>
          ))}
        </p>
      )}
    </ErrorState>
  )
}

/** Signed out: the same page without the shell, offering Sign in. */
export function StandaloneNotFound() {
  useEffect(() => {
    document.title = 'Page not found · Vento'
  }, [])
  return (
    <ErrorState
      icon={CircleHelpIcon}
      tone="blue"
      title={TITLE}
      actions={
        <Button asChild>
          <Link to="/sign-in">Sign in</Link>
        </Button>
      }
    >
      <ErrorText>{LINE}</ErrorText>
    </ErrorState>
  )
}
