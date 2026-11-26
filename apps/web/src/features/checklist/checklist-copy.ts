import type { ChecklistItemKey } from '@vento/shared'

type Copy = { label: string; open: string; short: string }

/** Each item's words (spec "Setup checklist"); the server sends done and its detail. */
export const CHECKLIST_COPY: Record<ChecklistItemKey, Copy> = {
  organization: { label: 'Create your organization', open: '', short: 'Organization' },
  first_entity: {
    label: 'Add your first entity',
    open: 'The company that holds your first project',
    short: 'first entity',
  },
  two_step: {
    label: 'Turn on two-step sign-in',
    open: 'A code from your phone at each sign-in',
    short: 'two-step sign-in',
  },
  invite_team: {
    label: 'Invite your team',
    open: 'Bring in finance, sales and site staff',
    short: 'team invited',
  },
}

export const ALL_DONE_LINE = "You're set up. New steps appear here as you add projects and sales."
