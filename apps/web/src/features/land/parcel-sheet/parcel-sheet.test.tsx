import { ORPCError } from '@orpc/client'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Entity } from '@vento/shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { parcelFixture } from '../detail/parcel.fixture'
import { ParcelSheet } from './parcel-sheet'

const COMPANY = '0193a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b'

const api = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn() }))
const net = vi.hoisted(() => ({ online: true }))
const latest = vi.hoisted(() => ({ parcel: null as unknown }))

// No router here: nothing navigates, so the leave guard never has anything to hold.
vi.mock('@tanstack/react-router', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@tanstack/react-router')>()),
  useBlocker: () => ({ status: 'idle' }),
}))

vi.mock('@/lib/orpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orpc')>()),
  client: { land: { parcels: api } },
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
  // No parcel of that name: the hint stays quiet.
  parcelNameTakenQuery: (name: string) => ({
    queryKey: ['nameTaken', name],
    queryFn: async () => null,
  }),
  // The stale catch-up reads the parcel as the server has it now.
  parcelQuery: (id: string) => ({ queryKey: ['parcel', id], queryFn: async () => latest.parcel }),
}))
vi.mock('@/features/entity/use-current-entity', () => ({
  useCurrentEntity: () => ({
    entity: null,
    locked: false,
    options: [{ id: COMPANY, name: 'Lekki Pearl Estates Ltd' } as Entity],
    select: vi.fn(),
  }),
}))

beforeAll(() => {
  // jsdom has no matchMedia: a desktop with a mouse.
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
  // The last state used is remembered on the device; each test starts without one.
  localStorage.clear()
})

function renderAdd(role: Parameters<typeof testMe>[0] = 'land_legal') {
  const onSaved = vi.fn()
  const view = renderWithMe(
    <ParcelSheet open parcel={null} onClose={vi.fn()} onSaved={onSaved} />,
    testMe(role),
  )
  return { onSaved, unmount: view.unmount }
}

async function fillEssentials() {
  await userEvent.type(screen.getByLabelText('Parcel name'), 'Plot 22, Folu Ayo')
  await userEvent.selectOptions(screen.getByLabelText('State'), 'Lagos')
  await userEvent.selectOptions(screen.getByLabelText('LGA'), 'Ibeju-Lekki')
  await userEvent.type(screen.getByLabelText('Size'), '4.2')
}

const saveButton = () => screen.getByRole('button', { name: 'Save parcel' })

describe('Add parcel', () => {
  it("adds a parcel under the only company with the state's usual stages", async () => {
    api.create.mockResolvedValue({ id: 'p', name: 'Plot 22, Folu Ayo' })
    const { onSaved } = renderAdd()
    await fillEssentials()

    await userEvent.click(saveButton())

    expect(api.create).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Plot 22, Folu Ayo',
        state: 'Lagos',
        lga: 'Ibeju-Lekki',
        size: { value: '4.2', unit: 'ha', plotSizeSqm: null },
        status: 'under_acquisition',
        entityId: COMPANY,
        documents: [],
      }),
    )
    expect(api.create.mock.calls[0]?.[0]).not.toHaveProperty('stages')
    expect(onSaved).toHaveBeenCalledWith({ id: 'p', name: 'Plot 22, Folu Ayo' })
  })

  it('shows the FCT’s stages with R of O instead of the excision gazette', async () => {
    renderAdd()

    await userEvent.selectOptions(screen.getByLabelText('State'), 'FCT')

    const stages = within(screen.getByRole('list', { name: 'Title stages' }))
    expect(stages.getByText('R of O')).toBeInTheDocument()
    expect(stages.queryByText('Excision gazette')).not.toBeInTheDocument()
  })

  it("puts the server's LGA refusal on the LGA field and keeps what was typed", async () => {
    api.create.mockRejectedValue(
      new ORPCError('BAD_REQUEST', {
        message: 'Pick an LGA in Lagos.',
        data: { reason: 'lga_not_in_state' },
      }),
    )
    renderAdd()
    await fillEssentials()

    await userEvent.click(saveButton())

    expect(await screen.findByText('Pick an LGA in Lagos.')).toBeInTheDocument()
    expect(screen.getByLabelText('Parcel name')).toHaveValue('Plot 22, Folu Ayo')
  })

  it('starts in the state this device last added a parcel in', async () => {
    api.create.mockResolvedValue({ id: 'p', name: 'Plot 22, Folu Ayo' })
    const first = renderAdd()
    await fillEssentials()
    await userEvent.click(saveButton())
    first.unmount()

    renderAdd()

    expect(screen.getByLabelText('State')).toHaveValue('Lagos')
  })

  it('says what is missing and saves nothing', async () => {
    renderAdd()

    await userEvent.click(saveButton())

    expect(
      await screen.findByText('Choose a state', { selector: '[data-slot=field-error]' }),
    ).toBeInTheDocument()
    expect(api.create).not.toHaveBeenCalled()
  })

  it('keeps Save off while offline, with the reason', async () => {
    net.online = false
    renderAdd()
    await fillEssentials()

    expect(saveButton()).toBeDisabled()
    expect(
      screen.getByText("You're offline. Your changes are kept; save when you're back online."),
    ).toBeInTheDocument()
  })

  it('hides the cost and seller from people who may not see them', async () => {
    renderAdd('project_manager')

    await userEvent.click(screen.getByRole('button', { name: 'More options' }))

    expect(screen.queryByLabelText('Acquisition date')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Acquisition cost')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Bought from')).not.toBeInTheDocument()
  })
})

describe('Edit parcel', () => {
  it('after someone else saved first, keeps the typing and checks the next Save against theirs', async () => {
    const parcel = parcelFixture({ version: 4 })
    latest.parcel = { ...parcel, version: 5 }
    api.update
      .mockRejectedValueOnce(
        new ORPCError('CONFLICT', {
          message: 'Ngozi Adeyemi saved this parcel first. Check it and save again.',
          data: { reason: 'stale' },
        }),
      )
      .mockResolvedValueOnce({ ...parcel, name: 'Plot 22A, Folu Ayo', version: 6 })
    renderWithMe(<ParcelSheet open parcel={parcel} onClose={vi.fn()} />, testMe('land_legal'))
    const name = screen.getByLabelText('Parcel name')
    await userEvent.clear(name)
    await userEvent.type(name, 'Plot 22A, Folu Ayo')

    await userEvent.click(saveButton())
    expect(await screen.findByText(/saved this parcel first/)).toBeInTheDocument()
    expect(name).toHaveValue('Plot 22A, Folu Ayo')
    await userEvent.click(saveButton())

    expect(api.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedVersion: 5, name: 'Plot 22A, Folu Ayo' }),
    )
  })
})
