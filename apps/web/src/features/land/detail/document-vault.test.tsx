import { ORPCError } from '@orpc/client'
import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ParcelDetail } from '@vento/shared'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { documentVersionsQuery } from '@/features/land/parcels-queries'
import { testMe } from '@/test/me'
import { renderWithMe } from '@/test/render-with-me'
import { DocumentVault } from './document-vault'
import { documentFixture, parcelFixture, versionFixture } from './parcel.fixture'
import { parcelAbilities } from './parcel-abilities'
import { useDocumentLink } from './use-document-link'

const api = vi.hoisted(() => ({ link: vi.fn() }))
const toasts = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))

vi.mock('sonner', () => ({ toast: toasts }))
vi.mock('@/lib/orpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/orpc')>()),
  client: { land: { documents: api } },
}))

beforeAll(() => {
  window.matchMedia ??= ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
})

beforeEach(() => vi.clearAllMocks())

const cofoLatest = versionFixture({ versionNo: 3, number: 'CO/23/2025', issuedBy: 'Lands Bureau' })
const cofo = documentFixture({
  type: 'c_of_o',
  stageType: 'c_of_o',
  latest: cofoLatest,
  earlierCount: 2,
})
const photo = documentFixture({
  type: 'family_receipt',
  name: 'Adeyemi family',
  stageType: null,
  latest: versionFixture({
    file: { name: 'receipt.heic', contentType: 'image/heic', sizeBytes: 800_000 },
  }),
})

function Vault({ parcel, onRemove }: { parcel: ParcelDetail; onRemove: () => void }) {
  const link = useDocumentLink(parcel.id)
  return (
    <DocumentVault
      parcel={parcel}
      abilities={parcelAbilities(parcel)}
      handlers={{ preview: vi.fn(), download: (id) => void link.download(id), busy: link.busy }}
      onUpload={vi.fn()}
      onRemove={onRemove}
      onIntent={() => {}}
    />
  )
}

function renderVault(parcel: ParcelDetail) {
  const onRemove = vi.fn()
  const view = renderWithMe(<Vault parcel={parcel} onRemove={onRemove} />, testMe('land_legal'))
  return { onRemove, queryClient: view.queryClient }
}

describe('Document vault', () => {
  it('shows each document by type with its latest version and how many came before', () => {
    renderVault(parcelFixture({ documents: [cofo, photo] }))

    const rows = within(screen.getByRole('list', { name: 'Documents' })).getAllByRole('listitem')
    expect(rows[0]).toHaveTextContent('C of O')
    expect(rows[0]).toHaveTextContent('v3 · 2 earlier')
    expect(rows[0]).toHaveTextContent('CO/23/2025 · Lands Bureau')
    expect(rows[1]).toHaveTextContent('Family receipt · Adeyemi family')
  })

  it('previews PDFs and only downloads HEIC photos', () => {
    renderVault(parcelFixture({ documents: [cofo, photo] }))

    expect(screen.getByRole('button', { name: 'Preview C of O v3' })).toBeInTheDocument()
    expect(
      screen.queryByRole('button', { name: 'Preview Family receipt · Adeyemi family v1' }),
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Download Family receipt · Adeyemi family v1' }),
    ).toBeInTheDocument()
  })

  it('says so in plain words when too many documents were opened', async () => {
    api.link.mockRejectedValue(
      new ORPCError('TOO_MANY_REQUESTS', { status: 429, message: 'Too many requests' }),
    )
    renderVault(parcelFixture({ documents: [cofo] }))

    await userEvent.click(screen.getByRole('button', { name: 'Download C of O v3' }))

    expect(api.link).toHaveBeenCalledWith({ versionId: cofo.latest?.id, disposition: 'attachment' })
    expect(toasts.error).toHaveBeenCalledWith(
      "You've opened a lot of documents in the last few minutes. Try again shortly.",
    )
  })

  it('says a removed version is gone instead of failing quietly', async () => {
    api.link.mockRejectedValue(new ORPCError('NOT_FOUND', { message: 'Not found' }))
    renderVault(parcelFixture({ documents: [cofo] }))

    await userEvent.click(screen.getByRole('button', { name: 'Download C of O v3' }))

    expect(toasts.error).toHaveBeenCalledWith(
      'That version was removed. Open the latest one instead.',
    )
  })

  it('lists every version, removed ones with who removed them and why', async () => {
    const parcel = parcelFixture({ documents: [cofo] })
    const removed = versionFixture({
      versionNo: 2,
      removed: { at: '2026-11-03T09:00:00.000Z', byName: 'Ngozi Adeyemi', reason: 'Wrong parcel' },
    })
    const { onRemove, queryClient } = renderVault(parcel)
    queryClient.setQueryData(documentVersionsQuery(cofo.id).queryKey, [
      cofoLatest,
      removed,
      versionFixture({ versionNo: 1 }),
    ])

    await userEvent.click(
      screen.getAllByRole('button', { name: /Versions of C of O/ })[0] as HTMLElement,
    )
    await userEvent.click(screen.getByRole('button', { name: 'Remove C of O v3' }))

    expect(
      screen.getByText(/Removed 3 Nov 2026 by Ngozi Adeyemi · Wrong parcel/),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Remove C of O v2' })).not.toBeInTheDocument()
    expect(onRemove).toHaveBeenCalledWith(cofo, cofo.latest)
  })

  it('offers no upload or remove to people who can only view', async () => {
    const parcel = parcelFixture({
      documents: [cofo],
      can: { edit: false, create: false, delete: false },
    })
    const { queryClient } = renderVault(parcel)
    queryClient.setQueryData(documentVersionsQuery(cofo.id).queryKey, [cofoLatest])

    await userEvent.click(
      screen.getAllByRole('button', { name: /Versions of C of O/ })[0] as HTMLElement,
    )

    expect(screen.queryByRole('button', { name: 'Upload new version' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^Remove/ })).not.toBeInTheDocument()
    // The row and its history both offer the file.
    expect(screen.getAllByRole('button', { name: 'Download C of O v3' })).toHaveLength(2)
  })
})
