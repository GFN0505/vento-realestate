import { createHmac } from 'node:crypto'
import { createApp } from '@/app'
import { createAuth } from '@/auth/auth'
import type { BreachCheck } from '@/auth/password-policy'
import { db } from '@/db/client'
import { createMemoryTransport } from '@/email/transports/memory'
import { env } from '@/env'

/** A real app (Better Auth included) with emails kept in memory. */
export function testApp(options: { breachCheck?: BreachCheck | null; rateLimit?: boolean } = {}) {
  const mailer = createMemoryTransport()
  const auth = createAuth({
    db,
    mailer,
    breachCheck: options.breachCheck ?? null,
    rateLimit: options.rateLimit ?? false,
  })
  const app = createApp({ db, mailer, auth, breachCheck: options.breachCheck ?? null })
  return { app, mailer, auth }
}

type App = ReturnType<typeof testApp>['app']

/** One browser: keeps cookies between calls, sends the web origin like a real page would. */
export function browser(
  app: App,
  userAgent = 'Mozilla/5.0 (Macintosh) Chrome/131.0 Safari/537.36',
) {
  const jar = new Map<string, string>()
  const cookieHeader = () => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')

  async function request(path: string, init: { method?: string; body?: unknown } = {}) {
    const res = await app.request(path, {
      method: init.method ?? 'POST',
      headers: {
        'content-type': 'application/json',
        origin: env.WEB_ORIGIN,
        'user-agent': userAgent,
        cookie: cookieHeader(),
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    })
    for (const line of res.headers.getSetCookie()) {
      const [pair = '', ...attrs] = line.split(';')
      const i = pair.indexOf('=')
      const name = pair.slice(0, i).trim()
      const value = pair.slice(i + 1)
      const expired = attrs.some((a) => /max-age=0\b/i.test(a.trim())) || value === ''
      if (expired) jar.delete(name)
      else jar.set(name, value)
    }
    const text = await res.text()
    let json: unknown = null
    try {
      json = text ? JSON.parse(text) : null
    } catch {
      json = text
    }
    return {
      status: res.status,
      json: json as Record<string, unknown> & { json?: unknown },
      headers: res.headers,
    }
  }

  return {
    jar,
    /** Better Auth endpoint under /api/auth. */
    auth: (path: string, body?: unknown) => request(`/api/auth${path}`, { body: body ?? {} }),
    /** GET on a Better Auth endpoint, e.g. /get-session. */
    authGet: (path: string) => request(`/api/auth${path}`, { method: 'GET' }),
    /** oRPC procedure, e.g. rpc('account/me'). Returns the unwrapped `json` payload. */
    rpc: async (path: string, input?: unknown) => {
      const res = await request(`/rpc/${path}`, {
        body: input === undefined ? {} : { json: input },
      })
      return { status: res.status, body: res.json?.json as Record<string, unknown> }
    },
  }
}

/** The 6-digit code an authenticator app would show for an otpauth:// URI (RFC 6238). */
export function totpFromUri(uri: string, at = Date.now()): string {
  const secret = new URL(uri).searchParams.get('secret') ?? ''
  const key = base32Decode(secret)
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const hmac = createHmac('sha1', key).update(counter).digest()
  const offset = (hmac.at(-1) ?? 0) & 0xf
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return value.toString().padStart(6, '0')
}

function base32Decode(input: string): Buffer {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of input.replace(/=+$/, '').toUpperCase()) {
    bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

/** The 6-digit code from the newest verification email to `email`. */
export function codeFromEmail(
  mailer: ReturnType<typeof createMemoryTransport>,
  email: string,
): string {
  const message = mailer
    .to(email)
    .filter((m) => m.tag === 'verify_email')
    .at(-1)
  const code = message?.text.match(/\b\d{6}\b/)?.[0]
  if (!code) throw new Error(`No verification code for ${email}`)
  return code
}

/** The first link in the newest email with this tag. */
export function linkFromEmail(
  mailer: ReturnType<typeof createMemoryTransport>,
  email: string,
  tag: string,
): string {
  const message = mailer
    .to(email)
    .filter((m) => m.tag === tag)
    .at(-1)
  const link = message?.text.match(/https?:\/\/\S+/)?.[0]
  if (!link) throw new Error(`No ${tag} link for ${email}`)
  return link
}
