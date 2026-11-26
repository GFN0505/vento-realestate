import { PgTransaction } from 'drizzle-orm/pg-core'
import type { DbOrTx } from './client'

type Task = () => Promise<unknown>
type Results<T extends readonly Task[]> = { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }

/**
 * Runs independent queries side by side on the pool, but one after another on a transaction:
 * a transaction is one connection, and pg deprecates (and pg@9 refuses) overlapping queries on
 * one client.
 */
export async function runQueries<const T extends readonly Task[]>(
  db: DbOrTx,
  tasks: T,
): Promise<Results<T>> {
  if (db instanceof PgTransaction) {
    const results: unknown[] = []
    for (const task of tasks) results.push(await task())
    return results as Results<T>
  }
  return (await Promise.all(tasks.map((task) => task()))) as Results<T>
}
