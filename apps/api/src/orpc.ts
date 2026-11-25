import { implement } from '@orpc/server'
import { contract } from '@vento/shared'
import type { BaseContext } from '@/context'

/** Procedures implement the shared contract, so input and output types can't drift. */
export const os = implement(contract).$context<BaseContext>()
