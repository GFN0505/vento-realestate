type ErrorLike = { code?: unknown; constraint?: unknown; cause?: unknown }

/** The innermost error that carries a database (or system) error code, if any. */
function findCoded(error: unknown): ErrorLike | undefined {
  let current: unknown = error
  for (let i = 0; i < 4 && current && typeof current === 'object'; i++) {
    const candidate = current as ErrorLike
    if (typeof candidate.code === 'string') return candidate
    current = candidate.cause
  }
  return undefined
}

/**
 * What to log about an unexpected error without leaking personal data. Drizzle puts query
 * parameters (emails, names) into its message, and Postgres messages can quote input values,
 * so database errors are logged by code and constraint only, and stacks keep only their frames.
 */
export function errorSummary(error: unknown): Record<string, string | undefined> {
  if (!(error instanceof Error)) return { error: typeof error }
  const coded = findCoded(error)
  // Frames only: a multi-line message (Drizzle's "params: …") would otherwise follow line one.
  const stack = error.stack
    ?.split('\n')
    .filter((line) => /^\s+at /.test(line))
    .slice(0, 8)
    .join('\n')
  if (coded) {
    return {
      error: error.name,
      code: String(coded.code),
      constraint: typeof coded.constraint === 'string' ? coded.constraint : undefined,
      stack,
    }
  }
  return { error: error.name, detail: error.message.split('\n')[0]?.slice(0, 200), stack }
}
