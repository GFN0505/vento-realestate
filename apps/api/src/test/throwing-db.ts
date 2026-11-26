import type { DbOrTx } from '@/db/client'

/** A database that fails the test on any use: proves a code path reads and writes nothing. */
export function throwingDb(): DbOrTx {
  return new Proxy(
    {},
    {
      get(_target, property) {
        throw new Error(`The database was used (db.${String(property)})`)
      },
    },
  ) as DbOrTx
}
