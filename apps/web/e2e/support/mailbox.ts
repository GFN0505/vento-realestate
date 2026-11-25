import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { expect } from '@playwright/test'

const repoRoot = join(import.meta.dirname, '..', '..', '..', '..')
const mailDir = process.env.EMAIL_DEV_DIR ?? '.mail'
const folder = isAbsolute(mailDir) ? mailDir : join(repoRoot, mailDir)

type Mail = { to: string; subject: string; text: string; tag: string; sentAt: string }

async function mailsFor(email: string): Promise<Mail[]> {
  const safe = email.replace(/[^a-z0-9@._-]/gi, '_')
  const files = await readdir(folder).catch(() => [] as string[])
  // File names start with an ISO timestamp, so sorting names sorts by time.
  const mine = files.filter((f) => f.endsWith(`-${safe}.json`)).sort()
  return Promise.all(mine.map(async (f) => JSON.parse(await readFile(join(folder, f), 'utf8'))))
}

/** Waits for the newest email to `email` (optionally with a tag) and returns it. */
export async function newestEmail(email: string, tag?: string): Promise<Mail> {
  let found: Mail | undefined
  await expect
    .poll(
      async () => {
        found = (await mailsFor(email)).filter((m) => !tag || m.tag === tag).at(-1)
        return found !== undefined
      },
      { message: `an email to ${email}`, timeout: 15_000 },
    )
    .toBe(true)
  if (!found) throw new Error(`No email for ${email}`)
  return found
}

/** The 6-digit code from the newest verification email to `email`. */
export async function verificationCode(email: string): Promise<string> {
  const mail = await newestEmail(email, 'verify_email')
  const code = mail.text.match(/\b\d{6}\b/)?.[0]
  if (!code) throw new Error(`No 6-digit code in the email to ${email}`)
  return code
}
