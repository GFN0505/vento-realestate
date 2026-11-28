import { ENCUMBRANCE_LABELS, type EncumbranceType } from '@vento/shared'
import { and, eq, sql } from 'drizzle-orm'
import type { ServiceContext } from '@/access/context'
import { webUrl } from '@/auth/hooks/deps'
import type { DbOrTx } from '@/db/client'
import { members, roles, users } from '@/db/schema'
import type { EmailMessage } from '@/email/mailer'
import { encumbranceRecordedEmail } from '@/email/templates/encumbrance-recorded'
import { formatDate } from '@/lib/format'

// "Caveat recorded on Plot 22, Folu Ayo" to owners, built inside the recording transaction and
// sent by the router after commit (a mail failure never undoes the record). Never the claimant,
// lawyer or notes (owner, 28 Nov 2026): email leaves the product, so it says what and where, and
// the link shows the rest to people who may see it.

/** At most this many owners are emailed about one encumbrance. */
const MAX_OWNER_EMAILS = 50

/** "4 Nov 2026" from "2026-11-04". */
export function dateWords(isoDate: string): string {
  // Noon UTC is the same calendar day in Lagos.
  return formatDate(new Date(`${isoDate}T12:00:00Z`))
}

/**
 * Active owners other than the recorder whose company access includes the parcel's company (all
 * companies, or that one): a limited owner of another company hears nothing about it.
 */
export async function encumbranceRecordedEmails(
  tx: DbOrTx,
  ctx: Pick<ServiceContext, 'organizationId' | 'organizationName' | 'member' | 'user'>,
  facts: {
    parcel: { id: string; name: string; entityId: string }
    type: EncumbranceType
    servedOn: string
    blocksSales: boolean
  },
): Promise<EmailMessage[]> {
  const owners = await tx
    .select({ email: users.email })
    .from(members)
    .innerJoin(users, eq(users.id, members.userId))
    .innerJoin(
      roles,
      and(eq(roles.id, members.roleId), eq(roles.organizationId, members.organizationId)),
    )
    .where(
      and(
        eq(members.organizationId, ctx.organizationId),
        eq(members.status, 'active'),
        eq(roles.key, 'owner'),
        sql`${members.id} <> ${ctx.member.id}`,
        sql`(not exists (select 1 from member_entity_limits l
            where l.organization_id = ${members.organizationId} and l.member_id = ${members.id})
          or exists (select 1 from member_entity_limits l
            where l.organization_id = ${members.organizationId} and l.member_id = ${members.id}
              and l.entity_id = ${facts.parcel.entityId}))`,
      ),
    )
    .orderBy(users.email)
    .limit(MAX_OWNER_EMAILS)
  if (owners.length === 0) return []
  const rendered = encumbranceRecordedEmail({
    typeLabel: ENCUMBRANCE_LABELS[facts.type],
    servedOn: dateWords(facts.servedOn),
    recorderName: ctx.user.name,
    parcelName: facts.parcel.name,
    organizationName: ctx.organizationName,
    blocksSales: facts.blocksSales,
    url: webUrl(`/land/${facts.parcel.id}?tab=encumbrances`),
  })
  return owners.map((o) => ({ to: o.email, tag: 'land_alert' as const, ...rendered }))
}
