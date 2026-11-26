import type { AuthClientError } from '@/lib/auth-errors'

type Result<T> = { data: T | null; error: AuthClientError | null }

/**
 * Better Auth's client answers `{ data, error }`, but a dropped connection can still throw. Here
 * it never does: a throw becomes a network error (status 0), so no dialog is left stuck busy and
 * what was typed stays.
 */
export async function safeAuth<T>(
  call: () => Promise<{ data: T | null; error: unknown }>,
): Promise<Result<T>> {
  try {
    const { data, error } = await call()
    return { data, error: (error as AuthClientError | null) ?? null }
  } catch {
    return { data: null, error: { status: 0 } }
  }
}
