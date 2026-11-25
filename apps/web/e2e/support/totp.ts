import { createHmac } from 'node:crypto'

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(input: string): Buffer {
  let bits = ''
  for (const char of input.replace(/[\s=]/g, '').toUpperCase()) {
    bits += ALPHABET.indexOf(char).toString(2).padStart(5, '0')
  }
  const bytes: number[] = []
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(Number.parseInt(bits.slice(i, i + 8), 2))
  return Buffer.from(bytes)
}

/** The 6-digit code an authenticator app shows for this key (RFC 6238, 30 s, SHA-1). */
export function totpCode(secret: string, at = Date.now()): string {
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 1000 / 30)))
  const hmac = createHmac('sha1', base32Decode(secret)).update(counter).digest()
  const offset = (hmac.at(-1) ?? 0) & 0xf
  const value = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000
  return value.toString().padStart(6, '0')
}

/** A code from the next 30-second window, so a reused code is never rejected as already used. */
export function nextTotpCode(secret: string, at = Date.now()): string {
  return totpCode(secret, at + 30_000)
}
