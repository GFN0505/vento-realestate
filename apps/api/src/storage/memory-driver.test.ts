import { FILE_PART_SIZE } from '@vento/shared'
import { describe, expect, it } from 'vitest'
import { createMemoryStorage } from './memory-driver'

// The memory driver stands in for the bucket in service tests, so it must fail where S3 and R2
// do (decision 0025).

const KEY = 'incoming/org/o/f'

describe('memory storage', () => {
  it('signs a part link for an upload that is gone, as S3 signs offline; the PUT then fails', async () => {
    const storage = createMemoryStorage()
    const { uploadId } = await storage.createMultipartUpload(KEY, 'application/pdf')
    await storage.abortMultipartUpload(KEY, uploadId)
    await expect(storage.signUploadPart(KEY, uploadId, 1, 10, 900)).resolves.toContain(
      'partNumber=1',
    )
    expect(() => storage.uploadPart(KEY, uploadId, 1, new Uint8Array(10))).toThrow(
      expect.objectContaining({ kind: 'no_such_upload' }),
    )
  })

  it('refuses parts before the last that differ in size', async () => {
    const storage = createMemoryStorage()
    const { uploadId } = await storage.createMultipartUpload(KEY, 'application/pdf')
    const sizes = [FILE_PART_SIZE + 1, FILE_PART_SIZE, 10]
    const parts = sizes.map((size, i) => ({
      partNumber: i + 1,
      etag: storage.uploadPart(KEY, uploadId, i + 1, new Uint8Array(size)),
    }))
    await expect(storage.completeMultipartUpload(KEY, uploadId, parts)).rejects.toMatchObject({
      kind: 'invalid_parts',
    })
  })

  it('never deletes under kept/', async () => {
    const storage = createMemoryStorage()
    await storage.putObject('kept/org/o/f', new Uint8Array(1), 'application/pdf')
    await expect(storage.deleteObject('kept/org/o/f')).rejects.toThrow(/incoming/)
    expect(storage.hasObject('kept/org/o/f')).toBe(true)
  })
})
