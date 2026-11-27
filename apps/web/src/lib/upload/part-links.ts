import { PART_URL_SECONDS } from '@vento/shared'
import { UPLOAD_FAILED, UploadError } from './upload-error'
import type { UploadClock } from './upload-retry'

type Link = { partNumber: number; url: string }

/** Re-sign a minute early. Measured on this device's clock, so a wrong phone clock can't matter. */
const URL_LIFETIME_MS = (PART_URL_SECONDS - 60) * 1000

/**
 * Signed part links, kept until a minute before they expire. A missing or stale link is signed
 * again together with every other unsent part that needs one, in one call shared by all parts.
 */
export class PartLinks {
  private readonly urls = new Map<number, { url: string; staleAt: number }>()
  private signing: Promise<void> | null = null

  constructor(
    private readonly clock: UploadClock,
    private readonly sign: (partNumbers: number[], signal: AbortSignal) => Promise<readonly Link[]>,
  ) {}

  store(parts: readonly Link[]): void {
    const staleAt = this.clock.now() + URL_LIFETIME_MS
    for (const { partNumber, url } of parts) this.urls.set(partNumber, { url, staleAt })
  }

  /** The bucket refused this link (usually expired): the next `urlFor` signs a fresh one. */
  refuse(n: number): void {
    this.urls.delete(n)
  }

  clear(): void {
    this.urls.clear()
  }

  async urlFor(n: number, unsent: () => number[], signal: AbortSignal): Promise<string> {
    for (let tries = 0; tries < 3; tries++) {
      const known = this.urls.get(n)
      if (known && known.staleAt > this.clock.now()) return known.url
      this.signing ??= this.signMissing(unsent(), signal).finally(() => {
        this.signing = null
      })
      await this.signing
    }
    throw new UploadError(UPLOAD_FAILED, 'failed', true)
  }

  private async signMissing(unsent: number[], signal: AbortSignal): Promise<void> {
    const now = this.clock.now()
    const partNumbers = unsent.filter((n) => !((this.urls.get(n)?.staleAt ?? 0) > now))
    if (partNumbers.length === 0) return
    this.store(await this.sign(partNumbers, signal))
  }
}
