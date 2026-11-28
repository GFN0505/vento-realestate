import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { acceptFor } from '@vento/shared'
import { beforeEach, describe, expect, it } from 'vitest'
import type { PartTransport } from '@/lib/upload/put-part'
import {
  deferred,
  type FakeApi,
  FILE_ID,
  fakeApi,
  fakeClock,
  fakeNetwork,
  fakeTransport,
  LATER,
} from '@/lib/upload/upload.test-helpers'
import type { UploadItem } from '@/lib/upload/upload-item'
import type { UploadNetwork } from '@/lib/upload/upload-retry'
import { useFileUpload } from '@/lib/upload/use-file-upload'
import { FileDrop } from './file-drop'

const SECOND_ID = '01900000-0000-7000-8000-0000000000f2'
const pdf = (name = 'Survey plan.pdf') => new File(['%PDF-1.7'], name, { type: 'application/pdf' })
const onePartApi = () => fakeApi({ partSize: 5 * 1024 * 1024, count: 1, sizeBytes: 8 })
const started = (fileId: string) => ({
  fileId,
  partSize: 5 * 1024 * 1024,
  parts: [{ partNumber: 1, url: 'https://bucket.test/part-1' }],
  expiresAt: LATER,
})

type HarnessProps = {
  api: FakeApi
  transport?: PartTransport
  network?: UploadNetwork
  multiple?: boolean
  guessType?: (name: string) => string | null
  renderFile?: (item: UploadItem) => React.ReactNode
  takePhoto?: boolean
}

function Harness({ api, transport, network, ...rest }: HarnessProps) {
  const uploads = useFileUpload({
    purpose: 'title_document',
    api,
    transport: transport ?? fakeTransport(),
    network: network ?? fakeNetwork(),
    clock: fakeClock(),
    random: () => 0.5,
  })
  return (
    <>
      <FileDrop uploads={uploads} title="Drop PDFs or photos here" {...rest} />
      <p>{uploads.allSettled ? 'All settled' : `${uploads.pendingCount} pending`}</p>
    </>
  )
}

// jsdom has no media queries; `coarse` stands in for a phone's touch screen.
let coarse = false
beforeEach(() => {
  coarse = false
  window.matchMedia = (query: string) =>
    ({
      matches: coarse && query === '(pointer: coarse)',
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }) as unknown as MediaQueryList
})

const user = () => userEvent.setup({ applyAccept: false })
const chooser = () => screen.getByLabelText('Choose files')

