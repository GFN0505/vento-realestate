import { readFile } from 'node:fs/promises'
import { BlockList, isIP } from 'node:net'
import { type CityResponse, Reader } from 'mmdb-lib'
import { env } from '@/env'
import { logger } from './logger'

// Approximate place from an offline IP database (decision 0020): DB-IP "IP to City Lite", read
// with mmdb-lib. No outside service is called. The IP and the result are never logged.

type CityReader = { get(ip: string): CityResponse | null }

/** Addresses that can't have a place: private, loopback, link-local, carrier-grade NAT. */
const unroutable = new BlockList()
for (const [net, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.168.0.0', 16],
] as const) {
  unroutable.addSubnet(net, prefix, 'ipv4')
}
unroutable.addAddress('::1', 'ipv6')
unroutable.addSubnet('fc00::', 7, 'ipv6')
unroutable.addSubnet('fe80::', 10, 'ipv6')

function isPublic(ip: string): boolean {
  const version = isIP(ip)
  if (version === 0) return false
  return !unroutable.check(ip, version === 4 ? 'ipv4' : 'ipv6')
}

const english = (names: { readonly en?: string } | undefined): string | undefined =>
  names?.en?.trim() || undefined

/**
 * "Lekki, Lagos" in Nigeria (the state without " State"); "London, United Kingdom" elsewhere;
 * the region or country alone when there's no city. Null when nothing useful is known.
 */
export function formatPlace(record: CityResponse | null): string | null {
  if (!record) return null
  const city = english(record.city?.names)
  const region = english(record.subdivisions?.[0]?.names)?.replace(/ State$/, '')
  const country = english(record.country?.names)
  const nigeria = record.country?.iso_code === 'NG'
  const area = nigeria ? region : country
  if (city && area && city !== area) return `${city}, ${area}`
  return city ?? area ?? country ?? null
}

export type PlaceLookup = {
  /**
   * Reads the database once, in the background: startup never waits for it and sign-in never
   * reads a file. Any failure (no file, bad file) logs once and leaves places off until restart.
   */
  load(read: () => Promise<Buffer | null>): Promise<void>
  /** Null until loaded, without a database, or when nothing useful is known. */
  lookup(ip: string | null): string | null
}

export function createPlaceLookup(): PlaceLookup {
  let reader: CityReader | null = null
  return {
    async load(read) {
      try {
        const file = await read()
        reader = file ? new Reader<CityResponse>(file) : null
      } catch (error) {
        reader = null
        logger.warn('place_lookup_unavailable', {
          reason: error instanceof Error ? error.name : 'unknown',
        })
      }
    },
    lookup(ip) {
      if (!reader || !ip || !isPublic(ip)) return null
      try {
        return formatPlace(reader.get(ip))
      } catch {
        return null
      }
    },
  }
}

const places = createPlaceLookup()

/** The app's lookup. Without `preloadPlaces` (tests, CI) it simply answers null. */
export const lookupPlace = (ip: string | null): string | null => places.lookup(ip)

/** Called once at startup, not awaited: loads GEOIP_DB_PATH (about 120 MB) in the background. */
export function preloadPlaces(path = env.GEOIP_DB_PATH): Promise<void> {
  if (!path) return Promise.resolve()
  return places.load(() => readFile(path))
}
