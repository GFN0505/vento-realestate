import { act, renderHook } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import {
  type FakeApi,
  FILE_ID,
  fakeApi,
  fakeClock,
  fakeNetwork,
  fakeTransport,
  hang,
  LATER,
} from './upload.test-helpers'
import { type FileUploadOptions, useFileUpload } from './use-file-upload'

const SECOND_ID = '01900000-0000-7000-8000-0000000000f2'
const pdf = (name: string) => new File(['%PDF-1.7'], name, { type: 'application/pdf' })
const onePart = (fileId: string) => ({
  fileId,
  partSize: 5 * 1024 * 1024,
  parts: [{ partNumber: 1, url: 'https://bucket.test/part-1' }],
  expiresAt: LATER,
})

function mount(api: FakeApi, transport = fakeTransport()) {
  const options = (a: FakeApi): FileUploadOptions => ({
    purpose: 'title_document',
    api: a,
    transport,
    clock: fakeClock(),
    network: fakeNetwork(),
    random: () => 0.5,
  })
  return renderHook((a: FakeApi) => useFileUpload(options(a)), { initialProps: api })
}

describe('useFileUpload', () => {
  it('reset stops uploads still going and drops them, but leaves finished ones', async () => {
    const api = fakeApi()
    api.startUpload
      .mockResolvedValueOnce(onePart(FILE_ID))
      .mockResolvedValueOnce(onePart(SECOND_ID))
    const transport = fakeTransport((_, call, request) => (call === 2 ? hang(request) : undefined))
    const { result } = mount(api, transport)
    act(() => result.current.add([pdf('Deed.pdf')]))
    await expect.poll(() => result.current.done.length).toBe(1)
    act(() => result.current.add([pdf('Survey plan.pdf')]))
    await expect.poll(() => transport.mock.calls.length).toBe(2)

    act(() => result.current.reset())

    expect(result.current.items).toEqual([])
    await expect.poll(() => api.abortUpload.mock.calls).toEqual([[{ fileId: SECOND_ID }]])
  })

  it('starts new files with the options of the latest render', async () => {
    const first = fakeApi()
    const latest = fakeApi()
    const { result, rerender } = mount(first)

    rerender(latest)
    act(() => result.current.add([pdf('Deed.pdf')]))

    await expect.poll(() => result.current.done.length).toBe(1)
    expect(first.startUpload).not.toHaveBeenCalled()
    expect(latest.startUpload).toHaveBeenCalledTimes(1)
  })
})
