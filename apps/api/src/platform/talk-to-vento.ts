import { supportContact } from '@/env'

/** The "Talk to Vento" link for emails: WhatsApp when configured, else email, with context filled in. */
export function talkToVentoUrl(input: {
  organizationName: string
  planName: string | null
  about: string
}): string {
  const { email, whatsapp } = supportContact()
  const text = `Organization: ${input.organizationName}, plan: ${input.planName ?? 'none'}, about: ${input.about}`
  if (whatsapp)
    return `https://wa.me/${whatsapp.replace(/^\+/, '')}?text=${encodeURIComponent(text)}`
  return `mailto:${email}?subject=${encodeURIComponent(`About ${input.about}`)}&body=${encodeURIComponent(text)}`
}
