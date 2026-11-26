/** A refusal from a platform operation. The message is printed to the operator as is. */
export class CommandError extends Error {
  override name = 'CommandError'
}
