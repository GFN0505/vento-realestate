import { createHash, createPublicKey, type JsonWebKey, verify } from 'node:crypto'

// Suspected passkey clones (audit L3). The verifier refuses a counter that didn't move forward
// before it checks the signature, so a refusal alone proves nothing: anyone with a credential id
// could send a low counter. A clone is reported only when the response also carries a valid
// signature by the stored key over this request's own challenge.

type CoseValue = number | Buffer | string | CoseValue[] | Map<CoseValue, CoseValue>

/** Just enough CBOR to read a COSE public key (ints, byte and text strings, arrays, maps). */
function decode(buf: Buffer, start = 0): [CoseValue, number] {
  const first = buf[start] ?? 0
  const major = first >> 5
  const info = first & 0x1f
  let offset = start + 1
  let length = info
  if (info === 24) length = buf.readUInt8(offset++)
  else if (info === 25) {
    length = buf.readUInt16BE(offset)
    offset += 2
  } else if (info === 26) {
    length = buf.readUInt32BE(offset)
    offset += 4
  } else if (info > 26) throw new Error('Unsupported CBOR length')
  switch (major) {
    case 0:
      return [length, offset]
    case 1:
      return [-1 - length, offset]
    case 2:
      return [buf.subarray(offset, offset + length), offset + length]
    case 3:
      return [buf.toString('utf8', offset, offset + length), offset + length]
    case 4: {
      const items: CoseValue[] = []
      for (let i = 0; i < length; i++) {
        const [item, next] = decode(buf, offset)
        items.push(item)
        offset = next
      }
      return [items, offset]
    }
    case 5: {
      const map = new Map<CoseValue, CoseValue>()
      for (let i = 0; i < length; i++) {
        const [key, afterKey] = decode(buf, offset)
        const [value, afterValue] = decode(buf, afterKey)
        map.set(key, value)
        offset = afterValue
      }
      return [map, offset]
    }
    default:
      throw new Error('Unsupported CBOR type')
  }
}

const b64url = (value: CoseValue | undefined) =>
  Buffer.isBuffer(value) ? value.toString('base64url') : ''

/** The stored key (base64 COSE) as a JWK plus how to verify with it; null for kinds we don't know. */
function keyOf(stored: string): { jwk: JsonWebKey; algorithm: 'sha256' | null } | null {
  const [cose] = decode(Buffer.from(stored, 'base64'))
  if (!(cose instanceof Map)) return null
  const kty = cose.get(1)
  if (kty === 2 && cose.get(-1) === 1) {
    return {
      jwk: { kty: 'EC', crv: 'P-256', x: b64url(cose.get(-2)), y: b64url(cose.get(-3)) },
      algorithm: 'sha256',
    }
  }
  if (kty === 3)
    return {
      jwk: { kty: 'RSA', n: b64url(cose.get(-1)), e: b64url(cose.get(-2)) },
      algorithm: 'sha256',
    }
  if (kty === 1 && cose.get(-1) === 6) {
    return { jwk: { kty: 'OKP', crv: 'Ed25519', x: b64url(cose.get(-2)) }, algorithm: null }
  }
  return null
}

export type AssertionFacts = {
  credentialId: string
  counter: number
  /** Valid signature by `publicKey` over this assertion. */
  signedBy(publicKey: string): boolean
  challenge: string | null
  origin: string | null
}

/** Reads a WebAuthn assertion (the body's `response`); null when it isn't one. */
export function readAssertion(response: unknown): AssertionFacts | null {
  if (!response || typeof response !== 'object') return null
  const r = response as { id?: unknown; response?: Record<string, unknown> }
  const inner = r.response ?? {}
  const { authenticatorData, clientDataJSON, signature } = inner
  if (
    typeof r.id !== 'string' ||
    typeof authenticatorData !== 'string' ||
    typeof clientDataJSON !== 'string' ||
    typeof signature !== 'string'
  ) {
    return null
  }
  const data = Buffer.from(authenticatorData, 'base64url')
  const json = Buffer.from(clientDataJSON, 'base64url')
  if (data.length < 37) return null
  let client: { challenge?: unknown; origin?: unknown; type?: unknown } = {}
  try {
    client = JSON.parse(json.toString('utf8'))
  } catch {
    return null
  }
  const signed = Buffer.concat([data, createHash('sha256').update(json).digest()])
  return {
    credentialId: r.id,
    counter: data.readUInt32BE(33),
    challenge:
      client.type === 'webauthn.get' && typeof client.challenge === 'string'
        ? client.challenge
        : null,
    origin: typeof client.origin === 'string' ? client.origin : null,
    signedBy(publicKey) {
      try {
        const key = keyOf(publicKey)
        if (!key) return false
        const object = createPublicKey({ key: key.jwk, format: 'jwk' })
        return verify(key.algorithm, signed, object, Buffer.from(signature, 'base64url'))
      } catch {
        return false
      }
    },
  }
}

/**
 * A response for this request's challenge, from this origin, signed by the stored key, whose
 * counter didn't move forward: the key was likely copied (or a racing copy won).
 */
export function isSuspectedClone(
  assertion: AssertionFacts,
  stored: { counter: number; publicKey: string },
  expected: { challenge: string | null | undefined; origin: string },
): boolean {
  const regressed =
    (assertion.counter > 0 || stored.counter > 0) && assertion.counter <= stored.counter
  if (!regressed || !expected.challenge) return false
  if (assertion.challenge !== expected.challenge || assertion.origin !== expected.origin)
    return false
  return assertion.signedBy(stored.publicKey)
}
