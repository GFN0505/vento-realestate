import { ORPCError } from '@orpc/client'
import { screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ParcelDetail } from '@vento/shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { todayInLagos } from '@/lib/format'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { documentFixture, parcelFixture, stageFixture, versionFixture } from './parcel.fixture'
import { StageSheet } from './stage-sheet'

const api = vi.hoisted(() => ({ update: vi.fn(), undo: vi.fn() }))
const net = vi.hoisted(() => ({ online: true }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
const latest = vi.hoisted(() => ({ parcel: null as unknown }))

vi.mock('sonner', () => ({ toast: toasts }))
// No router here: nothing navigates, so the leave guard never has anything to hold.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useBlocker: () => ({ status: 'idle' }),
}))
vi.mock('@/lib/orpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orpc')>()),
  client: { land: { stages: api } },
}))
vi.mock('@/lib/connection', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/connection')>()
  return {
    ...real,
    connection: { ...real.connection, isOnline: () => net.online, reportNetworkFailure: () => {} },
    useOnline: () => net.online,
  }
})
vi.mock('@/features/land/parcels-queries', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/land/parcels-queries')>()),
  // The stale catch-up reads the parcel as the server has it now.
  parcelQuery: (id: string) => ({ queryKey: ['parcel', id], queryFn: async () => latest.parcel }),
  refreshParcel: vi.fn(),
}))

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: query.includes('pointer: fine'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => {
  vi.clearAllMocks()
  net.online = true
})

function renderSheet(parcel: ParcelDetail = parcelFixture()) {
  const onClose = vi.fn()
  renderWithMe(
    <StageSheet open parcel={parcel} stageType="c_of_o" onStage={vi.fn()} onClose={onClose} />,
    testMe('land_legal'),
  )
  return { onClose }
}

const save = () => screen.getByRole('button', { name: 'Save update' })
const withCofO = () =>
  parcelFixture({
    documents: [documentFixture({ type: 'c_of_o', stageType: 'c_of_o', latest: versionFixture() })],
  })

describe('Update title stage', () => {
  it('pre-selects the likely next status, today and the issuer last used', () => {
    renderSheet()

    expect(screen.getByRole('radio', { name: 'Granted' })).toBeChecked()
    expect(screen.getByLabelText('Date')).toHaveValue(todayInLagos())
    expect(screen.getByLabelText('Issued by')).toHaveValue('Lands Bureau, Lagos')
  })

  it('offers Follow up by only for submitted and queried', async () => {
    renderSheet()
    expect(screen.queryByLabelText(/Follow up by/)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('radio', { name: 'Queried' }))

    expect(screen.getByLabelText(/Follow up by/)).toBeInTheDocument()
  })

  it('asks what the registry asked for before saving a query', async () => {
    renderSheet()
    await userEvent.click(screen.getByRole('radio', { name: 'Queried' }))

    await userEvent.click(save())

    expect(await screen.findByText('Say what the registry asked for.')).toBeInTheDocument()
    expect(screen.getByLabelText(/What happened/)).toHaveFocus()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('refuses Granted without the stage’s document', async () => {
    renderSheet()

    await userEvent.click(save())

    expect(await screen.findByText('Attach the C of O to mark it granted.')).toBeInTheDocument()
    expect(api.update).not.toHaveBeenCalled()
  })

  it('grants with the C of O already in the vault and offers Undo', async () => {
    const parcel = withCofO()
    const stage = parcel.stages[2]
    api.update.mockResolvedValue({
      ...parcel,
      stages: [stageFixture({ ...stage, status: 'granted', version: 4, canUndo: true })],
    })
    renderSheet(parcel)

    expect(screen.getByText('Uses C of O v1 from the vault.', { exact: false })).toBeInTheDocument()
    await userEvent.type(screen.getByLabelText('Reference'), 'CO/23/2026')
    await userEvent.click(save())

    expect(api.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: stage?.id,
        expectedVersion: 3,
        status: 'granted',
        on: todayInLagos(),
        reference: 'CO/23/2026',
        followUpOn: null,
        attachments: [],
      }),
    )
    expect(toasts.success).toHaveBeenCalledWith(
      'C of O granted',
      expect.objectContaining({ action: expect.objectContaining({ label: 'Undo' }) }),
    )
  })

  it('keeps what was typed when someone else updated the stage first', async () => {
    const parcel = withCofO()
    latest.parcel = parcel
    api.update.mockRejectedValue(
      new ORPCError('CONFLICT', {
        message:
          'Ngozi Adeyemi updated this stage a moment ago. Check the latest, then save again.',
        data: { reason: 'stale' },
      }),
    )
    renderSheet(parcel)
    await userEvent.type(screen.getByLabelText('Reference'), 'CO/23/2026')

    await userEvent.click(save())

    expect(
      await screen.findByText(
        'Ngozi Adeyemi updated this stage a moment ago. Check the latest, then save again.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByLabelText('Reference')).toHaveValue('CO/23/2026')
  })

  it('keeps Save off while offline, with the reason', () => {
    net.online = false
    renderSheet(withCofO())

    expect(save()).toBeDisabled()
    expect(
      screen.getByText("You're offline. Your changes are kept; save when you're back online."),
    ).toBeInTheDocument()
  })

  it('offers Resubmit for a rejected stage', () => {
    renderSheet(
      parcelFixture({
        stages: [stageFixture({ type: 'c_of_o', status: 'rejected', statusOn: '2026-11-01' })],
      }),
    )

    expect(screen.getByRole('radio', { name: 'Submitted' })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Resubmit' })).toBeInTheDocument()
  })
})
