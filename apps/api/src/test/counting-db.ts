import type { DbOrTx } from '@/db/client'

const QUERY_METHODS = new Set([
  'execute',
  'select',
  'selectDistinct',
  'insert',
  'update',
  'delete',
  'transaction',
])

/**
 * Wraps a database so a test can see which queries a path ran: each select, insert, update,
 * delete, execute or transaction call is one entry in `calls`.
 */
export function countingDb(db: DbOrTx): { db: DbOrTx; calls: string[] } {
  const calls: string[] = []
  const proxy = new Proxy(db, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver)
      if (
        typeof property === 'string' &&
        QUERY_METHODS.has(property) &&
        typeof value === 'function'
      ) {
        return (...args: unknown[]) => {
          calls.push(property)
          return (value as (...a: unknown[]) => unknown).apply(target, args)
        }
      }
      return value
    },
  })
  return { db: proxy, calls }
}
