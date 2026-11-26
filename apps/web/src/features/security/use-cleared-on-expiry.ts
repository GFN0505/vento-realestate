import { useEffect, useRef, useState } from 'react'
import { useSessionExpired } from '@/lib/session-expired'

/**
 * Passwords never outlive a session: when "Session expired" appears over an open dialog, its
 * password fields are cleared (spec), and the dialog says so once the person is back.
 */
export function useClearedOnExpiry(clear: () => void): boolean {
  const expired = useSessionExpired()
  const [cleared, setCleared] = useState(false)
  const clearRef = useRef(clear)
  clearRef.current = clear
  useEffect(() => {
    if (!expired) return
    clearRef.current()
    setCleared(true)
  }, [expired])
  return cleared
}

export const CLEARED_NOTE = 'For your security, we cleared the password fields. Enter them again.'
