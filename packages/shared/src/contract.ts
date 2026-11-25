import { healthContract } from './health/contract'

/** The whole API surface. The server implements it and the web client calls it. */
export const contract = {
  health: healthContract,
}
export type Contract = typeof contract
