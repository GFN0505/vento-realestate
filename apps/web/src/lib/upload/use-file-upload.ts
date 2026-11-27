import type { FilePurpose } from '@vento/shared'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { connection } from '@/lib/connection'
import { client } from '@/lib/orpc'
import { MultipartUpload } from './multipart-upload'
import { UPLOAD_FAILED, UploadError } from './upload-error'
import { newItem, PENDING, sameFile, type UploadItem } from './upload-item'
import type { MultipartUploadOptions } from './upload-types'

export type FileUploadOptions = Pick<
  MultipartUploadOptions,
  'transport' | 'clock' | 'network' | 'random' | 'concurrency'
> & {
  purpose: FilePurpose
  api?: MultipartUploadOptions['api']
}

export type AddOptions = {
  guessType?: (name: string) => string | null
  /**
   * For a one-file field: the first file takes the current one's place once it has uploaded.
   * Until then the current file stays, so a pick that fails loses nothing.
   */
  replace?: boolean
}

export type FileUploads = {
  purpose: FilePurpose
  items: UploadItem[]
  add(files: Iterable<File>, options?: AddOptions): void
  retry(key: string): void
  /** Takes the file off the list and drops it on the server, finished or not. */
  remove(key: string): void
  /**
   * Forgets every file (after a save attached the finished ones, which stay on the server).
   * Files still going up are stopped and dropped.
   */
  reset(): void
  /** Checking, uploading or paused: a save waits for these. */
  pendingCount: number
  failedCount: number
  allSettled: boolean
  /** Finished uploads, in the order they were added. */
  done: UploadItem[]
}

/** Finished uploads are left alone: a save may be attaching them right now. */
function stopUnfinished(map: Map<string, MultipartUpload>, finished: Set<string>) {
  for (const [key, upload] of map) if (!finished.has(key)) void upload.cancel()
}

export function useFileUpload(options: FileUploadOptions): FileUploads {
  const [items, setItems] = useState<UploadItem[]>([])
  const uploads = useRef(new Map<string, MultipartUpload>())
  const latest = useRef(options)
  useLayoutEffect(() => {
    latest.current = options
  })
  const counter = useRef(0)
  const done = useRef(new Set<string>())
  /** Keys added with `replace`, until they finish. */
  const replacing = useRef(new Set<string>())
  // What `add` compares against for duplicates; `add` and `remove` also keep it current at once.
  const itemsRef = useRef(items)
  useLayoutEffect(() => {
    itemsRef.current = items
  }, [items])

  const patch = useCallback((key: string, change: Partial<UploadItem>) => {
    setItems((list) => list.map((item) => (item.key === key ? { ...item, ...change } : item)))
  }, [])

  const remove = useCallback((key: string) => {
    void uploads.current.get(key)?.cancel()
    uploads.current.delete(key)
    done.current.delete(key)
    replacing.current.delete(key)
    itemsRef.current = itemsRef.current.filter((item) => item.key !== key)
    setItems((list) => list.filter((item) => item.key !== key))
  }, [])

  const start = useCallback(
    (key: string) => {
      const upload = uploads.current.get(key)
      if (!upload) return
      upload.run().then(
        (result) => {
          if (uploads.current.get(key) !== upload) return
          done.current.add(key)
          patch(key, { status: 'done', fileId: result.fileId, error: null })
          if (!replacing.current.delete(key)) return
          for (const item of itemsRef.current) if (item.key !== key) remove(item.key)
        },
        (error: unknown) => {
          if (uploads.current.get(key) !== upload) return
          const failure = error instanceof UploadError ? error : null
          if (failure?.kind === 'cancelled') return
          patch(key, {
            status: 'failed',
            error: failure?.message || UPLOAD_FAILED,
            canRetry: failure?.retryable ?? true,
          })
        },
      )
    },
    [patch, remove],
  )

  const add = useCallback(
    (files: Iterable<File>, addOptions?: AddOptions) => {
      const { purpose, api = client.files, network = connection, ...rest } = latest.current
      const replace = addOptions?.replace ?? false
      const fresh: UploadItem[] = []
      for (const file of replace ? [...files].slice(0, 1) : files) {
        // Dropping the same file twice is a slip, not a second document.
        const known = [...itemsRef.current, ...fresh].some(
          (item) => item.status !== 'failed' && sameFile(item.file, file),
        )
        if (known) continue
        counter.current += 1
        fresh.push(
          newItem(`upload-${counter.current}`, file, addOptions?.guessType?.(file.name) ?? null),
        )
      }
      if (fresh.length === 0) return
      if (replace) {
        // Only a finished file is worth keeping until the new one is in.
        for (const item of itemsRef.current) if (item.status !== 'done') remove(item.key)
        for (const item of fresh) replacing.current.add(item.key)
      }
      itemsRef.current = [...itemsRef.current, ...fresh]
      setItems((list) => [...list, ...fresh])
      for (const item of fresh) {
        const upload = new MultipartUpload(item.file, {
          ...rest,
          purpose,
          api,
          network,
          onPhase: (status) => patch(item.key, { status }),
          onProgress: (loaded) => patch(item.key, { loaded }),
        })
        uploads.current.set(item.key, upload)
        start(item.key)
      }
    },
    [patch, remove, start],
  )

  const retry = useCallback(
    (key: string) => {
      patch(key, { status: 'checking', error: null })
      start(key)
    },
    [patch, start],
  )

  const reset = useCallback(() => {
    stopUnfinished(uploads.current, done.current)
    uploads.current.clear()
    done.current.clear()
    replacing.current.clear()
    itemsRef.current = []
    setItems([])
  }, [])

  // Leaving the form stops files still going up; the daily sweep removes finished ones nobody used.
  useEffect(() => {
    const map = uploads.current
    const finished = done.current
    return () => {
      stopUnfinished(map, finished)
      map.clear()
    }
  }, [])

  return useMemo(() => {
    const pendingCount = items.filter((i) => PENDING.includes(i.status)).length
    return {
      purpose: options.purpose,
      items,
      add,
      retry,
      remove,
      reset,
      pendingCount,
      failedCount: items.filter((i) => i.status === 'failed').length,
      allSettled: pendingCount === 0,
      done: items.filter((i) => i.status === 'done'),
    }
  }, [items, add, retry, remove, reset, options.purpose])
}
