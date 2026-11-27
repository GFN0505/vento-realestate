import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { focusFirstField, rememberOpener, useReturnFocus } from './focus'

function openOn(panel: HTMLElement) {
  const event = new CustomEvent('focusScope.autoFocusOnMount', { cancelable: true })
  panel.addEventListener('focusScope.autoFocusOnMount', focusFirstField, { once: true })
  panel.dispatchEvent(event)
  return event
}

describe('where a change opens', () => {
  it('opens on the chosen option, never on Cancel', async () => {
    render(
      <div data-testid="panel" tabIndex={-1}>
        <RadioGroup defaultValue="growth">
          <RadioGroupItem value="starter" aria-label="Starter" />
          <RadioGroupItem value="growth" aria-label="Growth" />
        </RadioGroup>
        <button type="button">Cancel</button>
      </div>,
    )
    const event = openOn(screen.getByTestId('panel'))
    expect(event.defaultPrevented).toBe(true)
    await waitFor(() => expect(screen.getByRole('radio', { name: 'Growth' })).toHaveFocus())
  })

  it('falls back to the panel itself when there is no field', async () => {
    render(
      <div data-testid="panel" tabIndex={-1}>
        <button type="button">Cancel</button>
      </div>,
    )
    openOn(screen.getByTestId('panel'))
    await waitFor(() => expect(screen.getByTestId('panel')).toHaveFocus())
  })
})

function Sheet() {
  useReturnFocus()
  return <p>Sheet</p>
}

describe('where focus goes when a change closes', () => {
  it('returns to the button that opened it', async () => {
    const { rerender } = render(
      <button type="button" data-testid="opener">
        Change plan
      </button>,
    )
    screen.getByTestId('opener').focus()
    rememberOpener()
    rerender(
      <>
        <button type="button" data-testid="opener">
          Change plan
        </button>
        <Sheet />
      </>,
    )
    ;(document.activeElement as HTMLElement).blur()
    rerender(
      <button type="button" data-testid="opener">
        Change plan
      </button>,
    )
    await waitFor(() => expect(screen.getByTestId('opener')).toHaveFocus())
  })
})
