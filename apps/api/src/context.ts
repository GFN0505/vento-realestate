import type { Db } from '@/db/client'

/** What every procedure receives. Auth adds the member and organization in brick 2. */
export type BaseContext = {
  db: Db
  requestId: string
}
