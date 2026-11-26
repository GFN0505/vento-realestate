import { z } from 'zod'
import { monthNumber, nigerianState } from '../common/nigeria'
import { id, paginated, paginationInput } from '../common/schemas'
import { HIDDEN_CHARACTERS_MESSAGE, hasHiddenCharacters } from '../common/text'

export const organizationName = z
  .string()
  .trim()
  .min(2, { message: 'Enter at least 2 characters' })
  .max(120, { message: 'Use 120 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

export const organization = z.object({
  id,
  name: z.string(),
  headOfficeState: nigerianState,
  financialYearStartMonth: monthNumber,
  /** Every organization and entity keeps its books in NGN. */
  baseCurrency: z.literal('NGN'),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Organization = z.infer<typeof organization>

export const createOrganizationInput = z.strictObject({
  name: organizationName,
  headOfficeState: nigerianState,
  financialYearStartMonth: monthNumber.default(1),
})
export type CreateOrganizationInput = z.input<typeof createOrganizationInput>

export const updateOrganizationInput = z.strictObject({
  name: organizationName.optional(),
  headOfficeState: nigerianState.optional(),
  financialYearStartMonth: monthNumber.optional(),
})

export const entityType = z.enum(['holding', 'spv'])
export type EntityType = z.infer<typeof entityType>
export const ENTITY_TYPE_LABELS: Record<EntityType, string> = {
  holding: 'Holding company',
  spv: 'Project company (SPV)',
}

export const entityStatus = z.enum(['active', 'archived'])
export type EntityStatus = z.infer<typeof entityStatus>

/** Optional registration code: blank means "add it later". */
const optionalCode = z
  .string()
  .trim()
  .max(20, { message: 'Use 20 characters or fewer' })
  .nullish()
  .transform((v) => (v ? v : null))

/**
 * Canonical RC number, "RC 1789234". Accepts "1789234", "rc1789234" or "RC-1789234".
 * Uniqueness per organization is checked on this form, so spacing can't dodge it.
 */
export function normaliseRcNumber(value: string): string {
  const compact = value.toUpperCase().replace(/[\s-]+/g, '')
  if (/^\d+$/.test(compact)) return `RC ${compact}`
  const match = /^([A-Z]+)(\d+)$/.exec(compact)
  return match ? `${match[1]} ${match[2]}` : value.trim().toUpperCase().replace(/\s+/g, ' ')
}

/** A warning, never a block: RC and TIN can be fixed later and formats vary. */
export function rcNumberWarning(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return /^RC \d{1,8}$/.test(normaliseRcNumber(value))
    ? null
    : 'RC numbers are digits, like RC 1789234'
}

export function normaliseTin(value: string): string {
  return value.replace(/\s+/g, '')
}

export function tinWarning(value: string | null | undefined): string | null {
  if (!value?.trim()) return null
  return /^(\d{8}-?\d{4}|\d{10}|\d{13})$/.test(normaliseTin(value))
    ? null
    : 'TINs are usually 10 digits, or like 12345678-0001'
}

export const entityName = z
  .string()
  .trim()
  .min(2, { message: 'Enter at least 2 characters' })
  .max(120, { message: 'Use 120 characters or fewer' })
  .refine((v) => !hasHiddenCharacters(v), { message: HIDDEN_CHARACTERS_MESSAGE })

export const entity = z.object({
  id,
  name: z.string(),
  type: entityType,
  rcNumber: z.string().nullable(),
  tin: z.string().nullable(),
  vatRegistered: z.boolean(),
  baseCurrency: z.literal('NGN'),
  status: entityStatus,
  archivedAt: z.iso.datetime().nullable(),
  /** "Archived 2 Dec 2026 by Olumide Bankole"; null while active (or archived before 3c with no record). */
  archivedByName: z.string().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
})
export type Entity = z.infer<typeof entity>

export const entityInput = z.strictObject({
  name: entityName,
  type: entityType,
  rcNumber: optionalCode,
  tin: optionalCode,
  vatRegistered: z.boolean().default(false),
})
export type EntityInput = z.input<typeof entityInput>

export const updateEntityInput = z.strictObject({
  id,
  name: entityName.optional(),
  type: entityType.optional(),
  rcNumber: optionalCode.optional(),
  tin: optionalCode.optional(),
  vatRegistered: z.boolean().optional(),
})

export const listEntitiesInput = paginationInput
  .extend({
    status: entityStatus.optional(),
    /** Name or RC number, matched anywhere. */
    q: z.string().trim().max(100).optional(),
  })
  .strict()
export type ListEntitiesInput = z.input<typeof listEntitiesInput>

export const listEntitiesOutput = paginated(entity).extend({
  /** For the chips and the context line, within the viewer's access; `q` doesn't narrow them. */
  counts: z.object({
    active: z.number().int().min(0),
    archived: z.number().int().min(0),
  }),
})
export type ListEntitiesOutput = z.infer<typeof listEntitiesOutput>

export const entityArchivePreview = z.object({
  isLastActive: z.boolean(),
  /**
   * Active members whose only active company is this one; they'd see none after archiving.
   * Up to 3 names, A–Z; `count` is the total.
   */
  members: z.object({
    count: z.number().int().min(0),
    names: z.array(z.string()).max(3),
  }),
})
export type EntityArchivePreview = z.infer<typeof entityArchivePreview>
