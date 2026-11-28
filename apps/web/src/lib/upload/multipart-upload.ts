import { ORPCError } from '@orpc/client'
import type { CompleteUploadOutput } from '@vento/shared'
import { errorReason } from '@/lib/error-data'
import { PartLinks } from './part-links'
import { sendAll } from './part-pool'
import { PartProgress } from './part-progress'
import { type PartTransport, putPart, xhrTransport } from './put-part'
import { checkFile, Restart, toUploadError, UPLOAD_FAILED, UploadError } from './upload-error'
import {
  backoff,
  browserNetwork,
  MAX_ATTEMPTS,
  type RetryEnv,
  realClock,
  whenOnline,
  withRetry,
} from './upload-retry'
import type { MultipartUploadOptions, UploadApi, UploadPhase } from './upload-types'

/*
 * A file straight to the bucket in 5 MiB parts (decision 0025), framework-free. Parts go up a few
 * at a time, each retried with backoff; the upload pauses while offline and carries on when the
 * connection is back; expired or refused part links are signed again. Calling `run()` again after
 * a failure resumes: parts already sent stay sent.
 */

export class MultipartUpload {
  private readonly api: UploadApi
  private readonly transport: PartTransport
  private readonly env: RetryEnv
  private fileId: string | null = null
  private partSize = 0
  private readonly links: PartLinks
  private readonly etags = new Map<number, string>()
  private readonly progress: PartProgress
  private controller: AbortController | null = null
  private cancelled = false
  /** Set after a stall: the link is too weak for parallel parts, so one at a time from then on. */
  private narrow = false
  private result: CompleteUploadOutput | null = null
  private wanted: UploadPhase = 'checking'
  private shown: UploadPhase | null = null

  constructor(
    private readonly file: File,
    private readonly options: MultipartUploadOptions,
  ) {
    this.api = options.api
    this.transport = options.transport ?? xhrTransport
    this.env = {
      clock: options.clock ?? realClock,
      net: options.network ?? browserNetwork,
      random: options.random ?? Math.random,
      onOffline: () => this.showPhase(),
    }
    this.links = new PartLinks(this.env.clock, (partNumbers, signal) =>
      this.signParts(partNumbers, signal),
    )
    this.progress = new PartProgress(file.size, () => this.etags.keys(), options.onProgress)
  }

  /** The server's file id once started (what a record's save sends). */
  get id(): string | null {
    return this.fileId
  }

  async run(): Promise<CompleteUploadOutput> {
    if (this.result) return this.result
    if (this.cancelled) throw new UploadError('', 'cancelled', false)
    const controller = new AbortController()
    this.controller = controller
    this.shown = null
    const unsubscribe = this.env.net.subscribe(() => this.showPhase())
    try {
      const checked = checkFile(this.options.purpose, this.file)
      if (!checked.ok) throw new UploadError(checked.problem, 'rejected', false)
      for (let restarts = 0; ; restarts++) {
        try {
          if (!this.fileId) await this.begin(checked.name, controller.signal)
          this.setPhase('uploading')
          await this.sendParts(controller.signal)
          this.result = await this.finish(controller.signal)
          return this.result
        } catch (error) {
          if (!(error instanceof Restart) || restarts >= 1) throw error
          this.forget()
        }
      }
    } catch (error) {
      throw toUploadError(error, this.cancelled)
    } finally {
      unsubscribe()
    }
  }

  /** Stops sending and tells the server to drop the upload (or the finished, unused file). */
  async cancel(): Promise<void> {
    this.cancelled = true
    this.controller?.abort()
    const fileId = this.fileId
    this.fileId = null
    if (fileId) await this.drop(fileId)
  }

  private async begin(name: string, signal: AbortSignal): Promise<void> {
    this.setPhase('checking')
    const { purpose } = this.options
    const { size, type } = this.file
    // Not cut short by a cancel: the server may already have made the upload, and only its answer
    // says which one to drop. An earlier attempt that failed with a 5xx may also have made one we
    // never hear of; it holds a slot until the sweep removes it, which we accept.
    const out = await withRetry(this.env, signal, () =>
      this.api.startUpload({ purpose, name, size, type }),
    )
    if (this.cancelled) {
      void this.drop(out.fileId)
      throw signal.reason
    }
    this.fileId = out.fileId
    this.partSize = out.partSize
    this.progress.partSize = out.partSize
    this.links.store(out.parts)
  }

