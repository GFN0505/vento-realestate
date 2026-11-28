import type { RecordEncumbranceInput } from '@vento/shared'
import { and, eq, inArray } from 'drizzle-orm'
import { loadMembership, type ServiceContext } from '@/access/context'
import { decide } from '@/approvals/engine'
import { approvalPlugins } from '@/approvals/registry'
import { recordEncumbrance, requestClear } from '@/modules/land/encumbrances.service'
import { availabilityForOrganization } from '@/platform/snapshot'
import type { DbOrTx } from './client'
import { encumbrances } from './schema'
import type { LandSeedInput } from './seed-land'
import { sampleUpload } from './seed-land-files'
import { daysBefore } from './seed-land-history'

// The golden thread's encumbrances (plan §9), written through the real services so the request,
// decisions, audit and `cleared` state are exactly what the engine writes, dated at seed time:
//   P-0012 Plot 22, Folu Ayo  a caveat, cleared: Ngozi asks, Aisha approves step 1, Olumide step 2
//   P-0015 Parkview Block B   a mortgage to Sterling Bank that doesn't block sales
//   P-0018 Idu family land    an active caveat with a next date in 12 days
// Safe to run again: a parcel that already has an encumbrance is left alone.

type Seeded = { reference: number; id: string; name: string }

type Person = LandSeedInput['officer']

/** A seeded person's context in the organization, as the member middleware would build it. */
async function contextOf(
  tx: DbOrTx,
  input: LandSeedInput,
  person: Person,
): Promise<ServiceContext> {
  const membership = await loadMembership(tx, person.id, input.organizationId)
  if (membership?.organizationId !== input.organizationId) {
    throw new Error(`${person.name} is not a member of the seed organization`)
  }
  return {
    db: tx,
    organizationId: input.organizationId,
    organizationName: membership.organizationName,
    user: person,
    member: membership.member,
    sessionId: null,
    features: await availabilityForOrganization(tx, input.organizationId),
    storage: input.storage,
  }
}

async function hasEncumbrance(tx: DbOrTx, organizationId: string, parcelIds: string[]) {
  if (parcelIds.length === 0) return new Set<string>()
  const rows = await tx
    .select({ parcelId: encumbrances.parcelId })
    .from(encumbrances)
    .where(
      and(
        eq(encumbrances.organizationId, organizationId),
        inArray(encumbrances.parcelId, parcelIds),
      ),
    )
  return new Set(rows.map((r) => r.parcelId))
}

/** "Fictional sample · not a real document", named for the parcel and what it is. */
const evidence = (tx: DbOrTx, input: LandSeedInput, parcel: Seeded, what: string) =>
  sampleUpload(tx, input, `${parcel.name} · ${what}`, what)

export async function seedLandEncumbrances(
  tx: DbOrTx,
  input: LandSeedInput,
  seeded: readonly Seeded[],
  today: string,
): Promise<void> {
  const byReference = new Map(seeded.map((p) => [p.reference, p]))
  const done = await hasEncumbrance(
    tx,
    input.organizationId,
    seeded.map((p) => p.id),
  )
  const ngozi = await contextOf(tx, input, input.officer)
  const record = async (
    parcel: Seeded,
    what: string,
    fields: Omit<RecordEncumbranceInput, 'parcelId' | 'evidence'>,
  ) => {
    const fileId = await evidence(tx, input, parcel, what)
    const { parcel: detail } = await recordEncumbrance(ngozi, {
      parcelId: parcel.id,
      reference: null,
      lawyer: null,
      nextOn: null,
      notes: null,
      ...fields,
      evidence: { fileId },
    })
    const [enc] = detail.encumbrances
    if (!enc) throw new Error(`Seed encumbrance on ${parcel.name} did not save`)
    return enc
  }

  const plot22 = byReference.get(12)
  if (plot22 && !done.has(plot22.id)) {
    const caveat = await record(plot22, 'Caveat', {
      type: 'caveat',
      blocksSales: true,
      claimant: 'Ogunleye family',
      servedOn: '2025-06-10',
      reference: 'CV/LAG/2025/0611',
      lawyer: 'Adaeze Okoro & Co.',
    })
    const sent = await requestClear(ngozi, {
      id: caveat.id,
      expectedVersion: caveat.version,
      clearedOn: today,
      evidence: { fileId: await evidence(tx, input, plot22, 'Withdrawal of caveat') },
      note: 'The Ogunleye family withdrew the caveat.',
      reason: 'Family withdrew the caveat',
    })
    if (!sent.pendingRequestId) throw new Error('Seed clearing request did not wait for approval')
    const plugins = approvalPlugins()
    for (const approver of [input.approvers.finance, input.approvers.owner]) {
      await decide(
        await contextOf(tx, input, approver),
        { requestId: sent.pendingRequestId, decision: 'approve' },
        plugins,
      )
    }
  }

  const block = byReference.get(15)
  if (block && !done.has(block.id)) {
    await record(block, 'Mortgage deed', {
      type: 'mortgage',
      blocksSales: false,
      claimant: 'Sterling Bank',
      servedOn: '2026-03-16',
      reference: 'Construction facility',
    })
  }

  const idu = byReference.get(18)
  if (idu && !done.has(idu.id)) {
    await record(idu, 'Caveat', {
      type: 'caveat',
      blocksSales: true,
      claimant: 'Okafor family',
      servedOn: daysBefore(today, 60),
      reference: 'CV/FCT/2026/0233',
      nextOn: daysBefore(today, -12),
      notes: 'Meeting with the family elders at the Idu chief’s palace.',
    })
  }
}
