import '@testing-library/jest-dom/vitest'
import { cleanup, configure } from '@testing-library/react'
import { afterEach } from 'vitest'

// jsdom has no layout. input-otp probes for password-manager badges with elementFromPoint.
if (!document.elementFromPoint) document.elementFromPoint = () => null

// Radix radios and checkboxes measure themselves; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// jsdom has no layout, so no scrolling: forms scroll their first error into view on submit.
Element.prototype.scrollIntoView ??= () => {}

// CI runners are about 4x slower than a laptop: a form's submit → refusal → message chain can
// take over the 1 s default there, so findBy/waitFor wait longer before failing.
configure({ asyncUtilTimeout: 5000 })

afterEach(() => {
  cleanup()
})