  private sendParts(signal: AbortSignal): Promise<void> {
    const width = this.narrow ? 1 : (this.options.concurrency ?? 3)
    const narrow = () => this.narrow
    return sendAll(this.unsent(), width, narrow, (n, s) => this.sendPart(n, s), signal)
  }

  private async sendPart(n: number, signal: AbortSignal): Promise<void> {
    const body = this.file.slice((n - 1) * this.partSize, n * this.partSize)
    for (let attempt = 1; ; attempt++) {
      await whenOnline(this.env, signal)
      const url = await this.links.urlFor(n, () => this.unsent(), signal)
      const outcome = await putPart(this.transport, this.env.net, {
        url,
        body,
        signal,
        onProgress: (loaded) => this.progress.moved(n, loaded),
      })
        .then((sent) => {
          if (typeof sent === 'object') this.etags.set(n, sent.etag)
          return sent
        })
        .finally(() => this.progress.ended(n))
      if (typeof outcome === 'object') return
      if (outcome === 'gone') throw new Restart()
      if (outcome === 'offline') {
        attempt--
        continue
      }
      if (outcome === 'stalled') this.narrow = true
      if (attempt >= MAX_ATTEMPTS) throw new UploadError(UPLOAD_FAILED, 'failed', true)
      // A refused link (usually expired) gets a fresh one at once; anything else backs off.
      if (outcome === 'forbidden') this.links.refuse(n)
      else await this.env.clock.sleep(backoff(attempt, this.env.random), signal)
    }
  }

  private async signParts(partNumbers: number[], signal: AbortSignal) {
    const fileId = this.fileId
    if (!fileId) return []
    try {
      const out = await withRetry(this.env, signal, () =>
        this.api.signParts({ fileId, partNumbers }, { signal }),
      )
      return out.parts
    } catch (error) {
      if (error instanceof ORPCError && error.code === 'NOT_FOUND') throw new Restart()
      throw error
    }
  }

  /** Completes; when the server says parts are missing or wrong, sends them all again once. */
  private async finish(signal: AbortSignal): Promise<CompleteUploadOutput> {
    for (let resent = 0; ; resent++) {
      this.setPhase('checking')
      const fileId = this.fileId
      if (!fileId) throw new Restart()
      const parts = [...this.etags]
        .sort(([a], [b]) => a - b)
        .map(([partNumber, etag]) => ({ partNumber, etag }))
      try {
        return await withRetry(this.env, signal, () =>
          this.api.completeUpload({ fileId, parts }, { signal }),
        )
      } catch (error) {
        if (errorReason(error) !== 'upload_incomplete') throw error
        if (resent >= 1) throw new Restart()
        this.etags.clear()
        this.progress.report()
        this.setPhase('uploading')
        await this.sendParts(signal)
      }
    }
  }

  /** Part numbers the bucket hasn't confirmed yet. */
  private unsent(): number[] {
    const count = Math.max(1, Math.ceil(this.file.size / this.partSize))
    return Array.from({ length: count }, (_, i) => i + 1).filter((n) => !this.etags.has(n))
  }

  /** Before a fresh start; the old upload is dropped so it doesn't hold one of the open slots. */
  private forget(): void {
    const fileId = this.fileId
    this.fileId = null
    this.links.clear()
    this.etags.clear()
    this.progress.clear()
    if (fileId) void this.drop(fileId)
  }

  /** Best effort: if this fails, the sweep removes the upload later. */
  private drop(fileId: string): Promise<void> {
    return this.api.abortUpload({ fileId }).catch(() => undefined)
  }

  private setPhase(phase: UploadPhase): void {
    this.wanted = phase
    this.showPhase()
  }

  private showPhase(): void {
    const phase = this.env.net.isOnline() ? this.wanted : 'paused'
    if (phase === this.shown || this.controller?.signal.aborted) return
    this.shown = phase
    this.options.onPhase?.(phase)
  }
}
