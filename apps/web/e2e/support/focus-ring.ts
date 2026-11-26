import { expect, type Locator } from '@playwright/test'

/**
 * The element shows a real focus ring: focus it by keyboard, then read the computed outline.
 * Guards the Tailwind v4 trap where `outline-hidden` + `outline-2` computes to no outline.
 */
export async function expectVisibleFocusRing(target: Locator) {
  await target.focus()
  const outline = await target.evaluate((el) => {
    const style = getComputedStyle(el)
    return { style: style.outlineStyle, width: Number.parseFloat(style.outlineWidth) }
  })
  expect(outline.style).not.toBe('none')
  expect(outline.width).toBeGreaterThanOrEqual(2)
}
