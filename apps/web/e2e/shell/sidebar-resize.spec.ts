import { expect, test } from '@playwright/test'
import { createMemberFixture } from '../support/fixtures'
import { signInWithTotp } from '../support/sign-in'

test('dragging the sidebar edge resizes it, and the width is remembered after a reload', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'The sidebar is resizable on desktop only')
  await signInWithTotp(page, createMemberFixture())

  const sidebar = page.getByRole('navigation', { name: 'Main' })
  const handle = page.getByRole('separator', { name: 'Resize sidebar' })
  await expect(handle).toHaveAttribute('aria-valuenow', '256')
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(256)

  const box = await handle.boundingBox()
  if (!box) throw new Error('The resize handle has no box')
  await page.mouse.move(box.x + box.width / 2, box.y + 200)
  await page.mouse.down()
  await page.mouse.move(300, box.y + 220, { steps: 8 })
  await page.mouse.up()

  await expect(handle).toHaveAttribute('aria-valuenow', '300')
  await page.reload()
  await expect(page.getByRole('separator', { name: 'Resize sidebar' })).toHaveAttribute(
    'aria-valuenow',
    '300',
  )
  await expect.poll(async () => (await sidebar.boundingBox())?.width).toBe(300)
})
