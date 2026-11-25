import { useEffect, useRef } from 'react'
import { hasFinePointer } from '@/lib/pointer'

/** Focuses the form's first field once, with a mouse or trackpad only (see hasFinePointer). */
export function useDesktopAutofocus(focus: () => void) {
  const focusRef = useRef(focus)
  useEffect(() => {
    if (hasFinePointer()) focusRef.current()
  }, [])
}
