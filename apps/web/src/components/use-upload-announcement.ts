import { useEffect, useRef, useState } from 'react'
import type { UploadItem, UploadStatus } from '@/lib/upload/upload-item'

export const UPLOAD_PAUSED = "Upload paused. It will continue when you're back online."

/** One polite line per change of state (never every percent), for screen readers. */
export function useUploadAnnouncement(items: readonly UploadItem[]): string {
  const [text, setText] = useState('')
  const seen = useRef(new Map<string, UploadStatus>())
  useEffect(() => {
    const lines = new Set<string>()
    for (const item of items) {
      const before = seen.current.get(item.key)
      if (before === item.status) continue
      if (item.status === 'done') lines.add(`${item.name} uploaded.`)
      else if (item.status === 'failed')
        lines.add(`${item.name} didn't upload. ${item.error ?? ''}`)
      else if (item.status === 'paused') lines.add(UPLOAD_PAUSED)
      else if (before === undefined) lines.add(`Uploading ${item.name}.`)
    }
    seen.current = new Map(items.map((item) => [item.key, item.status]))
    if (lines.size > 0) setText([...lines].join(' ').trim())
  }, [items])
  return text
}
