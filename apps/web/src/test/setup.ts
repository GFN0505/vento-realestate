import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no layout. input-otp probes for password-manager badges with elementFromPoint.
if (!document.elementFromPoint) document.elementFromPoint = () => null

afterEach(() => {
  cleanup()
})
