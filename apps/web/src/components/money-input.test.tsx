import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it } from 'vitest'
import { cleanMoneyText, groupMoneyText, MoneyInput } from './money-input'

describe('money text', () => {
  it('keeps digits and one point, two decimals at most, without rounding', () => {
    expect(cleanMoneyText('₦1,250,000.567')).toBe('1250000.56')
    expect(cleanMoneyText('1.2.3')).toBe('1.23')
    expect(cleanMoneyText('.5')).toBe('0.5')
    expect(cleanMoneyText('007')).toBe('7')
    expect(cleanMoneyText('')).toBe('')
  })

  it('groups thousands as typed', () => {
    expect(groupMoneyText('840000000')).toBe('840,000,000')
    expect(groupMoneyText('1250000.5')).toBe('1,250,000.5')
    expect(groupMoneyText('999')).toBe('999')
  })
})

function Harness() {
  const [value, setValue] = useState('')
  return (
    <>
      <label htmlFor="cost">Acquisition cost</label>
      <MoneyInput id="cost" value={value} onChange={setValue} />
      <output>{value}</output>
    </>
  )
}

describe('MoneyInput', () => {
  it('shows commas while handing back a plain decimal string', async () => {
    render(<Harness />)
    const box = screen.getByLabelText('Acquisition cost')

    await userEvent.type(box, '840000000.5')

    expect(box).toHaveValue('840,000,000.5')
    expect(screen.getByRole('status')).toHaveTextContent('840000000.5')
  })

  it('takes a pasted amount with the naira sign and commas', async () => {
    render(<Harness />)
    const box = screen.getByLabelText('Acquisition cost')
    await userEvent.click(box)

    await userEvent.paste('₦1,250,000.00')

    expect(screen.getByRole('status')).toHaveTextContent('1250000.00')
  })

  it('refuses a second decimal point instead of merging it', async () => {
    render(<Harness />)
    const box = screen.getByLabelText('Acquisition cost')

    await userEvent.type(box, '1.5.')

    expect(box).toHaveValue('1.5')
    expect(screen.getByRole('status')).toHaveTextContent('1.5')
  })

  it('tells screen readers the amount is in naira', () => {
    render(<Harness />)

    expect(screen.getByLabelText('Acquisition cost')).toHaveAccessibleDescription('in naira')
  })
})
