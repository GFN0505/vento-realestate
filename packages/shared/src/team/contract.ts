import { notice } from '../account/schema'
import { platform } from '../common/errors'
import { checklist, listTeamInput, listTeamOutput } from './schema'

export const teamContract = {
  /**
   * Members and open invitations in one list (open invitations first, newest sent first, then
   * members A–Z), or invited only, or removed people. Entity names are limited to the viewer's
   * own access; every row says what the viewer may do with it.
   */
  list: platform.input(listTeamInput).output(listTeamOutput),
}

export const checklistContract = {
  /** The viewer's setup checklist on Home, derived from data. */
  get: platform.output(checklist),
  /** Hides it for this person on every device. Not audited: no data changes. */
  hide: platform.output(notice),
  /** ⌘K "Show setup checklist". */
  show: platform.output(notice),
}
