import { readJson, writeJson } from '@/lib/storage'

/*
 * Upload document remembers, per organization on this device, the parcel last filed into: on a
 * site visit the next photo is almost always for the same land (spec: done in 3 taps). Never
 * shared, never sent.
 */

const key = (organizationId: string) => `vento:land:upload-document:${organizationId}`

const isMemory = (value: unknown): value is { parcelId?: unknown } =>
  typeof value === 'object' && value !== null

export function rememberedUploadParcel(organizationId: string | undefined): string | null {
  const stored = organizationId ? readJson(key(organizationId), isMemory) : null
  return typeof stored?.parcelId === 'string' ? stored.parcelId : null
}

export function rememberUploadParcel(organizationId: string | undefined, parcelId: string): void {
  if (organizationId) writeJson(key(organizationId), { parcelId })
}