describe('FileDrop', () => {
  it('uploads a chosen file and says so', async () => {
    const api = onePartApi()
    render(<Harness api={api} />)

    await user().upload(chooser(), pdf())

    const row = (await screen.findByText('Uploaded')).closest('li') as HTMLElement
    expect(within(row).getByText('Survey plan.pdf')).toBeInTheDocument()
    expect(screen.getByText('All settled')).toBeInTheDocument()
    expect(screen.getByText('Survey plan.pdf uploaded.')).toBeInTheDocument()
  })

  it('limits the picker to the purpose’s file types', () => {
    render(<Harness api={onePartApi()} />)

    expect(chooser()).toHaveAttribute('accept', acceptFor('title_document'))
  })

  it('refuses another format with the spec copy and no Try again', async () => {
    const api = onePartApi()
    render(<Harness api={api} />)

    await user().upload(chooser(), new File(['PK'], 'plan.docx', { type: 'application/msword' }))

    expect(
      await screen.findByText('Upload a PDF or a photo (JPG, PNG or HEIC).', { selector: 'li p' }),
    ).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument()
    expect(api.startUpload).not.toHaveBeenCalled()
  })

  it('pauses while offline and finishes when the connection is back', async () => {
    const network = fakeNetwork(false)
    render(<Harness api={onePartApi()} network={network} />)

    await user().upload(chooser(), pdf())

    const paused = "Upload paused. It will continue when you're back online."
    expect(await screen.findByText(paused, { selector: 'li p' })).toBeInTheDocument()
    expect(screen.getByText('1 pending')).toBeInTheDocument()
    network.set(true)
    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
  })

  it('offers Try again after a failed upload, and it finishes', async () => {
    let broken = true
    const transport = fakeTransport(() => (broken ? { status: 500 } : undefined))
    render(<Harness api={onePartApi()} transport={transport} />)
    const u = user()
    await u.upload(chooser(), pdf())

    const retry = await screen.findByRole('button', { name: 'Try again' })
    expect(
      screen.getByText("This file didn't finish uploading. Check your connection and try again.", {
        selector: 'li p',
      }),
    ).toBeInTheDocument()
    broken = false
    await u.click(retry)

    expect(await screen.findByText('Uploaded')).toBeInTheDocument()
  })

  it('removes a file and drops it on the server', async () => {
    const api = onePartApi()
    render(<Harness api={api} />)
    const u = user()
    await u.upload(chooser(), pdf())
    await screen.findByText('Uploaded')

    await u.click(screen.getByRole('button', { name: 'Remove Survey plan.pdf' }))

    expect(screen.queryByText('Survey plan.pdf')).not.toBeInTheDocument()
    expect(api.abortUpload).toHaveBeenCalledWith({ fileId: FILE_ID })
    expect(chooser()).toHaveFocus()
  })

  it('passes each file’s guessed type to the row’s own controls', async () => {
    render(
      <Harness
        api={onePartApi()}
        guessType={(name) => (/survey/i.test(name) ? 'survey_plan' : null)}
        renderFile={(item) => <span>Type: {item.guess ?? 'none'}</span>}
      />,
    )

    await user().upload(chooser(), pdf())

    expect(await screen.findByText('Type: survey_plan')).toBeInTheDocument()
  })

  it('offers Take photo with the back camera on a phone only', () => {
    const { unmount } = render(<Harness api={onePartApi()} takePhoto />)
    expect(screen.queryByLabelText('Take photo')).not.toBeInTheDocument()
    unmount()

    coarse = true
    render(<Harness api={onePartApi()} takePhoto />)

    expect(screen.getByLabelText('Take photo')).toHaveAttribute('capture', 'environment')
  })

  it('keeps the current file when a one-file pick is refused', async () => {
    const u = user()
    render(<Harness api={onePartApi()} multiple={false} />)
    await u.upload(screen.getByLabelText('Choose file'), pdf())
    await screen.findByText('Uploaded')

    await u.upload(
      screen.getByLabelText('Choose file'),
      new File(['PK'], 'plan.docx', { type: 'application/msword' }),
    )

    expect(screen.getByRole('alert')).toHaveTextContent(
      "plan.docx wasn't added. Upload a PDF or a photo (JPG, PNG or HEIC).",
    )
    expect(screen.getByText('Survey plan.pdf')).toBeInTheDocument()
    expect(screen.getByText('Uploaded')).toBeInTheDocument()
  })

  it('replaces the one file only once the new one has uploaded', async () => {
    const api = onePartApi()
    api.startUpload
      .mockResolvedValueOnce(started(FILE_ID))
      .mockResolvedValueOnce(started(SECOND_ID))
    const gate = deferred<void>()
    const transport = fakeTransport(async (_, call) => {
      if (call === 2) await gate.promise
      return undefined
    })
    const u = user()
    render(<Harness api={api} transport={transport} multiple={false} />)
    await u.upload(screen.getByLabelText('Choose file'), pdf())
    await screen.findByText('Uploaded')

    await u.upload(screen.getByLabelText('Choose file'), pdf('C of O.pdf'))
    await screen.findByText('C of O.pdf')
    expect(screen.getByText('Survey plan.pdf')).toBeInTheDocument()
    expect(api.abortUpload).not.toHaveBeenCalled()
    gate.resolve()

    await expect.poll(() => screen.queryByText('Survey plan.pdf')).toBeNull()
    expect(screen.getByText('Uploaded')).toBeInTheDocument()
    expect(api.abortUpload).toHaveBeenCalledWith({ fileId: FILE_ID })
  })

  it('highlights the zone only for files being dragged, not text', () => {
    render(<Harness api={onePartApi()} />)
    const zone = screen.getByText('Drop PDFs or photos here').parentElement as HTMLElement

    // No drag in userEvent: fireEvent carries the dataTransfer types the browser would.
    fireEvent.dragEnter(zone, { dataTransfer: { types: ['text/plain'] } })
    expect(zone).not.toHaveAttribute('data-dragging')

    fireEvent.dragEnter(zone, { dataTransfer: { types: ['Files'] } })
    expect(zone).toHaveAttribute('data-dragging')
  })
})
