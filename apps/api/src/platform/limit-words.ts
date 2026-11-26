import type { CountLimitKey, LimitKey } from '@vento/shared'

/** Every way a limit is named in messages and command output, in one place. */
export const LIMIT_WORDS: Record<
  LimitKey,
  { one: string; many: string; things: string; action: string }
> = {
  projects: {
    one: 'active project',
    many: 'active projects',
    things: 'projects',
    action: 'Archive a project',
  },
  // Entities are companies on screen (decision 0018). The action keeps its comma: "Archive
  // one, or talk to Vento about Growth."
  entities: {
    one: 'active company',
    many: 'active companies',
    things: 'companies',
    action: 'Archive one,',
  },
  members: { one: 'person', many: 'people', things: 'people', action: 'Remove someone' },
  ai_budget: { one: 'AI budget', many: 'AI budget', things: 'AI spend', action: '' },
}

/** "1 active project", "10 people". */
export function amountOf(key: CountLimitKey, n: number): string {
  return `${n} ${n === 1 ? LIMIT_WORDS[key].one : LIMIT_WORDS[key].many}`
}
