import type { ChecklistItem, ChecklistItemKey, FeatureKey } from '@vento/shared'

/**
 * What the checklist reads, in one query per Home visit. A brick that adds an item adds the
 * fact it needs here and to `loadFacts` in checklist.service.ts.
 */
export type ChecklistFacts = {
  organizationName: string
  /** Any active entity exists (organization-wide). */
  hasEntity: boolean
  /** The oldest active entity within the viewer's own limit, if any: never a name they can't see. */
  firstEntityName: string | null
  viewerTwoStepOn: boolean
  /** Active members other than the viewer, and the earliest one's name. */
  otherMembers: number
  firstOtherName: string | null
  /** Distinct emails ever invited to this organization. */
  invitedPeople: number
}

export type ChecklistEntry = {
  key: ChecklistItemKey
  /** The feature the item belongs to: shown only while it's available. null = platform. */
  feature: FeatureKey | null
  check(facts: ChecklistFacts): { done: boolean; detail: string | null }
}

const people = (n: number) => (n === 1 ? '1 person' : `${n} people`)

/** Setup checklist items in display order. Done comes from data; nobody ticks anything. */
export const CHECKLIST_ITEMS: readonly ChecklistEntry[] = [
  {
    key: 'organization',
    feature: null,
    check: (f) => ({ done: true, detail: f.organizationName }),
  },
  {
    key: 'first_entity',
    feature: null,
    check: (f) => ({ done: f.hasEntity, detail: f.hasEntity ? f.firstEntityName : null }),
  },
  {
    key: 'two_step',
    feature: null,
    check: (f) => ({ done: f.viewerTwoStepOn, detail: f.viewerTwoStepOn ? 'On for you' : null }),
  },
  {
    key: 'invite_team',
    feature: null,
    check: (f) => {
      if (f.otherMembers > 0) {
        const detail =
          f.otherMembers === 1 && f.firstOtherName
            ? `${f.firstOtherName} joined`
            : `${people(f.otherMembers)} joined`
        return { done: true, detail }
      }
      if (f.invitedPeople > 0) return { done: true, detail: `${people(f.invitedPeople)} invited` }
      return { done: false, detail: null }
    },
  },
]

/** The items this organization has the features for, evaluated. */
export function evaluateChecklist(
  registry: readonly ChecklistEntry[],
  has: (feature: FeatureKey) => boolean,
  facts: ChecklistFacts,
): ChecklistItem[] {
  return registry
    .filter((item) => item.feature === null || has(item.feature))
    .map((item) => ({ key: item.key, ...item.check(facts) }))
}
