import { createServer, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { afterEach, describe, expect, it } from 'vitest'
import { createS3Storage } from './s3-driver'

// The S3 driver against a fake endpoint, for answers a real bucket won't give on demand.

let server: Server | undefined

afterEach(async () => {
  server?.closeAllConnections()
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()))
  server = undefined
})

async function fakeBucket(handler: Parameters<typeof createServer>[1]): Promise<string> {
  server = createServer(handler)
  await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve))
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`
}

const storageAt = (endpoint: string, requestTimeout = 30_000) =>
  createS3Storage({
    endpoint,
    region: 'us-east-1',
    bucket: 'b',
    accessKeyId: 'k',
    secretAccessKey: 's',
    forcePathStyle: true,
    timeouts: { connectionTimeout: 1_000, requestTimeout },
  })

describe('S3 driver', () => {
  it('throws when HEAD answers without a size, instead of reading it as empty', async () => {
    const endpoint = await fakeBucket((_req, res) => {
      res.writeHead(200, { etag: '"x"' })
      res.end()
    })
    await expect(storageAt(endpoint).head('incoming/org/o/f')).rejects.toThrow(/no size/)
  })

  it('never deletes under kept/, before any request', async () => {
    await expect(storageAt('http://127.0.0.1:9').deleteObject('kept/org/o/f')).rejects.toThrow(
      /incoming/,
    )
  })

  it('gives up on a bucket that never answers', async () => {
    const endpoint = await fakeBucket(() => {
      // Accept the request and never answer.
    })
    const started = Date.now()
    await expect(storageAt(endpoint, 300).head('incoming/org/o/f')).rejects.toThrow()
    expect(Date.now() - started).toBeLessThan(5_000)
  })
})
