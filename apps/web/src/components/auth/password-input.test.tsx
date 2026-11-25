import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vitest'
import { PasswordInput } from './password-input'

function setup() {
  render(
    <>
      <label htmlFor="pw">Password</label>
      <PasswordInput id="pw" />
      <button type="button">Next</button>
    </>,
  )
  return screen.getByLabelText('Password')
}

describe('PasswordInput caps lock hint', () => {
  it('says Caps Lock is on while typing with it on', async () => {
    const user = userEvent.setup()
    await user.click(setup())

    await user.keyboard('{CapsLock}A')

    expect(screen.getByText('Caps Lock is on')).toBeInTheDocument()
  })

  it('hides the hint when Caps Lock goes off', async () => {
    const user = userEvent.setup()
    await user.click(setup())

    await user.keyboard('{CapsLock}A{CapsLock}a')

    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument()
  })

  it('hides the hint when leaving the field', async () => {
    const user = userEvent.setup()
    await user.click(setup())
    await user.keyboard('{CapsLock}A')

    await user.tab()

    expect(screen.queryByText('Caps Lock is on')).not.toBeInTheDocument()
  })
})
