import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PartStalled, putPart, STALL_MS, xhrTransport } from './put-part'
import { failure, fakeNetwork, fakeTransport } from './upload.test-helpers'

/** Just enough XMLHttpRequest: the test plays the bucket through `progress` and `respond`. */
class FakeXhr {
  static last: FakeXhr | null = null
  readonly upload: {
    onprogress: ((e: { loaded: number }) => void) | null
    onload: (() => void) | null
  } = { onprogress: null, onload: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  status = 0
  aborted = false
  sent: { method: string; url: string; body: unknown } | null = null
  private method = ''
  private url = ''
  private headers: Record<string, string> = {}
  open(method: string, url: string) {
    this.method = method
    this.url = url
  }
  send(body: unknown) {
    this.sent = { method: this.method, url: this.url, body }
    FakeXhr.last = this
  }
  abort() {
    this.aborted = true
  }
  getResponseHeader(name: string) {
    return this.headers[name] ?? null
  }
  progress(loaded: number) {
    this.upload.onprogress?.({ loaded })
  }
  respond(status: number, headers: Record<string, string> = {}) {
    this.status = status
    this.headers = headers
    this.onload?.()
  }
}

const xhr = () => {
  if (!FakeXhr.last) throw new Error('No request was sent')
  return FakeXhr.last
}
const body = new Blob(['%PDF-1.7'])
const send = (signal = new AbortController().signal, onProgress = vi.fn()) =>
  xhrTransport({ url: 'https://bucket.test/part-1', body, signal, onProgress })

beforeEach(() => {
  FakeXhr.last = null
  vi.stubGlobal('XMLHttpRequest', FakeXhr)
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('xhrTransport', () => {
  it('PUTs the part and reads the ETag the bucket answers with', async () => {
    const answer = send()
    xhr().respond(200, { ETag: '"abc"' })

    await expect(answer).resolves.toEqual({ status: 200, etag: '"abc"' })
    expect(xhr().sent).toEqual({ method: 'PUT', url: 'https://bucket.test/part-1', body })
  })

  it('keeps a slow part going while bytes move, and reports them', async () => {
    const onProgress = vi.fn()
    const answer = send(undefined, onProgress)
    for (const loaded of [1, 2, 3, 4]) {
      vi.advanceTimersByTime(STALL_MS - 1000)
      xhr().progress(loaded)
    }
    xhr().respond(200, { ETag: '"abc"' })

    await expect(answer).resolves.toMatchObject({ etag: '"abc"' })
    expect(onProgress.mock.calls.map(([n]) => n)).toEqual([1, 2, 3, 4])
  })

  it('cuts a part after 45 seconds with no bytes moving', async () => {
    const answer = failure(send())
    xhr().progress(1)
    vi.advanceTimersByTime(STALL_MS)

    expect(await answer).toBeInstanceOf(PartStalled)
    expect(xhr().aborted).toBe(true)
  })

  it('stops the request when the upload is cancelled', async () => {
    const cancel = new AbortController()
    const answer = failure(send(cancel.signal))
    cancel.abort(new DOMException('', 'AbortError'))

    expect(await answer).toMatchObject({ name: 'AbortError' })
    expect(xhr().aborted).toBe(true)
  })
})

describe('putPart', () => {
  const request = { url: 'https://bucket.test/part-1', body, onProgress: () => {} }
  const put = (transport: ReturnType<typeof fakeTransport>) =>
    putPart(transport, fakeNetwork(), { ...request, signal: new AbortController().signal })

  it('says an upload the bucket no longer knows is gone', async () => {
    await expect(put(fakeTransport(() => ({ status: 404 })))).resolves.toBe('gone')
  })

  it('says a stalled part stalled', async () => {
    await expect(put(fakeTransport(() => new PartStalled()))).resolves.toBe('stalled')
  })

  it('treats a 2xx without an ETag as a failure to retry', async () => {
    await expect(put(fakeTransport(() => ({ status: 200, etag: null })))).resolves.toBe('error')
  })
})
