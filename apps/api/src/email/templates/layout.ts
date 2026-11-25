import { escapeHtml } from '../escape'

export type RenderedEmail = { subject: string; html: string; text: string }

type Block =
  | { kind: 'p'; text: string }
  | { kind: 'button'; label: string; url: string }
  | { kind: 'code'; code: string }
  | { kind: 'small'; text: string }

/**
 * 600px single column, light only (email clients handle dark mode badly), following the
 * EmailVerify, EmailReset and EmailInvite boards. Inline styles: clients strip <style>.
 */
export function renderEmail(subject: string, heading: string, blocks: Block[]): RenderedEmail {
  const body = blocks
    .map((b): string => {
      switch (b.kind) {
        case 'p':
          return `<p style="margin:0 0 16px;font-size:15px;line-height:22px;color:#1f2937">${escapeHtml(b.text)}</p>`
        case 'small':
          return `<p style="margin:0 0 12px;font-size:13px;line-height:20px;color:#6b7280">${escapeHtml(b.text)}</p>`
        case 'code':
          return `<p style="margin:0 0 20px;font-size:28px;letter-spacing:8px;font-weight:600;color:#111827;font-family:Menlo,Consolas,monospace">${escapeHtml(b.code)}</p>`
        case 'button':
          return `<p style="margin:0 0 20px"><a href="${escapeHtml(b.url)}" style="display:inline-block;background:#5B5CE0;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:12px 20px;border-radius:10px">${escapeHtml(b.label)}</a></p>`
        default:
          return ''
      }
    })
    .join('\n')
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#f5f6fa;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f6fa;padding:24px 0"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:10px;border:1px solid #e5e7eb">
<tr><td style="padding:24px 32px;border-bottom:1px solid #e5e7eb;font-family:Poppins,Inter,Arial,sans-serif;font-weight:600;font-size:20px;color:#0f1a3c">Vento</td></tr>
<tr><td style="padding:32px">
<h1 style="margin:0 0 16px;font-family:Poppins,Inter,Arial,sans-serif;font-size:22px;line-height:30px;color:#111827">${escapeHtml(heading)}</h1>
${body}
</td></tr>
<tr><td style="padding:16px 32px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280">Vento · Data held in Nigeria</td></tr>
</table></td></tr></table></body></html>`
  const text = [
    heading,
    '',
    ...blocks.map((b) =>
      b.kind === 'button' ? `${b.label}: ${b.url}` : b.kind === 'code' ? b.code : b.text,
    ),
    '',
    'Vento · Data held in Nigeria',
  ].join('\n')
  return { subject, html, text }
}
