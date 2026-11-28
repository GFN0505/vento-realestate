import type { CreateParcelInput } from '@vento/shared'
import type { DbOrTx } from '@/db/client'
import { createMemoryStorage } from '@/storage/memory-driver'
import {
  createEntity,
  createMember,
  createOrganization,
  createReadyFile,
  type TestUser,
} from '@/test/factories'
import { clientAs } from '@/test/router-client'

// The land tests' shared world: an organization with two companies, Ngozi (Land & legal) and one
// in-memory bucket every client shares, so uploads made by a factory can be attached by a call.

export type LandClient = ReturnType<typeof clientAs>['client']

export async function landWorld(tx: DbOrTx) {
  const org = await createOrganization(tx)
  const storage = createMemoryStorage()
  const lekki = await createEntity(tx, org, { name: 'Lekki Pearl Estates Ltd' })
  const parkview = await createEntity(tx, org, { name: 'Parkview Residences SPV Ltd' })
  const ngozi = await createMember(tx, org, { role: 'land_legal', name: 'Ngozi Adeyemi' })
  const as = (user: TestUser): LandClient => clientAs(tx, user, { storage }).client
  /** A finished upload by `user` (Ngozi by default), ready to attach. */
  const file = async (user: TestUser = ngozi.user): Promise<string> =>
    (await createReadyFile(tx, org, { uploadedBy: user, storage })).id
  return { tx, org, storage, lekki, parkview, ngozi, as, file, client: as(ngozi.user) }
}

export type LandWorld = Awaited<ReturnType<typeof landWorld>>

/** Add parcel's input for Plot 22, Folu Ayo under `entityId`, with any field replaced. */
export function addParcel(
  entityId: string,
  overrides: Partial<CreateParcelInput> = {},
): CreateParcelInput {
  return {
    name: 'Plot 22, Folu Ayo',
    state: 'Lagos',
    lga: 'Ibeju-Lekki',
    area: 'Ibeju-Lekki',
    size: { value: '4.2', unit: 'ha' },
    status: 'acquired',
    entityId,
    ...overrides,
  }
}
