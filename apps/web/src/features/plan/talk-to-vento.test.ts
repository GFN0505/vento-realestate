import { describe, expect, it } from 'vitest'
import { availableOnText, talkToVentoHref, talkToVentoMessage } from './talk-to-vento'

const topic = {
  contact: { email: 'hello@vento.ng', whatsapp: null },
  organizationName: 'Lekki Partners Ltd',
  planName: 'Starter',
  about: 'Commissions',
}

describe('Talk to Vento Real Estate', () => {
  it('fills in the organization, plan and topic', () => {
    expect(talkToVentoMessage(topic)).toBe(
      "Hello Vento Real Estate, I'd like to talk about Commissions.\n\nOrganization: Lekki Partners Ltd\nPlan: Starter",
    )
  })

  it('leaves the plan out when there is none', () => {
    expect(talkToVentoMessage({ ...topic, planName: null })).not.toContain('Plan:')
  })

  it('opens email with an encoded subject and body when there is no WhatsApp number', () => {
    const href = talkToVentoHref(topic)
    expect(href).toMatch(
      /^mailto:hello@vento\.ng\?subject=Lekki%20Partners%20Ltd%3A%20Commissions&body=/,
    )
    expect(decodeURIComponent(href.split('body=')[1] ?? '')).toBe(talkToVentoMessage(topic))
  })

  it('opens WhatsApp with digits only when Vento Real Estate has a number', () => {
    const href = talkToVentoHref({
      ...topic,
      contact: { ...topic.contact, whatsapp: '+234 803 000 0000' },
    })
    expect(href).toMatch(/^https:\/\/wa\.me\/2348030000000\?text=Hello%20Vento%20Real%20Estate/)
  })

  it('encodes characters that would break the link', () => {
    const href = talkToVentoHref({ ...topic, organizationName: 'Ade & Sons #1?' })
    expect(href).toContain('Ade%20%26%20Sons%20%231%3F')
  })
})

describe('upgrade hint wording', () => {
  it('names a plan with "on" and an add-on with "with"', () => {
    expect(availableOnText({ availableOn: 'Growth' })).toBe('Available on Growth')
    expect(availableOnText({ availableOn: 'the AI add-on' })).toBe('Available with the AI add-on')
  })
})
