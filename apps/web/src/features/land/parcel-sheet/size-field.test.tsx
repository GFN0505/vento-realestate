import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useForm } from 'react-hook-form'
import { describe, expect, it } from 'vitest'
import { newParcelValues, type ParcelFormValues } from './parcel-values'
import { SizeField, sizeSummary } from './size-field'

describe('the worked-out size', () => {
  it('shows plots in m² and hectares, 600 m² a plot unless given', () => {
    expect(sizeSummary({ value: '12', unit: 'plots' })).toBe('= 7,200 m² (0.72 ha)')
    expect(sizeSummary({ value: '12', unit: 'plots', plotSizeSqm: '648' })).toBe(
      '= 7,776 m² (0.78 ha)',
    )
  })

  it('shows hectares in m², and m² in hectares', () => {
    expect(sizeSummary({ value: '4.2', unit: 'ha' })).toBe('= 42,000 m²')
    expect(sizeSummary({ value: '1200', unit: 'sqm' })).toBe('= 0.12 ha')
  })

  it('says nothing until the size is a number above zero', () => {
    expect(sizeSummary({ value: '', unit: 'ha' })).toBeNull()
    expect(sizeSummary({ value: '4,2', unit: 'ha' })).toBeNull()
    expect(sizeSummary({ value: '0', unit: 'ha' })).toBeNull()
  })
})

function Harness() {
  const form = useForm<ParcelFormValues>({
    defaultValues: newParcelValues({ entityId: 'e', state: 'Lagos' }),
  })
  return <SizeField form={form} />
}

describe('SizeField', () => {
  it('asks for the plot size only when the size is in plots', async () => {
    render(<Harness />)
    expect(screen.queryByLabelText('Plot size')).not.toBeInTheDocument()

    await userEvent.selectOptions(screen.getByLabelText('Size unit'), 'plots')

    expect(screen.getByLabelText('Plot size')).toBeInTheDocument()
  })

  it('works out the size as it is typed', async () => {
    render(<Harness />)
    await userEvent.selectOptions(screen.getByLabelText('Size unit'), 'plots')

    await userEvent.type(screen.getByLabelText('Size'), '12')

    expect(screen.getByText('= 7,200 m² (0.72 ha)')).toBeInTheDocument()
  })
})
