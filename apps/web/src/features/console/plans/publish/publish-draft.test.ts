import type { PlanDetail } from '@vento/shared/console'
import { describe, expect, it } from 'vitest'
import { initialPublishDraft, readPublishDraft } from './publish-draft'

const growth: PlanDetail = {
  key: 'growth',
  name: 'Growth',
  sortOrder: 20,
  defaultForNew: false,
  versions: [
    {
      id: '019a0000-0000-7000-8000-000000000001',
      version: 2,
      publishedAt: '2026-11-01T09:00:00Z',
      features: ['sales', 'sales.commissions'],
      limits: { projects: 5, entities: 3, members: 15, ai_budget: '150000.00' },
      organizations: 47,
    },
  ],
}

describe('Publish new version', () => {
  it('starts from the latest version, keeping the hidden projects limit', () => {
    const draft = initialPublishDraft(growth)
    expect(draft.features).toEqual(['sales', 'sales.commissions'])
    expect(draft.entities).toEqual({ text: '3', unlimited: false })
    expect(readPublishDraft(draft).definition?.limits).toEqual({
      projects: 5,
      entities: 3,
      members: 15,
      ai_budget: '150000.00',
    })
  })

  it('leaves out a limit set to Unlimited', () => {
    const draft = { ...initialPublishDraft(growth), members: { text: '', unlimited: true } }
    expect(readPublishDraft(draft).definition?.limits).not.toHaveProperty('members')
  })

  it('asks a new plan for its key and name', () => {
    const result = readPublishDraft(initialPublishDraft(null))
    expect(result.errors).toMatchObject({
      key: 'Use lower-case letters and _',
      name: 'Use 2 to 40 characters.',
    })
  })
})
