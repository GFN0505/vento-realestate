import { ORPCError } from '@orpc/client'
import { describe, expect, it } from 'vitest'
import {
  FILE_ID,
  failure,
  fakeApi,
  fakeClock,
  fakeNetwork,
  fakeTransport,
  partUrl,
  setup,
} from './upload.test-helpers'

describe('MultipartUpload', () => {
  it('sends every part and completes with their ETags in order', async () => {
    const { upload, api, progress } = setup()

    await expect(upload.run()).resolves.toEqual({
      fileId: FILE_ID,
      contentType: 'application/pdf',
      sizeBytes: 10,
    })
    expect(api.startUpload).toHaveBeenCalledWith({
      purpose: 'title_document',
      name: 'Survey plan.pdf',
      size: 10,
      type: 'application/pdf',
    })
    expect(api.completeUpload.mock.calls[0]?.[0]).toEqual({
      fileId: FILE_ID,
      parts: [1, 2, 3].map((partNumber) => ({ partNumber, etag: `"etag-part-${partNumber}"` })),
    })
    expect(progress.at(-1)).toBe(10)
  })

  it('moves the progress within a part as its bytes go up', async () => {
    const transport = fakeTransport((_, call, request) => {
      if (call === 1) for (const sent of [1, 3]) request.onProgress(sent)
      return undefined
    })
    const { upload, progress } = setup({ transport, concurrency: 1 })
    await upload.run()

    expect(progress.slice(0, 3)).toEqual([1, 3, 4])
  })

  it('refuses a file of another format before sending anything', async () => {
    const file = new File(['PK'], 'plan.docx', { type: 'application/msword' })
    const { upload, api } = setup({ file })

    const error = await failure(upload.run())

    expect(error).toMatchObject({
      kind: 'rejected',
      retryable: false,
      message: 'Upload a PDF or a photo (JPG, PNG or HEIC).',
    })
    expect(api.startUpload).not.toHaveBeenCalled()
  })

  it('refuses an empty file with the shared copy', async () => {
    const file = new File([], 'C of O.pdf', { type: 'application/pdf' })
    const error = await failure(setup({ file }).upload.run())

    expect(error).toMatchObject({ kind: 'rejected', message: 'This file is empty.' })
  })

  it('sends at most three parts at once', async () => {
    let inFlight = 0
    let most = 0
    const transport = fakeTransport(async () => {
      most = Math.max(most, ++inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return undefined
    })
    const file = new File(['%PDF-'.padEnd(20, 'x')], 'Deed.pdf', { type: 'application/pdf' })
    const api = fakeApi({ count: 5, sizeBytes: 20 })
    await setup({ file, transport, api }).upload.run()

    expect(transport).toHaveBeenCalledTimes(5)
    expect(most).toBe(3)
  })

  it('pauses while offline and carries on when the connection is back', async () => {
    const network = fakeNetwork()
    let dropped = false
    const transport = fakeTransport((u) => {
      if (!u.includes('part-2') || dropped) return undefined
      dropped = true
      network.set(false)
      return new TypeError('The part upload failed')
    })
    const { upload, phases } = setup({ transport, network, concurrency: 1 })
    const done = upload.run()
    await expect.poll(() => phases.at(-1)).toBe('paused')

    network.set(true)

    await expect(done).resolves.toMatchObject({ fileId: FILE_ID })
    expect(phases).toEqual(['checking', 'uploading', 'paused', 'uploading', 'checking'])
  })

  it('signs a refused part link again, and only that one', async () => {
    const transport = fakeTransport((u) => (u === partUrl(2) ? { status: 403 } : undefined))
    const { upload, api } = setup({ transport, concurrency: 1 })
    await upload.run()

    expect(api.signParts).toHaveBeenCalledWith(
      { fileId: FILE_ID, partNumbers: [2] },
      expect.anything(),
    )
    expect(transport.mock.calls.map(([r]) => r.url)).toContain(partUrl(2, 1))
  })

  it('signs fresh links before the old ones expire', async () => {
    const clock = fakeClock()
    const transport = fakeTransport((u) => {
      if (u === partUrl(1)) clock.advance(14.5 * 60_000)
      return undefined
    })
    const { upload, api } = setup({ transport, clock, concurrency: 1 })
    await upload.run()

    expect(api.signParts).toHaveBeenCalledWith(
      { fileId: FILE_ID, partNumbers: [2, 3] },
      expect.anything(),
    )
  })

  it('sends every part again when the server says the upload is incomplete', async () => {
    const api = fakeApi()
    api.completeUpload.mockRejectedValueOnce(
      new ORPCError('BAD_REQUEST', {
        message: "This upload didn't finish. Try again.",
        data: { reason: 'upload_incomplete' },
      }),
    )
    const transport = fakeTransport()
    await setup({ api, transport }).upload.run()

    expect(transport).toHaveBeenCalledTimes(6)
    expect(api.completeUpload).toHaveBeenCalledTimes(2)
  })

  it('reports a file the server refuses on its content, with no retry', async () => {
    const api = fakeApi()
    api.completeUpload.mockRejectedValue(
      new ORPCError('BAD_REQUEST', {
        message: 'Upload a PDF or a photo (JPG, PNG or HEIC).',
        data: { reason: 'file_type' },
      }),
    )
    const error = await failure(setup({ api }).upload.run())

    expect(error).toMatchObject({ kind: 'rejected', retryable: false })
  })

  it('waits as long as the server asks when rate limited', async () => {
    const clock = fakeClock()
    const api = fakeApi()
    api.startUpload.mockRejectedValueOnce(
      new ORPCError('TOO_MANY_REQUESTS', { data: { retryAfterSeconds: 7 } }),
    )
    await setup({ api, clock }).upload.run()

    expect(clock.delays).toEqual([7000])
    expect(api.startUpload).toHaveBeenCalledTimes(2)
  })

  it('drops the old upload and starts afresh when a resend still leaves parts missing', async () => {
    const api = fakeApi()
    const incomplete = new ORPCError('BAD_REQUEST', { data: { reason: 'upload_incomplete' } })
    api.completeUpload.mockRejectedValueOnce(incomplete).mockRejectedValueOnce(incomplete)
    await setup({ api }).upload.run()

    expect(api.startUpload).toHaveBeenCalledTimes(2)
    expect(api.abortUpload).toHaveBeenCalledWith({ fileId: FILE_ID })
  })
})
