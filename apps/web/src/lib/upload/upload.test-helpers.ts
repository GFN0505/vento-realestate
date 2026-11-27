import { vi } from 'vitest'
import { MultipartUpload } from './multipart-upload'
import type { PartRequest, PartResponse, PartTransport } from './put-part'
import type { UploadClock, UploadNetwork } from './upload-retry'
import type { MultipartUploadOptions, UploadApi, UploadPhase } from './upload-types'

/* Fakes shared by the upload tests. Not a test file itself, so Vitest doesn't collect it. */

export const FILE_ID = '01900000-0000-7000-8000-0000000000f1'
export const LATER = '2026-11-28T10:15:00.000Z'

export const partUrl = (n: number, round = 0) => `https://bucket.test/part-${n}?v=${round}`
export const partUrls = (numbers: number[], round = 0) =>
  numbers.map((partNumber) => ({ partNumber, url: partUrl(partNumber, round) }))
export const etagFor = (u: string) => `"etag-${new URL(u).pathname.slice(1)}"`

/** The files API: start hands out `count` parts of `partSize`; signing counts rounds in the URL. */
export function fakeApi({ partSize = 4, count = 3, sizeBytes = 10 } = {}) {
  let round = 0
  const numbers = Array.from({ length: count }, (_, i) => i + 1)
  return {
    startUpload: vi.fn<UploadApi['startUpload']>(async () => ({
      fileId: FILE_ID,
      partSize,
      parts: partUrls(numbers),
      expiresAt: LATER,
    })),
    signParts: vi.fn<UploadApi['signParts']>(async ({ partNumbers }) => ({
      parts: partUrls(partNumbers, ++round),
      expiresAt: LATER,
    })),
    completeUpload: vi.fn<UploadApi['completeUpload']>(async () => ({
      fileId: FILE_ID,
      contentType: 'application/pdf',
      sizeBytes,
    })),
    abortUpload: vi.fn<UploadApi['abortUpload']>(async () => undefined),
  }
}
export type FakeApi = ReturnType<typeof fakeApi>

type Answer = Partial<PartResponse> | Error | undefined
/**
 * The bucket: every part succeeds (all its bytes reported, then an ETag) unless `respond` answers
 * otherwise. A 2xx answer that doesn't mention `etag` gets the default one.
 */
export function fakeTransport(
  respond?: (url: string, call: number, request: PartRequest) => Answer | Promise<Answer>,
) {
  let call = 0
  return vi.fn<PartTransport>(async (request) => {
    const answer = await respond?.(request.url, ++call, request)
    if (answer instanceof Error) throw answer
    const status = answer?.status ?? 200
    const ok = status >= 200 && status < 300
    if (ok) request.onProgress(request.body.size)
    const fallback = ok ? etagFor(request.url) : null
    return { status, etag: answer && 'etag' in answer ? (answer.etag ?? null) : fallback }
  })
}

/** A request that never answers; it rejects the way XHR does when cut. */
export const hang = ({ signal }: PartRequest) =>
  new Promise<never>((_, reject) => {
    signal.addEventListener('abort', () => reject(new DOMException('', 'AbortError')), {
      once: true,
    })
  })

/** Backoff waits pass at once (and move the clock); waits of a minute or more only end by abort. */
export function fakeClock(
  start = 0,
): UploadClock & { delays: number[]; advance(ms: number): void } {
  let now = start
  const delays: number[] = []
  return {
    delays,
    now: () => now,
    advance: (ms) => {
      now += ms
    },
    sleep: (ms, signal) =>
      new Promise((resolve, reject) => {
        if (ms >= 60_000) {
          signal.addEventListener('abort', () => reject(signal.reason), { once: true })
          return
        }
        delays.push(ms)
        now += ms
        queueMicrotask(resolve)
      }),
  }
}

export function fakeNetwork(online = true): UploadNetwork & { set(value: boolean): void } {
  const listeners = new Set<() => void>()
  return {
    isOnline: () => online,
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    set(value) {
      online = value
      for (const listener of [...listeners]) listener()
    },
  }
}

/** A promise the test settles by hand. */
export function deferred<T>() {
  // Definitely assigned: the Promise constructor runs its executor synchronously.
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

/** 10 bytes in parts of 4: parts 1, 2 and 3 (the last is 2 bytes). */
export const pdf = () => new File(['%PDF-1.7\n\n'], 'Survey plan.pdf', { type: 'application/pdf' })

export function setup(options: Partial<MultipartUploadOptions> & { file?: File } = {}) {
  const api = (options.api as FakeApi | undefined) ?? fakeApi()
  const phases: UploadPhase[] = []
  const progress: number[] = []
  const upload = new MultipartUpload(options.file ?? pdf(), {
    purpose: 'title_document',
    transport: fakeTransport(),
    clock: fakeClock(),
    network: fakeNetwork(),
    random: () => 0.5,
    onPhase: (phase) => phases.push(phase),
    onProgress: (loaded) => progress.push(loaded),
    ...options,
    api,
  })
  return { upload, api, phases, progress }
}

export const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => error,
  )
