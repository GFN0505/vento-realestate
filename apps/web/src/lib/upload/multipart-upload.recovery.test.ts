import { describe, expect, it } from 'vitest'
import { PartStalled } from './put-part'
import {
  deferred,
  FILE_ID,
  failure,
  fakeApi,
  fakeClock,
  fakeTransport,
  hang,
  LATER,
  partUrls,
  setup,
} from './upload.test-helpers'
import { UploadError } from './upload-error'

const SECOND_ID = '01900000-0000-7000-8000-0000000000f2'
const pathOf = (u: string) => new URL(u).pathname

describe('MultipartUpload recovery', () => {
  it('retries a failed part with growing, jittered delays', async () => {
    const clock = fakeClock()
    const transport = fakeTransport((u, call) =>
      u.includes('part-2') && call <= 4 ? { status: 503 } : undefined,
    )
    await setup({ transport, clock, concurrency: 1 }).upload.run()

    // random() is 0.5: three quarters of 1 s, 2 s, then 4 s.
    expect(clock.delays).toEqual([750, 1500, 3000])
  })

  it('fails after six tries, then resumes on retry without resending finished parts', async () => {
    let broken = true
    const transport = fakeTransport((u) =>
      broken && u.includes('part-2') ? { status: 500 } : undefined,
    )
    const { upload, api } = setup({ transport, concurrency: 1 })
    const error = await failure(upload.run())
    expect(error).toBeInstanceOf(UploadError)
    expect(error).toMatchObject({ kind: 'failed', retryable: true })

    broken = false
    transport.mockClear()
    await upload.run()

    expect(api.startUpload).toHaveBeenCalledTimes(1)
    expect(transport.mock.calls.map(([r]) => pathOf(r.url))).toEqual(['/part-2', '/part-3'])
  })

  it('starts a fresh upload when the bucket no longer knows this one, and drops the old', async () => {
    const api = fakeApi()
    api.startUpload
      .mockResolvedValueOnce({
        fileId: FILE_ID,
        partSize: 4,
        parts: partUrls([1, 2, 3]),
        expiresAt: LATER,
      })
      .mockResolvedValueOnce({
        fileId: SECOND_ID,
        partSize: 4,
        parts: partUrls([1, 2, 3]),
        expiresAt: LATER,
      })
    let gone = true
    const transport = fakeTransport((u) => {
      if (!gone || !u.includes('part-2')) return undefined
      gone = false
      return { status: 404 }
    })
    await setup({ api, transport, concurrency: 1 }).upload.run()

    expect(api.abortUpload).toHaveBeenCalledWith({ fileId: FILE_ID })
    expect(api.completeUpload.mock.calls[0]?.[0]).toMatchObject({ fileId: SECOND_ID })
  })

  it('gives up after one fresh start when the upload keeps vanishing', async () => {
    const transport = fakeTransport(() => ({ status: 404 }))
    const { upload, api } = setup({ transport, concurrency: 1 })

    const error = await failure(upload.run())

    expect(error).toMatchObject({ kind: 'failed', retryable: true })
    expect(api.startUpload).toHaveBeenCalledTimes(2)
    expect(transport).toHaveBeenCalledTimes(2)
  })

  it('tries a stalled part again, then sends one part at a time', async () => {
    let stalled = false
    const startedWith = new Map<string, number>()
    let inFlight = 0
    const transport = fakeTransport(async (u) => {
      startedWith.set(pathOf(u), ++inFlight)
      if (u.includes('part-1') && !stalled) {
        stalled = true
        inFlight--
        return new PartStalled()
      }
      await new Promise((resolve) => setTimeout(resolve, 2))
      inFlight--
      return undefined
    })
    const file = new File(['%PDF-'.padEnd(24, 'x')], 'Deed.pdf', { type: 'application/pdf' })
    const api = fakeApi({ count: 6, sizeBytes: 24 })
    await setup({ file, transport, api }).upload.run()

    expect(transport).toHaveBeenCalledTimes(7)
    expect([4, 5, 6].map((n) => startedWith.get(`/part-${n}`))).toEqual([1, 1, 1])
  })

  it('cancels: stops sending and tells the server to drop the upload', async () => {
    const transport = fakeTransport((_, __, request) => hang(request))
    const { upload, api } = setup({ transport })
    const done = failure(upload.run())
    await expect.poll(() => transport.mock.calls.length).toBeGreaterThan(0)

    await upload.cancel()

    expect(await done).toMatchObject({ kind: 'cancelled' })
    expect(api.abortUpload).toHaveBeenCalledWith({ fileId: FILE_ID })
  })

  it('drops the upload a cancel raced with: once its start answers', async () => {
    const api = fakeApi()
    const started = deferred<Awaited<ReturnType<typeof api.startUpload>>>()
    api.startUpload.mockReturnValueOnce(started.promise)
    const { upload } = setup({ api })
    const done = failure(upload.run())

    await upload.cancel()
    expect(api.abortUpload).not.toHaveBeenCalled()
    started.resolve({ fileId: FILE_ID, partSize: 4, parts: partUrls([1, 2, 3]), expiresAt: LATER })

    expect(await done).toMatchObject({ kind: 'cancelled' })
    expect(api.abortUpload).toHaveBeenCalledWith({ fileId: FILE_ID })
  })
})
