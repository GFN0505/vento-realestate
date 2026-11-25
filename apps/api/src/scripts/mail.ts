import { readdir, readFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'
import { findRepoRoot } from '@/lib/repo-root'

/**
 * Development only: prints the newest emails the API "sent" to the dev mailbox, with the
 * code or link to act on. Usage: pnpm mail [count] [address filter]
 */
const count = Number(process.argv[2] ?? 5) || 5
const filter = process.argv[3]?.toLowerCase()

const root = findRepoRoot(import.meta.dirname) ?? process.cwd()
const dir = process.env.EMAIL_DEV_DIR ?? '.mail'
const folder = isAbsolute(dir) ? dir : join(root, dir)

type Saved = { to: string; subject: string; text: string; sentAt: string }

const files = (await readdir(folder).catch(() => [] as string[]))
  .filter((f) => f.endsWith('.json') && (!filter || f.toLowerCase().includes(filter)))
  .sort()
  .slice(-count)
  .reverse()

if (files.length === 0) {
  process.stdout.write('No emails yet. Sign up or request a code, then run this again.\n')
}
for (const file of files) {
  const mail = JSON.parse(await readFile(join(folder, file), 'utf8')) as Saved
  const when = new Date(mail.sentAt).toLocaleTimeString('en-GB')
  const code = mail.text.match(/\b\d{6}\b/)?.[0]
  const link = mail.text.match(/https?:\/\/\S+/)?.[0]
  const lines = [`${when}  to ${mail.to}`, `  ${mail.subject}`]
  if (code) lines.push(`  Code: ${code}`)
  if (link) lines.push(`  Link: ${link}`)
  process.stdout.write(`\n${lines.join('\n')}\n`)
}
