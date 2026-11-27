import type { UploadNetwork } from './upload-retry'

/*
 * One part PUT straight to the bucket. XMLHttpRequest rather than fetch because only XHR reports
 * upload progress, which both moves the bar within a part and tells a slow link (bytes trickling
 * in) from a dead one (nothing for 45 s). There is no limit on the whole request: a 5 MiB part
 * at 20 KB/s takes four minutes and should still finish.
 */

export type PartRequest = {
  url: string
  body: Blob
  signal: AbortSignal
  /** Bytes of this part sent so far. */
  onProgress(loaded: number): void
}
export type PartResponse = { status: number; etag: string | null }
/** `xhrTransport` in the browser; a fake in tests. Rejects with `PartStalled` after a stall. */
export type PartTransport = (request: PartRequest) => Promise<PartResponse>

/** No bytes moved for this long: the request is cut and the part tried again. */
export const STALL_MS = 45_000

export class PartStalled extends Error {
  constructor() {
    super('No bytes moved for 45 seconds')
    this.name = 'PartStalled'
  }
}

export const xhrTransport: PartTransport = ({ url, body, signal, onProgress }) =>
  new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason)
    const xhr = new XMLHttpRequest()
    let timer: ReturnType<typeof setTimeout> | undefined
    const settle = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', cancel)
    }
    const fail = (error: unknown) => {
      settle()
      reject(error)
    }
    const arm = () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        fail(new PartStalled())
        xhr.abort()
      }, STALL_MS)
    }
    const cancel = () => {
      fail(signal.reason)
      xhr.abort()
    }
    xhr.upload.onprogress = (event) => {
      arm()
      onProgress(event.loaded)
    }
    // The body is sent; the bucket's answer gets its own 45 s.
    xhr.upload.onload = arm
    xhr.onload = () => {
      settle()
      resolve({ status: xhr.status, etag: xhr.getResponseHeader('ETag') })
    }
    xhr.onerror = () => fail(new TypeError('The part upload failed'))
    signal.addEventListener('abort', cancel, { once: true })
    xhr.open('PUT', url)
    xhr.send(body)
    arm()
  })

export type PutOutcome = { etag: string } | 'offline' | 'forbidden' | 'gone' | 'stalled' | 'error'

/** One PUT, cut short by a stall, a cancel or the connection dropping. */
export async function putPart(
  transport: PartTransport,
  net: UploadNetwork,
  { url, body, signal, onProgress }: PartRequest,
): Promise<PutOutcome> {
  signal.throwIfAborted()
  const attempt = new AbortController()
  const forward = () => attempt.abort(signal.reason)
  signal.addEventListener('abort', forward, { once: true })
  const unsubscribe = net.subscribe(() => {
    if (!net.isOnline()) attempt.abort()
  })
  try {
    const response = await transport({ url, body, signal: attempt.signal, onProgress })
    if (response.status === 403) return 'forbidden'
    // NoSuchUpload: the upload was aborted or swept on the server; retrying the part can't help.
    if (response.status === 404) return 'gone'
    const ok = response.status >= 200 && response.status < 300
    return ok && response.etag ? { etag: response.etag } : 'error'
  } catch (error) {
    signal.throwIfAborted()
    if (!net.isOnline()) return 'offline'
    net.reportNetworkFailure?.()
    return error instanceof PartStalled ? 'stalled' : 'error'
  } finally {
    signal.removeEventListener('abort', forward)
    unsubscribe()
    attempt.abort()
  }
}
