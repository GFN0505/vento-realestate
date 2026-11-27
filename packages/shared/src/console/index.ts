// `@vento/shared/console`: the Vento console's contract and schemas. Never re-exported from the
// package root, so the customer web can't reach them (the bundle check enforces it).
export * from './contract'
export * from './schema'
