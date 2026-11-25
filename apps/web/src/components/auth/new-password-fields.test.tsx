import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it, vi } from 'vitest'
import { Button } from '@/components/ui/button'
import { NewPasswordFields } from './new-password-fields'

function Harness({ onValid }: { onValid: (values: { password: string }) => void }) {
  const form = useForm({ defaultValues: { password: '', confirm: '' } })
  return (
    <form onSubmit={form.handleSubmit(onValid)} noValidate>
      <NewPasswordFields form={form} label="Password" />
      <Button type="submit">Create account</Button>
    </form>
  )
}

describe('NewPasswordFields', () => {
  it('hides the rules until the person starts typing, then ticks them live', async () => {
    render(<Harness onValid={vi.fn()} />)
    expect(screen.queryByText('At least 8 characters')).not.toBeInTheDocument()

    await userEvent.type(screen.getByLabelText('Password'), 'Vento')

    expect(screen.getByText('An uppercase letter').closest('li')).toHaveAttribute(
      'data-state',
      'met',
    )
    expect(screen.getByLabelText('Password')).toHaveAccessibleDescription(/At least 8 characters/)
  })

  it('shows the rules in rose when submitted empty', async () => {
    render(<Harness onValid={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText('At least 8 characters')).toBeInTheDocument()
    expect(screen.getAllByText('Not met:')).toHaveLength(5)
  })

  it('says the passwords do not match and does not submit', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.type(screen.getByLabelText('Password'), 'Vento-Test-2026!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Vento-Test-2027!')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument()
    expect(onValid).not.toHaveBeenCalled()
  })

  it('checks the confirmation when leaving the field', async () => {
    render(<Harness onValid={vi.fn()} />)

    await userEvent.type(screen.getByLabelText('Password'), 'Vento-Test-2026!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Vento')
    await userEvent.tab()

    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument()
  })

  it('submits when both match and every rule is met', async () => {
    const onValid = vi.fn()
    render(<Harness onValid={onValid} />)

    await userEvent.type(screen.getByLabelText('Password'), 'Vento-Test-2026!')
    await userEvent.type(screen.getByLabelText('Confirm password'), 'Vento-Test-2026!')
    await userEvent.click(screen.getByRole('button', { name: 'Create account' }))

    expect(onValid).toHaveBeenCalledWith(
      expect.objectContaining({ password: 'Vento-Test-2026!' }),
      expect.anything(),
    )
  })
})
