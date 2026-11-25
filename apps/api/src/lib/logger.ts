import { env } from '@/env'

const levels = { debug: 10, info: 20, warn: 30, error: 40 } as const
type Level = keyof typeof levels

/** Structured JSON logs, one line per event, so the host can search them. */
function write(level: Level, message: string, fields: Record<string, unknown> = {}) {
  if (levels[level] < levels[env.LOG_LEVEL]) return
  const line = JSON.stringify({ time: new Date().toISOString(), level, message, ...fields })
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout
  stream.write(`${line}\n`)
}

export const logger = {
  debug: (message: string, fields?: Record<string, unknown>) => write('debug', message, fields),
  info: (message: string, fields?: Record<string, unknown>) => write('info', message, fields),
  warn: (message: string, fields?: Record<string, unknown>) => write('warn', message, fields),
  error: (message: string, fields?: Record<string, unknown>) => write('error', message, fields),
}
