import { describe, expect, it, vi } from 'vitest'
import { logger } from './logger'
import { createPlaceLookup, formatPlace } from './place'

// A tiny MaxMind DB (MMDB v2) built here, so no third-party data sits in the repo: an IPv4 tree
// with one /24 per place, 24-bit records, and the City-style records DB-IP uses.

type Value = string | number | Value[] | { [key: string]: Value }

function encode(value: Value): Buffer {
  const control = (type: number, size: number) =>
    type <= 7 ? Buffer.from([(type << 5) | size]) : Buffer.from([size, type - 7])
  if (typeof value === 'string') {
    const bytes = Buffer.from(value)
    return Buffer.concat([control(2, bytes.length), bytes])
  }
  if (typeof value === 'number') {
    const bytes = Buffer.alloc(4)
    bytes.writeUInt32BE(value)
    return Buffer.concat([control(6, 4), bytes])
  }
  if (Array.isArray(value)) return Buffer.concat([control(11, value.length), ...value.map(encode)])
  const entries = Object.entries(value)
  return Buffer.concat([
    control(7, entries.length),
    ...entries.flatMap(([k, v]) => [encode(k), encode(v)]),
  ])
}

function buildMmdb(networks: { prefix: string; record: Value }[]): Buffer {
  type Node = { children: [Node | number | null, Node | number | null] }
  const root: Node = { children: [null, null] }
  const data: Buffer[] = []
  let offset = 0
  for (const { prefix, record } of networks) {
    const bits = prefix
      .split('.')
      .slice(0, 3)
      .flatMap((o) => Number(o).toString(2).padStart(8, '0').split('').map(Number))
    let node = root
    for (const [i, bit] of bits.entries()) {
      if (i === bits.length - 1) {
        node.children[bit as 0 | 1] = offset
        break
      }
      const side = bit as 0 | 1
      const next = node.children[side]
      if (typeof next === 'object' && next) {
        node = next
      } else {
        const child: Node = { children: [null, null] }
        node.children[side] = child
        node = child
      }
    }
    const bytes = encode(record)
    data.push(bytes)
    offset += bytes.length
  }
  const nodes: Node[] = []
  const walk = (n: Node) => {
    nodes.push(n)
    for (const c of n.children) if (c && typeof c === 'object') walk(c)
  }
  walk(root)
  const count = nodes.length
  const tree = Buffer.alloc(count * 6)
  nodes.forEach((n, i) => {
    n.children.forEach((c, side) => {
      const value = c === null ? count : typeof c === 'number' ? count + 16 + c : nodes.indexOf(c)
      tree.writeUIntBE(value, i * 6 + side * 3, 3)
    })
  })
  const metadata = encode({
    node_count: count,
    record_size: 24,
    ip_version: 4,
    database_type: 'Test-City',
    languages: ['en'],
    binary_format_major_version: 2,
    binary_format_minor_version: 0,
    build_epoch: 0,
    description: { en: 'test' },
  })
  const marker = Buffer.from('ABCDEF4D61784D696E642E636F6D', 'hex')
  return Buffer.concat([tree, Buffer.alloc(16), ...data, marker, metadata])
}

const fixture = buildMmdb([
  {
    prefix: '102.89.34.0',
    record: {
      city: { names: { en: 'Lekki' } },
      subdivisions: [{ names: { en: 'Lagos State' } }],
      country: { iso_code: 'NG', names: { en: 'Nigeria' } },
    },
  },
  {
    prefix: '81.2.69.0',
    record: {
      city: { names: { en: 'London' } },
      subdivisions: [{ names: { en: 'England' } }],
      country: { iso_code: 'GB', names: { en: 'United Kingdom' } },
    },
  },
  { prefix: '41.58.1.0', record: { country: { iso_code: 'NG', names: { en: 'Nigeria' } } } },
])

describe('place lookup', () => {
  const lookup = createPlaceLookup(() => fixture)

  it('says "City, State" in Nigeria, without " State"', () => {
    expect(lookup('102.89.34.14')).toBe('Lekki, Lagos')
  })

  it('says "City, Country" elsewhere', () => {
    expect(lookup('81.2.69.160')).toBe('London, United Kingdom')
  })

  it('falls back to the country alone, and to nothing for unknown addresses', () => {
    expect(lookup('41.58.1.9')).toBe('Nigeria')
    expect(lookup('8.8.8.8')).toBeNull()
  })

  it('never looks up private, loopback or invalid addresses', () => {
    for (const ip of ['10.1.2.3', '192.168.0.4', '127.0.0.1', '::1', 'fe80::1', 'nonsense', null]) {
      expect(lookup(ip)).toBeNull()
    }
  })

  it('answers null with one log line, never the address, when the file is missing', () => {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {})
    const missing = createPlaceLookup(() => {
      throw Object.assign(new Error('ENOENT: /srv/geo/dbip.mmdb'), { name: 'Error' })
    })
    expect(missing('102.89.34.14')).toBeNull()
    expect(missing('81.2.69.160')).toBeNull()
    expect(warn).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(warn.mock.calls)).not.toContain('102.89')
    warn.mockRestore()
  })

  it('answers null without a file configured', () => {
    expect(createPlaceLookup(() => null)('102.89.34.14')).toBeNull()
  })

  it('formats a record with only a region', () => {
    expect(
      formatPlace({
        subdivisions: [{ names: { en: 'Rivers State' } }],
        country: { iso_code: 'NG' },
      } as never),
    ).toBe('Rivers')
  })
})
