import { createHash, generateKeyPairSync, type KeyObject, randomBytes, sign } from 'node:crypto'

// A software passkey for API tests: a P-256 key in memory that answers WebAuthn registration and
// sign-in the way a phone would, so the passkey plugin's real verification runs end to end.
// Browser-level behaviour (the virtual authenticator) is covered by Playwright.

type Cbor = number | string | Uint8Array | Cbor[] | Map<Cbor, Cbor> | { [key: string]: Cbor }

function head(major: number, length: number): number[] {
  if (length < 24) return [(major << 5) | length]
  if (length < 0x100) return [(major << 5) | 24, length]
  if (length < 0x10000) return [(major << 5) | 25, length >> 8, length & 0xff]
  return [
    (major << 5) | 26,
    (length >>> 24) & 0xff,
    (length >> 16) & 0xff,
    (length >> 8) & 0xff,
    length & 0xff,
  ]
}

/** Just enough CBOR (RFC 8949) for attestation objects and COSE keys. */
export function cbor(value: Cbor): Buffer {
  if (typeof value === 'number') {
    return Buffer.from(value >= 0 ? head(0, value) : head(1, -1 - value))
  }
  if (typeof value === 'string') {
    const bytes = Buffer.from(value, 'utf8')
    return Buffer.concat([Buffer.from(head(3, bytes.length)), bytes])
  }
  if (value instanceof Uint8Array) {
    return Buffer.concat([Buffer.from(head(2, value.length)), Buffer.from(value)])
  }
  if (Array.isArray(value)) {
    return Buffer.concat([Buffer.from(head(4, value.length)), ...value.map(cbor)])
  }
  const entries = value instanceof Map ? [...value] : Object.entries(value)
  return Buffer.concat([
    Buffer.from(head(5, entries.length)),
    ...entries.flatMap(([k, v]) => [cbor(k), cbor(v)]),
  ])
}

const b64url = (data: Uint8Array | string) => Buffer.from(data).toString('base64url')
const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest()

const FLAG_UP = 0x01
const FLAG_UV = 0x04
const FLAG_AT = 0x40
/** Apple sends zeros under `attestation: 'none'`. */
const ZERO_AAGUID = Buffer.alloc(16)

export type SoftAuthenticator = {
  credentialId: string
  /** The answer to /passkey/generate-register-options, for /passkey/verify-registration. */
  register(
    options: { challenge: string },
    opts?: { userVerified?: boolean; aaguid?: Buffer },
  ): unknown
  /** The answer to /passkey/generate-authenticate-options, for /passkey/verify-authentication. */
  /** `counter` replays a given signature counter, as a copied key would. */
  signIn(
    options: { challenge: string },
    opts?: { userVerified?: boolean; counter?: number; badSignature?: boolean },
  ): unknown
}

export function softAuthenticator(origin: string): SoftAuthenticator {
  const rpId = new URL(origin).hostname
  const { privateKey, publicKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' })
  const credential = randomBytes(16)
  let counter = 0

  function coseKey(key: KeyObject): Buffer {
    const jwk = key.export({ format: 'jwk' })
    return cbor(
      new Map<Cbor, Cbor>([
        [1, 2], // kty: EC2
        [3, -7], // alg: ES256
        [-1, 1], // crv: P-256
        [-2, Buffer.from(jwk.x ?? '', 'base64url')],
        [-3, Buffer.from(jwk.y ?? '', 'base64url')],
      ]),
    )
  }

  function authData(flags: number, attested?: Buffer): Buffer {
    const count = Buffer.alloc(4)
    count.writeUInt32BE(counter)
    return Buffer.concat([sha256(rpId), Buffer.from([flags]), count, attested ?? Buffer.alloc(0)])
  }

  const clientData = (type: string, challenge: string) =>
    Buffer.from(JSON.stringify({ type, challenge, origin, crossOrigin: false }))

  return {
    credentialId: b64url(credential),
    register(options, opts = {}) {
      const length = Buffer.alloc(2)
      length.writeUInt16BE(credential.length)
      const attested = Buffer.concat([
        opts.aaguid ?? ZERO_AAGUID,
        length,
        credential,
        coseKey(publicKey),
      ])
      const flags = FLAG_UP | FLAG_AT | (opts.userVerified === false ? 0 : FLAG_UV)
      const attestationObject = cbor({
        fmt: 'none',
        attStmt: {},
        authData: authData(flags, attested),
      })
      return {
        id: b64url(credential),
        rawId: b64url(credential),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(clientData('webauthn.create', options.challenge)),
          attestationObject: b64url(attestationObject),
          transports: ['internal'],
        },
      }
    },
    signIn(options, opts = {}) {
      counter = opts.counter ?? counter + 1
      const data = authData(FLAG_UP | (opts.userVerified === false ? 0 : FLAG_UV))
      const json = clientData('webauthn.get', options.challenge)
      // A forger without the private key signs with some other key.
      const signer = opts.badSignature
        ? generateKeyPairSync('ec', { namedCurve: 'P-256' }).privateKey
        : privateKey
      const signature = sign('sha256', Buffer.concat([data, sha256(json)]), signer)
      return {
        id: b64url(credential),
        rawId: b64url(credential),
        type: 'public-key',
        authenticatorAttachment: 'platform',
        clientExtensionResults: {},
        response: {
          clientDataJSON: b64url(json),
          authenticatorData: b64url(data),
          signature: b64url(signature),
        },
      }
    },
  }
}
