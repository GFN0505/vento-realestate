import type { MePlan, UpgradeHint } from '@vento/shared'

type Topic = {
  contact: MePlan['contact']
  organizationName: string
  /** null = no plan assigned. */
  planName: string | null
  /** What the owner wants: "Commissions", "more projects", "the Enterprise trial". */
  about: string
}

/** The message Vento receives, so nobody has to ask which organization or plan. */
export function talkToVentoMessage({ organizationName, planName, about }: Topic): string {
  return [
    `Hello Vento, I'd like to talk about ${about}.`,
    '',
    `Organization: ${organizationName}`,
    ...(planName ? [`Plan: ${planName}`] : []),
  ].join('\n')
}

/**
 * **Talk to Vento**: WhatsApp when Vento has a number set (most owners live there), otherwise
 * email, with the organization, plan and topic filled in. Billing screens replace this later.
 */
export function talkToVentoHref(topic: Topic): string {
  const text = encodeURIComponent(talkToVentoMessage(topic))
  const whatsapp = topic.contact.whatsapp?.replace(/\D/g, '')
  if (whatsapp) return `https://wa.me/${whatsapp}?text=${text}`
  const subject = encodeURIComponent(`${topic.organizationName}: ${topic.about}`)
  return `mailto:${topic.contact.email}?subject=${subject}&body=${text}`
}

/** Opens the link: WhatsApp in a new tab, email in the mail app. */
export function openTalkToVento(href: string) {
  if (href.startsWith('mailto:')) window.location.href = href
  else window.open(href, '_blank', 'noopener,noreferrer')
}

/** "Available on Growth", or "Available with the AI add-on". */
export function availableOnText(hint: Pick<UpgradeHint, 'availableOn'>): string {
  return /^the /i.test(hint.availableOn)
    ? `Available with ${hint.availableOn}`
    : `Available on ${hint.availableOn}`
}
