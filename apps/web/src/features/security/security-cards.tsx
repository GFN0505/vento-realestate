import { useQuery } from '@tanstack/react-query'
import { Avatar } from '@/components/avatar'
import { TooltipProvider } from '@/components/ui/tooltip'
import { useMe } from '@/features/preview/use-effective-permissions'
import { securityQuery, sessionsQuery } from '@/features/settings/security-queries'
import type { SecurityIntent } from '@/features/settings/security-search'
import { NameField } from './name-field'
import { useAddPasskey } from './passkey-actions'
import { PasskeysCard } from './passkeys-card'
import { SecurityDialogs } from './security-dialogs-host'
import { CardError, CardSkeleton } from './security-states'
import { SessionsCard } from './sessions-card'
import { SignInCard } from './sign-in-card'
import { useSecurityIntent } from './use-security-intent'

type Props = {
  /** The line under the email: whose account this is ("…in every organization you belong to"). */
  accountLine: string
  intent?: SecurityIntent | undefined
  onIntentHandled?: () => void
}

const noop = () => {}

/**
 * The person's own sign-in, in four blocks: who you are (name in place), Sign-in (password,
 * two-step, backup codes), Passkeys, Where you're signed in. My security and the console's My
 * account render the same cards with the same rules (decision 0019, plan §1b.13).
 */
export function SecurityCards({ accountLine, intent, onIntentHandled = noop }: Props) {
  const me = useMe()
  const security = useQuery(securityQuery())
  const sessions = useQuery(sessionsQuery())
  const passkeys = useAddPasskey()
  const addRef = useSecurityIntent({ intent, onIntentHandled, data: security.data, passkeys })

  return (
    <TooltipProvider>
      <div className="flex items-center gap-4 px-1">
        <Avatar
          name={security.data?.name ?? me.user.name}
          className="size-14 text-lg ring-4 ring-highlight"
        />
        <div className="flex min-w-0 flex-col">
          <NameField name={security.data?.name ?? me.user.name} />
          <p className="truncate text-[13px]" title={me.user.email}>
            {security.data?.email ?? me.user.email}
          </p>
          <p className="text-muted-foreground text-xs">{accountLine}</p>
        </div>
      </div>

      {security.data ? (
        <>
          <SignInCard data={security.data} />
          {security.data.passkeys.available && (
            <PasskeysCard
              data={security.data}
              adding={passkeys.pending}
              onAdd={() => void passkeys.add()}
              addRef={addRef}
            />
          )}
        </>
      ) : security.isError ? (
        <CardError
          title="Sign-in"
          message="Couldn't load your sign-in details. Check your connection and try again."
          retrying={security.isFetching}
          onRetry={() => void security.refetch()}
        />
      ) : (
        <>
          <CardSkeleton rows={3} />
          <CardSkeleton rows={1} header />
        </>
      )}

      {sessions.data ? (
        <SessionsCard sessions={sessions.data.items} />
      ) : sessions.isError ? (
        <CardError
          title="Where you're signed in"
          message="Couldn't load your sessions. Check your connection and try again."
          retrying={sessions.isFetching}
          onRetry={() => void sessions.refetch()}
        />
      ) : (
        <CardSkeleton rows={2} header />
      )}

      <SecurityDialogs data={security.data} sessions={sessions.data?.items} />
    </TooltipProvider>
  )
}
