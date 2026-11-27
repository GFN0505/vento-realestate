import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ApprovalRequestDetail } from '@vento/shared'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { client } from '@/lib/orpc'
import { REQUEST_ID, testRequest } from '@/test/approvals'
import { ApprovalDetail } from './approval-detail'

vi.mock('@tanstack/react-router', () => ({ useRouter: () => ({ navigate: vi.fn() }) }))
vi.mock('@/lib/orpc', async (original) => {
  const actual = await original<typeof import('@/lib/orpc')>()
  return {
    ...actual,
    client: { approvals: { decide: vi.fn(), cancel: vi.fn() } },
  }
})

function renderDetail(detail: ApprovalRequestDetail, onDecided = vi.fn()) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  render(
    <QueryClientProvider client={queryClient}>
      <ApprovalDetail detail={detail} onDecided={onDecided} />
    </QueryClientProvider>,
  )
  return { onDecided }
}

afterEach(() => {
  vi.mocked(client.approvals.decide).mockReset()
  vi.mocked(client.approvals.cancel).mockReset()
})

describe('ApprovalDetail', () => {
  it('shows Field · Before · After, the reason and the steps as a list', () => {
    renderDetail(testRequest())
    const table = screen.getByRole('table', { name: 'What changes' })
    expect(within(table).getByRole('rowheader', { name: 'Projects & construction' })).toBeVisible()
    expect(screen.getByText('“Site engineers now raise POs”', { exact: false })).toBeVisible()
    const steps = screen.getByRole('list', { name: 'Steps' })
    expect(within(steps).getByText('Owner or Admin, waiting for you')).toBeInTheDocument()
  })

  it('approves at once with the button that names the effect', async () => {
    vi.mocked(client.approvals.decide).mockResolvedValue({ notice: 'Approved', ran: true })
    const { onDecided } = renderDetail(testRequest())
    await userEvent.click(screen.getByRole('button', { name: 'Approve role change' }))
    expect(client.approvals.decide).toHaveBeenCalledWith({
      requestId: REQUEST_ID,
      step: 1,
      decision: 'approve',
      comment: undefined,
    })
    await vi.waitFor(() => expect(onDecided).toHaveBeenCalled())
  })

  it('needs a comment to reject, and sends it', async () => {
    vi.mocked(client.approvals.decide).mockResolvedValue({ notice: 'Rejected', ran: false })
    renderDetail(testRequest())
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a comment to reject.')
    expect(client.approvals.decide).not.toHaveBeenCalled()
    await userEvent.type(screen.getByLabelText(/Comment/), 'Not for site staff')
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(client.approvals.decide).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'reject', comment: 'Not for site staff' }),
    )
  })

  it('clears the reject error once Approve is pressed', async () => {
    vi.mocked(client.approvals.decide).mockResolvedValue({ notice: 'Approved', ran: true })
    renderDetail(testRequest())
    await userEvent.click(screen.getByRole('button', { name: 'Reject' }))
    expect(screen.getByText('Enter a comment to reject.')).toBeVisible()
    await userEvent.click(screen.getByRole('button', { name: 'Approve role change' }))
    expect(screen.queryByText('Enter a comment to reject.')).toBeNull()
  })

  it('shows your own request with Cancel my request instead of the buttons', () => {
    renderDetail(
      testRequest({
        isOwn: true,
        canDecide: false,
        canCancel: true,
        reviewerHint: 'Aisha Bello (Finance) will review it.',
      }),
    )
    expect(screen.getByRole('note')).toHaveTextContent(
      'This is your own request. Aisha Bello (Finance) will review it. You can cancel it while it waits.',
    )
    expect(screen.getByRole('button', { name: 'Cancel my request' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Approve role change' })).toBeNull()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })

  it('says why someone excluded by the action cannot decide', () => {
    const reason = "This change gives access you don't have, so another owner or admin approves it."
    renderDetail(testRequest({ canDecide: false, blockedReason: reason }))
    expect(screen.getByText(reason)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Reject' })).toBeNull()
  })

  it('asks once before approving an irreversible action, with the amount', async () => {
    vi.mocked(client.approvals.decide).mockResolvedValue({ notice: 'Approved', ran: true })
    const amount = { value: '55720000.00', currency: 'NGN' as const, ngnValue: '55720000.00' }
    renderDetail(
      testRequest({
        irreversible: true,
        amount,
        summary: { ...testRequest().summary, title: 'November payroll', amount },
        approveLabel: 'Approve & pay ₦55.72m',
      }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Approve & pay ₦55.72m' }))
    expect(client.approvals.decide).not.toHaveBeenCalled()
    const dialog = screen.getByRole('alertdialog')
    expect(dialog).toHaveTextContent('November payroll · ₦55,720,000')
    await userEvent.click(within(dialog).getByRole('button', { name: 'Approve & pay ₦55.72m' }))
    expect(client.approvals.decide).toHaveBeenCalledWith(
      expect.objectContaining({ decision: 'approve', requestId: REQUEST_ID }),
    )
  })
})
