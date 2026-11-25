import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { CodeInput } from './code-input'

function Harness({ invalid = false, onComplete = () => {} }) {
  const [value, setValue] = useState('')
  return <CodeInput value={value} onChange={setValue} onComplete={onComplete} invalid={invalid} />
}

describe('CodeInput', () => {
  it('fills all six boxes from a pasted code with spaces and calls onComplete', async () => {
    const user = userEvent.setup()
    const onComplete = vi.fn()
    render(<Harness onComplete={onComplete} />)

    await user.click(screen.getByRole('textbox', { name: '6-digit code' }))
    await user.paste('482 135')

    expect(screen.getByRole('textbox', { name: '6-digit code' })).toHaveValue('482135')
    expect(onComplete).toHaveBeenCalledWith('482135')
  })

  it('ignores letters typed between digits', async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.type(screen.getByRole('textbox', { name: '6-digit code' }), '4a8')

    expect(screen.getByRole('textbox', { name: '6-digit code' })).toHaveValue('48')
  })

  it('marks the field invalid in the error state', () => {
    render(<Harness invalid />)

    expect(screen.getByRole('textbox', { name: '6-digit code' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
  })

  it('offers the code from SMS or email to the keyboard', () => {
    render(<Harness />)

    const input = screen.getByRole('textbox', { name: '6-digit code' })
    expect(input).toHaveAttribute('autocomplete', 'one-time-code')
    expect(input).toHaveAttribute('inputmode', 'numeric')
  })
})
